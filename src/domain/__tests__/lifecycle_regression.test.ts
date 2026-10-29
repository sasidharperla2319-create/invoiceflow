import { describe, it, expect } from 'vitest';
import { evaluateExceptionResolution, canResolveException } from '../lifecycle';
import type { Invoice, ExceptionFinding } from '../types';

function createMockInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    invoice_id: 'inv-exc-101',
    invoice_number: 'INV-10100',
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
    extraction_confidence: 0.95,
    extraction_status: 'EXTRACTED',
    validation_status: 'VALIDATED',
    match_status: 'EXCEPTION',
    approval_status: 'NOT_REQUIRED',
    payment_status: 'NOT_READY',
    lifecycle_state: 'EXCEPTION',
    source_document_ref: null,
    scenario_label: 'PRICE_VARIANCE',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    duplicate_group_id: null,
    ...overrides,
  };
}

function createMockException(overrides: Partial<ExceptionFinding> = {}): ExceptionFinding {
  return {
    exception_id: 'exc-1',
    invoice_id: 'inv-exc-101',
    rule_id: 'RULE-PRICE-1',
    rule_version: '1.0',
    issue_type: 'UNIT_PRICE_MISMATCH',
    severity: 'MEDIUM',
    status: 'OPEN',
    observed_value: '105.00',
    expected_value: '100.00',
    tolerance: '0.02',
    difference: '5.00',
    explanation: 'Price variance',
    routed_to_role: 'OPERATIONS_ANALYST',
    assigned_to_user_id: null,
    priority: 'NORMAL',
    resolution_notes: null,
    created_at: '2026-10-01T10:00:00Z',
    resolved_at: null,
    ...overrides,
  };
}

