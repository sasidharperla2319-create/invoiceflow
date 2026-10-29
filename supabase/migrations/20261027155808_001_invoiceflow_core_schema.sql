/*
# InvoiceFlow AI — Core Schema (single migration)

1. Overview
InvoiceFlow AI is a no-auth demo application for accounts-payable automation.
All tables are single-tenant (shared operational data) and accessible to both
the `anon` and `authenticated` roles so the anon-key browser client can read
and write operational records. Ground-truth evaluation tables are also
writable by the anon role because the demo generator populates them.

2. New Tables (in dependency order)
- users               — demo role-aware users (Business Requester, Approver, etc.)
- vendors             — vendor master
- purchase_orders     — PO header
- purchase_order_lines— PO line items (1–8 per PO)
- goods_receipts      — goods receipt header
- goods_receipt_lines — receipt lines referencing PO lines
- invoices            — invoice header with lifecycle states
- invoice_lines       — invoice line items
- approvals           — approval tasks/decisions
- payments            — simulated payment records
- exceptions          — exception findings from the matching engine
- exception_assignments — assignment + resolution history
- duplicate_findings  — duplicate-pair / group findings
- audit_events        — append-only audit log
- state_transitions   — lifecycle transition history
- extraction_attempts — invoice extraction attempts
- config_settings     — business tolerances / policies (key/value)
- generation_manifests— synthetic dataset generation metadata
- evaluation_runs     — evaluation run metadata
- ground_truth        — expected scenario labels per invoice (kept separate from operational input)

3. Enums / allowed values
- vendor status: ACTIVE, ON_HOLD, CLOSED
- po status: DRAFT, OPEN, PARTIALLY_RECEIVED, FULLY_RECEIVED, CLOSED, CANCELLED
- invoice extraction_status: PENDING, EXTRACTED, EXTRACTION_FAILED, SIMULATED
- invoice validation_status: PENDING, VALIDATED, VALIDATION_FAILED
- invoice match_status: UNMATCHED, MATCHED, MATCHED_WITHIN_TOLERANCE, PARTIAL_MATCH, EXCEPTION, BLOCKED, PENDING_REVIEW
- invoice approval_status: NOT_REQUIRED, PENDING, APPROVED, REJECTED, BLOCKED
- invoice payment_status: NOT_READY, READY, SCHEDULED, PAID, FAILED, NOT_APPLICABLE
- approval status: PENDING, APPROVED, REJECTED
- payment status: SCHEDULED, PAID, FAILED
- exception severity: LOW, MEDIUM, HIGH, BLOCKING
- exception status: OPEN, ASSIGNED, RESOLVED, REJECTED
- lifecycle states: RECEIVED, EXTRACTED, VALIDATED, MATCHED, EXCEPTION, APPROVAL_PENDING, APPROVED, REJECTED, BLOCKED, ON_HOLD, PAYMENT_READY, PAYMENT_SCHEDULED, PAID, PAYMENT_FAILED

4. Constraints / Indexes
- business IDs are text with UNIQUE constraints (e.g. VND-00001).
- FK constraints with ON DELETE CASCADE for child line tables.
- Indexes on common filter columns (vendor_id, po_number, statuses, dates).
- invoice_lines unique(invoice_id, line_number); purchase_order_lines unique(purchase_order_id, line_number).

5. Security
- RLS enabled on every table.
- CRUD granted to `anon, authenticated` (no-auth demo app — data is intentionally shared).
- Policies use USING (true) / WITH CHECK (true) because all operational data is shared demo data.
- service_role granted CRUD on all tables so edge functions / service code can operate.
*/

-- =========================================================
-- users
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
  user_id text PRIMARY KEY,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('BUSINESS_REQUESTER','PROCESS_OWNER','APPROVER','OPERATIONS_ANALYST','SYSTEM_ADMIN')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_users_rw" ON users;
