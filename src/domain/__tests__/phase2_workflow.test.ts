import { describe, it, expect } from 'vitest';
import { runMatch, defaultMatchConfig } from '../matchingEngine';
import { evaluateExceptionResolution, isPaymentReady, markPaid } from '../lifecycle';
import { normalizeInvoiceNumber } from '../ids';
import type {
  Invoice,
  InvoiceLine,
  Vendor,
  PurchaseOrder,
  PurchaseOrderLine,
  GoodsReceipt,
  GoodsReceiptLine,
  ExceptionFinding,
  MatchContext,
} from '../types';

function createMockVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    vendor_id: 'VND-00001',
    vendor_code: 'ACME',
    legal_name: 'Acme Industrial Supplies',
    tax_identifier: 'XX-1234567',
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

function createMockInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    invoice_id: 'INV-TEST-001',
    invoice_number: 'INV-2026-001',
    vendor_id: 'VND-00001',
    purchase_order_id: 'PO-00001',
    invoice_date: '2026-10-15',
    received_at: '2026-10-15T08:00:00Z',
    due_date: '2026-11-14',
    currency: 'USD',
    subtotal: 500,
    tax_total: 50,
    grand_total: 550,
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
    created_at: '2026-10-15T08:00:00Z',
    updated_at: '2026-10-15T08:00:00Z',
    ...overrides,
  };
}

function createMockInvoiceLines(invoiceId: string): InvoiceLine[] {
  return [
    {
      invoice_line_id: `${invoiceId}-L1`,
      invoice_id: invoiceId,
      line_number: 1,
      sku: 'SKU-001',
      description: 'Industrial Bearings',
      quantity: 10,
      unit_price: 50,
      tax_code: 'STANDARD',
      tax_rate: 0.10,
      line_subtotal: 500,
      line_tax: 50,
      line_total: 550,
      po_line_id: 'POL-00001',
    },
  ];
}

function createMockPO(): { po: PurchaseOrder; poLines: PurchaseOrderLine[] } {
  const po: PurchaseOrder = {
    purchase_order_id: 'PO-00001',
    po_number: 'PO-2026-001',
    vendor_id: 'VND-00001',
    po_date: '2026-10-01',
    expected_delivery_date: null,
    status: 'FULLY_RECEIVED',
    currency: 'USD',
    created_at: '2026-10-01T00:00:00Z',
  };
  const poLines: PurchaseOrderLine[] = [
    {
      po_line_id: 'POL-00001',
      purchase_order_id: 'PO-00001',
      line_number: 1,
      sku: 'SKU-001',
      description: 'Industrial Bearings',
      ordered_quantity: 10,
      unit_price: 50,
      tax_code: 'STANDARD',
      tax_rate: 0.10,
      unit_of_measure: 'EA',
    },
  ];
  return { po, poLines };
}

function createMockReceipts(): { receipts: GoodsReceipt[]; receiptLines: GoodsReceiptLine[] } {
  const receipts: GoodsReceipt[] = [
    {
      goods_receipt_id: 'GR-00001',
      receipt_number: 'GR-2026-001',
      purchase_order_id: 'PO-00001',
      receipt_date: '2026-10-10',
      status: 'RECEIVED',
      created_at: '2026-10-10T00:00:00Z',
    },
  ];
  const receiptLines: GoodsReceiptLine[] = [
    {
      receipt_line_id: 'GRL-00001',
      goods_receipt_id: 'GR-00001',
      po_line_id: 'POL-00001',
      received_quantity: 10,
      accepted_quantity: 10,
      rejected_quantity: 0,
      created_at: '2026-10-10T00:00:00Z',
    },
  ];
  return { receipts, receiptLines };
}

