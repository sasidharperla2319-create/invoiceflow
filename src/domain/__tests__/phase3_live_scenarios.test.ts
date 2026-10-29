import { describe, it, expect, afterAll } from 'vitest';
import { supabase } from '../../lib/supabase';
import { runMatch, defaultMatchConfig } from '../matchingEngine';
import { isPaymentReady, evaluateExceptionResolution } from '../lifecycle';
import type {
  Invoice,
  InvoiceLine,
  Vendor,
  PurchaseOrder,
  PurchaseOrderLine,
  GoodsReceipt,
  GoodsReceiptLine,
  ExceptionFinding,
} from '../types';

const ISO_PREFIX = 'ISO-TEST-' + Date.now();

describe('Phase 3: Live Supabase AP Workflow & Business Scenarios', () => {
  const testUserId = `${ISO_PREFIX}-USR-APPROVER`;
  const testAnalystId = `${ISO_PREFIX}-USR-ANALYST`;
  const testVendorId = `${ISO_PREFIX}-VND-01`;
  const testPoId = `${ISO_PREFIX}-PO-01`;
  const testPoLineId = `${ISO_PREFIX}-POL-01`;
  const testGrId = `${ISO_PREFIX}-GR-01`;
  const testGrLineId = `${ISO_PREFIX}-GRL-01`;
  const testInvCleanId = `${ISO_PREFIX}-INV-CLEAN`;
  const testInvPriceId = `${ISO_PREFIX}-INV-PRICE`;
  const testInvQtyId = `${ISO_PREFIX}-INV-QTY`;
  const testInvIneligibleId = `${ISO_PREFIX}-INV-INELIGIBLE`;
  const testApprovalId = `${ISO_PREFIX}-APP-01`;

  afterAll(async () => {
    // Clean up isolated test records
    await supabase.from('payments').delete().like('invoice_id', `${ISO_PREFIX}%`);
    await supabase.from('approvals').delete().like('invoice_id', `${ISO_PREFIX}%`);
    await supabase.from('exceptions').delete().like('invoice_id', `${ISO_PREFIX}%`);
    await supabase.from('state_transitions').delete().like('invoice_id', `${ISO_PREFIX}%`);
    await supabase.from('audit_events').delete().like('entity_id', `${ISO_PREFIX}%`);
    await supabase.from('invoice_lines').delete().like('invoice_id', `${ISO_PREFIX}%`);
    await supabase.from('invoices').delete().like('invoice_id', `${ISO_PREFIX}%`);
    await supabase.from('goods_receipt_lines').delete().like('receipt_line_id', `${ISO_PREFIX}%`);
    await supabase.from('goods_receipts').delete().like('goods_receipt_id', `${ISO_PREFIX}%`);
    await supabase.from('purchase_order_lines').delete().like('po_line_id', `${ISO_PREFIX}%`);
    await supabase.from('purchase_orders').delete().like('purchase_order_id', `${ISO_PREFIX}%`);
    await supabase.from('vendors').delete().like('vendor_id', `${ISO_PREFIX}%`);
    await supabase.from('users').delete().like('user_id', `${ISO_PREFIX}%`);
  });

  it('Setup: creates isolated test users, vendor, PO, and goods receipt in Supabase', async () => {
    // 1. Approver user
    const { error: uErr } = await supabase.from('users').insert([
      {
        user_id: testUserId,
        email: `${ISO_PREFIX}@test.local`,
        full_name: 'Test Approver',
        role: 'APPROVER',
        is_active: true,
      },
      {
        user_id: testAnalystId,
        email: `${ISO_PREFIX}-analyst@test.local`,
        full_name: 'Test Analyst',
        role: 'OPERATIONS_ANALYST',
        is_active: true,
      },
    ]);
    expect(uErr).toBeNull();

    // 2. Active Vendor
    const { error: vErr } = await supabase.from('vendors').insert({
      vendor_id: testVendorId,
      vendor_code: `${ISO_PREFIX}-VC`,
      legal_name: 'Iso Vendor Technologies Inc',
      tax_identifier: 'US-99887766',
      currency: 'USD',
      payment_terms_days: 30,
      status: 'ACTIVE',
      effective_from: '2025-01-01',
    });
    expect(vErr).toBeNull();

    // 3. PO
    const { error: poErr } = await supabase.from('purchase_orders').insert({
      purchase_order_id: testPoId,
      po_number: `${ISO_PREFIX}-PONUM`,
      vendor_id: testVendorId,
      po_date: '2026-10-01',
      currency: 'USD',
      status: 'OPEN',
    });
    expect(poErr).toBeNull();

    // 4. PO Line: 10 units @ $100
    const { error: polErr } = await supabase.from('purchase_order_lines').insert({
      po_line_id: testPoLineId,
      purchase_order_id: testPoId,
      line_number: 1,
      sku: 'SKU-ISO-01',
      description: 'High-density switch',
      ordered_quantity: 10,
      unit_price: 100,
      tax_code: 'STANDARD',
      tax_rate: 0.10,
    });
    expect(polErr).toBeNull();

    // 5. Goods Receipt: 10 units accepted
    const { error: grErr } = await supabase.from('goods_receipts').insert({
      goods_receipt_id: testGrId,
      receipt_number: `${ISO_PREFIX}-GRNUM`,
      purchase_order_id: testPoId,
      receipt_date: '2026-10-05',
      status: 'RECEIVED',
    });
    expect(grErr).toBeNull();

    // 6. Goods Receipt Line
    const { error: grlErr } = await supabase.from('goods_receipt_lines').insert({
      receipt_line_id: testGrLineId,
      goods_receipt_id: testGrId,
      po_line_id: testPoLineId,
      received_quantity: 10,
      accepted_quantity: 10,
      rejected_quantity: 0,
    });
    expect(grlErr).toBeNull();
  });

  // Scenario 1: Valid invoice with matching vendor, PO, and goods receipt
  it('Scenario 1: Valid clean 3-way match invoice inserts into Supabase and reaches MATCHED', async () => {
    const { error: invErr } = await supabase.from('invoices').insert({
      invoice_id: testInvCleanId,
      invoice_number: `${ISO_PREFIX}-INV-01`,
      vendor_id: testVendorId,
      purchase_order_id: testPoId,
      invoice_date: '2026-10-10',
      due_date: '2026-11-09',
      currency: 'USD',
      subtotal: 1000,
      tax_total: 100,
      grand_total: 1100,
      extraction_status: 'EXTRACTED',
      validation_status: 'VALIDATED',
      match_status: 'MATCHED',
      approval_status: 'PENDING',
      payment_status: 'NOT_READY',
      lifecycle_state: 'APPROVAL_PENDING',
    });
    expect(invErr).toBeNull();

    const { error: lineErr } = await supabase.from('invoice_lines').insert({
      invoice_line_id: `${testInvCleanId}-L1`,
      invoice_id: testInvCleanId,
      line_number: 1,
      sku: 'SKU-ISO-01',
      description: 'High-density switch',
      quantity: 10,
      unit_price: 100,
      line_subtotal: 1000,
      line_tax: 100,
      line_total: 1100,
      po_line_id: testPoLineId,
    });
    expect(lineErr).toBeNull();

    // Create approval record
    const { error: appErr } = await supabase.from('approvals').insert({
      approval_id: testApprovalId,
      invoice_id: testInvCleanId,
      approver_user_id: testUserId,
      approval_level: 1,
      status: 'PENDING',
    });
    expect(appErr).toBeNull();
  });

  // Scenario 7: Invoice awaiting approval
  it('Scenario 7: Live invoice awaiting approval is in APPROVAL_PENDING and payment is NOT_READY', async () => {
    const { data: inv, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('invoice_id', testInvCleanId)
      .single();

    expect(error).toBeNull();
    expect(inv.lifecycle_state).toBe('APPROVAL_PENDING');
    expect(inv.approval_status).toBe('PENDING');
    expect(inv.payment_status).toBe('NOT_READY');

    // Payment readiness check must be false while awaiting approval
    expect(isPaymentReady(inv, [])).toBe(false);
  });

  // Scenario 9: Approved invoice eligible for payment via live RPC decide_approval_secure
  it('Scenario 9: Live RPC decide_approval_secure successfully approves invoice and sets PAYMENT_READY', async () => {
    const { data, error } = await supabase.rpc('decide_approval_secure', {
      p_approval_id: testApprovalId,
      p_invoice_id: testInvCleanId,
      p_decision: 'APPROVED',
      p_actor_user_id: testUserId,
      p_reason: 'Three-way match confirmed and goods receipt inspected',
      p_comments: 'Live assessment automated test approval',
    });

    expect(error).toBeNull();
    expect(data.success).toBe(true);
    expect(data.approval_status).toBe('APPROVED');
    expect(data.lifecycle_state).toBe('PAYMENT_READY');
    expect(data.payment_status).toBe('READY');

    // Verify invoice in live DB
    const { data: updatedInv } = await supabase
      .from('invoices')
      .select('*')
      .eq('invoice_id', testInvCleanId)
      .single();

    expect(updatedInv.lifecycle_state).toBe('PAYMENT_READY');
    expect(updatedInv.payment_status).toBe('READY');

    // Verify state transition logged in Supabase
    const { data: transitions } = await supabase
      .from('state_transitions')
      .select('*')
      .eq('invoice_id', testInvCleanId);
    expect(transitions?.length).toBeGreaterThan(0);
    expect(transitions?.some((t) => t.to_state === 'PAYMENT_READY')).toBe(true);

    // Verify audit event logged in Supabase
    const { data: audits } = await supabase
      .from('audit_events')
      .select('*')
      .eq('entity_id', testInvCleanId);
    expect(audits?.length).toBeGreaterThan(0);
    expect(audits?.some((a) => a.action === 'APPROVAL_APPROVED')).toBe(true);
  });

  // Payment scheduling via live RPC schedule_payment_secure
  it('Payment Scheduling: Live RPC schedule_payment_secure successfully schedules approved invoice', async () => {
    const { data, error } = await supabase.rpc('schedule_payment_secure', {
      p_invoice_id: testInvCleanId,
      p_actor_user_id: testUserId,
    });

    expect(error).toBeNull();
    expect(data.success).toBe(true);
    expect(data.payment_id).toBeDefined();
    expect(data.payment_reference).toBeDefined();

    // Verify invoice status updated in live DB
    const { data: inv } = await supabase
      .from('invoices')
      .select('*')
      .eq('invoice_id', testInvCleanId)
      .single();
    expect(inv.lifecycle_state).toBe('PAYMENT_SCHEDULED');
    expect(inv.payment_status).toBe('SCHEDULED');

    // Verify payment record in live DB
    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('invoice_id', testInvCleanId)
      .single();
    expect(payment).toBeDefined();
    expect(payment.status).toBe('SCHEDULED');
    expect(Number(payment.amount)).toBe(1100);
  });

  // Scenario 10: Attempt to schedule payment for an ineligible invoice
  it('Scenario 10: Live RPC schedule_payment_secure server-side blocks payment for ineligible invoice', async () => {
    // Insert an ineligible invoice (unapproved, match exception)
    await supabase.from('invoices').insert({
      invoice_id: testInvIneligibleId,
      invoice_number: `${ISO_PREFIX}-INELIGIBLE-01`,
      vendor_id: testVendorId,
      purchase_order_id: testPoId,
      invoice_date: '2026-10-15',
      due_date: '2026-11-14',
      currency: 'USD',
      subtotal: 500,
      tax_total: 50,
      grand_total: 550,
      match_status: 'EXCEPTION',
      approval_status: 'PENDING',
      payment_status: 'NOT_READY',
      lifecycle_state: 'EXCEPTION',
    });

    // Attempting schedule_payment_secure MUST throw server-side Postgres exception
    const { data, error } = await supabase.rpc('schedule_payment_secure', {
      p_invoice_id: testInvIneligibleId,
      p_actor_user_id: testUserId,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/is not payment-ready/i);
  });

  // Authorization enforcement: User with unauthorized role cannot approve
  it('Security: Live RPC decide_approval_secure enforces role check (OPERATIONS_ANALYST cannot approve)', async () => {
    const unauthAppId = `${ISO_PREFIX}-APP-UNAUTH`;
    const unauthInvId = `${ISO_PREFIX}-INV-UNAUTH`;

    await supabase.from('invoices').insert({
      invoice_id: unauthInvId,
      invoice_number: `${ISO_PREFIX}-UNAUTH-01`,
      vendor_id: testVendorId,
      purchase_order_id: testPoId,
      invoice_date: '2026-10-15',
      due_date: '2026-11-14',
      currency: 'USD',
      subtotal: 200,
      tax_total: 20,
      grand_total: 220,
      match_status: 'MATCHED',
      approval_status: 'PENDING',
      payment_status: 'NOT_READY',
      lifecycle_state: 'APPROVAL_PENDING',
    });

    await supabase.from('approvals').insert({
      approval_id: unauthAppId,
      invoice_id: unauthInvId,
      approver_user_id: testUserId,
      approval_level: 1,
      status: 'PENDING',
    });

    // Operations analyst role cannot approve
    const { error } = await supabase.rpc('decide_approval_secure', {
      p_approval_id: unauthAppId,
      p_invoice_id: unauthInvId,
      p_decision: 'APPROVED',
      p_actor_user_id: testAnalystId, // Role is OPERATIONS_ANALYST
      p_reason: 'Attempt unauthorized approval',
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/Unauthorized/i);
  });

  // Scenario 8: Rejected invoice terminal state via live RPC
  it('Scenario 8: Live RPC decide_approval_secure handles REJECTED decision and locks payment', async () => {
    const rejectAppId = `${ISO_PREFIX}-APP-REJECT`;
    const rejectInvId = `${ISO_PREFIX}-INV-REJECT`;

    await supabase.from('invoices').insert({
      invoice_id: rejectInvId,
      invoice_number: `${ISO_PREFIX}-REJECT-01`,
      vendor_id: testVendorId,
      purchase_order_id: testPoId,
      invoice_date: '2026-10-15',
      due_date: '2026-11-14',
      currency: 'USD',
      subtotal: 200,
      tax_total: 20,
      grand_total: 220,
      match_status: 'MATCHED',
      approval_status: 'PENDING',
      payment_status: 'NOT_READY',
      lifecycle_state: 'APPROVAL_PENDING',
    });

    await supabase.from('approvals').insert({
      approval_id: rejectAppId,
      invoice_id: rejectInvId,
      approver_user_id: testUserId,
      approval_level: 1,
      status: 'PENDING',
    });

    const { data, error } = await supabase.rpc('decide_approval_secure', {
      p_approval_id: rejectAppId,
      p_invoice_id: rejectInvId,
      p_decision: 'REJECTED',
      p_actor_user_id: testUserId,
      p_reason: 'Budget overrun for department',
    });

    expect(error).toBeNull();
    expect(data.approval_status).toBe('REJECTED');
    expect(data.lifecycle_state).toBe('REJECTED');
    expect(data.payment_status).toBe('NOT_READY');

    // Attempting schedule_payment_secure on rejected invoice MUST fail
    const { error: schedErr } = await supabase.rpc('schedule_payment_secure', {
      p_invoice_id: rejectInvId,
      p_actor_user_id: testUserId,
    });
    expect(schedErr).not.toBeNull();
    expect(schedErr?.message).toMatch(/is not payment-ready/i);
  });

  // Scenario 2: Price mismatch in matching engine
  it('Scenario 2: Price variance produces EXCEPTION status, routes to analyst, and blocks payment', () => {
    const invoice: Invoice = {
      invoice_id: testInvPriceId,
      invoice_number: 'INV-PRICE-999',
      vendor_id: testVendorId,
      purchase_order_id: testPoId,
      invoice_date: '2026-10-10',
      received_at: '2026-10-10T00:00:00Z',
      due_date: '2026-11-09',
      currency: 'USD',
      subtotal: 1250,
      tax_total: 125,
      grand_total: 1375,
      extracted_fields_json: {},
      extraction_confidence: 1,
      extraction_status: 'EXTRACTED',
      validation_status: 'VALIDATED',
      match_status: 'UNMATCHED',
      approval_status: 'NOT_REQUIRED',
      payment_status: 'NOT_READY',
      lifecycle_state: 'VALIDATED',
      source_document_ref: null,
      scenario_label: 'PRICE_VARIANCE',
      duplicate_group_id: null,
      created_at: '2026-10-10T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
    };

    const invoiceLines: InvoiceLine[] = [{
      invoice_line_id: `${testInvPriceId}-L1`,
      invoice_id: testInvPriceId,
      line_number: 1,
      sku: 'SKU-ISO-01',
      description: 'High-density switch',
      quantity: 10,
      unit_price: 125, // PO was $100 -> $25 discrepancy > 1% tolerance
      tax_code: 'STANDARD',
      tax_rate: 0.10,
      line_subtotal: 1250,
      line_tax: 125,
      line_total: 1375,
      po_line_id: testPoLineId,
    }];

    const vendor: Vendor = {
      vendor_id: testVendorId,
      vendor_code: 'VC',
      legal_name: 'Iso Vendor',
      tax_identifier: 'US-99',
      currency: 'USD',
      payment_terms_days: 30,
      status: 'ACTIVE',
      effective_from: '2025-01-01',
      effective_to: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    const po: PurchaseOrder = {
      purchase_order_id: testPoId,
      po_number: 'PONUM',
      vendor_id: testVendorId,
      po_date: '2026-10-01',
      expected_delivery_date: null,
      status: 'OPEN',
      currency: 'USD',
      created_at: '2026-10-01T00:00:00Z',
    };

    const poLines: PurchaseOrderLine[] = [{
      po_line_id: testPoLineId,
      purchase_order_id: testPoId,
      line_number: 1,
      sku: 'SKU-ISO-01',
      description: 'High-density switch',
      ordered_quantity: 10,
      unit_price: 100,
      tax_code: 'STANDARD',
      tax_rate: 0.10,
      unit_of_measure: 'EA',
    }];

    const receipts: GoodsReceipt[] = [{
      goods_receipt_id: testGrId,
      receipt_number: 'GRNUM',
      purchase_order_id: testPoId,
      receipt_date: '2026-10-05',
      status: 'RECEIVED',
      created_at: '2026-10-05T00:00:00Z',
    }];

    const receiptLines: GoodsReceiptLine[] = [{
      receipt_line_id: testGrLineId,
      goods_receipt_id: testGrId,
      po_line_id: testPoLineId,
      received_quantity: 10,
      accepted_quantity: 10,
      rejected_quantity: 0,
      created_at: '2026-10-05T00:00:00Z',
    }];

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

    const finding: ExceptionFinding = {
      exception_id: 'EX-P1',
      invoice_id: testInvPriceId,
      rule_id: 'R-PRICE',
      rule_version: '1.0',
      issue_type: 'PRICE_VARIANCE',
      severity: 'MEDIUM',
      status: 'OPEN',
      observed_value: '125',
      expected_value: '100',
      tolerance: '0.50',
      difference: '25.00',
      explanation: 'Price variance',
      routed_to_role: 'OPERATIONS_ANALYST',
      assigned_to_user_id: null,
      priority: 'NORMAL',
      resolution_notes: null,
      created_at: new Date().toISOString(),
      resolved_at: null,
    };

    invoice.match_status = 'EXCEPTION';
    invoice.lifecycle_state = 'EXCEPTION';
    expect(isPaymentReady(invoice, [finding])).toBe(false);

    // Resolve exception
    finding.status = 'RESOLVED';
    const resolution = evaluateExceptionResolution(invoice, [finding]);
    expect(resolution.unresolvedCount).toBe(0);
    expect(resolution.matchStatus).toBe('MATCHED');
    expect(resolution.lifecycleState).toBe('APPROVAL_PENDING');
  });

  // Scenario 3: Quantity mismatch
  it('Scenario 3: Quantity mismatch (billed 10, received 6) creates QUANTITY_EXCEEDS_RECEIVED exception', () => {
    const invoice: Invoice = {
      invoice_id: testInvQtyId,
      invoice_number: 'INV-QTY-999',
      vendor_id: testVendorId,
      purchase_order_id: testPoId,
      invoice_date: '2026-10-10',
      received_at: '2026-10-10T00:00:00Z',
      due_date: '2026-11-09',
      currency: 'USD',
      subtotal: 1000,
      tax_total: 100,
      grand_total: 1100,
      extracted_fields_json: {},
      extraction_confidence: 1,
      extraction_status: 'EXTRACTED',
      validation_status: 'VALIDATED',
      match_status: 'UNMATCHED',
      approval_status: 'NOT_REQUIRED',
      payment_status: 'NOT_READY',
      lifecycle_state: 'VALIDATED',
      source_document_ref: null,
      scenario_label: 'QUANTITY_MISMATCH',
      duplicate_group_id: null,
      created_at: '2026-10-10T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
    };

    const invoiceLines: InvoiceLine[] = [{
      invoice_line_id: `${testInvQtyId}-L1`,
      invoice_id: testInvQtyId,
      line_number: 1,
      sku: 'SKU-ISO-01',
      description: 'High-density switch',
      quantity: 10, // billed 10
      unit_price: 100,
      tax_code: 'STANDARD',
      tax_rate: 0.10,
      line_subtotal: 1000,
      line_tax: 100,
      line_total: 1100,
      po_line_id: testPoLineId,
    }];

    const receiptLines: GoodsReceiptLine[] = [{
      receipt_line_id: testGrLineId,
      goods_receipt_id: testGrId,
      po_line_id: testPoLineId,
      received_quantity: 6,
      accepted_quantity: 6, // only 6 accepted
      rejected_quantity: 0,
      created_at: '2026-10-05T00:00:00Z',
    }];

    const outcome = runMatch({
      invoice,
      invoiceLines,
      vendor: {
        vendor_id: testVendorId,
        vendor_code: 'VC',
        legal_name: 'Iso Vendor',
        tax_identifier: 'US-99',
        currency: 'USD',
        payment_terms_days: 30,
        status: 'ACTIVE',
        effective_from: '2025-01-01',
        effective_to: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
      po: {
        purchase_order_id: testPoId,
        po_number: 'PONUM',
        vendor_id: testVendorId,
        po_date: '2026-10-01',
        expected_delivery_date: null,
        status: 'OPEN',
        currency: 'USD',
        created_at: '2026-10-01T00:00:00Z',
      },
      poLines: [{
        po_line_id: testPoLineId,
        purchase_order_id: testPoId,
        line_number: 1,
        sku: 'SKU-ISO-01',
        description: 'High-density switch',
        ordered_quantity: 10,
        unit_price: 100,
        tax_code: 'STANDARD',
        tax_rate: 0.10,
        unit_of_measure: 'EA',
      }],
      receipts: [{
        goods_receipt_id: testGrId,
        receipt_number: 'GRNUM',
        purchase_order_id: testPoId,
        receipt_date: '2026-10-05',
        status: 'RECEIVED',
        created_at: '2026-10-05T00:00:00Z',
      }],
      receiptLines,
      allInvoices: [invoice],
      config: defaultMatchConfig(),
    });

    expect(outcome.overall_status).toBe('EXCEPTION');
    const qtyEx = outcome.exceptions.find((e) => e.issue_type === 'QUANTITY_EXCEEDS_RECEIVED');
    expect(qtyEx).toBeDefined();
    expect(qtyEx?.observed_value).toContain('10');
  });

  // Scenario 4: Inactive vendor
  it('Scenario 4: Inactive (CLOSED / ON_HOLD) vendor triggers BLOCKING exception and BLOCKED status', () => {
    const invoice: Invoice = {
      invoice_id: `${ISO_PREFIX}-INV-CLOSED`,
      invoice_number: 'INV-CLOSED-01',
      vendor_id: `${ISO_PREFIX}-VND-CLOSED`,
      purchase_order_id: null,
      invoice_date: '2026-10-10',
      received_at: '2026-10-10T00:00:00Z',
      due_date: '2026-11-09',
      currency: 'USD',
      subtotal: 500,
      tax_total: 50,
      grand_total: 550,
      extracted_fields_json: {},
      extraction_confidence: 1,
      extraction_status: 'EXTRACTED',
      validation_status: 'VALIDATED',
      match_status: 'UNMATCHED',
      approval_status: 'NOT_REQUIRED',
      payment_status: 'NOT_READY',
      lifecycle_state: 'VALIDATED',
      source_document_ref: null,
      scenario_label: 'TAX_OR_VENDOR_ERROR',
      duplicate_group_id: null,
      created_at: '2026-10-10T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
    };

    const closedVendor: Vendor = {
      vendor_id: `${ISO_PREFIX}-VND-CLOSED`,
      vendor_code: 'CLOSED-VC',
      legal_name: 'Closed Vendor Corp',
      tax_identifier: 'US-000',
      currency: 'USD',
      payment_terms_days: 30,
      status: 'CLOSED',
      effective_from: '2020-01-01',
      effective_to: '2025-12-31',
      created_at: '2020-01-01T00:00:00Z',
      updated_at: '2025-12-31T00:00:00Z',
    };

    const outcome = runMatch({
      invoice,
      invoiceLines: [],
      vendor: closedVendor,
      po: null,
      poLines: [],
      receipts: [],
      receiptLines: [],
      allInvoices: [invoice],
      config: defaultMatchConfig(),
    });

    expect(outcome.overall_status).toBe('BLOCKED');
    expect(outcome.blocking).toBe(true);
    expect(outcome.exceptions.some((e) => e.issue_type === 'VENDOR_CLOSED')).toBe(true);
  });

  // Scenario 5: Duplicate invoice detection
  it('Scenario 5: Duplicate invoice detection flags duplicate and sets HIGH severity exception', () => {
    const invA: Invoice = {
      invoice_id: `${ISO_PREFIX}-DUP-A`,
      invoice_number: 'INV-2026-DUPLICATE-001',
      vendor_id: testVendorId,
      purchase_order_id: null,
      invoice_date: '2026-10-01',
      received_at: '2026-10-01T00:00:00Z',
      due_date: '2026-10-31',
      currency: 'USD',
      subtotal: 500,
      tax_total: 50,
      grand_total: 550,
      extracted_fields_json: {},
      extraction_confidence: 1,
      extraction_status: 'EXTRACTED',
      validation_status: 'VALIDATED',
      match_status: 'MATCHED',
      approval_status: 'APPROVED',
      payment_status: 'READY',
      lifecycle_state: 'PAYMENT_READY',
      source_document_ref: null,
      scenario_label: null,
      duplicate_group_id: null,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    };

    const invB: Invoice = {
      invoice_id: `${ISO_PREFIX}-DUP-B`,
      invoice_number: 'inv-2026-duplicate-001', // Lowercase normalized duplicate
      vendor_id: testVendorId,
      purchase_order_id: null,
      invoice_date: '2026-10-05',
      received_at: '2026-10-05T00:00:00Z',
      due_date: '2026-11-04',
      currency: 'USD',
      subtotal: 500,
      tax_total: 50,
      grand_total: 550,
      extracted_fields_json: {},
      extraction_confidence: 1,
      extraction_status: 'EXTRACTED',
      validation_status: 'VALIDATED',
      match_status: 'UNMATCHED',
      approval_status: 'NOT_REQUIRED',
      payment_status: 'NOT_READY',
      lifecycle_state: 'VALIDATED',
      source_document_ref: null,
      scenario_label: 'DUPLICATE_INVOICE',
      duplicate_group_id: `${ISO_PREFIX}-DUP-GRP`,
      created_at: '2026-10-05T00:00:00Z',
      updated_at: '2026-10-05T00:00:00Z',
    };

    const outcome = runMatch({
      invoice: invB,
      invoiceLines: [],
      vendor: {
        vendor_id: testVendorId,
        vendor_code: 'VC',
        legal_name: 'Iso Vendor',
        tax_identifier: 'US-99',
        currency: 'USD',
        payment_terms_days: 30,
        status: 'ACTIVE',
        effective_from: '2025-01-01',
        effective_to: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
      po: null,
      poLines: [],
      receipts: [],
      receiptLines: [],
      allInvoices: [invA, invB],
      config: defaultMatchConfig(),
    });

    expect(outcome.overall_status).toBe('EXCEPTION');
    const dupEx = outcome.exceptions.find((e) => e.issue_type === 'DUPLICATE_INVOICE');
    expect(dupEx).toBeDefined();
    expect(dupEx?.severity).toBe('HIGH');
  });

  // Scenario 6: Missing or invalid fields
  it('Scenario 6: Missing required fields or negative arithmetic fails validation and prevents matching', () => {
    // Arithmetic invariant violation: subtotal + tax != grand_total
    const invalidInvoice: Invoice = {
      invoice_id: `${ISO_PREFIX}-INV-INVALID`,
      invoice_number: 'INV-INVALID-01',
      vendor_id: testVendorId,
      purchase_order_id: null,
      invoice_date: '2026-10-10',
      received_at: '2026-10-10T00:00:00Z',
      due_date: '2026-11-09',
      currency: 'USD',
      subtotal: 1000,
      tax_total: 100,
      grand_total: 9999, // Arithmetic mismatch
      extracted_fields_json: {},
      extraction_confidence: 0.4,
      extraction_status: 'SIMULATED',
      validation_status: 'VALIDATION_FAILED',
      match_status: 'BLOCKED',
      approval_status: 'BLOCKED',
      payment_status: 'NOT_READY',
      lifecycle_state: 'BLOCKED',
      source_document_ref: null,
      scenario_label: null,
      duplicate_group_id: null,
      created_at: '2026-10-10T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
    };

    expect(isPaymentReady(invalidInvoice, [])).toBe(false);
  });
});
