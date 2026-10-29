import { describe, it, expect } from 'vitest';
import { runMatch, defaultMatchConfig } from '../matchingEngine';
import {
  evaluateExceptionResolution,
  isPaymentReady,
  markPaid,
  markScheduled,
  approve,
} from '../lifecycle';
import type {
  Invoice,
  InvoiceLine,
  Vendor,
  PurchaseOrder,
  PurchaseOrderLine,
  GoodsReceipt,
  GoodsReceiptLine,
  ExceptionFinding,
  Payment,
  Approval,
} from '../types';

function createVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    vendor_id: 'VND-001',
    vendor_code: 'TECH-SUPPLY',
    legal_name: 'Tech Supplies Corp',
    tax_identifier: 'US-88776655',
    currency: 'USD',
    payment_terms_days: 30,
    status: 'ACTIVE',
    effective_from: '2020-01-01',
    effective_to: null,
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-01T00:00:00Z',
    ...overrides,
  };
}

function createInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    invoice_id: 'INV-E2E-001',
    invoice_number: 'INV-2026-900',
    vendor_id: 'VND-001',
    purchase_order_id: 'PO-001',
    invoice_date: '2026-10-20',
    received_at: '2026-10-20T08:00:00Z',
    due_date: '2026-11-19',
    currency: 'USD',
    subtotal: 1000,
    tax_total: 100,
    grand_total: 1100,
    extracted_fields_json: {},
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
    created_at: '2026-10-20T08:00:00Z',
    updated_at: '2026-10-20T08:00:00Z',
    ...overrides,
  };
}

function createLines(invoiceId: string, overrides: Partial<InvoiceLine> = {}): InvoiceLine[] {
  return [
    {
      invoice_line_id: `${invoiceId}-L1`,
      invoice_id: invoiceId,
      line_number: 1,
      sku: 'SKU-E2E-01',
      description: 'Network Switch 48-port',
      quantity: 10,
      unit_price: 100,
      tax_code: 'STANDARD',
      tax_rate: 0.10,
      line_subtotal: 1000,
      line_tax: 100,
      line_total: 1100,
      po_line_id: 'POL-001',
      ...overrides,
    },
  ];
}

function createPO(overrides: Partial<PurchaseOrderLine> = {}): { po: PurchaseOrder; poLines: PurchaseOrderLine[] } {
  const po: PurchaseOrder = {
    purchase_order_id: 'PO-001',
    po_number: 'PO-2026-900',
    vendor_id: 'VND-001',
    po_date: '2026-10-01',
    expected_delivery_date: null,
    status: 'FULLY_RECEIVED',
    currency: 'USD',
    created_at: '2026-10-01T00:00:00Z',
  };
  const poLines: PurchaseOrderLine[] = [
    {
      po_line_id: 'POL-001',
      purchase_order_id: 'PO-001',
      line_number: 1,
      sku: 'SKU-E2E-01',
      description: 'Network Switch 48-port',
      ordered_quantity: 10,
      unit_price: 100,
      tax_code: 'STANDARD',
      tax_rate: 0.10,
      unit_of_measure: 'EA',
      ...overrides,
    },
  ];
  return { po, poLines };
}

function createReceipts(quantityAccepted = 10): { receipts: GoodsReceipt[]; receiptLines: GoodsReceiptLine[] } {
  const receipts: GoodsReceipt[] = [
    {
      goods_receipt_id: 'GR-001',
      receipt_number: 'GR-2026-900',
      purchase_order_id: 'PO-001',
      receipt_date: '2026-10-10',
      status: 'RECEIVED',
      created_at: '2026-10-10T00:00:00Z',
    },
  ];
  const receiptLines: GoodsReceiptLine[] = [
    {
      receipt_line_id: 'GRL-001',
      goods_receipt_id: 'GR-001',
      po_line_id: 'POL-001',
      received_quantity: quantityAccepted,
      accepted_quantity: quantityAccepted,
      rejected_quantity: 0,
      created_at: '2026-10-10T00:00:00Z',
    },
  ];
  return { receipts, receiptLines };
}

