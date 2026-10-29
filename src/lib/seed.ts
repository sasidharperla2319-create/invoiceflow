import { supabase } from './supabase';
import { generateDataset } from '@/domain/generator';
import { runMatch, defaultMatchConfig } from '@/domain/matchingEngine';
import { validateDataset, reproducibilityChecksum } from '@/domain/validation';
import { evaluate, formatMetrics, type EvaluationMetrics } from '@/domain/evaluation';
import { normalizeInvoiceNumber } from '@/domain/ids';
import { ROLE_BY_ISSUE_TYPE, severityForIssueType } from '@/domain/config';
import { manifestId } from '@/domain/ids';
import type {
  ExceptionFinding,
  RuleExecution,
  AuditEvent,
  StateTransition,
  DuplicateFinding,
  MatchOutcome,
} from '@/domain/types';

const BATCH_SIZE = 500;

async function insertBatch<T>(table: string, rows: T[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch as unknown as Record<string, unknown>[]);
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
  }
}

export interface SeedResult {
  manifest: { row_counts: Record<string, number>; scenario_counts: Record<string, number>; checksum: string };
  validation: { passed: boolean; summary: string; checks: { name: string; passed: boolean; detail?: string }[] };
  evaluation: EvaluationMetrics;
  evaluationFormatted: Record<string, string>;
  duplicatesCreated: number;
  exceptionsCreated: number;
  ruleExecutionsCreated: number;
}

// Tables with a column we can filter on for "delete all". Supabase requires
// at least one filter on delete. We use a per-table always-true filter.
const CLEAR_TABLES: { table: string; column: string; value: string }[] = [
  { table: 'rule_executions', column: 'created_at', value: '1970-01-01T00:00:00Z' },
  { table: 'exception_assignments', column: 'created_at', value: '1970-01-01T00:00:00Z' },
  { table: 'exceptions', column: 'created_at', value: '1970-01-01T00:00:00Z' },
  { table: 'duplicate_findings', column: 'created_at', value: '1970-01-01T00:00:00Z' },
  { table: 'state_transitions', column: 'created_at', value: '1970-01-01T00:00:00Z' },
  { table: 'audit_events', column: 'created_at', value: '1970-01-01T00:00:00Z' },
  { table: 'extraction_attempts', column: 'created_at', value: '1970-01-01T00:00:00Z' },
  { table: 'payments', column: 'created_at', value: '1970-01-01T00:00:00Z' },
  { table: 'approvals', column: 'assigned_at', value: '1970-01-01T00:00:00Z' },
  { table: 'invoice_lines', column: 'invoice_id', value: '' },
  { table: 'invoices', column: 'invoice_id', value: '' },
  { table: 'ground_truth', column: 'invoice_id', value: '' },
  { table: 'goods_receipt_lines', column: 'receipt_line_id', value: '' },
  { table: 'goods_receipts', column: 'goods_receipt_id', value: '' },
  { table: 'purchase_order_lines', column: 'po_line_id', value: '' },
  { table: 'purchase_orders', column: 'purchase_order_id', value: '' },
  { table: 'vendors', column: 'vendor_id', value: '' },
  { table: 'users', column: 'user_id', value: '' },
  { table: 'config_settings', column: 'updated_at', value: '1970-01-01T00:00:00Z' },
  { table: 'generation_manifests', column: 'generated_at', value: '1970-01-01T00:00:00Z' },
  { table: 'evaluation_runs', column: 'started_at', value: '1970-01-01T00:00:00Z' },
];

export async function clearAllData(): Promise<void> {
  for (const { table, column, value } of CLEAR_TABLES) {
    const filter = column.endsWith('_at')
      ? supabase.from(table).delete().gt(column, value)
      : supabase.from(table).delete().neq(column, value);
    const { error } = await filter;
    if (error) throw new Error(`Failed to clear ${table}: ${error.message}`);
  }
}

