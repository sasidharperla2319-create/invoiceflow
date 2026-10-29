-- ==============================================================================
-- InvoiceFlow AI — Migration 002: Security Hardening, Invariants & Stored Procedures
-- Phase 3 Submission Readiness & Database-Level Boundary Protection
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DATABASE INVARIANTS & CONSTRAINTS
-- ------------------------------------------------------------------------------

-- Payments: Exactly one PAID payment allowed per invoice (enforced at DB engine level)
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_paid_per_invoice
  ON payments(invoice_id)
  WHERE status = 'PAID';

-- Payments: Exactly one SCHEDULED payment allowed per invoice
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_scheduled_per_invoice
  ON payments(invoice_id)
  WHERE status = 'SCHEDULED';

-- Payments: Non-negative amount
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_amount_positive'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT chk_payment_amount_positive CHECK (amount >= 0);
  END IF;
END $$;

-- Invoices: Non-negative totals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_grand_total_nonnegative'
  ) THEN
    ALTER TABLE invoices ADD CONSTRAINT chk_invoice_grand_total_nonnegative CHECK (grand_total >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_subtotal_nonnegative'
  ) THEN
    ALTER TABLE invoices ADD CONSTRAINT chk_invoice_subtotal_nonnegative CHECK (subtotal >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_tax_nonnegative'
  ) THEN
    ALTER TABLE invoices ADD CONSTRAINT chk_invoice_tax_nonnegative CHECK (tax_total >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_due_date_valid'
  ) THEN
    ALTER TABLE invoices ADD CONSTRAINT chk_invoice_due_date_valid CHECK (due_date >= invoice_date);
  END IF;
END $$;

-- Invoice Lines: Positive quantity & non-negative pricing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_invl_qty_positive'
  ) THEN
    ALTER TABLE invoice_lines ADD CONSTRAINT chk_invl_qty_positive CHECK (quantity > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_invl_price_nonnegative'
  ) THEN
    ALTER TABLE invoice_lines ADD CONSTRAINT chk_invl_price_nonnegative CHECK (unit_price >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_invl_totals_nonnegative'
  ) THEN
    ALTER TABLE invoice_lines ADD CONSTRAINT chk_invl_totals_nonnegative CHECK (
      line_subtotal >= 0 AND line_tax >= 0 AND line_total >= 0
    );
  END IF;
END $$;

-- Purchase Order Lines: Positive quantity & non-negative unit price
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pol_qty_positive'
  ) THEN
    ALTER TABLE purchase_order_lines ADD CONSTRAINT chk_pol_qty_positive CHECK (ordered_quantity > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pol_price_nonnegative'
  ) THEN
    ALTER TABLE purchase_order_lines ADD CONSTRAINT chk_pol_price_nonnegative CHECK (unit_price >= 0);
  END IF;
END $$;

-- Goods Receipt Lines: Non-negative quantities
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_grl_received_nonnegative'
  ) THEN
    ALTER TABLE goods_receipt_lines ADD CONSTRAINT chk_grl_received_nonnegative CHECK (received_quantity >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_grl_accepted_nonnegative'
  ) THEN
    ALTER TABLE goods_receipt_lines ADD CONSTRAINT chk_grl_accepted_nonnegative CHECK (accepted_quantity >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_grl_rejected_nonnegative'
  ) THEN
    ALTER TABLE goods_receipt_lines ADD CONSTRAINT chk_grl_rejected_nonnegative CHECK (rejected_quantity >= 0);
  END IF;
END $$;

-- Approvals: Prevent duplicate active PENDING approvals for the same invoice
CREATE UNIQUE INDEX IF NOT EXISTS uq_approvals_pending_invoice
  ON approvals(invoice_id)
  WHERE status = 'PENDING';

-- ------------------------------------------------------------------------------
-- 2. TAMPER-PROOF IMMUTABILITY FOR AUDIT LOGS & LIFECYCLE TRANSITIONS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_audit_tampering()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail and lifecycle state transitions are strictly append-only: updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON audit_events;
CREATE TRIGGER trg_audit_events_immutable
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_tampering();

DROP TRIGGER IF EXISTS trg_state_transitions_immutable ON state_transitions;
CREATE TRIGGER trg_state_transitions_immutable
BEFORE UPDATE OR DELETE ON state_transitions
FOR EACH ROW EXECUTE FUNCTION prevent_audit_tampering();

-- Revoke UPDATE and DELETE permissions from client roles
REVOKE UPDATE, DELETE ON audit_events FROM anon, authenticated;
REVOKE UPDATE, DELETE ON state_transitions FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. SECURE SERVER-SIDE STORED PROCEDURES (SECURITY DEFINER RPCS)
-- ------------------------------------------------------------------------------

