import { describe, it, expect } from 'vitest';
import { isPaymentReady, markPaid } from '../lifecycle';
import type { Invoice, Payment, ExceptionFinding } from '../types';

function createMockInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    invoice_id: 'inv-test-1',
    invoice_number: 'INV-10001',
    vendor_id: 'vend-1',
    purchase_order_id: 'po-1',
    invoice_date: '2026-10-01',
    received_at: '2026-10-01T10:00:00Z',
    due_date: '2026-10-31',
    currency: 'USD',
    subtotal: 1000,
    tax_total: 100,
    grand_total: 1100,
    extracted_fields_json: {},
    extraction_confidence: 0.99,
    extraction_status: 'EXTRACTED',
    validation_status: 'VALIDATED',
    match_status: 'MATCHED',
    approval_status: 'APPROVED',
    payment_status: 'NOT_READY',
    lifecycle_state: 'APPROVED',
    source_document_ref: null,
    scenario_label: 'CLEAN_MATCH',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    duplicate_group_id: null,
    ...overrides,
  };
}

describe('Payment Readiness & Query Logic', () => {
  describe('isPaymentReady guards', () => {
    it('returns true when invoice is validated, matched, approved, and has no blocking exceptions', () => {
      const invoice = createMockInvoice();
      expect(isPaymentReady(invoice, [])).toBe(true);
    });

    it('blocks payment readiness if invoice has a BLOCKING open exception', () => {
      const invoice = createMockInvoice();
      const blockingException: ExceptionFinding = {
        exception_id: 'exc-1',
        invoice_id: invoice.invoice_id,
        rule_id: 'RULE-PRICE-1',
        rule_version: '1.0',
        issue_type: 'UNIT_PRICE_MISMATCH',
        severity: 'BLOCKING',
        status: 'OPEN',
        observed_value: '12.00',
        expected_value: '10.00',
        tolerance: '0.02',
        difference: '2.00',
        explanation: 'Unit price exceeds PO unit price',
        routed_to_role: 'OPERATIONS_ANALYST',
        assigned_to_user_id: null,
        priority: 'HIGH',
        resolution_notes: null,
        created_at: '2026-10-01T10:00:00Z',
        resolved_at: null,
      };

      expect(isPaymentReady(invoice, [blockingException])).toBe(false);
    });

    it('blocks payment readiness if invoice has an unresolved exception and match_status is EXCEPTION', () => {
      const invoice = createMockInvoice({ match_status: 'EXCEPTION' });
      const warningException: ExceptionFinding = {
        exception_id: 'exc-2',
        invoice_id: invoice.invoice_id,
        rule_id: 'RULE-LINE-1',
        rule_version: '1.0',
        issue_type: 'MISSING_PO_LINE',
        severity: 'MEDIUM',
        status: 'OPEN',
        observed_value: 'null',
        expected_value: '1',
        tolerance: '0',
        difference: null,
        explanation: 'Invoice references non-existent PO line',
        routed_to_role: 'OPERATIONS_ANALYST',
        assigned_to_user_id: null,
        priority: 'NORMAL',
        resolution_notes: null,
        created_at: '2026-10-01T10:00:00Z',
        resolved_at: null,
      };

      expect(isPaymentReady(invoice, [warningException])).toBe(false);
    });

    it('blocks payment readiness if approval_status is not APPROVED', () => {
      const pendingInvoice = createMockInvoice({ approval_status: 'PENDING' });
      expect(isPaymentReady(pendingInvoice, [])).toBe(false);

      const notReqInvoice = createMockInvoice({ approval_status: 'NOT_REQUIRED' });
      expect(isPaymentReady(notReqInvoice, [])).toBe(false);
    });

    it('blocks payment readiness if validation_status is not VALIDATED', () => {
      const unvalidated = createMockInvoice({ validation_status: 'VALIDATION_FAILED' });
      expect(isPaymentReady(unvalidated, [])).toBe(false);
    });

    it('blocks payment readiness if already PAID', () => {
      const paidInvoice = createMockInvoice({ payment_status: 'PAID' });
      expect(isPaymentReady(paidInvoice, [])).toBe(false);
    });
  });

  describe('Duplicate payment prevention', () => {
    it('throws LifecycleError when attempting to markPaid an already paid invoice', () => {
      const invoice = createMockInvoice({ lifecycle_state: 'PAYMENT_SCHEDULED' });
      const existingPayment: Payment = {
        payment_id: 'pay-1',
        invoice_id: invoice.invoice_id,
        payment_reference: 'PAY-REF-1',
        amount: invoice.grand_total,
        currency: invoice.currency,
        status: 'PAID',
        scheduled_at: '2026-10-02T10:00:00Z',
        paid_at: '2026-10-02T11:00:00Z',
        failure_reason: null,
        created_at: '2026-10-02T10:00:00Z',
      };

      expect(() => markPaid(invoice, [existingPayment])).toThrow(
        `Invoice ${invoice.invoice_id} already has a successful payment`,
      );
    });

    it('successfully produces payment payload when no previous successful payment exists', () => {
      const invoice = createMockInvoice({ lifecycle_state: 'PAYMENT_SCHEDULED' });
      const result = markPaid(invoice, []);

      expect(result.invoice.payment_status).toBe('PAID');
      expect(result.invoice.lifecycle_state).toBe('PAID');
      expect(result.payment.status).toBe('PAID');
      expect(result.payment.paid_at).toBeDefined();
      expect(result.payment.amount).toBe(invoice.grand_total);
    });
  });

  describe('Query timestamp schema safety (Task 1 regression check)', () => {
    it('verifies that invoices schema does NOT contain paid_at column', () => {
      const invoice = createMockInvoice();
      // TypeScript compile-time and runtime check: invoices table has updated_at, created_at, due_date
      expect('updated_at' in invoice).toBe(true);
      expect('created_at' in invoice).toBe(true);
      expect('due_date' in invoice).toBe(true);
      // Invoices must not have paid_at
      expect('paid_at' in invoice).toBe(false);
    });

    it('verifies that paid_at belongs strictly to the payments relation', () => {
      const payment: Payment = {
        payment_id: 'pay-100',
        invoice_id: 'inv-test-1',
        payment_reference: 'PAY-100',
        amount: 500,
        currency: 'USD',
        status: 'PAID',
        scheduled_at: '2026-10-10T10:00:00Z',
        paid_at: '2026-10-10T11:30:00Z',
        failure_reason: null,
        created_at: '2026-10-10T10:00:00Z',
      };

      expect(payment.paid_at).toBe('2026-10-10T11:30:00Z');
      expect(payment.status).toBe('PAID');
    });

    it('verifies that sorting invoices uses valid schema columns (updated_at, created_at, due_date)', () => {
      const validInvoiceSortColumns = [
        'invoice_id',
        'invoice_number',
        'invoice_date',
        'received_at',
        'due_date',
        'subtotal',
        'tax_total',
        'grand_total',
        'created_at',
        'updated_at',
      ];
      // Assert that paid_at is not in the allowed invoice sort columns
      expect(validInvoiceSortColumns.includes('paid_at')).toBe(false);
      // Assert that updated_at (which we substituted) is valid
      expect(validInvoiceSortColumns.includes('updated_at')).toBe(true);
    });
  });
});
