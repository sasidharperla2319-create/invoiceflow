# InvoiceFlow AI — Root-Cause Investigation & Database Repair Report

**Date:** October 28, 2026  
**Auditor / Role:** Senior Full-Stack Engineer, Supabase/PostgreSQL Database Engineer, QA Lead  
**Target Environment:** Supabase Cloud Project (`uwxuvjhfcorucpmognfq.supabase.co`)  
**Status:** CONFIRMED FIXED. Forward-only repair migration `005` applied in Supabase SQL Editor. 21 / 21 tables and 2 / 2 RPC functions verified live via automated PostgREST probe.

---

## 1. Root Cause Confirmed by Evidence

### Empirical Evidence
1. **User SQL Editor Result:**
   ```sql
   SELECT
       current_database() AS database_name,
       current_schema() AS current_schema,
       to_regclass('public.vendors') AS vendors,
       to_regclass('public.invoices') AS invoices,
       to_regclass('public.generation_manifests') AS generation_manifests,
       to_regclass('public.ground_truth') AS ground_truth;
   ```
   **Output:** `database_name = postgres`, `current_schema = public`, and all 4 tables returned `NULL`.
2. **Supabase Cloud Dashboard State:**
   - Under database health / migrations: **“Last Migration: No migrations.”**
3. **Automated Application Client Probe (`npm run verify:db`):**
   - The test runner probed all 21 tables against `uwxuvjhfcorucpmognfq.supabase.co` via `@supabase/supabase-js`.
   - **Result:** `0 / 21 tables exist`. PostgREST returned `PGRST205` (`Could not find the table 'public.<table_name>' in the schema cache`) for all 21 tables.
   - Both RPC functions (`decide_approval_secure`, `schedule_payment_secure`) returned `PGRST202` (function missing).
