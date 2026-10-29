import { supabase } from './supabase';
import { round2 } from '@/domain/money';
import { invoiceLineId, normalizeInvoiceNumber } from '@/domain/ids';
import { evaluateExceptionResolution, type ExceptionResolutionOutcome } from '@/domain/lifecycle';
import { runMatch, defaultMatchConfig } from '@/domain/matchingEngine';
import { ROLE_BY_ISSUE_TYPE, severityForIssueType } from '@/domain/config';
import type { MatchOutcome } from '@/domain/types';
import type {
  Invoice,
  Vendor,
  PurchaseOrder,
  PurchaseOrderLine,
  GoodsReceipt,
  GoodsReceiptLine,
  InvoiceLine,
  ExceptionFinding,
  Approval,
  Payment,
  AuditEvent,
  StateTransition,
  DuplicateFinding,
  RuleExecution,
  GroundTruth,
  User,
  ConfigSetting,
  GenerationManifest,
  EvaluationRun,
  ExceptionAssignment,
  LifecycleState,
} from '@/domain/types';

export interface InvoiceDetail {
  invoice: Invoice;
  vendor: Vendor | null;
  po: PurchaseOrder | null;
  poLines: PurchaseOrderLine[];
  receipts: GoodsReceipt[];
  receiptLines: GoodsReceiptLine[];
  invoiceLines: InvoiceLine[];
  exceptions: ExceptionFinding[];
  approvals: Approval[];
  payments: Payment[];
  ruleExecutions: RuleExecution[];
  auditEvents: AuditEvent[];
  stateTransitions: StateTransition[];
  groundTruth: GroundTruth | null;
  duplicates: DuplicateFinding[];
}

const PAGE_SIZE = 25;

export async function fetchInvoiceDetail(invoiceId: string): Promise<InvoiceDetail | null> {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('invoice_id', invoiceId)
    .maybeSingle();
  if (error || !invoice) return null;

  const vendorId = (invoice as Invoice).vendor_id;
  const poId = (invoice as Invoice).purchase_order_id;

  const [vendor, po, invoiceLines, exceptions, approvals, payments, ruleExecutions, auditEvents, stateTransitions, groundTruth, duplicates] = await Promise.all([
    supabase.from('vendors').select('*').eq('vendor_id', vendorId).maybeSingle(),
    poId ? supabase.from('purchase_orders').select('*').eq('purchase_order_id', poId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from('invoice_lines').select('*').eq('invoice_id', invoiceId).order('line_number'),
    supabase.from('exceptions').select('*').eq('invoice_id', invoiceId).order('created_at'),
    supabase.from('approvals').select('*').eq('invoice_id', invoiceId).order('assigned_at'),
    supabase.from('payments').select('*').eq('invoice_id', invoiceId).order('created_at'),
    supabase.from('rule_executions').select('*').eq('invoice_id', invoiceId).order('created_at'),
    supabase.from('audit_events').select('*').eq('entity_id', invoiceId).order('created_at'),
    supabase.from('state_transitions').select('*').eq('invoice_id', invoiceId).order('created_at'),
    supabase.from('ground_truth').select('*').eq('invoice_id', invoiceId).maybeSingle(),
    supabase.from('duplicate_findings').select('*').or(`invoice_id_a.eq.${invoiceId},invoice_id_b.eq.${invoiceId}`),
  ]);

  const poLines = poId
    ? (await supabase.from('purchase_order_lines').select('*').eq('purchase_order_id', poId).order('line_number')).data ?? []
    : [];

  let receipts: GoodsReceipt[] = [];
  let receiptLines: GoodsReceiptLine[] = [];
  if (poId) {
    receipts = (await supabase.from('goods_receipts').select('*').eq('purchase_order_id', poId).order('receipt_date')).data ?? [];
    const grnIds = receipts.map((r) => r.goods_receipt_id);
    if (grnIds.length > 0) {
      receiptLines = (await supabase.from('goods_receipt_lines').select('*').in('goods_receipt_id', grnIds)).data ?? [];
    }
  }

  return {
    invoice: invoice as Invoice,
    vendor: (vendor.data as Vendor) ?? null,
    po: (po.data as PurchaseOrder) ?? null,
    poLines: poLines as PurchaseOrderLine[],
    receipts: receipts as GoodsReceipt[],
    receiptLines: receiptLines as GoodsReceiptLine[],
    invoiceLines: (invoiceLines.data as InvoiceLine[]) ?? [],
    exceptions: (exceptions.data as ExceptionFinding[]) ?? [],
    approvals: (approvals.data as Approval[]) ?? [],
    payments: (payments.data as Payment[]) ?? [],
    ruleExecutions: (ruleExecutions.data as RuleExecution[]) ?? [],
    auditEvents: (auditEvents.data as AuditEvent[]) ?? [],
    stateTransitions: (stateTransitions.data as StateTransition[]) ?? [],
    groundTruth: (groundTruth.data as GroundTruth) ?? null,
    duplicates: (duplicates.data as DuplicateFinding[]) ?? [],
  };
}

export interface InvoiceListFilters {
  search?: string;
  matchStatus?: string;
  approvalStatus?: string;
  paymentStatus?: string;
  scenarioLabel?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
}

export async function fetchInvoices(filters: InvoiceListFilters): Promise<{ rows: Invoice[]; total: number }> {
  let q = supabase.from('invoices').select('*', { count: 'exact' });
  if (filters.search) {
    q = q.or(`invoice_number.ilike.%${filters.search}%,invoice_id.ilike.%${filters.search}%`);
  }
  if (filters.matchStatus && filters.matchStatus !== 'ALL') q = q.eq('match_status', filters.matchStatus);
  if (filters.approvalStatus && filters.approvalStatus !== 'ALL') q = q.eq('approval_status', filters.approvalStatus);
  if (filters.paymentStatus && filters.paymentStatus !== 'ALL') q = q.eq('payment_status', filters.paymentStatus);
  if (filters.scenarioLabel && filters.scenarioLabel !== 'ALL') q = q.eq('scenario_label', filters.scenarioLabel);

  const sortBy = filters.sortBy ?? 'received_at';
  const sortDir = filters.sortDir ?? 'desc';
  q = q.order(sortBy, { ascending: sortDir === 'asc' });

  const page = filters.page ?? 1;
  q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { rows: (data as Invoice[]) ?? [], total: count ?? 0 };
}

export async function fetchDashboardStats(): Promise<{
  total: number;
  cleanMatches: number;
  exceptions: number;
  blocked: number;
  pendingApprovals: number;
  paymentReady: number;
  paid: number;
  paidAmount: number;
  outstandingAmount: number;
  byMatchStatus: { status: string; count: number }[];
  byScenario: { label: string; count: number }[];
  byDay: { date: string; count: number }[];
}> {
  const { data, error } = await supabase.from('invoices').select('match_status, approval_status, payment_status, scenario_label, grand_total, received_at');
  if (error) throw new Error(error.message);
  const rows = (data as Invoice[]) ?? [];

  const stats = {
    total: rows.length,
    cleanMatches: rows.filter((r) => r.match_status === 'MATCHED').length,
    exceptions: rows.filter((r) => r.match_status === 'EXCEPTION').length,
    blocked: rows.filter((r) => r.match_status === 'BLOCKED').length,
    pendingApprovals: rows.filter((r) => r.approval_status === 'PENDING').length,
    paymentReady: rows.filter((r) => r.payment_status === 'READY').length,
    paid: rows.filter((r) => r.payment_status === 'PAID').length,
    paidAmount: rows.filter((r) => r.payment_status === 'PAID').reduce((a, r) => a + r.grand_total, 0),
    outstandingAmount: rows.filter((r) => r.payment_status !== 'PAID').reduce((a, r) => a + r.grand_total, 0),
    byMatchStatus: aggregate(rows, 'match_status'),
    byScenario: aggregate(rows, 'scenario_label').map((d) => ({ label: d.status, count: d.count })),
    byDay: aggregateByDay(rows),
  };
  return stats;
}

function aggregate(rows: Invoice[], field: keyof Invoice): { status: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = String(r[field] ?? 'UNKNOWN');
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].map(([status, count]) => ({ status, count }));
}

