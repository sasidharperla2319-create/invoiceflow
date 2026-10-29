# InvoiceFlow AI — Complete Database Audit Matrix

**Audit Date:** October 28, 2026
**Repository:** `invoice_flow-main`
**Connected Supabase Project:** `uwxuvjhfcorucpmognfq.supabase.co`

---

## 1. Diagnostic Summary

| Check | Result |
|---|---|
| Supabase URL configured | YES |
| `select('*').limit(1)` on any table | PGRST205 on all 21 tables |
| Tables existing in PostgreSQL | **0 of 21 tables** |
| RPC functions existing | **0 of 2 functions** |
| Migrations applied | **NEITHER migration has been executed** |

> **Root cause:** Both SQL migration files exist locally but have never been run
> against the connected Supabase project `uwxuvjhfcorucpmognfq`.

---

## 2. Full Table Audit Matrix

| # | Table | PK | FK Dependencies | Migration | Live Status |
|---|---|---|---|---|---|
| 1 | users | user_id | none | 001 L63-77 | NOT EXISTS |
| 2 | vendors | vendor_id | none | 001 L82-101 | NOT EXISTS |
| 3 | purchase_orders | purchase_order_id | vendors | 001 L106-124 | NOT EXISTS |
| 4 | purchase_order_lines | po_line_id | purchase_orders | 001 L129-149 | NOT EXISTS |
| 5 | goods_receipts | goods_receipt_id | purchase_orders | 001 L154-169 | NOT EXISTS |
| 6 | goods_receipt_lines | receipt_line_id | goods_receipts, purchase_order_lines | 001 L174-191 | NOT EXISTS |
| 7 | invoices | invoice_id | vendors, purchase_orders | 001 L196-235 | NOT EXISTS |
| 8 | invoice_lines | invoice_line_id | invoices, purchase_order_lines | 001 L240-264 | NOT EXISTS |
| 9 | approvals | approval_id | invoices, users | 001 L269-288 | NOT EXISTS |
| 10 | payments | payment_id | invoices | 001 L293-313 | NOT EXISTS |
| 11 | exceptions | exception_id | invoices, users | 001 L318-348 | NOT EXISTS |
| 12 | exception_assignments | assignment_id | exceptions | 001 L353-369 | NOT EXISTS |
| 13 | duplicate_findings | duplicate_id | invoices (x2) | 001 L374-392 | NOT EXISTS |
| 14 | audit_events | audit_id | none | 001 L397-414 | NOT EXISTS |
| 15 | state_transitions | transition_id | invoices | 001 L419-435 | NOT EXISTS |
| 16 | extraction_attempts | attempt_id | invoices | 001 L440-457 | NOT EXISTS |
| 17 | config_settings | key | none | 001 L462-474 | NOT EXISTS |
| 18 | generation_manifests | manifest_id | none | 001 L479-494 | NOT EXISTS |
| 19 | evaluation_runs | run_id | none | 001 L499-515 | NOT EXISTS |
| 20 | ground_truth | invoice_id | invoices | 001 L520-538 | NOT EXISTS |
| 21 | rule_executions | execution_id | invoices | 001 L543-565 | NOT EXISTS |

---

## 3. Detailed Schema Per Table

### Table 1: users
```
user_id       text        PK
email         text        NOT NULL
full_name     text        NOT NULL
role          text        NOT NULL CHECK (IN BUSINESS_REQUESTER,PROCESS_OWNER,APPROVER,OPERATIONS_ANALYST,SYSTEM_ADMIN)
is_active     boolean     NOT NULL DEFAULT true
created_at    timestamptz NOT NULL DEFAULT now()
```
**RLS:** Enabled. CRUD policies for anon, authenticated using (true).
**Grants:** SELECT, INSERT, UPDATE, DELETE to anon, authenticated, service_role.
**Frontend queries:** session.ts:L29, queries.ts:L240, seed.ts:L87

### Table 2: vendors
```
vendor_id            text        PK
vendor_code          text        NOT NULL UNIQUE
legal_name           text        NOT NULL
tax_identifier       text        NOT NULL
currency             text        NOT NULL DEFAULT 'USD'
payment_terms_days   integer     NOT NULL DEFAULT 30
status               text        NOT NULL DEFAULT 'ACTIVE' CHECK (IN ACTIVE,ON_HOLD,CLOSED)
effective_from       date        NOT NULL
effective_to         date        (nullable)
created_at           timestamptz NOT NULL DEFAULT now()
updated_at           timestamptz NOT NULL DEFAULT now()
```
**Trigger:** trg_vendors_updated (set_updated_at on UPDATE)
**RLS:** Enabled. CRUD policies.
**Frontend queries:** queries.ts:L64,L284,L290,L505,L601,L917; seed.ts:L88