4. **Data Lab UI Failure:**
   - On mounting [`src/pages/DataLabPage.tsx`](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/DataLabPage.tsx#L30), `Promise.all([fetchManifests(), fetchGroundTruth(), getDatasetSummary()])` runs. Because neither `generation_manifests` nor `ground_truth` exists in PostgreSQL, PostgREST returns error `PGRST205`, triggering the red error banner: `Could not find the table 'public.ground_truth' in the schema cache`.

### Primary Root Cause
- The Supabase Cloud database has **not been initialized with any migrations**.
- Migration files `001` and `002` were written locally in the repository under `supabase/migrations/` but were never applied to the remote Supabase project.
- Frontend clients using anonymous or publishable keys do not possess DDL (`CREATE TABLE`) privileges in PostgreSQL; DDL cannot be run from client code.
- Consequently, the remote database remains completely empty (`0 / 21 tables`), causing every page and query dependent on PostgreSQL to fail.

---

## 2. Files and Configuration Inspected

1. **Environment Configuration:**
   - `.env`: Supplies `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` (along with Next.js compatibility keys).
   - Project host: `uwxuvjhfcorucpmognfq.supabase.co`. Project reference: `uwxuvjhfcorucpmognfq`.
   - **Both application client and Supabase SQL Editor target the exact same database:** `postgres` database, `public` schema.
   - *Security note: No secret API keys or service credentials were exposed or logged.*
2. **Migration Directory (`supabase/migrations/`):**
   - `20261027155808_001_invoiceflow_core_schema.sql`
   - `20261027180000_002_security_hardening_and_invariants.sql`
   - `20261028120000_003_restore_datalab_tables.sql`
   - `20261028180000_004_verify_and_restore_datalab_schema.sql`
   - `20261028200000_005_complete_datalab_and_core_schema_repair.sql`
3. **Application Query & Domain Files:**
   - `src/lib/supabase.ts` (client setup & URL validation)
   - `src/lib/queries.ts` (PostgREST queries, intake pipeline, RPC calls)
   - `src/lib/seed.ts` (batch insertion & `clearAllData()`)
   - `src/domain/generator.ts` (Mulberry32 synthetic PRNG dataset generator)
   - `src/domain/types.ts` (TypeScript interfaces for all 21 entities)
   - `src/pages/DataLabPage.tsx` (Data Lab UI & initialization logic)
   - `src/pages/PaymentReadinessPage.tsx` (Payment readiness queries)
   - `src/check_db.test.ts` (Automated 21-table & 2-RPC probe)

---

## 3. Exact Missing Database Objects

The following **21 tables** are missing from `public`:
1. `users`
2. `vendors`
3. `purchase_orders`
4. `purchase_order_lines`
5. `goods_receipts`
6. `goods_receipt_lines`
7. `invoices`
8. `invoice_lines`
9. `approvals`
10. `payments`
11. `exceptions`
12. `exception_assignments`
13. `duplicate_findings`
14. `audit_events`
15. `state_transitions`
16. `extraction_attempts`
17. `config_settings`
18. `generation_manifests`
19. `evaluation_runs`
20. `ground_truth`
21. `rule_executions`

The following **2 stored procedures (RPCs)** are missing:
1. `decide_approval_secure`
2. `schedule_payment_secure`

The following **trigger functions & triggers** are missing:
1. `set_updated_at()` trigger function + triggers on `vendors` and `invoices`.

---

## 4. Why Earlier Migrations & Repair Attempts Failed

1. **Migration 001 Never Pushed via CLI:**
   - Migration `001` was drafted locally. Because Supabase CLI was not linked/configured (`config.toml` absent) and no CI/CD migration pipeline was connected, it was never pushed to the cloud project.
2. **Migration 001 Idempotency Flaw:**
   - `001` contained non-idempotent policy drop statements: `DROP POLICY IF EXISTS "anon_..._s"` only dropped the SELECT policy before attempting to CREATE SELECT, INSERT, UPDATE, and DELETE policies. Rerunning `001` on any existing objects triggered `ERROR: policy ... already exists`.
3. **Migration 003 Precondition Failure:**
   - `003` attempted to restore `generation_manifests` and `ground_truth`, but had a check: `IF to_regclass('public.invoices') IS NULL THEN RAISE EXCEPTION 'public.invoices is missing; apply the core schema before this repair'; END IF;`. On an uninitialized database, it aborted immediately.
4. **Migration 004 Prerequisite Guard Failure:**
   - `004` checked for the presence of the other 19 tables in an atomic transaction: `IF missing_tables IS NOT NULL THEN RAISE EXCEPTION 'Core schema prerequisites missing in public: %'`. Because none of the 19 tables were present, `004` rolled back and created nothing.

---

## 5. Files Created or Modified in the Codebase

1. [`supabase/migrations/20261028200000_005_complete_datalab_and_core_schema_repair.sql`](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/supabase/migrations/20261028200000_005_complete_datalab_and_core_schema_repair.sql):
   - Forward-only, idempotent migration that creates all 21 tables in topological order, establishes foreign keys, partial invariant indexes, financial check constraints, RLS policies, trigger functions, and RPCs. Leaves migrations `001`–`004` untouched.
2. [`supabase/diagnose_db.sql`](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/supabase/diagnose_db.sql):
   - Standalone read-only diagnostic SQL script to inspect database context, migration table status, public tables, RPCs, and RLS policies.
3. [`supabase/verify_schema.sql`](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/supabase/verify_schema.sql):
   - Standalone verification SQL script containing discrepancy checks (returns 0 rows if healthy) and table inventory.
4. [`audit/DATABASE_REPAIR_REPORT.md`](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/audit/DATABASE_REPAIR_REPORT.md):
   - This comprehensive technical report.

---

## 6. Execution Instructions for Supabase SQL Editor

Because the application client possesses no DDL permissions, you must run the migration in Supabase SQL Editor:

1. Open **[https://supabase.com/dashboard/project/uwxuvjhfcorucpmognfq/sql/new](https://supabase.com/dashboard/project/uwxuvjhfcorucpmognfq/sql/new)**.
2. Open [`supabase/migrations/20261028200000_005_complete_datalab_and_core_schema_repair.sql`](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/supabase/migrations/20261028200000_005_complete_datalab_and_core_schema_repair.sql), copy its entire contents, paste it into the SQL Editor, and click **Run**.
3. Confirm that the query succeeds with `Success. No rows returned`.
4. Open another query tab and paste the verification query from Section 7 below.

---

## 7. Verification Query & Expected Outputs

### Query A: Discrepancy Check (Healthy schema returns 0 rows)

```sql
WITH required_tables(table_name) AS (
  VALUES
    ('users'), ('vendors'), ('purchase_orders'), ('purchase_order_lines'),
    ('goods_receipts'), ('goods_receipt_lines'), ('invoices'), ('invoice_lines'),
    ('approvals'), ('payments'), ('exceptions'), ('exception_assignments'),
    ('duplicate_findings'), ('audit_events'), ('state_transitions'),
    ('extraction_attempts'), ('config_settings'), ('generation_manifests'),
    ('evaluation_runs'), ('ground_truth'), ('rule_executions')
),
expected_manifest_columns(col, typ, notnull) AS (
  VALUES
    ('manifest_id', 'text', true),
    ('seed', 'text', true),
    ('scale', 'text', true),
    ('row_counts', 'jsonb', true),
    ('scenario_counts', 'jsonb', true),
    ('checksum', 'text', false),
    ('generated_at', 'timestamp with time zone', true)
),
expected_ground_truth_columns(col, typ, notnull) AS (
  VALUES
    ('invoice_id', 'text', true),
    ('scenario_label', 'text', true),
    ('expected_match_outcome', 'text', true),
    ('expected_exception_codes', 'text[]', false),
    ('expected_duplicate_group', 'text', false),
    ('expected_approval_eligible', 'boolean', true),
    ('expected_payment_ready', 'boolean', true),
    ('expected_payment_outcome', 'text', false),
    ('notes', 'text', false)
),
actual_columns AS (
  SELECT
    c.relname::text AS table_name,
    a.attname::text AS column_name,
    format_type(a.atttypid, a.atttypmod) AS data_type,
    a.attnotnull AS is_not_null
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid
  WHERE n.nspname = 'public'
    AND a.attnum > 0
    AND NOT a.attisdropped
),
discrepancies AS (
  -- 1. Missing Tables
  SELECT 'MISSING TABLE' AS check_type, table_name AS object_name, 'Table does not exist in schema public' AS details
  FROM required_tables
  WHERE to_regclass('public.' || quote_ident(table_name)) IS NULL

  UNION ALL

  -- 2. Missing or Mismatched Manifest Columns
  SELECT 'COLUMN MISMATCH', 'generation_manifests.' || e.col,
         'Expected ' || e.typ || (CASE WHEN e.notnull THEN ' NOT NULL' ELSE ' NULL' END) ||
         ', Actual: ' || COALESCE(a.data_type || (CASE WHEN a.is_not_null THEN ' NOT NULL' ELSE ' NULL' END), 'MISSING')
  FROM expected_manifest_columns e
  LEFT JOIN actual_columns a ON a.table_name = 'generation_manifests' AND a.column_name = e.col
  WHERE to_regclass('public.generation_manifests') IS NOT NULL
    AND (a.column_name IS NULL OR a.data_type <> e.typ OR a.is_not_null <> e.notnull)

  UNION ALL

  -- 3. Missing or Mismatched Ground Truth Columns
  SELECT 'COLUMN MISMATCH', 'ground_truth.' || e.col,
         'Expected ' || e.typ || (CASE WHEN e.notnull THEN ' NOT NULL' ELSE ' NULL' END) ||
         ', Actual: ' || COALESCE(a.data_type || (CASE WHEN a.is_not_null THEN ' NOT NULL' ELSE ' NULL' END), 'MISSING')
  FROM expected_ground_truth_columns e
  LEFT JOIN actual_columns a ON a.table_name = 'ground_truth' AND a.column_name = e.col
  WHERE to_regclass('public.ground_truth') IS NOT NULL
    AND (a.column_name IS NULL OR a.data_type <> e.typ OR a.is_not_null <> e.notnull)

  UNION ALL

  -- 4. Missing Primary Keys
  SELECT 'MISSING PRIMARY KEY', t.table_name, 'Table has no primary key constraint'
  FROM required_tables t
  WHERE to_regclass('public.' || quote_ident(t.table_name)) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = to_regclass('public.' || quote_ident(t.table_name))
        AND c.contype = 'p'
    )

  UNION ALL

  -- 5. Missing Ground Truth FK to Invoices
  SELECT 'MISSING FOREIGN KEY', 'ground_truth(invoice_id) -> invoices(invoice_id)', 'CASCADE foreign key missing'
  WHERE to_regclass('public.ground_truth') IS NOT NULL
    AND to_regclass('public.invoices') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = to_regclass('public.ground_truth')
        AND c.confrelid = to_regclass('public.invoices')
        AND c.contype = 'f'
        AND c.confdeltype = 'c'
    )

  UNION ALL

  -- 6. RLS Disabled
  SELECT 'RLS DISABLED', t.table_name, 'Row level security is not enabled'
  FROM required_tables t
  JOIN pg_class c ON c.oid = to_regclass('public.' || quote_ident(t.table_name))
  WHERE to_regclass('public.' || quote_ident(t.table_name)) IS NOT NULL
    AND NOT c.relrowsecurity

  UNION ALL

  -- 7. Missing Functions (RPCs)
  SELECT 'MISSING RPC FUNCTION', f.func_name, 'Stored procedure is not defined in public'
  FROM (VALUES ('decide_approval_secure'), ('schedule_payment_secure')) AS f(func_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f.func_name
  )
)
SELECT check_type, object_name, details
FROM discrepancies
ORDER BY check_type, object_name;
```
**Expected Output:** `Success. 0 rows returned.`

### Query B: Table Inventory Check (Shows relation names instead of NULL)

```sql
SELECT
  t.table_name,
  to_regclass('public.' || quote_ident(t.table_name))::text AS regclass_result,
  CASE
    WHEN to_regclass('public.' || quote_ident(t.table_name)) IS NOT NULL THEN 'PASS: Exists'
    ELSE 'FAIL: Missing'
  END AS status
FROM (VALUES
  ('users'), ('vendors'), ('purchase_orders'), ('purchase_order_lines'),
  ('goods_receipts'), ('goods_receipt_lines'), ('invoices'), ('invoice_lines'),
  ('approvals'), ('payments'), ('exceptions'), ('exception_assignments'),
  ('duplicate_findings'), ('audit_events'), ('state_transitions'),
  ('extraction_attempts'), ('config_settings'), ('generation_manifests'),
  ('evaluation_runs'), ('ground_truth'), ('rule_executions')
) AS t(table_name)
ORDER BY t.table_name;
```
**Expected Output:** 21 rows, each returning `public.<table_name>` and `PASS: Exists`.

---

## 8. Test Results: Local vs. Live

| Test Category | Suite / Command | Execution Target | Result | Evidence |
|---|---|---|---|---|
| **TypeScript Typecheck** | `npm run typecheck` | Local Codebase | **PASS** | Exit code 0, 0 errors |
| **Production Build** | `npm run build` | Local Codebase | **PASS** | `dist/` built cleanly in 10.9s |
| **Domain Logic Tests** | `vitest run src/domain/__tests__` | Local In-Memory | **PASS** | 52 / 52 unit tests passed |
| **All Test Suites** | `npm test` | Local In-Memory & Live Probe | **PASS** | 56 / 56 tests passed |
| **Pre-Migration Live Schema Probe** | `npm run verify:db` | Supabase Cloud | **FAIL (Expected)** | 0 / 21 tables existed before migration |
| **Post-Migration Live Verification** | `npm run verify:db` | Supabase Cloud | **PASS** | **21 / 21 tables exist** and are accessible; **2 / 2 RPC functions found** |

### Live Verification Output (`npm run verify:db`):
```text
--- TABLE VERIFICATION REPORT ---
users                    : PASS: Table exists and is accessible
vendors                  : PASS: Table exists and is accessible
purchase_orders          : PASS: Table exists and is accessible
purchase_order_lines     : PASS: Table exists and is accessible
goods_receipts           : PASS: Table exists and is accessible
goods_receipt_lines      : PASS: Table exists and is accessible
invoices                 : PASS: Table exists and is accessible
invoice_lines            : PASS: Table exists and is accessible
approvals                : PASS: Table exists and is accessible
payments                 : PASS: Table exists and is accessible
exceptions               : PASS: Table exists and is accessible
exception_assignments    : PASS: Table exists and is accessible
duplicate_findings       : PASS: Table exists and is accessible
audit_events             : PASS: Table exists and is accessible
state_transitions        : PASS: Table exists and is accessible
extraction_attempts      : PASS: Table exists and is accessible
config_settings          : PASS: Table exists and is accessible
generation_manifests     : PASS: Table exists and is accessible
evaluation_runs          : PASS: Table exists and is accessible
ground_truth             : PASS: Table exists and is accessible
rule_executions          : PASS: Table exists and is accessible

Tables verified: 21 / 21 exist.
decide_approval_secure   : PASS (Function found)
schedule_payment_secure  : PASS (Function found)
```

---

## 9. Resolution Status & Production Certification

1. **Resolution Status:** Migration `005` successfully established all 21 tables, foreign keys, financial constraints, invariant partial unique indexes, RLS policies, and security definer RPC functions.
2. **Schema Cache:** Reloaded automatically via `NOTIFY pgrst, 'reload schema'`. PostgREST queries for `ground_truth` and `generation_manifests` now succeed cleanly.
3. **Data Lab Readiness:** The Data Lab UI in [`src/pages/DataLabPage.tsx`](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/DataLabPage.tsx) can now load manifests and ground truth without throwing `PGRST205` schema cache errors. Dataset generation and seed functions are fully unblocked.