export async function seedDataset(seed: string, scale: 'starter' | 'full'): Promise<SeedResult> {
  const ds = generateDataset(seed, scale);

  // 1. Validate locally before inserting
  const validation = validateDataset(ds);
  if (!validation.passed) {
    throw new Error(`Dataset validation failed: ${validation.summary}`);
  }

  // 2. Clear existing data
  await clearAllData();

  // 3. Insert in dependency order
  await insertBatch('users', ds.users);
  await insertBatch('vendors', ds.vendors);
  await insertBatch('purchase_orders', ds.purchaseOrders);
  await insertBatch('purchase_order_lines', ds.purchaseOrderLines);
  await insertBatch('goods_receipts', ds.goodsReceipts);
  await insertBatch('goods_receipt_lines', ds.goodsReceiptLines);
  await insertBatch('invoices', ds.invoices);
  await insertBatch('invoice_lines', ds.invoiceLines);
  await insertBatch('approvals', ds.approvals);
  await insertBatch('payments', ds.payments);
  await insertBatch('ground_truth', ds.groundTruth);

  // 4. Run matching engine for every invoice -> create exceptions + rule_executions + audit events + state transitions + duplicate findings
  const allInvoices = ds.invoices;
  const config = defaultMatchConfig();
  const exceptions: ExceptionFinding[] = [];
  const ruleExecutions: RuleExecution[] = [];
  const duplicates: DuplicateFinding[] = [];
  const auditEvents: AuditEvent[] = [];
  const stateTransitions: StateTransition[] = [];
  const outcomes = new Map<string, MatchOutcome>();

  let excCounter = 0;
  let ruleCounter = 0;
  let dupCounter = 0;
  let audCounter = 0;
  let trnCounter = 0;

  // Build lookup maps
  const vendorsById = new Map(ds.vendors.map((v) => [v.vendor_id, v]));
  const posById = new Map(ds.purchaseOrders.map((p) => [p.purchase_order_id, p]));
  const polByPo = new Map<string, typeof ds.purchaseOrderLines>();
  for (const pol of ds.purchaseOrderLines) {
    const arr = polByPo.get(pol.purchase_order_id) ?? [];
    arr.push(pol);
    polByPo.set(pol.purchase_order_id, arr);
  }
  const grByPo = new Map<string, typeof ds.goodsReceipts>();
  for (const gr of ds.goodsReceipts) {
    const arr = grByPo.get(gr.purchase_order_id) ?? [];
    arr.push(gr);
    grByPo.set(gr.purchase_order_id, arr);
  }
  const grlByPo = new Map<string, typeof ds.goodsReceiptLines>();
  for (const grl of ds.goodsReceiptLines) {
    const gr = ds.goodsReceipts.find((g) => g.goods_receipt_id === grl.goods_receipt_id);
    if (gr) {
      const arr = grlByPo.get(gr.purchase_order_id) ?? [];
      arr.push(grl);
      grlByPo.set(gr.purchase_order_id, arr);
    }
  }
  const linesByInv = new Map<string, typeof ds.invoiceLines>();
  for (const il of ds.invoiceLines) {
    const arr = linesByInv.get(il.invoice_id) ?? [];
    arr.push(il);
    linesByInv.set(il.invoice_id, arr);
  }

  for (const inv of allInvoices) {
    const vendor = vendorsById.get(inv.vendor_id) ?? null;
    const po = inv.purchase_order_id ? posById.get(inv.purchase_order_id) ?? null : null;
    const poLines = po ? polByPo.get(po.purchase_order_id) ?? [] : [];
    const receipts = po ? grByPo.get(po.purchase_order_id) ?? [] : [];
    const receiptLines = po ? grlByPo.get(po.purchase_order_id) ?? [] : [];
    const invoiceLines = linesByInv.get(inv.invoice_id) ?? [];

    const outcome = runMatch({
      invoice: inv,
      invoiceLines,
      vendor,
      po,
      poLines,
      receipts,
      receiptLines,
      allInvoices,
      config,
    });
    outcomes.set(inv.invoice_id, outcome);

    // Persist rule executions
    for (const r of outcome.results) {
      ruleCounter++;
      ruleExecutions.push({
        execution_id: `RUL-${String(ruleCounter).padStart(8, '0')}`,
        invoice_id: inv.invoice_id,
        processing_run_id: outcome.processing_run_id,
        rule_id: r.rule_id,
        rule_version: r.rule_version,
        result: r.result,
        observed_value: r.observed_value,
        expected_value: r.expected_value,
        tolerance: r.tolerance,
        difference: r.difference,
        explanation: r.explanation,
        created_at: new Date().toISOString(),
      });
    }

    // Persist exceptions for failures
    for (const e of outcome.exceptions) {
      excCounter++;
      const issueType = e.issue_type ?? 'UNKNOWN';
      exceptions.push({
        exception_id: `EXC-${String(excCounter).padStart(7, '0')}`,
        invoice_id: inv.invoice_id,
        rule_id: e.rule_id,
        rule_version: e.rule_version,
        issue_type: issueType,
        severity: e.severity,
        status: 'OPEN',
        observed_value: e.observed_value,
        expected_value: e.expected_value,
        tolerance: e.tolerance,
        difference: e.difference,
        explanation: e.explanation,
        routed_to_role: (ROLE_BY_ISSUE_TYPE[issueType] as ExceptionFinding['routed_to_role']) ?? null,
        assigned_to_user_id: null,
        priority: severityForIssueType(issueType) === 'BLOCKING' ? 'URGENT' : 'NORMAL',
        resolution_notes: null,
        created_at: new Date().toISOString(),
        resolved_at: null,
      });
    }

    // Duplicate findings (pairs)
    if (inv.scenario_label === 'DUPLICATE_INVOICE' && inv.duplicate_group_id) {
      const normalized = normalizeInvoiceNumber(inv.invoice_number);
      const siblings = allInvoices.filter(
        (i) =>
          i.invoice_id !== inv.invoice_id &&
          i.vendor_id === inv.vendor_id &&
          normalizeInvoiceNumber(i.invoice_number) === normalized,
      );
      for (const sib of siblings) {
        dupCounter++;
        duplicates.push({
          duplicate_id: `DUP-${String(dupCounter).padStart(7, '0')}`,
          duplicate_group_id: inv.duplicate_group_id,
          invoice_id_a: inv.invoice_id,
          invoice_id_b: sib.invoice_id,
          reason: 'Same vendor + normalized invoice number',
          normalized_key: normalized,
          created_at: new Date().toISOString(),
        });
      }
    }

    // Audit event: processed
    audCounter++;
    auditEvents.push({
      audit_id: `AUD-${String(audCounter).padStart(8, '0')}`,
      entity_type: 'invoice',
      entity_id: inv.invoice_id,
      action: 'MATCHED',
      actor_user_id: null,
      details: { overall_status: outcome.overall_status, exceptions: outcome.exceptions.length },
      created_at: new Date().toISOString(),
    });

    // State transition: RECEIVED -> current
    trnCounter++;
    stateTransitions.push({
      transition_id: `TRN-${String(trnCounter).padStart(8, '0')}`,
      invoice_id: inv.invoice_id,
      from_state: 'RECEIVED',
      to_state: inv.lifecycle_state,
      reason: 'Initial processing',
      actor_user_id: null,
      created_at: new Date().toISOString(),
    });
  }

  await insertBatch('exceptions', exceptions);
  await insertBatch('rule_executions', ruleExecutions);
  await insertBatch('duplicate_findings', duplicates);
  await insertBatch('audit_events', auditEvents);
  await insertBatch('state_transitions', stateTransitions);

  // 5. Insert generation manifest
  const manifest = {
    manifest_id: manifestId(seed, scale),
    seed,
    scale,
    row_counts: ds.rowCounts,
    scenario_counts: ds.scenarioCounts,
    checksum: reproducibilityChecksum(ds),
    generated_at: new Date().toISOString(),
  };
  const { error: manifestErr } = await supabase.from('generation_manifests').insert(manifest);
  if (manifestErr) throw new Error(`Manifest insert failed: ${manifestErr.message}`);

  // 6. Run evaluation
  const metrics = evaluate(allInvoices, exceptions, ds.groundTruth, outcomes);
  const formatted = formatMetrics(metrics);
  const evalRun = {
    run_id: `EVAL-${String(Date.now()).slice(-6)}`,
    seed,
    scale,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    metrics: metrics as unknown as Record<string, unknown>,
    summary: formatted as unknown as Record<string, unknown>,
    status: 'COMPLETED',
  };
  const { error: evalErr } = await supabase.from('evaluation_runs').insert(evalRun);
  if (evalErr) throw new Error(`Evaluation run insert failed: ${evalErr.message}`);

  // 7. Insert default config settings (if empty)
  await seedDefaultConfig();

  return {
    manifest: { row_counts: ds.rowCounts, scenario_counts: ds.scenarioCounts, checksum: ds.checksum },
    validation,
    evaluation: metrics,
    evaluationFormatted: formatted,
    duplicatesCreated: duplicates.length,
    exceptionsCreated: exceptions.length,
    ruleExecutionsCreated: ruleExecutions.length,
  };
}

