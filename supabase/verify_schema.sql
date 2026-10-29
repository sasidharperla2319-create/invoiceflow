-- ==============================================================================
-- InvoiceFlow AI — Database Schema Health & Object Verification Query
-- Run this in Supabase SQL Editor to verify tables, columns, PKs, FKs, and RLS.
-- ==============================================================================

-- Section 1: Detailed Discrepancy Check (Returns 0 rows when healthy)
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

-- Section 2: Summary Status (Shows 21/21 tables and positive regclass results)
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