### Table 3: purchase_orders
```
purchase_order_id       text   PK
po_number               text   NOT NULL UNIQUE
vendor_id               text   NOT NULL REFERENCES vendors(vendor_id)
po_date                 date   NOT NULL
expected_delivery_date  date   (nullable)
currency                text   NOT NULL DEFAULT 'USD'
status                  text   NOT NULL DEFAULT 'OPEN' CHECK (IN DRAFT,OPEN,PARTIALLY_RECEIVED,FULLY_RECEIVED,CLOSED,CANCELLED)
created_at              timestamptz NOT NULL DEFAULT now()
```
**Indexes:** idx_po_vendor(vendor_id), idx_po_status(status)
**Frontend queries:** queries.ts:L65,L926; seed.ts:L89

### Table 4: purchase_order_lines
```
po_line_id          text           PK
purchase_order_id   text           NOT NULL REFERENCES purchase_orders(purchase_order_id) ON DELETE CASCADE
line_number         integer        NOT NULL
sku                 text           NOT NULL
description         text           (nullable)
ordered_quantity    numeric(14,3)  NOT NULL
unit_price          numeric(14,4)  NOT NULL
tax_code            text           NOT NULL DEFAULT 'STANDARD'
tax_rate            numeric(6,4)   NOT NULL DEFAULT 0.10
unit_of_measure     text           NOT NULL DEFAULT 'EA'
UNIQUE(purchase_order_id, line_number)
```
**Migration 002 constraints:** chk_pol_qty_positive (>0), chk_pol_price_nonnegative (>=0)
**Indexes:** idx_pol_po(purchase_order_id)
**Frontend queries:** queries.ts:L78,L929; seed.ts:L90

### Table 5: goods_receipts
```
goods_receipt_id   text        PK
receipt_number     text        NOT NULL UNIQUE
purchase_order_id  text        NOT NULL REFERENCES purchase_orders(purchase_order_id) ON DELETE CASCADE
receipt_date       date        NOT NULL
status             text        NOT NULL DEFAULT 'RECEIVED'
created_at         timestamptz NOT NULL DEFAULT now()
```
**Indexes:** idx_gr_po(purchase_order_id)
**Frontend queries:** queries.ts:L84,L931; seed.ts:L91

### Table 6: goods_receipt_lines
```
receipt_line_id     text           PK
goods_receipt_id    text           NOT NULL REFERENCES goods_receipts(goods_receipt_id) ON DELETE CASCADE
po_line_id          text           NOT NULL REFERENCES purchase_order_lines(po_line_id) ON DELETE CASCADE
received_quantity   numeric(14,3)  NOT NULL
accepted_quantity   numeric(14,3)  NOT NULL
rejected_quantity   numeric(14,3)  NOT NULL DEFAULT 0
created_at          timestamptz    NOT NULL DEFAULT now()
```
**Migration 002 constraints:** chk_grl_received_nonnegative, chk_grl_accepted_nonnegative, chk_grl_rejected_nonnegative
**Indexes:** idx_grl_po_line(po_line_id), idx_grl_gr(goods_receipt_id)
**Frontend queries:** queries.ts:L87,L935; seed.ts:L92

