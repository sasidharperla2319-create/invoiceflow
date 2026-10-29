# InvoiceFlow AI — Database Verification Test Script

**Verification Date:** October 28, 2026 (pre-migration run)
**Supabase Project:** uwxuvjhfcorucpmognfq.supabase.co
**Status:** PENDING — migrations must be applied before tests pass

---

## How to Run

```bash
npm run verify:db
```

This runs `src/check_db.test.ts` via Vitest.

---

## Pre-Migration Baseline Results (Expected)

All tables should fail with PGRST205 before migrations are applied:

```
users                    : FAIL [PGRST205] — Table not in schema cache
vendors                  : FAIL [PGRST205] — Table not in schema cache
purchase_orders          : FAIL [PGRST205] — Table not in schema cache
purchase_order_lines     : FAIL [PGRST205] — Table not in schema cache
goods_receipts           : FAIL [PGRST205] — Table not in schema cache
goods_receipt_lines      : FAIL [PGRST205] — Table not in schema cache
invoices                 : FAIL [PGRST205] — Table not in schema cache
invoice_lines            : FAIL [PGRST205] — Table not in schema cache
approvals                : FAIL [PGRST205] — Table not in schema cache
payments                 : FAIL [PGRST205] — Table not in schema cache
exceptions               : FAIL [PGRST205] — Table not in schema cache
exception_assignments    : FAIL [PGRST205] — Table not in schema cache
duplicate_findings       : FAIL [PGRST205] — Table not in schema cache
audit_events             : FAIL [PGRST205] — Table not in schema cache
state_transitions        : FAIL [PGRST205] — Table not in schema cache
extraction_attempts      : FAIL [PGRST205] — Table not in schema cache
config_settings          : FAIL [PGRST205] — Table not in schema cache
generation_manifests     : FAIL [PGRST205] — Table not in schema cache
evaluation_runs          : FAIL [PGRST205] — Table not in schema cache
ground_truth             : FAIL [PGRST205] — Table not in schema cache
rule_executions          : FAIL [PGRST205] — Table not in schema cache

Tables verified: 0 / 21 exist.

decide_approval_secure   : MISSING [PGRST202] — Function not found
schedule_payment_secure  : MISSING [PGRST202] — Function not found
```

---

## Post-Migration Expected Results (Target)

After running both migration files in Supabase SQL Editor:

```
users                    : PASS — Table exists and is accessible (0 rows)
vendors                  : PASS — Table exists and is accessible (0 rows)
purchase_orders          : PASS — Table exists and is accessible (0 rows)
purchase_order_lines     : PASS — Table exists and is accessible (0 rows)
goods_receipts           : PASS — Table exists and is accessible (0 rows)
goods_receipt_lines      : PASS — Table exists and is accessible (0 rows)
invoices                 : PASS — Table exists and is accessible (0 rows)
invoice_lines            : PASS — Table exists and is accessible (0 rows)
approvals                : PASS — Table exists and is accessible (0 rows)
payments                 : PASS — Table exists and is accessible (0 rows)
exceptions               : PASS — Table exists and is accessible (0 rows)
exception_assignments    : PASS — Table exists and is accessible (0 rows)
duplicate_findings       : PASS — Table exists and is accessible (0 rows)
audit_events             : PASS — Table exists and is accessible (0 rows)
state_transitions        : PASS — Table exists and is accessible (0 rows)
extraction_attempts      : PASS — Table exists and is accessible (0 rows)
config_settings          : PASS — Table exists and is accessible (0 rows)
generation_manifests     : PASS — Table exists and is accessible (0 rows)
evaluation_runs          : PASS — Table exists and is accessible (0 rows)
ground_truth             : PASS — Table exists and is accessible (0 rows)
rule_executions          : PASS — Table exists and is accessible (0 rows)

Tables verified: 21 / 21 exist.

decide_approval_secure   : PASS (Function found)
schedule_payment_secure  : PASS (Function found)
```

---

## Post-Seed Expected Results (Target — after running Data Lab Generate)

After generating the starter dataset via Data Lab:

| Table | Expected Row Count (Starter, seed=20261022) |
|---|---|
| users | 8 |
| vendors | 5 |
| purchase_orders | 20 |
| purchase_order_lines | 40–100 (avg ~60) |
| goods_receipts | 18–20 |
| goods_receipt_lines | 40–80 |
| invoices | ~50 (+duplicates = ~55) |
| invoice_lines | ~100–160 |
| approvals | ~25–35 |
| payments | ~8–15 |
| ground_truth | ~50–55 (1:1 with invoices) |
| exceptions | varies by matching engine output |
| rule_executions | varies (per invoice per rule) |
| audit_events | varies |
| state_transitions | varies |
| duplicate_findings | ~5–10 |
| config_settings | 7 (seeded by seedDefaultConfig) |
| generation_manifests | 1 |
| evaluation_runs | 1 |

Scenario distribution (starter):
| Scenario | Count |
|---|---|
| CLEAN_MATCH | ~20 |
| PRICE_VARIANCE | ~8 |
| QUANTITY_MISMATCH | ~8 |
| DUPLICATE_INVOICE | ~5 |
| MISSING_RECEIPT | ~5 |
| TAX_OR_VENDOR_ERROR | ~5 |

---

## Manual Verification Checklist (Supabase Dashboard)

After applying migrations, verify in Table Editor:

- [ ] Navigate to Table Editor in Supabase Dashboard
- [ ] Confirm 21 tables appear in the public schema
- [ ] Click `ground_truth` — columns match Section 3.20 of DATABASE_AUDIT.md
- [ ] Click `generation_manifests` — columns match Section 3.18 of DATABASE_AUDIT.md
- [ ] Click `invoices` — at least 24 columns visible
- [ ] Click `payments` — `paid_at` column exists (not `invoices.paid_at`)
- [ ] Navigate to Database > Functions
- [ ] Confirm `decide_approval_secure` function appears
- [ ] Confirm `schedule_payment_secure` function appears
- [ ] Navigate to Authentication > Policies
- [ ] Confirm RLS is enabled on all 21 tables (green shield icon)

---

## Data Lab Integration Test (Manual)

After applying migrations and running Data Lab:

1. Navigate to /datalab in the running app
2. Verify no error banner appears (no PGRST205 message)
3. Click Generate Synthetic Dataset (Starter)
4. Verify completion message with seed and checksum
5. Verify scenario distribution counts appear
6. Verify precision/recall metrics display
7. Navigate to /invoices — confirm invoice list loads
8. Navigate to /exceptions — confirm exception workbench loads
9. Navigate to /approvals — confirm approval inbox loads
10. Navigate to /payments — confirm payment readiness page loads

All 10 checks should pass without console errors.

---

## Verification Command Reference

| Command | Purpose | When to Run |
|---|---|---|
| `npm run verify:db` | Full table + RPC existence check | After applying migrations |
| `npm run typecheck` | TypeScript type safety | Anytime |
| `npm run lint` | Code quality | Anytime |
| `npm run build` | Production build validity | Before deploy |
| `npm test` | Full unit test suite (55 tests) | After code changes |
| `npm run dev` | Start local dev server | For manual testing |

---

## Idempotency Guarantee

Both migration files can be run multiple times safely:
- `CREATE TABLE IF NOT EXISTS` — no-op if table exists
- `CREATE INDEX IF NOT EXISTS` — no-op if index exists
- `CREATE OR REPLACE FUNCTION` — updates function if exists
- `DROP POLICY IF EXISTS ... CREATE POLICY` — idempotent
- Constraint-adding blocks check pg_constraint before adding

Running migrations on an already-migrated database will produce no errors and make no changes.