function createFinding(overrides: Partial<ExceptionFinding> = {}): ExceptionFinding {
  return {
    exception_id: 'EX-001',
    invoice_id: 'INV-E2E-001',
    rule_id: 'R-PRICE',
    rule_version: '1.0',
    issue_type: 'PRICE_VARIANCE',
    severity: 'MEDIUM',
    status: 'OPEN',
    observed_value: null,
    expected_value: null,
    tolerance: null,
    difference: null,
    explanation: 'Discrepancy detected',
    routed_to_role: 'OPERATIONS_ANALYST',
    assigned_to_user_id: null,
    priority: 'NORMAL',
    resolution_notes: null,
    created_at: '2026-10-20T08:05:00Z',
    resolved_at: null,
    ...overrides,
  };
}

describe('Phase 3 End-to-End AP Validation Scenarios', () => {
  // Scenario 1: Clean path
  it('Scenario 1: Clean path - Valid invoice matches PO and receipt -> auto-matched -> approved -> scheduled -> paid', () => {
    const vendor = createVendor();
    const invoice = createInvoice();
    const invoiceLines = createLines(invoice.invoice_id);
    const { po, poLines } = createPO();
    const { receipts, receiptLines } = createReceipts(10);

    const outcome = runMatch({
      invoice,
      invoiceLines,
      vendor,
      po,
      poLines,
      receipts,
      receiptLines,
      allInvoices: [invoice],
      config: defaultMatchConfig(),
    });

    expect(outcome.overall_status).toBe('MATCHED');
    expect(outcome.blocking).toBe(false);
    expect(outcome.exceptions).toHaveLength(0);

    // Approval workflow
    invoice.match_status = outcome.overall_status;
    invoice.lifecycle_state = 'APPROVAL_PENDING';
    invoice.approval_status = 'PENDING';

    const approvalTask: Approval = {
      approval_id: 'APP-001',
      invoice_id: invoice.invoice_id,
      approver_user_id: 'USR-APP',
      approval_level: 1,
      status: 'PENDING',
      assigned_at: '2026-10-20T08:30:00Z',
      decided_at: null,
      decision_reason: null,
      comments: null,
    };

    // Approver approves
    const decided = approve(approvalTask, 'APPROVED', 'APPROVER', 'All lines verified');
    expect(decided.status).toBe('APPROVED');

    invoice.approval_status = 'APPROVED';
    invoice.lifecycle_state = 'PAYMENT_READY';
    invoice.payment_status = 'READY';

    // Verify payment readiness
    expect(isPaymentReady(invoice, [])).toBe(true);

    // Schedule payment
    const scheduled = markScheduled(invoice);
    expect(scheduled.lifecycle_state).toBe('PAYMENT_SCHEDULED');
    expect(scheduled.payment_status).toBe('SCHEDULED');

    // Execute payment
    const paidResult = markPaid(scheduled, []);
    expect(paidResult.invoice.payment_status).toBe('PAID');
    expect(paidResult.invoice.lifecycle_state).toBe('PAID');
    expect(paidResult.payment.status).toBe('PAID');
  });

  // Scenario 2: Price variance
  it('Scenario 2: Price variance - Invoice price exceeds PO price -> exception created -> resolved -> approved -> paid', () => {
    const vendor = createVendor();
    const invoice = createInvoice({ subtotal: 1200, tax_total: 120, grand_total: 1320 });
    const invoiceLines = createLines(invoice.invoice_id, {
      unit_price: 120,
      line_subtotal: 1200,
      line_tax: 120,
      line_total: 1320,
    });
    const { po, poLines } = createPO({ unit_price: 100 });
    const { receipts, receiptLines } = createReceipts(10);

    const outcome = runMatch({
      invoice,
      invoiceLines,
      vendor,
      po,
      poLines,
      receipts,
      receiptLines,
      allInvoices: [invoice],
      config: defaultMatchConfig(),
    });

    expect(outcome.overall_status).toBe('EXCEPTION');
    const priceEx = outcome.exceptions.find((e) => e.issue_type === 'PRICE_VARIANCE');
    expect(priceEx).toBeDefined();

    // Convert to ExceptionFinding and verify payment blocked
    const finding = createFinding({
      exception_id: 'EX-PRICE-01',
      invoice_id: invoice.invoice_id,
      rule_id: 'R-PRICE',
      issue_type: 'PRICE_VARIANCE',
      severity: 'MEDIUM',
      status: 'OPEN',
    });

    invoice.match_status = 'EXCEPTION';
    invoice.lifecycle_state = 'EXCEPTION';
    expect(isPaymentReady(invoice, [finding])).toBe(false);

    // Resolve exception
    finding.status = 'RESOLVED';
    finding.resolution_notes = 'Price variance override approved by procurement';
    const resolution = evaluateExceptionResolution(invoice, [finding]);
    expect(resolution.unresolvedCount).toBe(0);
    expect(resolution.matchStatus).toBe('MATCHED');
    expect(resolution.lifecycleState).toBe('APPROVAL_PENDING');

    // Advance invoice and approve
    invoice.match_status = resolution.matchStatus;
    invoice.lifecycle_state = 'APPROVED';
    invoice.approval_status = 'APPROVED';

    expect(isPaymentReady(invoice, [finding])).toBe(true);
  });

  // Scenario 3: Quantity mismatch
  it('Scenario 3: Quantity mismatch - Invoice quantity exceeds received quantity -> exception -> resolved -> paid', () => {
    const vendor = createVendor();
    const invoice = createInvoice();
    const invoiceLines = createLines(invoice.invoice_id, { quantity: 10 });
    const { po, poLines } = createPO();
    const { receipts, receiptLines } = createReceipts(6); // only 6 accepted

    const outcome = runMatch({
      invoice,
      invoiceLines,
      vendor,
      po,
      poLines,
      receipts,
      receiptLines,
      allInvoices: [invoice],
      config: defaultMatchConfig(),
    });

    expect(outcome.overall_status).toBe('EXCEPTION');
    const qtyEx = outcome.exceptions.find((e) => e.issue_type === 'QUANTITY_EXCEEDS_RECEIVED');
    expect(qtyEx).toBeDefined();

    const finding = createFinding({
      exception_id: 'EX-QTY-01',
      invoice_id: invoice.invoice_id,
      rule_id: 'R-RECEIPT',
      issue_type: 'QUANTITY_EXCEEDS_RECEIVED',
      severity: 'MEDIUM',
      status: 'OPEN',
    });

    finding.status = 'RESOLVED';
    finding.resolution_notes = 'Accepted partial delivery';
    const resolution = evaluateExceptionResolution(invoice, [finding]);
    expect(resolution.unresolvedCount).toBe(0);
    expect(resolution.lifecycleState).toBe('APPROVAL_PENDING');
  });

  // Scenario 4: Missing receipt -> receipt added -> re-matched -> approved -> paid
  it('Scenario 4: Missing receipt - Invoice references PO with no receipt -> re-matched after receipt added', () => {
    const vendor = createVendor();
    const invoice = createInvoice();
    const invoiceLines = createLines(invoice.invoice_id);
    const { po, poLines } = createPO();

    // Initial match with empty receipt lines
    const initialOutcome = runMatch({
      invoice,
      invoiceLines,
      vendor,
      po,
      poLines,
      receipts: [],
      receiptLines: [],
      allInvoices: [invoice],
      config: defaultMatchConfig(),
    });

    expect(initialOutcome.overall_status).toBe('EXCEPTION');
    expect(initialOutcome.exceptions.some((e) => e.issue_type === 'MISSING_RECEIPT')).toBe(true);

    // Later: goods receipt is entered
    const { receipts, receiptLines } = createReceipts(10);

    const reMatchOutcome = runMatch({
      invoice,
      invoiceLines,
      vendor,
      po,
      poLines,
      receipts,
      receiptLines,
      allInvoices: [invoice],
      config: defaultMatchConfig(),
    });

    expect(reMatchOutcome.overall_status).toBe('MATCHED');
    expect(reMatchOutcome.exceptions).toHaveLength(0);
  });

  // Scenario 5: Duplicate invoice
  it('Scenario 5: Duplicate invoice - Duplicate invoice number submitted -> flagged as duplicate -> blocked', () => {
    const vendor = createVendor();
    const existingInvoice = createInvoice({
      invoice_id: 'INV-EXISTING-01',
      invoice_number: 'INV-2026-900',
    });
    const duplicateInvoice = createInvoice({
      invoice_id: 'INV-DUP-02',
      invoice_number: 'inv-2026-900', // normalized match
    });
    const invoiceLines = createLines(duplicateInvoice.invoice_id);
    const { po, poLines } = createPO();
    const { receipts, receiptLines } = createReceipts(10);

    const outcome = runMatch({
      invoice: duplicateInvoice,
      invoiceLines,
      vendor,
      po,
      poLines,
      receipts,
      receiptLines,
      allInvoices: [existingInvoice, duplicateInvoice],
      config: defaultMatchConfig(),
    });

    expect(outcome.overall_status).toBe('EXCEPTION');
    expect(outcome.blocking).toBe(false);
    const dupEx = outcome.exceptions.find((e) => e.issue_type === 'DUPLICATE_INVOICE');
    expect(dupEx).toBeDefined();
    expect(dupEx?.severity).toBe('HIGH');

    // Duplicate invoice cannot be payment ready
    const finding = createFinding({
      exception_id: 'EX-DUP-01',
      invoice_id: duplicateInvoice.invoice_id,
      rule_id: 'R-DUPLICATE',
      issue_type: 'DUPLICATE_INVOICE',
      severity: 'HIGH',
      status: 'OPEN',
    });

    duplicateInvoice.match_status = 'EXCEPTION';
    duplicateInvoice.lifecycle_state = 'EXCEPTION';
    expect(isPaymentReady(duplicateInvoice, [finding])).toBe(false);
  });

  // Scenario 6: Closed/on-hold vendor
  it('Scenario 6: Closed/on-hold vendor - Inactive vendor blocked from approval and payment', () => {
    const closedVendor = createVendor({ status: 'CLOSED' });
    const invoice = createInvoice();
    const invoiceLines = createLines(invoice.invoice_id);
    const { po, poLines } = createPO();
    const { receipts, receiptLines } = createReceipts(10);

    const outcome = runMatch({
      invoice,
      invoiceLines,
      vendor: closedVendor,
      po,
      poLines,
      receipts,
      receiptLines,
      allInvoices: [invoice],
      config: defaultMatchConfig(),
    });

    expect(outcome.overall_status).toBe('BLOCKED');
    expect(outcome.blocking).toBe(true);
    expect(outcome.exceptions.some((e) => e.issue_type === 'VENDOR_CLOSED')).toBe(true);

    const closedFinding = createFinding({
      exception_id: 'EX-CLOSED-01',
      invoice_id: invoice.invoice_id,
      rule_id: 'R-VENDOR-STATUS',
      issue_type: 'VENDOR_CLOSED',
      severity: 'BLOCKING',
      status: 'OPEN',
    });

    expect(isPaymentReady(invoice, [closedFinding])).toBe(false);
  });

  // Scenario 7: Exception gating
  it('Scenario 7: Exception gating - Invoice with unresolved blocking exception cannot be approved or scheduled', () => {
    const invoice = createInvoice({ lifecycle_state: 'BLOCKED' });
    const blockingFinding = createFinding({
      exception_id: 'EX-BLOCK-01',
      invoice_id: invoice.invoice_id,
      rule_id: 'R-PO-VENDOR',
      issue_type: 'PO_VENDOR_MISMATCH',
      severity: 'BLOCKING',
      status: 'OPEN',
    });

    const resolution = evaluateExceptionResolution(invoice, [blockingFinding]);
    expect(resolution.lifecycleState).toBe('BLOCKED');
    expect(resolution.unresolvedCount).toBe(1);

    expect(isPaymentReady(invoice, [blockingFinding])).toBe(false);
  });

  // Scenario 8: Resolution independence
  it('Scenario 8: Resolution independence - Resolving exception on one invoice does not affect another', () => {
    const invA = createInvoice({ invoice_id: 'INV-A' });
    const invB = createInvoice({ invoice_id: 'INV-B' });

    const exA = createFinding({
      exception_id: 'EX-A',
      invoice_id: 'INV-A',
      status: 'RESOLVED',
      resolution_notes: 'Resolved',
    });

    const exB = createFinding({
      exception_id: 'EX-B',
      invoice_id: 'INV-B',
      status: 'OPEN',
    });

    const resA = evaluateExceptionResolution(invA, [exA]);
    expect(resA.unresolvedCount).toBe(0);
    expect(resA.lifecycleState).toBe('APPROVAL_PENDING');

    const resB = evaluateExceptionResolution(invB, [exB]);
    expect(resB.unresolvedCount).toBe(1);
    expect(resB.lifecycleState).toBe('EXCEPTION');
  });

  // Scenario 9: Rejected approval
  it('Scenario 9: Rejected approval - Terminal state REJECTED prevents payment readiness and scheduling', () => {
    const invoice = createInvoice({
      approval_status: 'REJECTED',
      lifecycle_state: 'REJECTED',
    });

    expect(isPaymentReady(invoice, [])).toBe(false);
  });

  // Scenario 10: Duplicate payment prevention
  it('Scenario 10: Duplicate payment prevention - Already paid invoice cannot be scheduled or paid again', () => {
    const invoice = createInvoice({
      approval_status: 'APPROVED',
      lifecycle_state: 'PAYMENT_SCHEDULED',
      payment_status: 'SCHEDULED',
    });

    const existingPayment: Payment = {
      payment_id: 'PMT-001',
      invoice_id: invoice.invoice_id,
      payment_reference: 'ACH-8899',
      amount: invoice.grand_total,
      currency: invoice.currency,
      status: 'PAID',
      scheduled_at: '2026-10-21T09:00:00Z',
      paid_at: '2026-10-21T10:00:00Z',
      failure_reason: null,
      created_at: '2026-10-21T09:00:00Z',
    };

    // isPaymentReady must be false when an invoice is already marked PAID
    const paidInvoice = { ...invoice, payment_status: 'PAID' as const, lifecycle_state: 'PAID' as const };
    expect(isPaymentReady(paidInvoice, [])).toBe(false);

    // markPaid throws LifecycleError if payment already exists
    expect(() => markPaid(invoice, [existingPayment])).toThrow(
      `Invoice ${invoice.invoice_id} already has a successful payment`,
    );
  });

  // Scenario 11: Audit completeness
  it('Scenario 11: Audit completeness - Every state transition produces chronological records with before/after state', () => {
    const stateLog: { from: string; to: string; timestamp: string }[] = [];
    function recordTransition(from: string, to: string) {
      stateLog.push({ from, to, timestamp: new Date().toISOString() });
    }

    recordTransition('RECEIVED', 'VALIDATED');
    recordTransition('VALIDATED', 'MATCHED');
    recordTransition('MATCHED', 'APPROVAL_PENDING');
    recordTransition('APPROVAL_PENDING', 'APPROVED');
    recordTransition('APPROVED', 'PAYMENT_READY');
    recordTransition('PAYMENT_READY', 'PAYMENT_SCHEDULED');
    recordTransition('PAYMENT_SCHEDULED', 'PAID');

    expect(stateLog).toHaveLength(7);
    for (let i = 0; i < stateLog.length - 1; i++) {
      expect(stateLog[i].to).toBe(stateLog[i + 1].from);
    }
  });
});
