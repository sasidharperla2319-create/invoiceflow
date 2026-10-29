-- ==============================================================================
-- InvoiceFlow AI — Database Read-Only Diagnostics Script
-- Run this in Supabase SQL Editor to inspect schema state without modifying data.
-- ==============================================================================

-- 1. Database & Schema Context
SELECT
  current_database() AS database_name,
  current_schema() AS current_schema,
  current_user AS session_user,
  version() AS postgres_version;

-- 2. Supabase Migration History (if tracked by Supabase CLI)
DO $$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    RAISE NOTICE 'supabase_migrations.schema_migrations exists:';
  ELSE
    RAISE NOTICE 'supabase_migrations.schema_migrations does NOT exist (no CLI migrations tracked).';
  END IF;
END $$;

SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10;

-- 3. Public Tables Inventory
SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 4. Check All 21 Required Application Tables
SELECT
  t.table_name,
  to_regclass('public.' || quote_ident(t.table_name))::text AS regclass_result,
  CASE
    WHEN to_regclass('public.' || quote_ident(t.table_name)) IS NOT NULL THEN 'PRESENT'
    ELSE 'ABSENT'
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

-- 5. RPC Functions Check
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('decide_approval_secure', 'schedule_payment_secure', 'set_updated_at');

-- 6. Row-Level Security Status on Public Tables
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  COUNT(p.policyname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;