-- RPC: decide_approval_secure
CREATE OR REPLACE FUNCTION decide_approval_secure(
  p_approval_id text,
  p_invoice_id text,
  p_decision text,
  p_actor_user_id text,
  p_reason text,
  p_comments text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
  v_inv record;
  v_vendor record;
  v_has_blocking boolean;
  v_has_unresolved boolean;
  v_vendor_blocked boolean;
  v_new_lifecycle text;
  v_new_payment_status text;
BEGIN
  -- 1. Validate Decision Input
  IF p_decision NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Invalid decision: % (must be APPROVED or REJECTED)', p_decision;
  END IF;

  -- 2. Validate Actor Role
  SELECT role INTO v_user_role FROM users WHERE user_id = p_actor_user_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('APPROVER', 'PROCESS_OWNER') THEN
    RAISE EXCEPTION 'Unauthorized: User % with role % cannot approve invoices', p_actor_user_id, COALESCE(v_user_role, 'NONE');
  END IF;

  -- 3. Lock & Fetch Invoice
  SELECT * INTO v_inv FROM invoices WHERE invoice_id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  -- 4. Check Unresolved Blocking Exceptions
  IF p_decision = 'APPROVED' THEN
    SELECT EXISTS (
      SELECT 1 FROM exceptions
      WHERE invoice_id = p_invoice_id
        AND status IN ('OPEN', 'ASSIGNED')
        AND severity = 'BLOCKING'
    ) INTO v_has_blocking;

    IF v_has_blocking THEN
      RAISE EXCEPTION 'Cannot approve invoice %: unresolved blocking exceptions exist', p_invoice_id;
    END IF;

    -- Check Vendor Status
    SELECT * INTO v_vendor FROM vendors WHERE vendor_id = v_inv.vendor_id;
    v_vendor_blocked := (v_vendor.status IS NOT NULL AND v_vendor.status IN ('CLOSED', 'ON_HOLD'));

    -- Check Remaining Non-blocking Exceptions
    SELECT EXISTS (
      SELECT 1 FROM exceptions
      WHERE invoice_id = p_invoice_id
        AND status IN ('OPEN', 'ASSIGNED')
    ) INTO v_has_unresolved;

    IF v_vendor_blocked OR v_has_unresolved THEN
      v_new_lifecycle := 'APPROVED';
      v_new_payment_status := 'NOT_READY';
    ELSE
      v_new_lifecycle := 'PAYMENT_READY';
      v_new_payment_status := 'READY';
    END IF;
  ELSE
    v_new_lifecycle := 'REJECTED';
    v_new_payment_status := 'NOT_READY';
  END IF;

  -- 5. Update Approval Record
  UPDATE approvals
  SET status = p_decision,
      decided_at = now(),
      decision_reason = p_reason,
      comments = p_comments
  WHERE approval_id = p_approval_id
    AND status = 'PENDING';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval % is not pending or does not exist', p_approval_id;
  END IF;

  -- 6. Update Invoice Record
  UPDATE invoices
  SET approval_status = p_decision,
      lifecycle_state = v_new_lifecycle,
      payment_status = v_new_payment_status,
      updated_at = now()
  WHERE invoice_id = p_invoice_id;

  -- 7. Insert State Transition & Audit Event
  INSERT INTO state_transitions (
    transition_id, invoice_id, from_state, to_state, reason, actor_user_id
  ) VALUES (
    'TRN-DB-' || floor(extract(epoch from now()) * 1000)::text,
    p_invoice_id, v_inv.lifecycle_state, v_new_lifecycle, p_reason, p_actor_user_id
  );

  INSERT INTO audit_events (
    audit_id, entity_type, entity_id, action, actor_user_id, details
  ) VALUES (
    'AUD-DB-' || floor(extract(epoch from now()) * 1000)::text,
    'invoice', p_invoice_id, 'APPROVAL_' || p_decision, p_actor_user_id,
    jsonb_build_object('approval_id', p_approval_id, 'reason', p_reason, 'to_lifecycle', v_new_lifecycle)
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'approval_status', p_decision,
    'lifecycle_state', v_new_lifecycle,
    'payment_status', v_new_payment_status
  );
END;
$$;

-- RPC: schedule_payment_secure
CREATE OR REPLACE FUNCTION schedule_payment_secure(
  p_invoice_id text,
  p_actor_user_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_vendor record;
  v_has_blocking boolean;
  v_existing_paid boolean;
  v_existing_sched boolean;
  v_payment_id text;
  v_ref text;
BEGIN
  -- 1. Lock & Fetch Invoice
  SELECT * INTO v_inv FROM invoices WHERE invoice_id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  -- 2. Enforce Authoritative State Invariants
  IF v_inv.lifecycle_state != 'PAYMENT_READY' OR v_inv.payment_status != 'READY' THEN
    RAISE EXCEPTION 'Invoice % is not payment-ready (state: %, payment_status: %)',
      p_invoice_id, v_inv.lifecycle_state, v_inv.payment_status;
  END IF;

  IF v_inv.approval_status IN ('PENDING', 'REJECTED') THEN
    RAISE EXCEPTION 'Cannot schedule payment: approval status is %', v_inv.approval_status;
  END IF;

  IF v_inv.match_status = 'BLOCKED' OR v_inv.validation_status = 'VALIDATION_FAILED' THEN
    RAISE EXCEPTION 'Cannot schedule payment: invoice matching or validation failed';
  END IF;

  -- 3. Check Blocking Exceptions
  SELECT EXISTS (
    SELECT 1 FROM exceptions
    WHERE invoice_id = p_invoice_id
      AND status IN ('OPEN', 'ASSIGNED')
      AND severity = 'BLOCKING'
  ) INTO v_has_blocking;
  IF v_has_blocking THEN
    RAISE EXCEPTION 'Cannot schedule payment: invoice % has unresolved blocking exceptions', p_invoice_id;
  END IF;

  -- 4. Check Vendor Status
  SELECT * INTO v_vendor FROM vendors WHERE vendor_id = v_inv.vendor_id;
  IF v_vendor.status IS NOT NULL AND v_vendor.status IN ('CLOSED', 'ON_HOLD') THEN
    RAISE EXCEPTION 'Cannot schedule payment: vendor % is %', v_inv.vendor_id, v_vendor.status;
  END IF;

  -- 5. Check No Prior Paid Payment
  SELECT EXISTS (
    SELECT 1 FROM payments WHERE invoice_id = p_invoice_id AND status = 'PAID'
  ) INTO v_existing_paid;
  IF v_existing_paid THEN
    RAISE EXCEPTION 'Cannot schedule payment: invoice % already has a successful payment', p_invoice_id;
  END IF;

  -- 6. Check No Concurrent Scheduled Payment
  SELECT EXISTS (
    SELECT 1 FROM payments WHERE invoice_id = p_invoice_id AND status = 'SCHEDULED'
  ) INTO v_existing_sched;
  IF v_existing_sched THEN
    RAISE EXCEPTION 'Cannot schedule payment: invoice % already has a scheduled payment pending', p_invoice_id;
  END IF;

  -- 7. Execute Scheduling
  v_payment_id := 'PAY-DB-' || floor(extract(epoch from now()) * 1000)::text;
  v_ref := 'PMT-' || right(p_invoice_id, 6) || '-' || to_char(now(), 'HH24MISS');

  UPDATE invoices
  SET lifecycle_state = 'PAYMENT_SCHEDULED',
      payment_status = 'SCHEDULED',
      updated_at = now()
  WHERE invoice_id = p_invoice_id;

  INSERT INTO payments (
    payment_id, invoice_id, payment_reference, amount, currency, status, scheduled_at
  ) VALUES (
    v_payment_id, p_invoice_id, v_ref, v_inv.grand_total, v_inv.currency, 'SCHEDULED', now()
  );

  INSERT INTO state_transitions (
    transition_id, invoice_id, from_state, to_state, reason, actor_user_id
  ) VALUES (
    'TRN-DB-' || floor(extract(epoch from now()) * 1000)::text,
    p_invoice_id, 'PAYMENT_READY', 'PAYMENT_SCHEDULED', 'Scheduled for payment', p_actor_user_id
  );

  INSERT INTO audit_events (
    audit_id, entity_type, entity_id, action, actor_user_id, details
  ) VALUES (
    'AUD-DB-' || floor(extract(epoch from now()) * 1000)::text,
    'invoice', p_invoice_id, 'PAYMENT_SCHEDULED', p_actor_user_id,
    jsonb_build_object('payment_id', v_payment_id, 'payment_reference', v_ref, 'amount', v_inv.grand_total)
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'payment_reference', v_ref,
    'amount', v_inv.grand_total
  );
END;
$$;

-- Grant EXECUTE to application client roles
GRANT EXECUTE ON FUNCTION decide_approval_secure(text, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION schedule_payment_secure(text, text) TO anon, authenticated, service_role;