### Table 7: invoices (central entity)
```
invoice_id            text           PK
invoice_number        text           NOT NULL
vendor_id             text           NOT NULL REFERENCES vendors(vendor_id)
purchase_order_id     text           REFERENCES purchase_orders(purchase_order_id) (nullable)
invoice_date          date           NOT NULL
received_at           timestamptz    NOT NULL DEFAULT now()
due_date              date           NOT NULL
currency              text           NOT NULL DEFAULT 'USD'
subtotal              numeric(14,2)  NOT NULL DEFAULT 0
tax_total             numeric(14,2)  NOT NULL DEFAULT 0
grand_total           numeric(14,2)  NOT NULL DEFAULT 0
extracted_fields_json jsonb          (nullable)
extraction_confidence numeric(5,2)   NOT NULL DEFAULT 0
extraction_status     text           NOT NULL DEFAULT 'PENDING' CHECK (...)
validation_status     text           NOT NULL DEFAULT 'PENDING' CHECK (...)
match_status          text           NOT NULL DEFAULT 'UNMATCHED' CHECK (...)
approval_status       text           NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (...)
payment_status        text           NOT NULL DEFAULT 'NOT_READY' CHECK (...)
lifecycle_state       text           NOT NULL DEFAULT 'RECEIVED' CHECK (...)
source_document_ref   text           (nullable)
scenario_label        text           (nullable)
created_at            timestamptz    NOT NULL DEFAULT now()
updated_at            timestamptz    NOT NULL DEFAULT now()
duplicate_group_id    text           (nullable)
```
**Migration 002 constraints:** chk_invoice_grand_total_nonnegative, chk_invoice_subtotal_nonnegative, chk_invoice_tax_nonnegative, chk_invoice_due_date_valid
**Trigger:** trg_invoices_updated (set_updated_at on UPDATE)
**Indexes:** idx_inv_vendor, idx_inv_po, idx_inv_match, idx_inv_approval, idx_inv_payment, idx_inv_lifecycle, idx_inv_received
**Frontend queries:** Virtually every query in queries.ts; seed.ts:L93

### Table 8: invoice_lines
```
invoice_line_id  text           PK
invoice_id       text           NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE
line_number      integer        NOT NULL
sku              text           NOT NULL
description      text           (nullable)
quantity         numeric(14,3)  NOT NULL
unit_price       numeric(14,4)  NOT NULL
tax_code         text           NOT NULL DEFAULT 'STANDARD'
tax_rate         numeric(6,4)   NOT NULL DEFAULT 0.10
line_subtotal    numeric(14,2)  NOT NULL DEFAULT 0
line_tax         numeric(14,2)  NOT NULL DEFAULT 0
line_total       numeric(14,2)  NOT NULL DEFAULT 0
po_line_id       text           REFERENCES purchase_order_lines(po_line_id) (nullable)
UNIQUE(invoice_id, line_number)
```
**Migration 002 constraints:** chk_invl_qty_positive, chk_invl_price_nonnegative, chk_invl_totals_nonnegative
**Indexes:** idx_invl_inv(invoice_id), idx_invl_pol(po_line_id)
**Frontend queries:** queries.ts:L66,L78; seed.ts:L94

### Table 9: approvals
```
approval_id      text        PK
invoice_id       text        NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE
approver_user_id text        REFERENCES users(user_id) (nullable)
approval_level   integer     NOT NULL DEFAULT 1
status           text        NOT NULL DEFAULT 'PENDING' CHECK (IN PENDING,APPROVED,REJECTED)
assigned_at      timestamptz NOT NULL DEFAULT now()
decided_at       timestamptz (nullable)
decision_reason  text        (nullable)
comments         text        (nullable)
```
**Migration 002 unique index:** uq_approvals_pending_invoice ON (invoice_id) WHERE status = 'PENDING'
**Indexes:** idx_apr_inv(invoice_id), idx_apr_status(status)
**Frontend queries:** queries.ts:L68,L209,L423,L429,L536,L1077,L1082; seed.ts:L95

### Table 10: payments
```
payment_id         text           PK
invoice_id         text           NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE
payment_reference  text           NOT NULL
amount             numeric(14,2)  NOT NULL
currency           text           NOT NULL DEFAULT 'USD'
status             text           NOT NULL DEFAULT 'SCHEDULED' CHECK (IN SCHEDULED,PAID,FAILED)
scheduled_at       timestamptz    NOT NULL DEFAULT now()
paid_at            timestamptz    (nullable)
failure_reason     text           (nullable)
created_at         timestamptz    NOT NULL DEFAULT now()
```
**Migration 002 unique indexes:** uq_payments_one_paid_per_invoice, uq_payments_one_scheduled_per_invoice
**Migration 002 constraint:** chk_payment_amount_positive (amount >= 0)
**Indexes:** idx_pay_inv(invoice_id), idx_pay_status(status)
**Frontend queries:** queries.ts:L69,L214,L611,L637,L670,L675,L708; seed.ts:L96; PaymentReadinessPage.tsx:L36