async function seedDefaultConfig(): Promise<void> {
  const { data } = await supabase.from('config_settings').select('key').limit(1);
  if (data && data.length > 0) return;
  const defaults = [
    { key: 'price_abs_tolerance', value: 0.5, description: 'Absolute price tolerance per line (currency units)' },
    { key: 'price_pct_tolerance', value: 0.01, description: 'Percentage price tolerance per line' },
    { key: 'quantity_tolerance_pct', value: 0.0, description: 'Quantity tolerance percentage' },
    { key: 'rounding_tolerance', value: 0.02, description: 'Arithmetic rounding tolerance' },
    { key: 'require_receipt', value: true, description: 'Require goods receipt for three-way matching' },
    { key: 'two_way_match_policy', value: 'WARN', description: 'Policy for invoices without a PO' },
    { key: 'tax_codes', value: { STANDARD: 0.1, ZERO: 0.0, REDUCED: 0.05 }, description: 'Allowed tax codes and rates' },
  ];
  const { error } = await supabase.from('config_settings').insert(defaults as unknown as Record<string, unknown>[]);
  if (error) throw new Error(`Default config insert failed: ${error.message}`);
}

export async function getDatasetSummary(): Promise<{ invoices: number; exceptions: number; approvals: number; payments: number; hasData: boolean }> {
  const [inv, exc, apr, pay] = await Promise.all([
    supabase.from('invoices').select('invoice_id', { count: 'exact', head: true }),
    supabase.from('exceptions').select('exception_id', { count: 'exact', head: true }),
    supabase.from('approvals').select('approval_id', { count: 'exact', head: true }),
    supabase.from('payments').select('payment_id', { count: 'exact', head: true }),
  ]);
  return {
    invoices: inv.count ?? 0,
    exceptions: exc.count ?? 0,
    approvals: apr.count ?? 0,
    payments: pay.count ?? 0,
    hasData: (inv.count ?? 0) > 0,
  };
}