function aggregateByDay(rows: Invoice[]): { date: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const d = (r.received_at ?? '').slice(0, 10);
    if (!d) continue;
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  return [...m.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchExceptions(filters: { status?: string; assignedTo?: string; issueType?: string } = {}): Promise<ExceptionFinding[]> {
  let q = supabase.from('exceptions').select('*').order('created_at', { ascending: false });
  if (filters.status && filters.status !== 'ALL') q = q.eq('status', filters.status);
  if (filters.issueType && filters.issueType !== 'ALL') q = q.eq('issue_type', filters.issueType);
  if (filters.assignedTo === 'UNASSIGNED') q = q.is('assigned_to_user_id', null);
  else if (filters.assignedTo) q = q.eq('assigned_to_user_id', filters.assignedTo);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as ExceptionFinding[]) ?? [];
}

export async function fetchApprovals(status = 'PENDING'): Promise<Approval[]> {
  const { data, error } = await supabase.from('approvals').select('*').eq('status', status).order('assigned_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Approval[]) ?? [];
}

export async function fetchPayments(status = 'ALL'): Promise<Payment[]> {
  let q = supabase.from('payments').select('*').order('created_at', { ascending: false });
  if (status !== 'ALL') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as Payment[]) ?? [];
}

export async function fetchPaymentReadyInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase.from('invoices').select('*').eq('payment_status', 'READY').order('due_date');
  if (error) throw new Error(error.message);
  return (data as Invoice[]) ?? [];
}

export async function fetchPaidInvoices(limit = 50): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('payment_status', 'PAID')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as Invoice[]) ?? [];
}

export async function fetchUsers(): Promise<User[]> {
  const { data, error } = await supabase.from('users').select('*').order('user_id');
  if (error) throw new Error(error.message);
  return (data as User[]) ?? [];
}

export async function fetchConfigSettings(): Promise<ConfigSetting[]> {
  const { data, error } = await supabase.from('config_settings').select('*').order('key');
  if (error) throw new Error(error.message);
  return (data as ConfigSetting[]) ?? [];
}