describe('Exception Resolution Lifecycle Progression (Task 2)', () => {
  describe('Partial resolution: one or more exceptions remain unresolved', () => {
    it('maintains EXCEPTION state when remaining unresolved exception is non-blocking (MEDIUM)', () => {
      const invoice = createMockInvoice({ match_status: 'EXCEPTION', lifecycle_state: 'EXCEPTION' });
      const exc1 = createMockException({ exception_id: 'exc-1', status: 'RESOLVED' });
      const exc2 = createMockException({ exception_id: 'exc-2', status: 'OPEN', severity: 'MEDIUM' });

      const outcome = evaluateExceptionResolution(invoice, [exc1, exc2]);

      expect(outcome.unresolvedCount).toBe(1);
      expect(outcome.matchStatus).toBe('EXCEPTION');
      expect(outcome.lifecycleState).toBe('EXCEPTION');
      expect(outcome.paymentStatus).toBe('NOT_READY');
      expect(outcome.requiresApprovalTask).toBe(false);
    });

    it('keeps invoice BLOCKED when any remaining unresolved exception is BLOCKING', () => {
      const invoice = createMockInvoice({ match_status: 'BLOCKED', lifecycle_state: 'BLOCKED' });
      const exc1 = createMockException({ exception_id: 'exc-1', status: 'RESOLVED' });
      const exc2 = createMockException({
        exception_id: 'exc-2',
        status: 'OPEN',
        severity: 'BLOCKING',
        issue_type: 'UNIT_PRICE_MISMATCH',
      });

      const outcome = evaluateExceptionResolution(invoice, [exc1, exc2]);

      expect(outcome.unresolvedCount).toBe(1);
      expect(outcome.matchStatus).toBe('BLOCKED');
      expect(outcome.lifecycleState).toBe('BLOCKED');
      expect(outcome.paymentStatus).toBe('NOT_READY');
      expect(outcome.requiresApprovalTask).toBe(false);
    });
  });

  describe('Full resolution: all exceptions resolved', () => {
    it('recovers match_status to MATCHED and moves lifecycle to APPROVAL_PENDING when unapproved', () => {
      const invoice = createMockInvoice({
        match_status: 'EXCEPTION',
        lifecycle_state: 'EXCEPTION',
        approval_status: 'NOT_REQUIRED',
      });
      const exc1 = createMockException({ exception_id: 'exc-1', status: 'RESOLVED' });
      const exc2 = createMockException({ exception_id: 'exc-2', status: 'RESOLVED' });

      const outcome = evaluateExceptionResolution(invoice, [exc1, exc2]);

      expect(outcome.unresolvedCount).toBe(0);
      expect(outcome.matchStatus).toBe('MATCHED');
      expect(outcome.lifecycleState).toBe('APPROVAL_PENDING');
      expect(outcome.approvalStatus).toBe('PENDING');
      expect(outcome.requiresApprovalTask).toBe(true);
      expect(outcome.paymentStatus).toBe('NOT_READY');
    });

    it('NEVER automatically approves an invoice merely because all exceptions are resolved', () => {
      const invoice = createMockInvoice({
        match_status: 'EXCEPTION',
        lifecycle_state: 'EXCEPTION',
        approval_status: 'PENDING',
      });
      const exc1 = createMockException({ exception_id: 'exc-1', status: 'RESOLVED' });

      const outcome = evaluateExceptionResolution(invoice, [exc1]);

      // Strictly must NOT be auto-approved
      expect(outcome.approvalStatus).not.toBe('APPROVED');
      expect(outcome.approvalStatus).toBe('PENDING');
      expect(outcome.lifecycleState).toBe('APPROVAL_PENDING');
    });

    it('NEVER marks invoice payment-ready without existing approval', () => {
      const invoice = createMockInvoice({
        match_status: 'EXCEPTION',
        lifecycle_state: 'EXCEPTION',
        approval_status: 'NOT_REQUIRED',
        payment_status: 'NOT_READY',
      });
      const exc1 = createMockException({ exception_id: 'exc-1', status: 'RESOLVED' });

      const outcome = evaluateExceptionResolution(invoice, [exc1]);

      expect(outcome.paymentStatus).toBe('NOT_READY');
      expect(outcome.lifecycleState).not.toBe('PAYMENT_READY');
    });

    it('transitions to PAYMENT_READY ONLY if invoice was ALREADY approved prior to exception', () => {
      const invoice = createMockInvoice({
        match_status: 'EXCEPTION',
        lifecycle_state: 'EXCEPTION',
        approval_status: 'APPROVED',
        validation_status: 'VALIDATED',
        extraction_status: 'EXTRACTED',
      });
      const exc1 = createMockException({ exception_id: 'exc-1', status: 'RESOLVED' });

      const outcome = evaluateExceptionResolution(invoice, [exc1]);

      expect(outcome.matchStatus).toBe('MATCHED');
      expect(outcome.lifecycleState).toBe('PAYMENT_READY');
      expect(outcome.paymentStatus).toBe('READY');
      expect(outcome.requiresApprovalTask).toBe(false);
    });
  });

  describe('Exception resolution role authorization & idempotency', () => {
    it('allows OPERATIONS_ANALYST and PROCESS_OWNER to resolve open exceptions', () => {
      const openExc = createMockException({ status: 'OPEN' });
      expect(canResolveException('OPERATIONS_ANALYST', openExc)).toBe(true);
      expect(canResolveException('PROCESS_OWNER', openExc)).toBe(true);
    });

    it('rejects unauthorized roles (BUSINESS_REQUESTER, APPROVER, SYSTEM_ADMIN)', () => {
      const openExc = createMockException({ status: 'OPEN' });
      expect(canResolveException('BUSINESS_REQUESTER', openExc)).toBe(false);
      expect(canResolveException('APPROVER', openExc)).toBe(false);
      expect(canResolveException('SYSTEM_ADMIN', openExc)).toBe(false);
    });

    it('disallows resolving an already resolved exception (safe repeated resolution attempt)', () => {
      const resolvedExc = createMockException({ status: 'RESOLVED' });
      expect(canResolveException('OPERATIONS_ANALYST', resolvedExc)).toBe(false);
      expect(canResolveException('PROCESS_OWNER', resolvedExc)).toBe(false);
    });
  });
});