### Table 11: exceptions
```
exception_id         text        PK
invoice_id           text        NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE
rule_id              text        NOT NULL
rule_version         text        NOT NULL DEFAULT '1.0'
issue_type           text        NOT NULL
severity             text        NOT NULL CHECK (IN LOW,MEDIUM,HIGH,BLOCKING)
status               text        NOT NULL DEFAULT 'OPEN' CHECK (IN OPEN,ASSIGNED,RESOLVED,REJECTED)
observed_value       text        (nullable)
expected_value       text        (nullable)
tolerance            text        (nullable)
difference           text        (nullable)
explanation          text        (nullable)
routed_to_role       text        (nullable)
assigned_to_user_id  text        REFERENCES users(user_id) (nullable)
priority             text        NOT NULL DEFAULT 'NORMAL' CHECK (IN LOW,NORMAL,HIGH,URGENT)
resolution_notes     text        (nullable)
created_at           timestamptz NOT NULL DEFAULT now()
resolved_at          timestamptz (nullable)
```
**Indexes:** idx_exc_inv, idx_exc_status, idx_exc_issue_type, idx_exc_assigned
**Frontend queries:** queries.ts:L67,L197,L307,L360,L447,L492,L591; seed.ts insertBatch

### Table 12: exception_assignments
```
assignment_id  text        PK
exception_id   text        NOT NULL REFERENCES exceptions(exception_id) ON DELETE CASCADE
assigned_by    text        (nullable)
assigned_to    text        (nullable)
action         text        NOT NULL
notes          text        (nullable)
created_at     timestamptz NOT NULL DEFAULT now()
```
**Indexes:** idx_ea_exc(exception_id)
**Frontend queries:** queries.ts:L278,L338,L453; seed.ts CLEAR_TABLES

### Table 13: duplicate_findings
```
duplicate_id        text        PK
duplicate_group_id  text        NOT NULL
invoice_id_a        text        NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE
invoice_id_b        text        NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE
reason              text        NOT NULL
normalized_key      text        (nullable)
created_at          timestamptz NOT NULL DEFAULT now()
```
**Indexes:** idx_dup_group, idx_dup_a(invoice_id_a), idx_dup_b(invoice_id_b)
**Frontend queries:** queries.ts:L74,L1032,L1041; seed.ts insertBatch

### Table 14: audit_events (APPEND-ONLY)
```
audit_id      text        PK
entity_type   text        NOT NULL
entity_id     text        NOT NULL
action        text        NOT NULL
actor_user_id text        (nullable)
details       jsonb       (nullable)
created_at    timestamptz NOT NULL DEFAULT now()
```
**Migration 002:** trg_audit_events_immutable (blocks UPDATE/DELETE) + REVOKE UPDATE,DELETE from anon,authenticated
**Indexes:** idx_aud_entity(entity_type, entity_id), idx_aud_created(created_at)
**Frontend queries:** queries.ts:L71,L263,L348,L403,L561,L697,L1110,L1150

### Table 15: state_transitions (APPEND-ONLY)
```
transition_id  text        PK
invoice_id     text        NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE
from_state     text        NOT NULL
to_state       text        NOT NULL
reason         text        (nullable)
actor_user_id  text        (nullable)
created_at     timestamptz NOT NULL DEFAULT now()
```
**Migration 002:** trg_state_transitions_immutable (blocks UPDATE/DELETE) + REVOKE
**Indexes:** idx_st_inv(invoice_id)
**Frontend queries:** queries.ts:L72,L392,L551,L648,L687,L720,L743,L1126

### Table 16: extraction_attempts
```
attempt_id      text           PK
invoice_id      text           NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE
provider        text           NOT NULL DEFAULT 'SIMULATED'
status          text           NOT NULL
confidence      numeric(5,2)   (nullable)
extracted_json  jsonb          (nullable)
error_message   text           (nullable)
created_at      timestamptz    NOT NULL DEFAULT now()
```
**Indexes:** idx_exa_inv(invoice_id)
**Frontend queries:** seed.ts CLEAR_TABLES only (future use)

### Table 17: config_settings
```
key         text    PK
value       jsonb   NOT NULL
description text    (nullable)
updated_at  timestamptz NOT NULL DEFAULT now()
```
**Default data:** price_abs_tolerance=0.5, price_pct_tolerance=0.01, quantity_tolerance_pct=0.0,
rounding_tolerance=0.02, require_receipt=true, two_way_match_policy='WARN',
tax_codes={STANDARD:0.1,ZERO:0.0,REDUCED:0.05}
**Frontend queries:** queries.ts:L246,L1177; seed.ts:L310,L321