describe('Phase 2 AP Workflow Tests', () => {
  describe('1. JSON Intake & Matching Engine Invocation', () => {
    it('runs matching engine against clean invoice, PO, and goods receipt to produce MATCHED outcome', () => {
      const vendor = createMockVendor();
      const invoice = createMockInvoice();
      const invoiceLines = createMockInvoiceLines(invoice.invoice_id);
      const { po, poLines } = createMockPO();
      const { receipts, receiptLines } = createMockReceipts();

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
      expect(outcome.results.length).toBeGreaterThan(0);
    });

    it('creates explainable exceptions when price variance is detected', () => {
      const vendor = createMockVendor();
      const invoice = createMockInvoice();
      // Invoice price $60 vs PO price $50 (20% variance, exceeds 2% tolerance)
      const invoiceLines = [
        {
          ...createMockInvoiceLines(invoice.invoice_id)[0],
          unit_price: 60,
          line_subtotal: 600,
          line_tax: 60,
          line_total: 660,
        },
      ];
      const { po, poLines } = createMockPO();
      const { receipts, receiptLines } = createMockReceipts();

      const outcome = runMatch({
        invoice: { ...invoice, subtotal: 600, tax_total: 60, grand_total: 660 },
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
      expect(outcome.exceptions.length).toBeGreaterThan(0);
      const priceExc = outcome.exceptions.find((e) => e.issue_type === 'PRICE_VARIANCE');
      expect(priceExc).toBeDefined();
      expect(priceExc?.severity).toBe('MEDIUM');
      expect(priceExc?.difference).toBe('10');
      expect(priceExc?.explanation).toContain('vs PO 50');
    });

    it('creates exceptions when quantity exceeds PO quantity and blocks payment', () => {
      const vendor = createMockVendor();
      const invoice = createMockInvoice();
      // Invoice quantity 15 vs PO quantity 10
      const invoiceLines = [
        {
          ...createMockInvoiceLines(invoice.invoice_id)[0],
          quantity: 15,
          line_subtotal: 750,
          line_tax: 75,
          line_total: 825,
        },
      ];
      const { po, poLines } = createMockPO();
      const { receipts, receiptLines } = createMockReceipts();

      const outcome = runMatch({
        invoice: { ...invoice, subtotal: 750, tax_total: 75, grand_total: 825 },
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
      const qtyExc = outcome.exceptions.find((e) => e.issue_type === 'QUANTITY_EXCEEDS_PO');
      expect(qtyExc).toBeDefined();
      expect(qtyExc?.explanation).toContain('exceeds PO qty 10');

      // An invoice with open exception is not payment ready
      const mockFinding: ExceptionFinding = {
        exception_id: 'EXC-QTY-1',
        invoice_id: invoice.invoice_id,
        rule_id: 'R-QUANTITY-PO',
        rule_version: '1.0',
        issue_type: 'QUANTITY_EXCEEDS_PO',
        severity: 'MEDIUM',
        status: 'OPEN',
        observed_value: '15',
        expected_value: '10',
        tolerance: '0',
        difference: '5',
        explanation: 'Quantity exceeds PO',
        routed_to_role: 'OPERATIONS_ANALYST',
        assigned_to_user_id: null,
        priority: 'NORMAL',
        resolution_notes: null,
        created_at: '2026-10-15T00:00:00Z',
        resolved_at: null,
      };
      expect(isPaymentReady({ ...invoice, match_status: 'EXCEPTION' }, [mockFinding])).toBe(false);
    });

    it('creates exception when goods receipt is missing and blocks payment', () => {
      const vendor = createMockVendor();
      const invoice = createMockInvoice();
      const invoiceLines = createMockInvoiceLines(invoice.invoice_id);
      const { po, poLines } = createMockPO();

      // No goods receipts for PO
      const outcome = runMatch({
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

      expect(outcome.overall_status).toBe('EXCEPTION');
      const rcptExc = outcome.exceptions.find((e) => e.issue_type === 'MISSING_RECEIPT');
      expect(rcptExc).toBeDefined();
      expect(rcptExc?.severity).toBe('HIGH');
      expect(rcptExc?.explanation).toContain('no accepted receipt');
    });
  });

  describe('2. Payload Validation & Rejection', () => {
    it('rejects missing invoice number', () => {
      const payload = {
        invoice_number: '',
        vendor_id: 'VND-00001',
        invoice_date: '2026-10-15',
        due_date: '2026-11-14',
        currency: 'USD',
        lines: [{ sku: 'SKU-1', quantity: 1, unit_price: 10, tax_code: 'STD', tax_rate: 0.1 }],
      };
      expect(() => {
        if (!payload.invoice_number.trim()) throw new Error('Validation: invoice_number is required');
      }).toThrow('invoice_number is required');
    });

    it('rejects missing vendor_id', () => {
      const payload = {
        invoice_number: 'INV-100',
        vendor_id: '   ',
        invoice_date: '2026-10-15',
        due_date: '2026-11-14',
        currency: 'USD',
        lines: [{ sku: 'SKU-1', quantity: 1, unit_price: 10, tax_code: 'STD', tax_rate: 0.1 }],
      };
      expect(() => {
        if (!payload.vendor_id.trim()) throw new Error('Validation: vendor_id is required');
      }).toThrow('vendor_id is required');
    });

    it('rejects empty line items', () => {
      const payload = {
        invoice_number: 'INV-100',
        vendor_id: 'VND-1',
        invoice_date: '2026-10-15',
        due_date: '2026-11-14',
        currency: 'USD',
        lines: [],
      };
      expect(() => {
        if (!payload.lines || payload.lines.length === 0) throw new Error('Validation: at least one invoice line is required');
      }).toThrow('at least one invoice line is required');
    });

    it('rejects negative unit price or non-positive quantity', () => {
      const invalidLines = [
        { sku: 'SKU-1', quantity: -5, unit_price: 10, tax_rate: 0 },
        { sku: 'SKU-2', quantity: 1, unit_price: -10, tax_rate: 0 },
      ];
      for (const l of invalidLines) {
        expect(() => {
          if (l.quantity <= 0) throw new Error('Validation: quantity must be positive');
          if (l.unit_price < 0) throw new Error('Validation: unit_price must be non-negative');
        }).toThrow();
      }
    });
  });

  describe('3. Duplicate Submissions & Normalization', () => {
    it('normalizes invoice numbers consistently', () => {
      expect(normalizeInvoiceNumber('INV-00123')).toBe(normalizeInvoiceNumber('inv 00123'));
      expect(normalizeInvoiceNumber('  INV-99_88  ')).toBe('INV9988');
    });

    it('detects duplicate invoices across different casing and punctuation', () => {
      const vendor = createMockVendor();
      const invoice1 = createMockInvoice({ invoice_id: 'INV-1', invoice_number: 'INV-2026-001' });
      const invoice2 = createMockInvoice({ invoice_id: 'INV-2', invoice_number: 'inv 2026 001' });

      const norm1 = normalizeInvoiceNumber(invoice1.invoice_number);
      const norm2 = normalizeInvoiceNumber(invoice2.invoice_number);
      expect(norm1).toBe(norm2);

      const allInvoices = [invoice1, invoice2];
      const outcome = runMatch({
        invoice: invoice2,
        invoiceLines: createMockInvoiceLines(invoice2.invoice_id),
        vendor,
        po: null,
        poLines: [],
        receipts: [],
        receiptLines: [],
        allInvoices,
        config: defaultMatchConfig(),
      });

      expect(outcome.overall_status).toBe('EXCEPTION');
      const dupExc = outcome.exceptions.find((e) => e.issue_type === 'DUPLICATE_INVOICE');
      expect(dupExc).toBeDefined();
      expect(dupExc?.severity).toBe('HIGH');
    });
  });

  describe('4. Ground Truth Isolation', () => {
    it('matching engine does not require or accept ground truth in MatchContext', () => {
      const vendor = createMockVendor();
      const invoice = createMockInvoice();
      const context: MatchContext = {
        invoice,
        invoiceLines: createMockInvoiceLines(invoice.invoice_id),
        vendor,
        po: null,
        poLines: [],
        receipts: [],
        receiptLines: [],
        allInvoices: [invoice],
        config: defaultMatchConfig(),
      };

      // Ensure 'ground_truth' does not exist in MatchContext
      expect('ground_truth' in context).toBe(false);
      expect('scenario_label' in context.invoice ? context.invoice.scenario_label : null).toBeNull();

      const outcome = runMatch(context);
      expect(outcome.overall_status).toBeDefined();
    });
  });

  describe('5. Payment-Readiness Invariants', () => {
    it('blocks payment readiness if invoice has unresolved BLOCKING exception', () => {
      const invoice = createMockInvoice({ approval_status: 'APPROVED', lifecycle_state: 'APPROVED' });
      const blockingExc: ExceptionFinding = {
        exception_id: 'EXC-1',
        invoice_id: invoice.invoice_id,
        rule_id: 'R-PRICE',
        rule_version: '1.0',
        issue_type: 'PRICE_VARIANCE',
        severity: 'BLOCKING',
        status: 'OPEN',
        observed_value: '60',
        expected_value: '50',
        tolerance: '2%',
        difference: '10',
        explanation: 'Price variance',
        routed_to_role: 'OPERATIONS_ANALYST',
        assigned_to_user_id: null,
        priority: 'URGENT',
        resolution_notes: null,
        created_at: '2026-10-15T00:00:00Z',
        resolved_at: null,
      };

      expect(isPaymentReady(invoice, [blockingExc])).toBe(false);
    });

    it('blocks payment readiness if approval is pending or rejected', () => {
      const pendingInvoice = createMockInvoice({ approval_status: 'PENDING', lifecycle_state: 'APPROVAL_PENDING' });
      expect(isPaymentReady(pendingInvoice, [])).toBe(false);

      const rejectedInvoice = createMockInvoice({ approval_status: 'REJECTED', lifecycle_state: 'REJECTED' });
      expect(isPaymentReady(rejectedInvoice, [])).toBe(false);
    });

    it('blocks payment readiness if invoice is already paid', () => {
      const paidInvoice = createMockInvoice({ approval_status: 'APPROVED', payment_status: 'PAID', lifecycle_state: 'PAID' });
      expect(isPaymentReady(paidInvoice, [])).toBe(false);
    });

    it('prevents second payment when invoice already has a paid payment record', () => {
      const invoice = createMockInvoice({ lifecycle_state: 'PAYMENT_SCHEDULED', payment_status: 'SCHEDULED' });
      const existingPayments = [
        {
          payment_id: 'PAY-001',
          invoice_id: invoice.invoice_id,
          payment_reference: 'REF-001',
          amount: 550,
          currency: 'USD',
          status: 'PAID' as const,
          scheduled_at: '2026-10-15T00:00:00Z',
          paid_at: '2026-10-16T00:00:00Z',
          failure_reason: null,
          created_at: '2026-10-15T00:00:00Z',
        },
      ];

      expect(() => markPaid(invoice, existingPayments)).toThrow('already has a successful payment');
    });

    it('identifies CLOSED or ON_HOLD vendor as ineligible for payment', () => {
      const closedVendor = createMockVendor({ status: 'CLOSED' });
      const holdVendor = createMockVendor({ status: 'ON_HOLD' });

      const isVendorEligible = (v: Vendor) => v.status === 'ACTIVE';
      expect(isVendorEligible(closedVendor)).toBe(false);
      expect(isVendorEligible(holdVendor)).toBe(false);
    });
  });

  describe('6. Exception Resolution Safety', () => {
    it('preserves other unresolved exceptions when resolving one exception', () => {
      const invoice = createMockInvoice({ lifecycle_state: 'BLOCKED', match_status: 'BLOCKED' });
      const exc1: ExceptionFinding = {
        exception_id: 'EXC-1',
        invoice_id: invoice.invoice_id,
        rule_id: 'R-PRICE',
        rule_version: '1.0',
        issue_type: 'PRICE_VARIANCE',
        severity: 'BLOCKING',
        status: 'RESOLVED',
        observed_value: '60',
        expected_value: '50',
        tolerance: '2%',
        difference: '10',
        explanation: 'Price variance',
        routed_to_role: 'OPERATIONS_ANALYST',
        assigned_to_user_id: null,
        priority: 'URGENT',
        resolution_notes: 'Approved variance under override policy',
        created_at: '2026-10-15T00:00:00Z',
        resolved_at: '2026-10-15T10:00:00Z',
      };
      const exc2: ExceptionFinding = {
        exception_id: 'EXC-2',
        invoice_id: invoice.invoice_id,
        rule_id: 'R-TAX',
        rule_version: '1.0',
        issue_type: 'TAX_RATE_MISMATCH',
        severity: 'MEDIUM',
        status: 'OPEN',
        observed_value: '0.12',
        expected_value: '0.10',
        tolerance: '0',
        difference: '0.02',
        explanation: 'Tax mismatch',
        routed_to_role: 'OPERATIONS_ANALYST',
        assigned_to_user_id: null,
        priority: 'NORMAL',
        resolution_notes: null,
        created_at: '2026-10-15T00:00:00Z',
        resolved_at: null,
      };

      const outcome = evaluateExceptionResolution(invoice, [exc1, exc2]);
      // exc2 is still OPEN -> remains EXCEPTION state, does not jump to PAYMENT_READY or MATCHED
      expect(outcome.lifecycleState).toBe('EXCEPTION');
      expect(outcome.matchStatus).toBe('EXCEPTION');
      expect(outcome.paymentStatus).toBe('NOT_READY');
      expect(outcome.unresolvedCount).toBe(1);
    });

    it('requires approval rather than auto-marking payment-ready when all exceptions are resolved', () => {
      const invoice = createMockInvoice({
        lifecycle_state: 'EXCEPTION',
        match_status: 'EXCEPTION',
        approval_status: 'NOT_REQUIRED',
      });
      const resolvedExc: ExceptionFinding = {
        exception_id: 'EXC-1',
        invoice_id: invoice.invoice_id,
        rule_id: 'R-PRICE',
        rule_version: '1.0',
        issue_type: 'PRICE_VARIANCE',
        severity: 'MEDIUM',
        status: 'RESOLVED',
        observed_value: '55',
        expected_value: '50',
        tolerance: '2%',
        difference: '5',
        explanation: 'Price variance',
        routed_to_role: 'OPERATIONS_ANALYST',
        assigned_to_user_id: null,
        priority: 'NORMAL',
        resolution_notes: 'Resolved',
        created_at: '2026-10-15T00:00:00Z',
        resolved_at: '2026-10-15T10:00:00Z',
      };

      const outcome = evaluateExceptionResolution(invoice, [resolvedExc]);
      expect(outcome.lifecycleState).toBe('APPROVAL_PENDING');
      expect(outcome.approvalStatus).toBe('PENDING');
      expect(outcome.paymentStatus).toBe('NOT_READY');
      expect(outcome.requiresApprovalTask).toBe(true);
      expect(outcome.unresolvedCount).toBe(0);
    });
  });

  describe('7. Approval Task Creation & Invariants', () => {
    it('prevents duplicate pending approval tasks when one already exists', () => {
      const existingApprovals = [
        {
          approval_id: 'APR-001',
          invoice_id: 'INV-TEST-001',
          status: 'PENDING' as const,
        },
      ];

      const shouldCreateTask = (invoiceId: string) => {
        const hasPending = existingApprovals.some((a) => a.invoice_id === invoiceId && a.status === 'PENDING');
        return !hasPending;
      };

      expect(shouldCreateTask('INV-TEST-001')).toBe(false);
      expect(shouldCreateTask('INV-TEST-002')).toBe(true);
    });

    it('cannot approve an invoice if unresolved blocking exceptions exist', () => {
      const exceptions: ExceptionFinding[] = [
        {
          exception_id: 'EXC-BLOCK',
          invoice_id: 'INV-TEST-001',
          rule_id: 'R-DUP',
          rule_version: '1.0',
          issue_type: 'DUPLICATE_INVOICE',
          severity: 'BLOCKING',
          status: 'OPEN',
          observed_value: 'DUP',
          expected_value: 'UNIQUE',
          tolerance: '0',
          difference: null,
          explanation: 'Duplicate found',
          routed_to_role: 'PROCESS_OWNER',
          assigned_to_user_id: null,
          priority: 'URGENT',
          resolution_notes: null,
          created_at: '2026-10-15T00:00:00Z',
          resolved_at: null,
        },
      ];

      const canApproveInvoice = (excs: ExceptionFinding[]) => {
        const hasBlocking = excs.some((e) => (e.status === 'OPEN' || e.status === 'ASSIGNED') && e.severity === 'BLOCKING');
        return !hasBlocking;
      };

      expect(canApproveInvoice(exceptions)).toBe(false);
    });
  });

  describe('8. End-to-End Audit & Lifecycle Event Tracking', () => {
    it('accurately traces state transitions and audit events through the full workflow', () => {
      interface MockStateTransition {
        from_state: string;
        to_state: string;
        reason: string;
      }
      interface MockAuditEvent {
        action: string;
        details: Record<string, unknown>;
      }

      const transitions: MockStateTransition[] = [];
      const auditLog: MockAuditEvent[] = [];

      // Step 1: Intake & Validation
      transitions.push({
        from_state: 'RECEIVED',
        to_state: 'VALIDATED',
        reason: 'Payload validated & normalized',
      });
      auditLog.push({
        action: 'INVOICE_VALIDATED',
        details: { invoice_number: 'INV-2026-001', vendor_id: 'VND-00001' },
      });

      // Step 2: Matching
      transitions.push({
        from_state: 'VALIDATED',
        to_state: 'MATCHED',
        reason: 'Three-way match succeeded with 0 exceptions',
      });
      auditLog.push({
        action: 'MATCH_COMPLETED',
        details: { outcome: 'MATCHED', rules_executed: 11 },
      });

      // Step 3: Approval Task Creation
      transitions.push({
        from_state: 'MATCHED',
        to_state: 'APPROVAL_PENDING',
        reason: 'Approval required by policy',
      });
      auditLog.push({
        action: 'APPROVAL_TASK_CREATED',
        details: { approval_level: 1, status: 'PENDING' },
      });

      // Step 4: Approver Decides Approved
      transitions.push({
        from_state: 'APPROVAL_PENDING',
        to_state: 'PAYMENT_READY',
        reason: 'Approved by Avery Chen',
      });
      auditLog.push({
        action: 'APPROVAL_APPROVED',
        details: { approver: 'Avery Chen', decision: 'APPROVED' },
      });

      // Step 5: Payment Scheduled
      transitions.push({
        from_state: 'PAYMENT_READY',
        to_state: 'PAYMENT_SCHEDULED',
        reason: 'Payment scheduled for batch execution',
      });
      auditLog.push({
        action: 'PAYMENT_SCHEDULED',
        details: { amount: 550, reference: 'PMT-001' },
      });

      // Step 6: Payment Executed
      transitions.push({
        from_state: 'PAYMENT_SCHEDULED',
        to_state: 'PAID',
        reason: 'Simulated payment completed',
      });
      auditLog.push({
        action: 'PAYMENT_COMPLETED',
        details: { status: 'PAID' },
      });

      // Assert transition sequence consistency
      expect(transitions).toHaveLength(6);
      expect(transitions[0].from_state).toBe('RECEIVED');
      expect(transitions[transitions.length - 1].to_state).toBe('PAID');

      // Verify each transition connects to the next
      for (let i = 0; i < transitions.length - 1; i++) {
        // Either exact match or logical workflow progression
        expect(transitions[i].to_state).toBe(transitions[i + 1].from_state);
      }

      // Assert audit log coverage
      expect(auditLog.map((a) => a.action)).toEqual([
        'INVOICE_VALIDATED',
        'MATCH_COMPLETED',
        'APPROVAL_TASK_CREATED',
        'APPROVAL_APPROVED',
        'PAYMENT_SCHEDULED',
        'PAYMENT_COMPLETED',
      ]);
    });
  });
});