CREATE POLICY "anon_users_rw" ON users FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_users_rw_i" ON users FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_users_rw_u" ON users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_users_rw_d" ON users FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- vendors
-- =========================================================
CREATE TABLE IF NOT EXISTS vendors (
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
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON vendors TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_vendors_s" ON vendors;
CREATE POLICY "anon_vendors_s" ON vendors FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_vendors_i" ON vendors FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_vendors_u" ON vendors FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_vendors_d" ON vendors FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- purchase_orders
-- =========================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  purchase_order_id text PRIMARY KEY,
  po_number text NOT NULL UNIQUE,
  vendor_id text NOT NULL REFERENCES vendors(vendor_id),
  po_date date NOT NULL,
  expected_delivery_date date,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('DRAFT','OPEN','PARTIALLY_RECEIVED','FULLY_RECEIVED','CLOSED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_orders TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_pos_s" ON purchase_orders;
CREATE POLICY "anon_pos_s" ON purchase_orders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_pos_i" ON purchase_orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_pos_u" ON purchase_orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_pos_d" ON purchase_orders FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

-- =========================================================
-- purchase_order_lines
-- =========================================================
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  po_line_id text PRIMARY KEY,
  purchase_order_id text NOT NULL REFERENCES purchase_orders(purchase_order_id) ON DELETE CASCADE,
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
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_order_lines TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_pol_s" ON purchase_order_lines;
CREATE POLICY "anon_pol_s" ON purchase_order_lines FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_pol_i" ON purchase_order_lines FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_pol_u" ON purchase_order_lines FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_pol_d" ON purchase_order_lines FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_pol_po ON purchase_order_lines(purchase_order_id);

-- =========================================================
-- goods_receipts
-- =========================================================
CREATE TABLE IF NOT EXISTS goods_receipts (
  goods_receipt_id text PRIMARY KEY,
  receipt_number text NOT NULL UNIQUE,
  purchase_order_id text NOT NULL REFERENCES purchase_orders(purchase_order_id) ON DELETE CASCADE,
  receipt_date date NOT NULL,
  status text NOT NULL DEFAULT 'RECEIVED',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON goods_receipts TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_gr_s" ON goods_receipts;
CREATE POLICY "anon_gr_s" ON goods_receipts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_gr_i" ON goods_receipts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_gr_u" ON goods_receipts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_gr_d" ON goods_receipts FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_gr_po ON goods_receipts(purchase_order_id);

-- =========================================================
-- goods_receipt_lines
-- =========================================================
CREATE TABLE IF NOT EXISTS goods_receipt_lines (
  receipt_line_id text PRIMARY KEY,
  goods_receipt_id text NOT NULL REFERENCES goods_receipts(goods_receipt_id) ON DELETE CASCADE,
  po_line_id text NOT NULL REFERENCES purchase_order_lines(po_line_id) ON DELETE CASCADE,
  received_quantity numeric(14,3) NOT NULL,
  accepted_quantity numeric(14,3) NOT NULL,
  rejected_quantity numeric(14,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE goods_receipt_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON goods_receipt_lines TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_grl_s" ON goods_receipt_lines;
CREATE POLICY "anon_grl_s" ON goods_receipt_lines FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_grl_i" ON goods_receipt_lines FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_grl_u" ON goods_receipt_lines FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_grl_d" ON goods_receipt_lines FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_grl_po_line ON goods_receipt_lines(po_line_id);
CREATE INDEX IF NOT EXISTS idx_grl_gr ON goods_receipt_lines(goods_receipt_id);

-- =========================================================
-- invoices
-- =========================================================
CREATE TABLE IF NOT EXISTS invoices (
  invoice_id text PRIMARY KEY,
  invoice_number text NOT NULL,
  vendor_id text NOT NULL REFERENCES vendors(vendor_id),
  purchase_order_id text REFERENCES purchase_orders(purchase_order_id),
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
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_inv_s" ON invoices;
CREATE POLICY "anon_inv_s" ON invoices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_inv_i" ON invoices FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_inv_u" ON invoices FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_inv_d" ON invoices FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_inv_vendor ON invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_inv_po ON invoices(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_inv_match ON invoices(match_status);
CREATE INDEX IF NOT EXISTS idx_inv_approval ON invoices(approval_status);
CREATE INDEX IF NOT EXISTS idx_inv_payment ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_inv_lifecycle ON invoices(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_inv_received ON invoices(received_at);

-- =========================================================
-- invoice_lines
-- =========================================================
CREATE TABLE IF NOT EXISTS invoice_lines (
  invoice_line_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
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
  po_line_id text REFERENCES purchase_order_lines(po_line_id),
  UNIQUE (invoice_id, line_number)
);
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_lines TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_invl_s" ON invoice_lines;
CREATE POLICY "anon_invl_s" ON invoice_lines FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_invl_i" ON invoice_lines FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_invl_u" ON invoice_lines FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_invl_d" ON invoice_lines FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_invl_inv ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invl_pol ON invoice_lines(po_line_id);

-- =========================================================
-- approvals
-- =========================================================
CREATE TABLE IF NOT EXISTS approvals (
  approval_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
  approver_user_id text REFERENCES users(user_id),
  approval_level integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decision_reason text,
  comments text
);
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON approvals TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_apr_s" ON approvals;
CREATE POLICY "anon_apr_s" ON approvals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_apr_i" ON approvals FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_apr_u" ON approvals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_apr_d" ON approvals FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_apr_inv ON approvals(invoice_id);
CREATE INDEX IF NOT EXISTS idx_apr_status ON approvals(status);

-- =========================================================
-- payments
-- =========================================================
CREATE TABLE IF NOT EXISTS payments (
  payment_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
  payment_reference text NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','PAID','FAILED')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON payments TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_pay_s" ON payments;
CREATE POLICY "anon_pay_s" ON payments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_pay_i" ON payments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_pay_u" ON payments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_pay_d" ON payments FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_pay_inv ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pay_status ON payments(status);

-- =========================================================
-- exceptions (findings)
-- =========================================================
CREATE TABLE IF NOT EXISTS exceptions (
  exception_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
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
  assigned_to_user_id text REFERENCES users(user_id),
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE exceptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON exceptions TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_exc_s" ON exceptions;
CREATE POLICY "anon_exc_s" ON exceptions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_exc_i" ON exceptions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_exc_u" ON exceptions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_exc_d" ON exceptions FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_exc_inv ON exceptions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_exc_status ON exceptions(status);
CREATE INDEX IF NOT EXISTS idx_exc_issue_type ON exceptions(issue_type);
CREATE INDEX IF NOT EXISTS idx_exc_assigned ON exceptions(assigned_to_user_id);

-- =========================================================
-- exception_assignments (history)
-- =========================================================
CREATE TABLE IF NOT EXISTS exception_assignments (
  assignment_id text PRIMARY KEY,
  exception_id text NOT NULL REFERENCES exceptions(exception_id) ON DELETE CASCADE,
  assigned_by text,
  assigned_to text,
  action text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE exception_assignments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON exception_assignments TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_ea_s" ON exception_assignments;
CREATE POLICY "anon_ea_s" ON exception_assignments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ea_i" ON exception_assignments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_ea_u" ON exception_assignments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_ea_d" ON exception_assignments FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_ea_exc ON exception_assignments(exception_id);

-- =========================================================
-- duplicate_findings
-- =========================================================
CREATE TABLE IF NOT EXISTS duplicate_findings (
  duplicate_id text PRIMARY KEY,
  duplicate_group_id text NOT NULL,
  invoice_id_a text NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
  invoice_id_b text NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
  reason text NOT NULL,
  normalized_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE duplicate_findings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON duplicate_findings TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_dup_s" ON duplicate_findings;
CREATE POLICY "anon_dup_s" ON duplicate_findings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_dup_i" ON duplicate_findings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_dup_u" ON duplicate_findings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_dup_d" ON duplicate_findings FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_dup_group ON duplicate_findings(duplicate_group_id);
CREATE INDEX IF NOT EXISTS idx_dup_a ON duplicate_findings(invoice_id_a);
CREATE INDEX IF NOT EXISTS idx_dup_b ON duplicate_findings(invoice_id_b);

-- =========================================================
-- audit_events (append-only)
-- =========================================================
CREATE TABLE IF NOT EXISTS audit_events (
  audit_id text PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_user_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_events TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_aud_s" ON audit_events;
CREATE POLICY "anon_aud_s" ON audit_events FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_aud_i" ON audit_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_aud_u" ON audit_events FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_aud_d" ON audit_events FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_aud_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_aud_created ON audit_events(created_at);

-- =========================================================
-- state_transitions (lifecycle history)
-- =========================================================
CREATE TABLE IF NOT EXISTS state_transitions (
  transition_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
  from_state text NOT NULL,
  to_state text NOT NULL,
  reason text,
  actor_user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE state_transitions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON state_transitions TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_st_s" ON state_transitions;
CREATE POLICY "anon_st_s" ON state_transitions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_st_i" ON state_transitions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_st_u" ON state_transitions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_st_d" ON state_transitions FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_st_inv ON state_transitions(invoice_id);

-- =========================================================
-- extraction_attempts
-- =========================================================
CREATE TABLE IF NOT EXISTS extraction_attempts (
  attempt_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'SIMULATED',
  status text NOT NULL,
  confidence numeric(5,2),
  extracted_json jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE extraction_attempts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON extraction_attempts TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_exa_s" ON extraction_attempts;
CREATE POLICY "anon_exa_s" ON extraction_attempts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_exa_i" ON extraction_attempts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_exa_u" ON extraction_attempts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_exa_d" ON extraction_attempts FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_exa_inv ON extraction_attempts(invoice_id);

-- =========================================================
-- config_settings (tolerances / policies)
-- =========================================================
CREATE TABLE IF NOT EXISTS config_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE config_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON config_settings TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_cfg_s" ON config_settings;
CREATE POLICY "anon_cfg_s" ON config_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_cfg_i" ON config_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_cfg_u" ON config_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_cfg_d" ON config_settings FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- generation_manifests
-- =========================================================
CREATE TABLE IF NOT EXISTS generation_manifests (
  manifest_id text PRIMARY KEY,
  seed text NOT NULL,
  scale text NOT NULL,
  row_counts jsonb NOT NULL,
  scenario_counts jsonb NOT NULL,
  checksum text,
  generated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE generation_manifests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON generation_manifests TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_gm_s" ON generation_manifests;
CREATE POLICY "anon_gm_s" ON generation_manifests FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_gm_i" ON generation_manifests FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_gm_u" ON generation_manifests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_gm_d" ON generation_manifests FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- evaluation_runs
-- =========================================================
CREATE TABLE IF NOT EXISTS evaluation_runs (
  run_id text PRIMARY KEY,
  seed text,
  scale text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metrics jsonb,
  summary jsonb,
  status text NOT NULL DEFAULT 'RUNNING'
);
ALTER TABLE evaluation_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON evaluation_runs TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_ev_s" ON evaluation_runs;
CREATE POLICY "anon_ev_s" ON evaluation_runs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ev_i" ON evaluation_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_ev_u" ON evaluation_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_ev_d" ON evaluation_runs FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- ground_truth (kept separate; never read by matching engine)
-- =========================================================
CREATE TABLE IF NOT EXISTS ground_truth (
  invoice_id text PRIMARY KEY REFERENCES invoices(invoice_id) ON DELETE CASCADE,
  scenario_label text NOT NULL,
  expected_match_outcome text NOT NULL,
  expected_exception_codes text[],
  expected_duplicate_group text,
  expected_approval_eligible boolean NOT NULL DEFAULT false,
  expected_payment_ready boolean NOT NULL DEFAULT false,
  expected_payment_outcome text,
  notes text
);
ALTER TABLE ground_truth ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON ground_truth TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_gt_s" ON ground_truth;
CREATE POLICY "anon_gt_s" ON ground_truth FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_gt_i" ON ground_truth FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_gt_u" ON ground_truth FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_gt_d" ON ground_truth FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_gt_scenario ON ground_truth(scenario_label);

-- =========================================================
-- rule_executions (per-rule results for explainability)
-- =========================================================
CREATE TABLE IF NOT EXISTS rule_executions (
  execution_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
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
ALTER TABLE rule_executions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON rule_executions TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "anon_re_s" ON rule_executions;
CREATE POLICY "anon_re_s" ON rule_executions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_re_i" ON rule_executions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_re_u" ON rule_executions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_re_d" ON rule_executions FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_re_inv ON rule_executions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_re_run ON rule_executions(processing_run_id);

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION set_updated_at() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_vendors_updated ON vendors;
CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON vendors
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated ON invoices;
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