### Table 18: generation_manifests (FIRST queried by DataLab)
```
manifest_id      text        PK
seed             text        NOT NULL
scale            text        NOT NULL
row_counts       jsonb       NOT NULL
scenario_counts  jsonb       NOT NULL
checksum         text        (nullable)
generated_at     timestamptz NOT NULL DEFAULT now()
```
**Frontend queries:** queries.ts:L252; seed.ts:L276
**NOTE:** `fetchManifests()` is the FIRST call DataLabPage makes on mount. Its absence triggers the PGRST205 error chain.

### Table 19: evaluation_runs
```
run_id        text        PK
seed          text        (nullable)
scale         text        (nullable)
started_at    timestamptz NOT NULL DEFAULT now()
completed_at  timestamptz (nullable)
metrics       jsonb       (nullable)
summary       jsonb       (nullable)
status        text        NOT NULL DEFAULT 'RUNNING'
```
**Frontend queries:** queries.ts:L258; seed.ts:L292

### Table 20: ground_truth (isolated from matching engine)
```
invoice_id                 text     PK REFERENCES invoices(invoice_id) ON DELETE CASCADE
scenario_label             text     NOT NULL
expected_match_outcome     text     NOT NULL
expected_exception_codes   text[]   (nullable)
expected_duplicate_group   text     (nullable)
expected_approval_eligible boolean  NOT NULL DEFAULT false
expected_payment_ready     boolean  NOT NULL DEFAULT false
expected_payment_outcome   text     (nullable)
notes                      text     (nullable)
```
**Indexes:** idx_gt_scenario(scenario_label)
**Architectural note:** matchingEngine.ts NEVER reads this table. Isolation is intentional.
**Frontend queries:** queries.ts:L73,L272; DataLabPage.tsx:L30; seed.ts:L97

### Table 21: rule_executions
```
execution_id      text        PK
invoice_id        text        NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE
processing_run_id text        NOT NULL
rule_id           text        NOT NULL
rule_version      text        NOT NULL DEFAULT '1.0'
result            text        NOT NULL CHECK (IN PASS,FAIL,WARN,SKIPPED,MATCHED,MATCHED_WITHIN_TOLERANCE,PARTIAL_MATCH,EXCEPTION,BLOCKED,PENDING_REVIEW)
observed_value    text        (nullable)
expected_value    text        (nullable)
tolerance         text        (nullable)
difference        text        (nullable)
explanation       text        (nullable)
created_at        timestamptz NOT NULL DEFAULT now()
```
**Indexes:** idx_re_inv(invoice_id), idx_re_run(processing_run_id)
**Frontend queries:** queries.ts:L70,L977,L992; seed.ts insertBatch

---

## 4. Stored Procedures & Functions

| Object | Type | Migration | Live Status |
|---|---|---|---|
| set_updated_at() | FUNCTION (trigger helper) | 001 L568-575 | NOT EXISTS |
| prevent_audit_tampering() | FUNCTION (trigger, immutability guard) | 002 L121-126 | NOT EXISTS |
| decide_approval_secure(...) | FUNCTION SECURITY DEFINER | 002 L147-268 | MISSING PGRST202 |
| schedule_payment_secure(...) | FUNCTION SECURITY DEFINER | 002 L271-380 | MISSING PGRST202 |

---

## 5. Query-Schema Reconciliation (All Correct)

All TypeScript queries in `queries.ts`, `seed.ts`, `session.ts`, and page components
reference columns that exist in the migration schema. No column name mismatches found.

Previously fixed issues:
- `invoices.paid_at` (does not exist — fixed in Phase 1, now uses `payments.paid_at`)
- Missing post-resolution lifecycle progression (fixed in Phase 2)

---

## 6. RLS & Security Audit

| Concern | Finding |
|---|---|
| RLS on all 21 tables | PASS — all have ENABLE ROW LEVEL SECURITY |
| Permissive policies for demo | ACCEPTABLE — no-auth demo with shared data |
| Audit log immutability | PASS (Migration 002 trigger + REVOKE) |
| Double-payment prevention | PASS (Migration 002 partial unique indexes) |
| service_role key not exposed | PASS — only publishable/anon key in .env and frontend |
| auth.role() deprecated usage | PASS — uses TO clause instead |

---

## 7. Migration Execution Order

```
Step 1: 20261027155808_001_invoiceflow_core_schema.sql        (REQUIRED FIRST)
Step 2: 20261027180000_002_security_hardening_and_invariants.sql  (REQUIRES STEP 1)
```

Both files use IF NOT EXISTS / DO $$ BEGIN IF NOT EXISTS patterns —
safe to run on a database that already has partial schema.
