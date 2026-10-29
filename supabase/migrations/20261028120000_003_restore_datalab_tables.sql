-- InvoiceFlow AI Data Lab repair. Apply after the core schema (001).
-- This migration only adds the two missing tables; it does not change existing data.

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NULL THEN
    RAISE EXCEPTION 'public.invoices is missing; apply the core schema before this repair';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.generation_manifests (
  manifest_id text PRIMARY KEY,
  seed text NOT NULL,
  scale text NOT NULL,
  row_counts jsonb NOT NULL,
  scenario_counts jsonb NOT NULL,
  checksum text,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_manifests_generated_at
  ON public.generation_manifests (generated_at DESC);

ALTER TABLE public.generation_manifests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.generation_manifests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.generation_manifests
  TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'generation_manifests'
      AND policyname = 'anon_gm_s'
  ) THEN
    CREATE POLICY anon_gm_s ON public.generation_manifests
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'generation_manifests'
      AND policyname = 'anon_gm_i'
  ) THEN
    CREATE POLICY anon_gm_i ON public.generation_manifests
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'generation_manifests'
      AND policyname = 'anon_gm_u'
  ) THEN
    CREATE POLICY anon_gm_u ON public.generation_manifests
      FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'generation_manifests'
      AND policyname = 'anon_gm_d'
  ) THEN
    CREATE POLICY anon_gm_d ON public.generation_manifests
      FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_gt_scenario
  ON public.ground_truth (scenario_label);

ALTER TABLE public.ground_truth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ground_truth FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ground_truth
  TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ground_truth'
      AND policyname = 'anon_gt_s'
  ) THEN
    CREATE POLICY anon_gt_s ON public.ground_truth
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ground_truth'
      AND policyname = 'anon_gt_i'
  ) THEN
    CREATE POLICY anon_gt_i ON public.ground_truth
      FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ground_truth'
      AND policyname = 'anon_gt_u'
  ) THEN
    CREATE POLICY anon_gt_u ON public.ground_truth
      FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ground_truth'
      AND policyname = 'anon_gt_d'
  ) THEN
    CREATE POLICY anon_gt_d ON public.ground_truth
      FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;