export async function fetchManifests(): Promise<GenerationManifest[]> {
  const { data, error } = await supabase.from('generation_manifests').select('*').order('generated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as GenerationManifest[]) ?? [];
}

export async function fetchEvaluationRuns(): Promise<EvaluationRun[]> {
  const { data, error } = await supabase.from('evaluation_runs').select('*').order('started_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as EvaluationRun[]) ?? [];
}

export async function fetchAuditEvents(entityType?: string, limit = 100): Promise<AuditEvent[]> {
  let q = supabase.from('audit_events').select('*').order('created_at', { ascending: false }).limit(limit);
  if (entityType) q = q.eq('entity_type', entityType);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as AuditEvent[]) ?? [];
}

export async function fetchGroundTruth(): Promise<GroundTruth[]> {
  const allRows: GroundTruth[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('ground_truth')
      .select('*')
      .order('invoice_id')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    allRows.push(...(data as GroundTruth[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}

export async function fetchExceptionAssignments(exceptionId: string): Promise<ExceptionAssignment[]> {
  const { data, error } = await supabase.from('exception_assignments').select('*').eq('exception_id', exceptionId).order('created_at');
  if (error) throw new Error(error.message);
  return (data as ExceptionAssignment[]) ?? [];
}

export async function fetchVendor(vendorId: string): Promise<Vendor | null> {
  const { data, error } = await supabase.from('vendors').select('*').eq('vendor_id', vendorId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Vendor) ?? null;
}

export async function fetchVendors(limit = 100): Promise<Vendor[]> {
  const { data, error } = await supabase.from('vendors').select('*').order('vendor_code').limit(limit);
  if (error) throw new Error(error.message);
  return (data as Vendor[]) ?? [];
}

export async function resolveException(
  exceptionId: string,
  actorRole: string,
  actorUserId: string,
  notes: string,
): Promise<{ invoiceId: string; outcome: ExceptionResolutionOutcome }> {
  const allowed = ['OPERATIONS_ANALYST', 'PROCESS_OWNER'];
  if (!allowed.includes(actorRole)) {
    throw new Error(`Role ${actorRole} cannot resolve exceptions`);
  }

  // 1. Fetch target exception to find invoice and status
  const { data: targetExc, error: excErr } = await supabase
    .from('exceptions')
    .select('*')
    .eq('exception_id', exceptionId)
    .maybeSingle();
  if (excErr || !targetExc) throw new Error(`Exception ${exceptionId} not found`);

  const prevStatus = (targetExc as ExceptionFinding).status;
  const invoiceId = (targetExc as ExceptionFinding).invoice_id;

  // 2. Fetch current invoice record
  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('invoice_id', invoiceId)
    .maybeSingle();
  if (invErr || !inv) throw new Error(`Invoice ${invoiceId} not found`);
  const invoice = inv as Invoice;

  // 3. Persist resolution (safe for repeated resolution attempts)
  if (prevStatus !== 'RESOLVED') {
    const { error: updErr } = await supabase
      .from('exceptions')
      .update({
        status: 'RESOLVED',
        resolution_notes: notes,
        resolved_at: new Date().toISOString(),
      })
      .eq('exception_id', exceptionId);
    if (updErr) throw new Error(updErr.message);

    const { error: aErr } = await supabase.from('exception_assignments').insert({
      assignment_id: `ASG-${Date.now()}`,
      exception_id: exceptionId,
      assigned_by: actorUserId,
      assigned_to: actorUserId,
      action: 'RESOLVED',
      notes,
    });
    if (aErr) throw new Error(aErr.message);

    const { error: audErr } = await supabase.from('audit_events').insert({
      audit_id: `AUD-${Date.now()}`,
      entity_type: 'exception',
      entity_id: exceptionId,
      action: 'RESOLVED',
      actor_user_id: actorUserId,
      details: { notes, role: actorRole },
    });
    if (audErr) throw new Error(audErr.message);
  }

  // 4. Fetch all exceptions for invoice to re-evaluate remaining unresolved
  const { data: allExc, error: allExcErr } = await supabase
    .from('exceptions')
    .select('*')
    .eq('invoice_id', invoiceId);
  if (allExcErr) throw new Error(allExcErr.message);

  const updatedExceptions = ((allExc as ExceptionFinding[]) ?? []).map((e) =>
    e.exception_id === exceptionId ? { ...e, status: 'RESOLVED' as const, resolution_notes: notes } : e
  );

  // 5. Evaluate lifecycle progression using existing business rules
  const outcome = evaluateExceptionResolution(invoice, updatedExceptions);

  const stateChanged = invoice.lifecycle_state !== outcome.lifecycleState;
  const matchChanged = invoice.match_status !== outcome.matchStatus;
  const approvalChanged = invoice.approval_status !== outcome.approvalStatus;
  const paymentChanged = invoice.payment_status !== outcome.paymentStatus;

  if (stateChanged || matchChanged || approvalChanged || paymentChanged) {
    const { error: invUpdErr } = await supabase
      .from('invoices')
      .update({
        lifecycle_state: outcome.lifecycleState,
        match_status: outcome.matchStatus,
        approval_status: outcome.approvalStatus,
        payment_status: outcome.paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('invoice_id', invoiceId);
    if (invUpdErr) throw new Error(invUpdErr.message);

    if (stateChanged) {
      const { error: trnErr } = await supabase.from('state_transitions').insert({
        transition_id: `TRN-${Date.now()}`,
        invoice_id: invoiceId,
        from_state: invoice.lifecycle_state,
        to_state: outcome.lifecycleState,
        reason: `Exception ${exceptionId} resolved (${notes})`,
        actor_user_id: actorUserId,
      });
      if (trnErr) throw new Error(trnErr.message);
    }

    const { error: audInvErr } = await supabase.from('audit_events').insert({
      audit_id: `AUD-${Date.now()}`,
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'EXCEPTION_RESOLVED_LIFECYCLE_UPDATED',
      actor_user_id: actorUserId,
      details: {
        exception_id: exceptionId,
        from_state: invoice.lifecycle_state,
        to_state: outcome.lifecycleState,
        new_match_status: outcome.matchStatus,
        unresolved_count: outcome.unresolvedCount,
        requires_approval: outcome.requiresApprovalTask,
      },
    });
    if (audInvErr) throw new Error(audInvErr.message);
  }

  // 6. If approval task is required, ensure a pending approval task exists in approvals table
  if (outcome.requiresApprovalTask) {
    const { data: existingApprs } = await supabase
      .from('approvals')
      .select('*')
      .eq('invoice_id', invoiceId)
      .eq('status', 'PENDING');
    if (!existingApprs || existingApprs.length === 0) {
      await supabase.from('approvals').insert({
        approval_id: `APR-${Date.now()}`,
        invoice_id: invoiceId,
        approver_user_id: null,
        approval_level: 1,
        status: 'PENDING',
        assigned_at: new Date().toISOString(),
        decided_at: null,
        decision_reason: null,
        comments: `Pending approver review following resolution of exception ${exceptionId}`,
      });
    }
  }

  return { invoiceId, outcome };
}

export async function assignException(exceptionId: string, userId: string, actorUserId: string): Promise<void> {
  const { error } = await supabase
    .from('exceptions')
    .update({ status: 'ASSIGNED', assigned_to_user_id: userId })
    .eq('exception_id', exceptionId);
  if (error) throw new Error(error.message);

  const { error: aErr } = await supabase.from('exception_assignments').insert({
    assignment_id: `ASG-${Date.now()}`,
    exception_id: exceptionId,
    assigned_by: actorUserId,
    assigned_to: userId,
    action: 'ASSIGNED',
    notes: null,
  });
  if (aErr) throw new Error(aErr.message);
}

export async function decideApproval(
  approvalId: string,
  invoiceId: string,
  decision: 'APPROVED' | 'REJECTED',
  actorRole: string,
  actorUserId: string,
  reason: string,
  comments?: string,
): Promise<void> {
  const allowed = ['APPROVER', 'PROCESS_OWNER'];
  if (!allowed.includes(actorRole)) {
    throw new Error(`Role ${actorRole} cannot approve invoices`);
  }

  // Fetch target invoice to check existing invariants
  const { data: inv, error: invFetchErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('invoice_id', invoiceId)
    .maybeSingle();
  if (invFetchErr || !inv) throw new Error(`Invoice ${invoiceId} not found`);
  const invoice = inv as Invoice;

  let newLifecycle: LifecycleState;
  let newPaymentStatus: Invoice['payment_status'];

  if (decision === 'APPROVED') {
    // Invariant: cannot approve if unresolved blocking exceptions exist
    const { data: excs } = await supabase
      .from('exceptions')
      .select('*')
      .eq('invoice_id', invoiceId)
      .in('status', ['OPEN', 'ASSIGNED']);
    const blockingExcs = (excs as ExceptionFinding[] ?? []).filter((e) => e.severity === 'BLOCKING');
    if (blockingExcs.length > 0) {
      throw new Error(
        `Cannot approve invoice ${invoiceId}: unresolved blocking exceptions exist (${blockingExcs.map((e) => e.issue_type).join(', ')})`,
      );
    }

    // Check vendor status
    const { data: vendorData } = await supabase
      .from('vendors')
      .select('*')
      .eq('vendor_id', invoice.vendor_id)
      .maybeSingle();
    const vendor = vendorData as Vendor | null;
    const vendorBlocked = vendor && (vendor.status === 'CLOSED' || vendor.status === 'ON_HOLD');

    // Check remaining non-blocking unresolved exceptions
    const remainingUnresolved = (excs?.length ?? 0) > 0;

    if (vendorBlocked || remainingUnresolved) {
      newLifecycle = 'APPROVED';
      newPaymentStatus = 'NOT_READY';
    } else {
      newLifecycle = 'PAYMENT_READY';
      newPaymentStatus = 'READY';
    }
  } else {
    newLifecycle = 'REJECTED';
    newPaymentStatus = 'NOT_READY';
  }

  const { error } = await supabase
    .from('approvals')
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decision_reason: reason,
      comments: comments ?? null,
    })
    .eq('approval_id', approvalId)
    .eq('status', 'PENDING');
  if (error) throw new Error(error.message);

  const { error: invErr } = await supabase
    .from('invoices')
    .update({
      approval_status: decision,
      lifecycle_state: newLifecycle,
      payment_status: newPaymentStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('invoice_id', invoiceId);
  if (invErr) throw new Error(invErr.message);

  const { error: trnErr } = await supabase.from('state_transitions').insert({
    transition_id: `TRN-${Date.now()}`,
    invoice_id: invoiceId,
    from_state: invoice.lifecycle_state,
    to_state: newLifecycle,
    reason,
    actor_user_id: actorUserId,
  });
  if (trnErr) throw new Error(trnErr.message);

  const { error: audErr } = await supabase.from('audit_events').insert({
    audit_id: `AUD-${Date.now()}`,
    entity_type: 'invoice',
    entity_id: invoiceId,
    action: `APPROVAL_${decision}`,
    actor_user_id: actorUserId,
    details: { approval_id: approvalId, reason, role: actorRole, to_lifecycle: newLifecycle },
  });
  if (audErr) throw new Error(audErr.message);
}

export async function schedulePayment(invoiceId: string, actorUserId: string): Promise<void> {
  const { data: inv, error } = await supabase.from('invoices').select('*').eq('invoice_id', invoiceId).maybeSingle();
  if (error || !inv) throw new Error('Invoice not found');
  const invoice = inv as Invoice;

  // Authoritative payment-readiness invariant enforcement
  if (invoice.lifecycle_state !== 'PAYMENT_READY' || invoice.payment_status !== 'READY') {
    throw new Error(`Invoice ${invoiceId} is not payment-ready (state: ${invoice.lifecycle_state}, payment_status: ${invoice.payment_status})`);
  }

  if (invoice.approval_status === 'PENDING' || invoice.approval_status === 'REJECTED') {
    throw new Error(`Cannot schedule payment: approval status is ${invoice.approval_status}`);
  }

  if (invoice.match_status === 'BLOCKED' || invoice.validation_status === 'VALIDATION_FAILED') {
    throw new Error('Cannot schedule payment: invoice matching or validation has failed');
  }

  // Check unresolved blocking exceptions
  const { data: excs } = await supabase
    .from('exceptions')
    .select('exception_id, severity, status')
    .eq('invoice_id', invoiceId)
    .in('status', ['OPEN', 'ASSIGNED']);
  if (excs?.some((e) => e.severity === 'BLOCKING')) {
    throw new Error(`Cannot schedule payment: invoice ${invoiceId} has unresolved blocking exceptions`);
  }

  // Check vendor status prohibits payment
  const { data: vendorData } = await supabase
    .from('vendors')
    .select('vendor_id, status')
    .eq('vendor_id', invoice.vendor_id)
    .maybeSingle();
  if (vendorData && (vendorData.status === 'CLOSED' || vendorData.status === 'ON_HOLD')) {
    throw new Error(`Cannot schedule payment: vendor ${invoice.vendor_id} status is ${vendorData.status}`);
  }

  // Check no existing paid payment
  const { data: existingPaid } = await supabase
    .from('payments')
    .select('payment_id')
    .eq('invoice_id', invoiceId)
    .eq('status', 'PAID');
  if (existingPaid && existingPaid.length > 0) {
    throw new Error(`Cannot schedule payment: invoice ${invoiceId} already has a successful payment`);
  }

  // Prevent duplicate active scheduled payment
  const { data: existingSched } = await supabase
    .from('payments')
    .select('payment_id')
    .eq('invoice_id', invoiceId)
    .eq('status', 'SCHEDULED');
  if (existingSched && existingSched.length > 0) {
    throw new Error(`Cannot schedule payment: invoice ${invoiceId} already has a payment scheduled`);
  }

  const { error: updErr } = await supabase
    .from('invoices')
    .update({ lifecycle_state: 'PAYMENT_SCHEDULED', payment_status: 'SCHEDULED', updated_at: new Date().toISOString() })
    .eq('invoice_id', invoiceId);
  if (updErr) throw new Error(updErr.message);

  const ref = `PMT-${invoiceId.slice(-6)}-${Date.now().toString().slice(-4)}`;
  const { error: payErr } = await supabase.from('payments').insert({
    payment_id: `PAY-${Date.now()}`,
    invoice_id: invoiceId,
    payment_reference: ref,
    amount: invoice.grand_total,
    currency: invoice.currency,
    status: 'SCHEDULED',
    scheduled_at: new Date().toISOString(),
  });
  if (payErr) throw new Error(payErr.message);

  const { error: trnErr } = await supabase.from('state_transitions').insert({
    transition_id: `TRN-${Date.now()}`,
    invoice_id: invoiceId,
    from_state: 'PAYMENT_READY',
    to_state: 'PAYMENT_SCHEDULED',
    reason: 'Scheduled for payment',
    actor_user_id: actorUserId,
  });
  if (trnErr) throw new Error(trnErr.message);

  await supabase.from('audit_events').insert({
    audit_id: `AUD-${Date.now()}`,
    entity_type: 'invoice',
    entity_id: invoiceId,
    action: 'PAYMENT_SCHEDULED',
    actor_user_id: actorUserId,
    details: { payment_reference: ref, amount: invoice.grand_total },
  });
}

export async function markPaymentPaid(paymentId: string, invoiceId: string, actorUserId: string): Promise<void> {
  // Check no existing successful payment for this invoice
  const { data: existing } = await supabase.from('payments').select('*').eq('invoice_id', invoiceId).eq('status', 'PAID');
  if (existing && existing.length > 0) {
    throw new Error(`Invoice ${invoiceId} already has a successful payment`);
  }

  const { error: payErr } = await supabase
    .from('payments')
    .update({ status: 'PAID', paid_at: new Date().toISOString() })
    .eq('payment_id', paymentId);
  if (payErr) throw new Error(payErr.message);

  const { error: invErr } = await supabase
    .from('invoices')
    .update({ lifecycle_state: 'PAID', payment_status: 'PAID', updated_at: new Date().toISOString() })
    .eq('invoice_id', invoiceId);
  if (invErr) throw new Error(invErr.message);

  const { error: trnErr } = await supabase.from('state_transitions').insert({
    transition_id: `TRN-${Date.now()}`,
    invoice_id: invoiceId,
    from_state: 'PAYMENT_SCHEDULED',
    to_state: 'PAID',
    reason: 'Simulated payment completed',
    actor_user_id: actorUserId,
  });
  if (trnErr) throw new Error(trnErr.message);

  await supabase.from('audit_events').insert({
    audit_id: `AUD-${Date.now()}`,
    entity_type: 'invoice',
    entity_id: invoiceId,
    action: 'PAYMENT_COMPLETED',
    actor_user_id: actorUserId,
    details: { payment_id: paymentId },
  });
}

export async function markPaymentFailed(paymentId: string, invoiceId: string, reason: string, actorUserId: string): Promise<void> {
  const { error: payErr } = await supabase
    .from('payments')
    .update({ status: 'FAILED', failure_reason: reason })
    .eq('payment_id', paymentId);
  if (payErr) throw new Error(payErr.message);

  const { error: invErr } = await supabase
    .from('invoices')
    .update({ lifecycle_state: 'PAYMENT_FAILED', payment_status: 'FAILED' })
    .eq('invoice_id', invoiceId);
  if (invErr) throw new Error(invErr.message);

  const { error: trnErr } = await supabase.from('state_transitions').insert({
    transition_id: `TRN-${Date.now()}`,
    invoice_id: invoiceId,
    from_state: 'PAYMENT_SCHEDULED',
    to_state: 'PAYMENT_FAILED',
    reason,
    actor_user_id: actorUserId,
  });
  if (trnErr) throw new Error(trnErr.message);
}

export async function retryPayment(invoiceId: string, actorUserId: string): Promise<void> {
  const { data: inv } = await supabase.from('invoices').select('*').eq('invoice_id', invoiceId).maybeSingle();
  if (!inv) throw new Error('Invoice not found');
  if ((inv as Invoice).lifecycle_state !== 'PAYMENT_FAILED') {
    throw new Error('Only failed payments can be retried');
  }
  const { error } = await supabase
    .from('invoices')
    .update({ lifecycle_state: 'PAYMENT_SCHEDULED', payment_status: 'SCHEDULED' })
    .eq('invoice_id', invoiceId);
  if (error) throw new Error(error.message);

  const { error: trnErr } = await supabase.from('state_transitions').insert({
    transition_id: `TRN-${Date.now()}`,
    invoice_id: invoiceId,
    from_state: 'PAYMENT_FAILED',
    to_state: 'PAYMENT_SCHEDULED',
    reason: 'Retry scheduled',
    actor_user_id: actorUserId,
  });
  if (trnErr) throw new Error(trnErr.message);
}

/**
 * APPROVAL_THRESHOLD: Invoices at or above this grand_total require explicit approval.
 * Clean-matched invoices below this threshold transition directly to PAYMENT_READY.
 * This is a configurable business rule documented here explicitly (Phase 2 assumption).
 */
const APPROVAL_THRESHOLD = 0;  // All invoices require approval — set >0 to auto-approve small clean invoices

export interface IntakeResult {
  invoiceId: string;
  matchOutcome: MatchOutcome;
  exceptionsCreated: number;
  approvalCreated: boolean;
  finalLifecycleState: string;
  finalMatchStatus: string;
}

/**
 * Full invoice intake pipeline:
 * 1. Validate payload
 * 2. Persist invoice + lines
 * 3. Fetch matching context (vendor, PO, PO lines, receipts, receipt lines, all invoices)
 * 4. Run matching engine (never uses ground_truth)
 * 5. Persist rule_executions + exceptions + duplicate_findings
 * 6. Determine lifecycle state + approval eligibility
 * 7. Create approval task if needed
 * 8. Record audit events + state transitions
 *
 * On failure after invoice insertion, the invoice is marked lifecycle_state='BLOCKED'
 * with an audit event so it does not appear as successfully processed.
 */
export async function processInvoiceIntake(payload: {
  invoice_number: string;
  vendor_id: string;
  purchase_order_id?: string | null;
  invoice_date: string;
  due_date: string;
  currency: string;
  lines: { sku: string; description?: string; quantity: number; unit_price: number; tax_code: string; tax_rate: number; po_line_id?: string | null }[];
}): Promise<IntakeResult> {
  // --- 1. Validate payload ---
  if (!payload.invoice_number || !payload.invoice_number.trim()) {
    throw new Error('Validation: invoice_number is required');
  }
  if (!payload.vendor_id || !payload.vendor_id.trim()) {
    throw new Error('Validation: vendor_id is required');
  }
  if (!payload.invoice_date || !payload.due_date) {
    throw new Error('Validation: invoice_date and due_date are required');
  }
  if (!payload.lines || payload.lines.length === 0) {
    throw new Error('Validation: at least one invoice line is required');
  }
  for (let i = 0; i < payload.lines.length; i++) {
    const l = payload.lines[i];
    if (!l.sku) throw new Error(`Validation: line ${i + 1} sku is required`);
    if (typeof l.quantity !== 'number' || l.quantity <= 0) throw new Error(`Validation: line ${i + 1} quantity must be positive`);
    if (typeof l.unit_price !== 'number' || l.unit_price < 0) throw new Error(`Validation: line ${i + 1} unit_price must be non-negative`);
    if (typeof l.tax_rate !== 'number' || l.tax_rate < 0) throw new Error(`Validation: line ${i + 1} tax_rate must be non-negative`);
  }

  // --- Check duplicate submission: prevent repeated submissions of identical invoice ---
  const { data: existingVendorInvs } = await supabase
    .from('invoices')
    .select('invoice_id, invoice_number, vendor_id')
    .eq('vendor_id', payload.vendor_id);
  if (existingVendorInvs && existingVendorInvs.length > 0) {
    const norm = normalizeInvoiceNumber(payload.invoice_number);
    const existing = existingVendorInvs.find((inv) => normalizeInvoiceNumber(inv.invoice_number) === norm);
    if (existing) {
      throw new Error(`Duplicate submission: Invoice '${payload.invoice_number}' already exists for vendor ${payload.vendor_id} (Invoice ID: ${existing.invoice_id})`);
    }
  }

  // --- 2. Build invoice + lines ---
  const invoiceId = `INV-MANUAL-${Date.now()}`;
  const lines = payload.lines.map((l, i) => {
    const sub = round2(l.quantity * l.unit_price);
    const tax = round2(sub * l.tax_rate);
    const total = round2(sub + tax);
    return {
      invoice_line_id: invoiceLineId(invoiceId, i + 1),
      invoice_id: invoiceId,
      line_number: i + 1,
      sku: l.sku,
      description: l.description ?? '',
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_code: l.tax_code,
      tax_rate: l.tax_rate,
      line_subtotal: sub,
      line_tax: tax,
      line_total: total,
      po_line_id: l.po_line_id ?? null,
    };
  });
  const subtotal = round2(lines.reduce((a, l) => a + l.line_subtotal, 0));
  const taxTotal = round2(lines.reduce((a, l) => a + l.line_tax, 0));
  const grandTotal = round2(subtotal + taxTotal);

  // --- 3. Persist invoice + lines ---
  const { error: invErr } = await supabase.from('invoices').insert({
    invoice_id: invoiceId,
    invoice_number: payload.invoice_number,
    vendor_id: payload.vendor_id,
    purchase_order_id: payload.purchase_order_id ?? null,
    invoice_date: payload.invoice_date,
    received_at: new Date().toISOString(),
    due_date: payload.due_date,
    currency: payload.currency,
    subtotal,
    tax_total: taxTotal,
    grand_total: grandTotal,
    extracted_fields_json: null,
    extraction_confidence: 1.0,
    extraction_status: 'EXTRACTED',
    validation_status: 'VALIDATED',
    match_status: 'UNMATCHED',
    approval_status: 'NOT_REQUIRED',
    payment_status: 'NOT_READY',
    lifecycle_state: 'VALIDATED',
    source_document_ref: null,
    scenario_label: null,
    duplicate_group_id: null,
  });
  if (invErr) throw new Error(`Invoice insert failed: ${invErr.message}`);

  const { error: lineErr } = await supabase.from('invoice_lines').insert(lines);
  if (lineErr) {
    // Compensate: delete the orphaned invoice
    await supabase.from('invoices').delete().eq('invoice_id', invoiceId);
    throw new Error(`Invoice line insert failed: ${lineErr.message}`);
  }

  // --- 4. Fetch matching context ---
  try {
    const invoice: Invoice = {
      invoice_id: invoiceId,
      invoice_number: payload.invoice_number,
      vendor_id: payload.vendor_id,
      purchase_order_id: payload.purchase_order_id ?? null,
      invoice_date: payload.invoice_date,
      received_at: new Date().toISOString(),
      due_date: payload.due_date,
      currency: payload.currency,
      subtotal,
      tax_total: taxTotal,
      grand_total: grandTotal,
      extracted_fields_json: null,
      extraction_confidence: 1.0,
      extraction_status: 'EXTRACTED',
      validation_status: 'VALIDATED',
      match_status: 'UNMATCHED',
      approval_status: 'NOT_REQUIRED',
      payment_status: 'NOT_READY',
      lifecycle_state: 'VALIDATED',
      source_document_ref: null,
      scenario_label: null,
      duplicate_group_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Fetch vendor
    const { data: vendorData } = await supabase.from('vendors').select('*').eq('vendor_id', payload.vendor_id).maybeSingle();
    const vendor = (vendorData as Vendor) ?? null;

    // Fetch PO + PO lines
    let po: PurchaseOrder | null = null;
    let poLines: PurchaseOrderLine[] = [];
    let receipts: GoodsReceipt[] = [];
    let receiptLines: GoodsReceiptLine[] = [];
    if (payload.purchase_order_id) {
      const { data: poData } = await supabase.from('purchase_orders').select('*').eq('purchase_order_id', payload.purchase_order_id).maybeSingle();
      po = (poData as PurchaseOrder) ?? null;
      if (po) {
        const { data: polData } = await supabase.from('purchase_order_lines').select('*').eq('purchase_order_id', po.purchase_order_id);
        poLines = (polData as PurchaseOrderLine[]) ?? [];
        const { data: grData } = await supabase.from('goods_receipts').select('*').eq('purchase_order_id', po.purchase_order_id);
        receipts = (grData as GoodsReceipt[]) ?? [];
        if (receipts.length > 0) {
          const grIds = receipts.map((g) => g.goods_receipt_id);
          const { data: grlData } = await supabase.from('goods_receipt_lines').select('*').in('goods_receipt_id', grIds);
          receiptLines = (grlData as GoodsReceiptLine[]) ?? [];
        }
      }
    }

    // Fetch all invoices for duplicate detection (excluding ground_truth — matching engine never reads it)
    const { data: allInvData } = await supabase.from('invoices').select('*');
    const allInvoices = (allInvData as Invoice[]) ?? [];

    const invoiceLines = lines.map((l) => ({
      ...l,
      invoice_line_id: l.invoice_line_id,
      invoice_id: l.invoice_id,
      line_number: l.line_number,
      sku: l.sku,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_code: l.tax_code,
      tax_rate: l.tax_rate,
      line_subtotal: l.line_subtotal,
      line_tax: l.line_tax,
      line_total: l.line_total,
      po_line_id: l.po_line_id,
    }));

    // --- 5. Run matching engine ---
    const config = defaultMatchConfig();
    const outcome = runMatch({
      invoice,
      invoiceLines,
      vendor,
      po,
      poLines,
      receipts,
      receiptLines,
      allInvoices,
      config,
    });

    // --- 6. Persist rule executions ---
    const ruleExecs = outcome.results.map((r, i) => ({
      execution_id: `RUL-MANUAL-${Date.now()}-${i}`,
      invoice_id: invoiceId,
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
    }));
    if (ruleExecs.length > 0) {
      const { error: ruleErr } = await supabase.from('rule_executions').insert(ruleExecs);
      if (ruleErr) throw new Error(`Rule execution insert failed: ${ruleErr.message}`);
    }

    // --- 7. Persist exceptions ---
    const excRecords = outcome.exceptions.map((e, i) => {
      const issueType = e.issue_type ?? 'UNKNOWN';
      return {
        exception_id: `EXC-MANUAL-${Date.now()}-${i}`,
        invoice_id: invoiceId,
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
        routed_to_role: (ROLE_BY_ISSUE_TYPE[issueType] as string) ?? null,
        assigned_to_user_id: null,
        priority: severityForIssueType(issueType) === 'BLOCKING' ? 'URGENT' : 'NORMAL',
        resolution_notes: null,
        created_at: new Date().toISOString(),
        resolved_at: null,
      };
    });
    if (excRecords.length > 0) {
      const { error: excErr } = await supabase.from('exceptions').insert(excRecords);
      if (excErr) throw new Error(`Exception insert failed: ${excErr.message}`);
    }

    // Persist duplicate findings
    const normalized = normalizeInvoiceNumber(payload.invoice_number);
    const dupSiblings = allInvoices.filter(
      (i) => i.invoice_id !== invoiceId && i.vendor_id === payload.vendor_id && normalizeInvoiceNumber(i.invoice_number) === normalized,
    );
    if (dupSiblings.length > 0) {
      const dupGroup = `DUPGRP-MANUAL-${Date.now()}`;
      const dupRecords = dupSiblings.map((sib, i) => ({
        duplicate_id: `DUP-MANUAL-${Date.now()}-${i}`,
        duplicate_group_id: dupGroup,
        invoice_id_a: invoiceId,
        invoice_id_b: sib.invoice_id,
        reason: 'Same vendor + normalized invoice number',
        normalized_key: normalized,
        created_at: new Date().toISOString(),
      }));
      await supabase.from('duplicate_findings').insert(dupRecords);
      // Update invoice duplicate_group_id
      await supabase.from('invoices').update({ duplicate_group_id: dupGroup }).eq('invoice_id', invoiceId);
    }

    // --- 8. Determine lifecycle state ---
    let lifecycleState: string;
    const matchStatus = outcome.overall_status;
    let approvalStatus = 'NOT_REQUIRED';
    let paymentStatus = 'NOT_READY';
    let approvalCreated = false;

    if (outcome.blocking) {
      lifecycleState = 'BLOCKED';
    } else if (outcome.exceptions.length > 0) {
      lifecycleState = 'EXCEPTION';
    } else {
      // Clean match — determine approval eligibility
      lifecycleState = 'MATCHED';

      // Check vendor status for payment eligibility
      const vendorBlocked = vendor && (vendor.status === 'CLOSED' || vendor.status === 'ON_HOLD');

      if (APPROVAL_THRESHOLD > 0 && grandTotal < APPROVAL_THRESHOLD && !vendorBlocked) {
        // Below threshold, auto-skip approval -> PAYMENT_READY
        lifecycleState = 'PAYMENT_READY';
        approvalStatus = 'NOT_REQUIRED';
        paymentStatus = 'READY';
      } else {
        // Requires approval
        lifecycleState = 'APPROVAL_PENDING';
        approvalStatus = 'PENDING';
        paymentStatus = 'NOT_READY';

        // Create pending approval task (prevent duplicates)
        const { data: existingAprs } = await supabase
          .from('approvals')
          .select('*')
          .eq('invoice_id', invoiceId)
          .eq('status', 'PENDING');
        if (!existingAprs || existingAprs.length === 0) {
          const { error: aprErr } = await supabase.from('approvals').insert({
            approval_id: `APR-MANUAL-${Date.now()}`,
            invoice_id: invoiceId,
            approver_user_id: null,
            approval_level: 1,
            status: 'PENDING',
            assigned_at: new Date().toISOString(),
            decided_at: null,
            decision_reason: null,
            comments: `Auto-created: invoice requires approval (grand_total=${grandTotal})`,
          });
          if (aprErr) throw new Error(`Approval task insert failed: ${aprErr.message}`);
          approvalCreated = true;
        }
      }
    }

    // --- 9. Update invoice with match results ---
    const { error: updErr } = await supabase.from('invoices').update({
      match_status: matchStatus,
      lifecycle_state: lifecycleState,
      approval_status: approvalStatus,
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
    }).eq('invoice_id', invoiceId);
    if (updErr) throw new Error(`Invoice update failed: ${updErr.message}`);

    // --- 10. Audit events + state transitions ---
    await supabase.from('audit_events').insert({
      audit_id: `AUD-INTAKE-${Date.now()}`,
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'IMPORTED_AND_MATCHED',
      actor_user_id: null,
      details: {
        method: 'structured_json',
        line_count: lines.length,
        overall_status: outcome.overall_status,
        exceptions_count: outcome.exceptions.length,
        approval_created: approvalCreated,
        lifecycle_state: lifecycleState,
      },
    });

    await supabase.from('state_transitions').insert({
      transition_id: `TRN-INTAKE-${Date.now()}`,
      invoice_id: invoiceId,
      from_state: 'VALIDATED',
      to_state: lifecycleState,
      reason: `Intake processing: ${outcome.overall_status} (${outcome.exceptions.length} exceptions)`,
      actor_user_id: null,
    });

    return {
      invoiceId,
      matchOutcome: outcome,
      exceptionsCreated: excRecords.length,
      approvalCreated,
      finalLifecycleState: lifecycleState,
      finalMatchStatus: matchStatus,
    };
  } catch (processingError) {
    // Compensate: mark invoice as BLOCKED so it doesn't appear as successfully processed
    await supabase.from('invoices').update({
      lifecycle_state: 'BLOCKED',
      match_status: 'BLOCKED',
      updated_at: new Date().toISOString(),
    }).eq('invoice_id', invoiceId);
    await supabase.from('audit_events').insert({
      audit_id: `AUD-ERR-${Date.now()}`,
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'PROCESSING_FAILED',
      actor_user_id: null,
      details: { error: (processingError as Error).message },
    });
    throw processingError;
  }
}

/** @deprecated Use processInvoiceIntake instead. Kept for backward compatibility. */
export async function importStructuredInvoice(payload: {
  invoice_number: string;
  vendor_id: string;
  purchase_order_id?: string | null;
  invoice_date: string;
  due_date: string;
  currency: string;
  lines: { sku: string; description?: string; quantity: number; unit_price: number; tax_code: string; tax_rate: number; po_line_id?: string | null }[];
}): Promise<string> {
  const result = await processInvoiceIntake(payload);
  return result.invoiceId;
}

export async function updateConfigValue(key: string, value: unknown, description?: string): Promise<void> {
  const { error } = await supabase
    .from('config_settings')
    .upsert({ key, value, description, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export { PAGE_SIZE };
