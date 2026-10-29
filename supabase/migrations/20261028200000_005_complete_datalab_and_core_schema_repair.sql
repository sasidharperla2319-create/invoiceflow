-- ==============================================================================
-- InvoiceFlow AI — Migration 005: Complete Schema & Data Lab Repair
-- Forward-only, idempotent repair establishing all required database objects:
-- 21 core & Data Lab tables, foreign keys, indexes, invariants, RLS policies,
-- audit triggers, and security definer RPC functions.
-- ==============================================================================

-- 1. Helper trigger function for updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION set_updated_at() TO anon, authenticated, service_role;

-- 2. users
CREATE TABLE IF NOT EXISTS public.users (
  user_id text PRIMARY KEY,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('BUSINESS_REQUESTER','PROCESS_OWNER','APPROVER','OPERATIONS_ANALYST','SYSTEM_ADMIN')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_users_rw" ON public.users;
DROP POLICY IF EXISTS "anon_users_rw_s" ON public.users;
DROP POLICY IF EXISTS "anon_users_rw_i" ON public.users;
DROP POLICY IF EXISTS "anon_users_rw_u" ON public.users;
DROP POLICY IF EXISTS "anon_users_rw_d" ON public.users;
DROP POLICY IF EXISTS "anon_users_s" ON public.users;
DROP POLICY IF EXISTS "anon_users_i" ON public.users;
DROP POLICY IF EXISTS "anon_users_u" ON public.users;
DROP POLICY IF EXISTS "anon_users_d" ON public.users;
CREATE POLICY "anon_users_s" ON public.users FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_users_i" ON public.users FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_users_u" ON public.users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_users_d" ON public.users FOR DELETE TO anon, authenticated USING (true);

-- 3. vendors
CREATE TABLE IF NOT EXISTS public.vendors (
  vendor_id text PRIMARY KEY,
  vendor_code text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  tax_identifier text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  payment_terms_days integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ON_HOLD','CLOSED')),
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_vendors_s" ON public.vendors;
DROP POLICY IF EXISTS "anon_vendors_i" ON public.vendors;
DROP POLICY IF EXISTS "anon_vendors_u" ON public.vendors;
DROP POLICY IF EXISTS "anon_vendors_d" ON public.vendors;
CREATE POLICY "anon_vendors_s" ON public.vendors FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_vendors_i" ON public.vendors FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_vendors_u" ON public.vendors FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_vendors_d" ON public.vendors FOR DELETE TO anon, authenticated USING (true);
DROP TRIGGER IF EXISTS trg_vendors_updated ON public.vendors;
CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. purchase_orders
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  purchase_order_id text PRIMARY KEY,
  po_number text NOT NULL UNIQUE,
  vendor_id text NOT NULL REFERENCES public.vendors(vendor_id),
  po_date date NOT NULL,
  expected_delivery_date date,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('DRAFT','OPEN','PARTIALLY_RECEIVED','FULLY_RECEIVED','CLOSED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_pos_s" ON public.purchase_orders;
DROP POLICY IF EXISTS "anon_pos_i" ON public.purchase_orders;
DROP POLICY IF EXISTS "anon_pos_u" ON public.purchase_orders;
DROP POLICY IF EXISTS "anon_pos_d" ON public.purchase_orders;
CREATE POLICY "anon_pos_s" ON public.purchase_orders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_pos_i" ON public.purchase_orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_pos_u" ON public.purchase_orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_pos_d" ON public.purchase_orders FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_po_vendor ON public.purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON public.purchase_orders(status);

-- 5. purchase_order_lines
CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  po_line_id text PRIMARY KEY,
  purchase_order_id text NOT NULL REFERENCES public.purchase_orders(purchase_order_id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  sku text NOT NULL,
  description text,
  ordered_quantity numeric(14,3) NOT NULL,
  unit_price numeric(14,4) NOT NULL,
  tax_code text NOT NULL DEFAULT 'STANDARD',
  tax_rate numeric(6,4) NOT NULL DEFAULT 0.10,
  unit_of_measure text NOT NULL DEFAULT 'EA',
  UNIQUE (purchase_order_id, line_number)
);
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_pol_s" ON public.purchase_order_lines;
DROP POLICY IF EXISTS "anon_pol_i" ON public.purchase_order_lines;
DROP POLICY IF EXISTS "anon_pol_u" ON public.purchase_order_lines;
DROP POLICY IF EXISTS "anon_pol_d" ON public.purchase_order_lines;
CREATE POLICY "anon_pol_s" ON public.purchase_order_lines FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_pol_i" ON public.purchase_order_lines FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_pol_u" ON public.purchase_order_lines FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_pol_d" ON public.purchase_order_lines FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_pol_po ON public.purchase_order_lines(purchase_order_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pol_qty_positive') THEN
    ALTER TABLE public.purchase_order_lines ADD CONSTRAINT chk_pol_qty_positive CHECK (ordered_quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pol_price_nonnegative') THEN
    ALTER TABLE public.purchase_order_lines ADD CONSTRAINT chk_pol_price_nonnegative CHECK (unit_price >= 0);
  END IF;
END $$;

-- 6. goods_receipts
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  goods_receipt_id text PRIMARY KEY,
  receipt_number text NOT NULL UNIQUE,
  purchase_order_id text NOT NULL REFERENCES public.purchase_orders(purchase_order_id) ON DELETE CASCADE,
  receipt_date date NOT NULL,
  status text NOT NULL DEFAULT 'RECEIVED',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipts TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_gr_s" ON public.goods_receipts;
DROP POLICY IF EXISTS "anon_gr_i" ON public.goods_receipts;
DROP POLICY IF EXISTS "anon_gr_u" ON public.goods_receipts;
DROP POLICY IF EXISTS "anon_gr_d" ON public.goods_receipts;
CREATE POLICY "anon_gr_s" ON public.goods_receipts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_gr_i" ON public.goods_receipts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_gr_u" ON public.goods_receipts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_gr_d" ON public.goods_receipts FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_gr_po ON public.goods_receipts(purchase_order_id);

-- 7. goods_receipt_lines
CREATE TABLE IF NOT EXISTS public.goods_receipt_lines (
  receipt_line_id text PRIMARY KEY,
  goods_receipt_id text NOT NULL REFERENCES public.goods_receipts(goods_receipt_id) ON DELETE CASCADE,
  po_line_id text NOT NULL REFERENCES public.purchase_order_lines(po_line_id) ON DELETE CASCADE,
  received_quantity numeric(14,3) NOT NULL,
  accepted_quantity numeric(14,3) NOT NULL,
  rejected_quantity numeric(14,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.goods_receipt_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipt_lines TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_grl_s" ON public.goods_receipt_lines;
DROP POLICY IF EXISTS "anon_grl_i" ON public.goods_receipt_lines;
DROP POLICY IF EXISTS "anon_grl_u" ON public.goods_receipt_lines;
DROP POLICY IF EXISTS "anon_grl_d" ON public.goods_receipt_lines;
CREATE POLICY "anon_grl_s" ON public.goods_receipt_lines FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_grl_i" ON public.goods_receipt_lines FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_grl_u" ON public.goods_receipt_lines FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_grl_d" ON public.goods_receipt_lines FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_grl_po_line ON public.goods_receipt_lines(po_line_id);
CREATE INDEX IF NOT EXISTS idx_grl_gr ON public.goods_receipt_lines(goods_receipt_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_grl_received_nonnegative') THEN
    ALTER TABLE public.goods_receipt_lines ADD CONSTRAINT chk_grl_received_nonnegative CHECK (received_quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_grl_accepted_nonnegative') THEN
    ALTER TABLE public.goods_receipt_lines ADD CONSTRAINT chk_grl_accepted_nonnegative CHECK (accepted_quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_grl_rejected_nonnegative') THEN
    ALTER TABLE public.goods_receipt_lines ADD CONSTRAINT chk_grl_rejected_nonnegative CHECK (rejected_quantity >= 0);
  END IF;
END $$;

-- 8. invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  invoice_id text PRIMARY KEY,
  invoice_number text NOT NULL,
  vendor_id text NOT NULL REFERENCES public.vendors(vendor_id),
  purchase_order_id text REFERENCES public.purchase_orders(purchase_order_id),
  invoice_date date NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  due_date date NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0,
  extracted_fields_json jsonb,
  extraction_confidence numeric(5,2) NOT NULL DEFAULT 0,
  extraction_status text NOT NULL DEFAULT 'PENDING' CHECK (extraction_status IN ('PENDING','EXTRACTED','EXTRACTION_FAILED','SIMULATED')),
  validation_status text NOT NULL DEFAULT 'PENDING' CHECK (validation_status IN ('PENDING','VALIDATED','VALIDATION_FAILED')),
  match_status text NOT NULL DEFAULT 'UNMATCHED' CHECK (match_status IN ('UNMATCHED','MATCHED','MATCHED_WITHIN_TOLERANCE','PARTIAL_MATCH','EXCEPTION','BLOCKED','PENDING_REVIEW')),
  approval_status text NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (approval_status IN ('NOT_REQUIRED','PENDING','APPROVED','REJECTED','BLOCKED')),
  payment_status text NOT NULL DEFAULT 'NOT_READY' CHECK (payment_status IN ('NOT_READY','READY','SCHEDULED','PAID','FAILED','NOT_APPLICABLE')),
  lifecycle_state text NOT NULL DEFAULT 'RECEIVED' CHECK (lifecycle_state IN ('RECEIVED','EXTRACTED','VALIDATED','MATCHED','EXCEPTION','APPROVAL_PENDING','APPROVED','REJECTED','BLOCKED','ON_HOLD','PAYMENT_READY','PAYMENT_SCHEDULED','PAID','PAYMENT_FAILED')),
  source_document_ref text,
  scenario_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  duplicate_group_id text
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_inv_s" ON public.invoices;
DROP POLICY IF EXISTS "anon_inv_i" ON public.invoices;
DROP POLICY IF EXISTS "anon_inv_u" ON public.invoices;
DROP POLICY IF EXISTS "anon_inv_d" ON public.invoices;
CREATE POLICY "anon_inv_s" ON public.invoices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_inv_i" ON public.invoices FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_inv_u" ON public.invoices FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_inv_d" ON public.invoices FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_inv_vendor ON public.invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_inv_po ON public.invoices(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_inv_match ON public.invoices(match_status);
CREATE INDEX IF NOT EXISTS idx_inv_approval ON public.invoices(approval_status);
CREATE INDEX IF NOT EXISTS idx_inv_payment ON public.invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_inv_lifecycle ON public.invoices(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_inv_received ON public.invoices(received_at);
DROP TRIGGER IF EXISTS trg_invoices_updated ON public.invoices;
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_grand_total_nonnegative') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT chk_invoice_grand_total_nonnegative CHECK (grand_total >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_subtotal_nonnegative') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT chk_invoice_subtotal_nonnegative CHECK (subtotal >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_tax_nonnegative') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT chk_invoice_tax_nonnegative CHECK (tax_total >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_due_date_valid') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT chk_invoice_due_date_valid CHECK (due_date >= invoice_date);
  END IF;
END $$;

-- 9. invoice_lines
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  invoice_line_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES public.invoices(invoice_id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  sku text NOT NULL,
  description text,
  quantity numeric(14,3) NOT NULL,
  unit_price numeric(14,4) NOT NULL,
  tax_code text NOT NULL DEFAULT 'STANDARD',
  tax_rate numeric(6,4) NOT NULL DEFAULT 0.10,
  line_subtotal numeric(14,2) NOT NULL DEFAULT 0,
  line_tax numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  po_line_id text REFERENCES public.purchase_order_lines(po_line_id),
  UNIQUE (invoice_id, line_number)
);
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_lines TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_invl_s" ON public.invoice_lines;
DROP POLICY IF EXISTS "anon_invl_i" ON public.invoice_lines;
DROP POLICY IF EXISTS "anon_invl_u" ON public.invoice_lines;
DROP POLICY IF EXISTS "anon_invl_d" ON public.invoice_lines;
CREATE POLICY "anon_invl_s" ON public.invoice_lines FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_invl_i" ON public.invoice_lines FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_invl_u" ON public.invoice_lines FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_invl_d" ON public.invoice_lines FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_invl_inv ON public.invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invl_pol ON public.invoice_lines(po_line_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invl_qty_positive') THEN
    ALTER TABLE public.invoice_lines ADD CONSTRAINT chk_invl_qty_positive CHECK (quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invl_price_nonnegative') THEN
    ALTER TABLE public.invoice_lines ADD CONSTRAINT chk_invl_price_nonnegative CHECK (unit_price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invl_totals_nonnegative') THEN
    ALTER TABLE public.invoice_lines ADD CONSTRAINT chk_invl_totals_nonnegative CHECK (
      line_subtotal >= 0 AND line_tax >= 0 AND line_total >= 0
    );
  END IF;
END $$;

-- 10. approvals
CREATE TABLE IF NOT EXISTS public.approvals (
  approval_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES public.invoices(invoice_id) ON DELETE CASCADE,
  approver_user_id text REFERENCES public.users(user_id),
  approval_level integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decision_reason text,
  comments text
);
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approvals TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_apr_s" ON public.approvals;
DROP POLICY IF EXISTS "anon_apr_i" ON public.approvals;
DROP POLICY IF EXISTS "anon_apr_u" ON public.approvals;
DROP POLICY IF EXISTS "anon_apr_d" ON public.approvals;
CREATE POLICY "anon_apr_s" ON public.approvals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_apr_i" ON public.approvals FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_apr_u" ON public.approvals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_apr_d" ON public.approvals FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_apr_inv ON public.approvals(invoice_id);
CREATE INDEX IF NOT EXISTS idx_apr_status ON public.approvals(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_approvals_pending_invoice ON public.approvals(invoice_id) WHERE status = 'PENDING';

-- 11. payments
CREATE TABLE IF NOT EXISTS public.payments (
  payment_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES public.invoices(invoice_id) ON DELETE CASCADE,
  payment_reference text NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','PAID','FAILED')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_pay_s" ON public.payments;
DROP POLICY IF EXISTS "anon_pay_i" ON public.payments;
DROP POLICY IF EXISTS "anon_pay_u" ON public.payments;
DROP POLICY IF EXISTS "anon_pay_d" ON public.payments;
CREATE POLICY "anon_pay_s" ON public.payments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_pay_i" ON public.payments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_pay_u" ON public.payments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_pay_d" ON public.payments FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_pay_inv ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pay_status ON public.payments(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_paid_per_invoice ON public.payments(invoice_id) WHERE status = 'PAID';
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_scheduled_per_invoice ON public.payments(invoice_id) WHERE status = 'SCHEDULED';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_amount_positive') THEN
    ALTER TABLE public.payments ADD CONSTRAINT chk_payment_amount_positive CHECK (amount >= 0);
  END IF;
END $$;

-- 12. exceptions
CREATE TABLE IF NOT EXISTS public.exceptions (
  exception_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES public.invoices(invoice_id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  rule_version text NOT NULL DEFAULT '1.0',
  issue_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','BLOCKING')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ASSIGNED','RESOLVED','REJECTED')),
  observed_value text,
  expected_value text,
  tolerance text,
  difference text,
  explanation text,
  routed_to_role text,
  assigned_to_user_id text REFERENCES public.users(user_id),
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.exceptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exceptions TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_exc_s" ON public.exceptions;
DROP POLICY IF EXISTS "anon_exc_i" ON public.exceptions;
DROP POLICY IF EXISTS "anon_exc_u" ON public.exceptions;
DROP POLICY IF EXISTS "anon_exc_d" ON public.exceptions;
CREATE POLICY "anon_exc_s" ON public.exceptions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_exc_i" ON public.exceptions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_exc_u" ON public.exceptions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_exc_d" ON public.exceptions FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_exc_inv ON public.exceptions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_exc_status ON public.exceptions(status);
CREATE INDEX IF NOT EXISTS idx_exc_issue_type ON public.exceptions(issue_type);
CREATE INDEX IF NOT EXISTS idx_exc_assigned ON public.exceptions(assigned_to_user_id);

-- 13. exception_assignments
CREATE TABLE IF NOT EXISTS public.exception_assignments (
  assignment_id text PRIMARY KEY,
  exception_id text NOT NULL REFERENCES public.exceptions(exception_id) ON DELETE CASCADE,
  assigned_by text,
  assigned_to text,
  action text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.exception_assignments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exception_assignments TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_ea_s" ON public.exception_assignments;
DROP POLICY IF EXISTS "anon_ea_i" ON public.exception_assignments;
DROP POLICY IF EXISTS "anon_ea_u" ON public.exception_assignments;
DROP POLICY IF EXISTS "anon_ea_d" ON public.exception_assignments;
CREATE POLICY "anon_ea_s" ON public.exception_assignments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ea_i" ON public.exception_assignments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_ea_u" ON public.exception_assignments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_ea_d" ON public.exception_assignments FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_ea_exc ON public.exception_assignments(exception_id);

-- 14. duplicate_findings
CREATE TABLE IF NOT EXISTS public.duplicate_findings (
  duplicate_id text PRIMARY KEY,
  duplicate_group_id text NOT NULL,
  invoice_id_a text NOT NULL REFERENCES public.invoices(invoice_id) ON DELETE CASCADE,
  invoice_id_b text NOT NULL REFERENCES public.invoices(invoice_id) ON DELETE CASCADE,
  reason text NOT NULL,
  normalized_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.duplicate_findings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duplicate_findings TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_dup_s" ON public.duplicate_findings;
DROP POLICY IF EXISTS "anon_dup_i" ON public.duplicate_findings;
DROP POLICY IF EXISTS "anon_dup_u" ON public.duplicate_findings;
DROP POLICY IF EXISTS "anon_dup_d" ON public.duplicate_findings;
CREATE POLICY "anon_dup_s" ON public.duplicate_findings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_dup_i" ON public.duplicate_findings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_dup_u" ON public.duplicate_findings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_dup_d" ON public.duplicate_findings FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_dup_group ON public.duplicate_findings(duplicate_group_id);
CREATE INDEX IF NOT EXISTS idx_dup_a ON public.duplicate_findings(invoice_id_a);
CREATE INDEX IF NOT EXISTS idx_dup_b ON public.duplicate_findings(invoice_id_b);

-- 15. audit_events
CREATE TABLE IF NOT EXISTS public.audit_events (
  audit_id text PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_user_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_events TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_aud_s" ON public.audit_events;
DROP POLICY IF EXISTS "anon_aud_i" ON public.audit_events;
DROP POLICY IF EXISTS "anon_aud_u" ON public.audit_events;
DROP POLICY IF EXISTS "anon_aud_d" ON public.audit_events;
CREATE POLICY "anon_aud_s" ON public.audit_events FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_aud_i" ON public.audit_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_aud_u" ON public.audit_events FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_aud_d" ON public.audit_events FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_aud_entity ON public.audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_aud_created ON public.audit_events(created_at);

-- 16. state_transitions
CREATE TABLE IF NOT EXISTS public.state_transitions (
  transition_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES public.invoices(invoice_id) ON DELETE CASCADE,
  from_state text NOT NULL,
  to_state text NOT NULL,
  reason text,
  actor_user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.state_transitions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.state_transitions TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_st_s" ON public.state_transitions;
DROP POLICY IF EXISTS "anon_st_i" ON public.state_transitions;
DROP POLICY IF EXISTS "anon_st_u" ON public.state_transitions;
DROP POLICY IF EXISTS "anon_st_d" ON public.state_transitions;
CREATE POLICY "anon_st_s" ON public.state_transitions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_st_i" ON public.state_transitions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_st_u" ON public.state_transitions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_st_d" ON public.state_transitions FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_st_inv ON public.state_transitions(invoice_id);

-- 17. extraction_attempts
CREATE TABLE IF NOT EXISTS public.extraction_attempts (
  attempt_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES public.invoices(invoice_id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'SIMULATED',
  status text NOT NULL,
  confidence numeric(5,2),
  extracted_json jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.extraction_attempts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extraction_attempts TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_exa_s" ON public.extraction_attempts;
DROP POLICY IF EXISTS "anon_exa_i" ON public.extraction_attempts;
DROP POLICY IF EXISTS "anon_exa_u" ON public.extraction_attempts;
DROP POLICY IF EXISTS "anon_exa_d" ON public.extraction_attempts;
CREATE POLICY "anon_exa_s" ON public.extraction_attempts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_exa_i" ON public.extraction_attempts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_exa_u" ON public.extraction_attempts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_exa_d" ON public.extraction_attempts FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_exa_inv ON public.extraction_attempts(invoice_id);

-- 18. config_settings
CREATE TABLE IF NOT EXISTS public.config_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.config_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.config_settings TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_cfg_s" ON public.config_settings;
DROP POLICY IF EXISTS "anon_cfg_i" ON public.config_settings;
DROP POLICY IF EXISTS "anon_cfg_u" ON public.config_settings;
DROP POLICY IF EXISTS "anon_cfg_d" ON public.config_settings;
CREATE POLICY "anon_cfg_s" ON public.config_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_cfg_i" ON public.config_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_cfg_u" ON public.config_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_cfg_d" ON public.config_settings FOR DELETE TO anon, authenticated USING (true);

-- 19. generation_manifests (Data Lab)
CREATE TABLE IF NOT EXISTS public.generation_manifests (
  manifest_id text PRIMARY KEY,
  seed text NOT NULL,
  scale text NOT NULL,
  row_counts jsonb NOT NULL,
  scenario_counts jsonb NOT NULL,
  checksum text,
  generated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.generation_manifests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generation_manifests TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_gm_s" ON public.generation_manifests;
DROP POLICY IF EXISTS "anon_gm_i" ON public.generation_manifests;
DROP POLICY IF EXISTS "anon_gm_u" ON public.generation_manifests;
DROP POLICY IF EXISTS "anon_gm_d" ON public.generation_manifests;
CREATE POLICY "anon_gm_s" ON public.generation_manifests FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_gm_i" ON public.generation_manifests FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_gm_u" ON public.generation_manifests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_gm_d" ON public.generation_manifests FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_generation_manifests_generated_at ON public.generation_manifests (generated_at DESC);

-- 20. evaluation_runs
CREATE TABLE IF NOT EXISTS public.evaluation_runs (
  run_id text PRIMARY KEY,
  seed text,
  scale text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metrics jsonb,
  summary jsonb,
  status text NOT NULL DEFAULT 'RUNNING'
);
ALTER TABLE public.evaluation_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_runs TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_ev_s" ON public.evaluation_runs;
DROP POLICY IF EXISTS "anon_ev_i" ON public.evaluation_runs;
DROP POLICY IF EXISTS "anon_ev_u" ON public.evaluation_runs;
DROP POLICY IF EXISTS "anon_ev_d" ON public.evaluation_runs;
CREATE POLICY "anon_ev_s" ON public.evaluation_runs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ev_i" ON public.evaluation_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_ev_u" ON public.evaluation_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_ev_d" ON public.evaluation_runs FOR DELETE TO anon, authenticated USING (true);

-- 21. ground_truth (Data Lab / Evaluation)
CREATE TABLE IF NOT EXISTS public.ground_truth (
  invoice_id text PRIMARY KEY REFERENCES public.invoices(invoice_id) ON DELETE CASCADE,
  scenario_label text NOT NULL,
  expected_match_outcome text NOT NULL,
  expected_exception_codes text[],
  expected_duplicate_group text,
  expected_approval_eligible boolean NOT NULL DEFAULT false,
  expected_payment_ready boolean NOT NULL DEFAULT false,
  expected_payment_outcome text,
  notes text
);
ALTER TABLE public.ground_truth ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ground_truth TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_gt_s" ON public.ground_truth;
DROP POLICY IF EXISTS "anon_gt_i" ON public.ground_truth;
DROP POLICY IF EXISTS "anon_gt_u" ON public.ground_truth;
DROP POLICY IF EXISTS "anon_gt_d" ON public.ground_truth;
CREATE POLICY "anon_gt_s" ON public.ground_truth FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_gt_i" ON public.ground_truth FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_gt_u" ON public.ground_truth FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_gt_d" ON public.ground_truth FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_gt_scenario ON public.ground_truth(scenario_label);

-- 22. rule_executions
CREATE TABLE IF NOT EXISTS public.rule_executions (
  execution_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES public.invoices(invoice_id) ON DELETE CASCADE,
  processing_run_id text NOT NULL,
  rule_id text NOT NULL,
  rule_version text NOT NULL DEFAULT '1.0',
  result text NOT NULL CHECK (result IN ('PASS','FAIL','WARN','SKIPPED','MATCHED','MATCHED_WITHIN_TOLERANCE','PARTIAL_MATCH','EXCEPTION','BLOCKED','PENDING_REVIEW')),
  observed_value text,
  expected_value text,
  tolerance text,
  difference text,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rule_executions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rule_executions TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_re_s" ON public.rule_executions;
DROP POLICY IF EXISTS "anon_re_i" ON public.rule_executions;
DROP POLICY IF EXISTS "anon_re_u" ON public.rule_executions;
DROP POLICY IF EXISTS "anon_re_d" ON public.rule_executions;
CREATE POLICY "anon_re_s" ON public.rule_executions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_re_i" ON public.rule_executions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_re_u" ON public.rule_executions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_re_d" ON public.rule_executions FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_re_inv ON public.rule_executions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_re_run ON public.rule_executions(processing_run_id);

-- 23. Stored Procedures (RPCs)
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
  IF p_decision NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Invalid decision: % (must be APPROVED or REJECTED)', p_decision;
  END IF;

  SELECT role INTO v_user_role FROM public.users WHERE user_id = p_actor_user_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('APPROVER', 'PROCESS_OWNER') THEN
    RAISE EXCEPTION 'Unauthorized: User % with role % cannot approve invoices', p_actor_user_id, COALESCE(v_user_role, 'NONE');
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE invoice_id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  IF p_decision = 'APPROVED' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.exceptions
      WHERE invoice_id = p_invoice_id
        AND status IN ('OPEN', 'ASSIGNED')
        AND severity = 'BLOCKING'
    ) INTO v_has_blocking;

    IF v_has_blocking THEN
      RAISE EXCEPTION 'Cannot approve invoice %: unresolved blocking exceptions exist', p_invoice_id;
    END IF;

    SELECT * INTO v_vendor FROM public.vendors WHERE vendor_id = v_inv.vendor_id;
    v_vendor_blocked := (v_vendor.status IS NOT NULL AND v_vendor.status IN ('CLOSED', 'ON_HOLD'));

    SELECT EXISTS (
      SELECT 1 FROM public.exceptions
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

  UPDATE public.approvals
  SET status = p_decision,
      decided_at = now(),
      decision_reason = p_reason,
      comments = p_comments
  WHERE approval_id = p_approval_id
    AND status = 'PENDING';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval % is not pending or does not exist', p_approval_id;
  END IF;

  UPDATE public.invoices
  SET approval_status = p_decision,
      lifecycle_state = v_new_lifecycle,
      payment_status = v_new_payment_status,
      updated_at = now()
  WHERE invoice_id = p_invoice_id;

  INSERT INTO public.state_transitions (
    transition_id, invoice_id, from_state, to_state, reason, actor_user_id
  ) VALUES (
    'TRN-DB-' || floor(extract(epoch from now()) * 1000)::text,
    p_invoice_id, v_inv.lifecycle_state, v_new_lifecycle, p_reason, p_actor_user_id
  );

  INSERT INTO public.audit_events (
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
  SELECT * INTO v_inv FROM public.invoices WHERE invoice_id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

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

  SELECT EXISTS (
    SELECT 1 FROM public.exceptions
    WHERE invoice_id = p_invoice_id
      AND status IN ('OPEN', 'ASSIGNED')
      AND severity = 'BLOCKING'
  ) INTO v_has_blocking;
  IF v_has_blocking THEN
    RAISE EXCEPTION 'Cannot schedule payment: invoice % has unresolved blocking exceptions', p_invoice_id;
  END IF;

  SELECT * INTO v_vendor FROM public.vendors WHERE vendor_id = v_inv.vendor_id;
  IF v_vendor.status IS NOT NULL AND v_vendor.status IN ('CLOSED', 'ON_HOLD') THEN
    RAISE EXCEPTION 'Cannot schedule payment: vendor % is %', v_inv.vendor_id, v_vendor.status;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.payments WHERE invoice_id = p_invoice_id AND status = 'PAID'
  ) INTO v_existing_paid;
  IF v_existing_paid THEN
    RAISE EXCEPTION 'Cannot schedule payment: invoice % already has a successful payment', p_invoice_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.payments WHERE invoice_id = p_invoice_id AND status = 'SCHEDULED'
  ) INTO v_existing_sched;
  IF v_existing_sched THEN
    RAISE EXCEPTION 'Cannot schedule payment: invoice % already has a scheduled payment pending', p_invoice_id;
  END IF;

  v_payment_id := 'PAY-DB-' || floor(extract(epoch from now()) * 1000)::text;
  v_ref := 'PMT-' || right(p_invoice_id, 6) || '-' || to_char(now(), 'HH24MISS');

  UPDATE public.invoices
  SET lifecycle_state = 'PAYMENT_SCHEDULED',
      payment_status = 'SCHEDULED',
      updated_at = now()
  WHERE invoice_id = p_invoice_id;

  INSERT INTO public.payments (
    payment_id, invoice_id, payment_reference, amount, currency, status, scheduled_at
  ) VALUES (
    v_payment_id, p_invoice_id, v_ref, v_inv.grand_total, v_inv.currency, 'SCHEDULED', now()
  );

  INSERT INTO public.state_transitions (
    transition_id, invoice_id, from_state, to_state, reason, actor_user_id
  ) VALUES (
    'TRN-DB-' || floor(extract(epoch from now()) * 1000)::text,
    p_invoice_id, 'PAYMENT_READY', 'PAYMENT_SCHEDULED', 'Scheduled for payment', p_actor_user_id
  );

  INSERT INTO public.audit_events (
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

GRANT EXECUTE ON FUNCTION decide_approval_secure(text, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION schedule_payment_secure(text, text) TO anon, authenticated, service_role;

-- 24. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

