import type {
  MatchContext,
  MatchOutcome,
  RuleResult,
  MatchStatus,
  GoodsReceiptLine,
} from './types';
import { DEFAULT_MATCH_CONFIG } from './config';
import { normalizeInvoiceNumber } from './ids';
import {
  round2,
  lineSubtotal,
  lineTax,
  lineTotal,
  withinTolerance,
  pctDifference,
} from './money';
import { ROLE_BY_ISSUE_TYPE } from './config';
import type { UserRole } from './types';

const RULE_VERSION = '1.0';
let runCounter = 0;
export function nextProcessingRunId(): string {
  runCounter++;
  return `RUN-${String(runCounter).padStart(8, '0')}`;
}

export function defaultMatchConfig() {
  return { ...DEFAULT_MATCH_CONFIG };
}

export function runMatch(ctx: MatchContext): MatchOutcome {
  const processingRunId = nextProcessingRunId();
  const results: RuleResult[] = [];
  const { invoice, invoiceLines, vendor, po, poLines, receiptLines, allInvoices, config } = ctx;

  // R-VENDOR-EXISTS
  if (!vendor) {
    results.push(fail('R-VENDOR-EXISTS', 'Vendor not found', 'VENDOR_NOT_FOUND', 'BLOCKING', null, null, 'OPERATIONS_ANALYST'));
  } else {
    results.push(pass('R-VENDOR-EXISTS', 'Vendor exists', vendor.vendor_code));
    // R-VENDOR-STATUS
    if (vendor.status === 'CLOSED') {
      results.push(fail('R-VENDOR-STATUS', `Vendor is CLOSED`, 'VENDOR_CLOSED', 'BLOCKING', vendor.status, 'ACTIVE', 'PROCESS_OWNER'));
    } else if (vendor.status === 'ON_HOLD') {
      results.push(fail('R-VENDOR-STATUS', `Vendor is ON_HOLD`, 'VENDOR_ON_HOLD', 'BLOCKING', vendor.status, 'ACTIVE', 'PROCESS_OWNER'));
    } else {
      results.push(pass('R-VENDOR-STATUS', 'Vendor is ACTIVE', vendor.status));
    }
  }

  // R-DUPLICATE
  const normalized = normalizeInvoiceNumber(invoice.invoice_number);
  const duplicates = allInvoices.filter(
    (i) =>
      i.invoice_id !== invoice.invoice_id &&
      i.vendor_id === invoice.vendor_id &&
      normalizeInvoiceNumber(i.invoice_number) === normalized,
  );
  if (duplicates.length > 0) {
    results.push(fail(
      'R-DUPLICATE',
      `Duplicate invoice number ${invoice.invoice_number} for vendor ${vendor?.vendor_code}`,
      'DUPLICATE_INVOICE',
      'HIGH',
      invoice.invoice_number,
      duplicates[0].invoice_number,
      'OPERATIONS_ANALYST',
    ));
  } else {
    results.push(pass('R-DUPLICATE', 'No duplicate invoice detected', normalized));
  }

  // PO-backed checks
  if (po) {
    // R-PO-VENDOR
    if (vendor && po.vendor_id !== invoice.vendor_id) {
      results.push(fail(
        'R-PO-VENDOR',
        `Invoice vendor ${vendor.vendor_code} does not match PO vendor`,
        'VENDOR_MISMATCH',
        'BLOCKING',
        vendor.vendor_code,
        po.vendor_id,
        'OPERATIONS_ANALYST',
      ));
    } else {
      results.push(pass('R-PO-VENDOR', 'Invoice vendor matches PO vendor', vendor?.vendor_code ?? null));
    }
    // R-DATE-BEFORE-PO
    if (invoice.invoice_date < po.po_date) {
      results.push(fail(
        'R-DATE-BEFORE-PO',
        `Invoice date ${invoice.invoice_date} is before PO date ${po.po_date}`,
        'DATE_BEFORE_PO',
        'MEDIUM',
        invoice.invoice_date,
        po.po_date,
        'OPERATIONS_ANALYST',
      ));
    } else {
      results.push(pass('R-DATE-BEFORE-PO', 'Invoice date is on/after PO date', invoice.invoice_date));
    }
  } else {
    // No PO — two-way matching
    if (config.two_way_match_policy === 'WARN') {
      results.push(warn('R-PO-PRESENT', 'Invoice has no PO (two-way match)', 'NO_PO', 'LOW', null, null, 'OPERATIONS_ANALYST'));
    } else {
      results.push(pass('R-PO-PRESENT', 'No PO required (two-way match allowed)', null));
    }
  }

  // Per-line checks
  for (const invLine of invoiceLines) {
    const pol = poLines.find((p) => p.po_line_id === invLine.po_line_id);
    if (pol) {
      // R-PRICE
      const absDiff = Math.abs(invLine.unit_price - pol.unit_price);
      const pctDiff = Math.abs(pctDifference(invLine.unit_price, pol.unit_price));
      const withinAbs = absDiff <= config.price_abs_tolerance + Number.EPSILON;
      const withinPct = pctDiff <= config.price_pct_tolerance + Number.EPSILON;
      if (withinAbs || withinPct) {
        results.push(pass(
          'R-PRICE',
          `Line ${invLine.line_number} price within tolerance`,
          String(invLine.unit_price),
        ));
      } else {
        results.push(fail(
          'R-PRICE',
          `Line ${invLine.line_number} price ${invLine.unit_price} vs PO ${pol.unit_price} (diff ${absDiff.toFixed(2)})`,
          'PRICE_VARIANCE',
          'MEDIUM',
          String(invLine.unit_price),
          String(pol.unit_price),
          'OPERATIONS_ANALYST',
          String(config.price_pct_tolerance),
          String(absDiff),
        ));
      }

      // R-QUANTITY-PO
      if (invLine.quantity > pol.ordered_quantity) {
        results.push(fail(
          'R-QUANTITY-PO',
          `Line ${invLine.line_number} qty ${invLine.quantity} exceeds PO qty ${pol.ordered_quantity}`,
          'QUANTITY_EXCEEDS_PO',
          'MEDIUM',
          String(invLine.quantity),
          String(pol.ordered_quantity),
          'OPERATIONS_ANALYST',
        ));
      } else {
        results.push(pass('R-QUANTITY-PO', `Line ${invLine.line_number} qty within PO qty`, String(invLine.quantity)));
      }

      // R-RECEIPT
      const accepted = aggregateAccepted(receiptLines, pol.po_line_id);
      if (config.require_receipt) {
        if (accepted <= 0) {
          results.push(fail(
            'R-RECEIPT',
            `Line ${invLine.line_number} has no accepted receipt for PO line ${pol.po_line_id}`,
            'MISSING_RECEIPT',
            'HIGH',
            '0',
            String(invLine.quantity),
            'OPERATIONS_ANALYST',
          ));
        } else if (invLine.quantity > accepted + Number.EPSILON) {
          results.push(fail(
            'R-RECEIPT',
            `Line ${invLine.line_number} qty ${invLine.quantity} exceeds accepted receipt ${accepted}`,
            'QUANTITY_EXCEEDS_RECEIVED',
            'MEDIUM',
            String(invLine.quantity),
            String(accepted),
            'OPERATIONS_ANALYST',
          ));
        } else {
          results.push(pass('R-RECEIPT', `Line ${invLine.line_number} receipt sufficient`, String(accepted)));
        }
      } else {
        results.push(pass('R-RECEIPT', 'Receipt not required by policy', null));
      }

      // R-TAX
      const expectedTaxRate = config.tax_codes[invLine.tax_code] ?? null;
      if (expectedTaxRate === null) {
        results.push(fail(
          'R-TAX',
          `Line ${invLine.line_number} tax code ${invLine.tax_code} not in policy`,
          'TAX_MISMATCH',
          'MEDIUM',
          invLine.tax_code,
          Object.keys(config.tax_codes).join(','),
          'OPERATIONS_ANALYST',
        ));
      } else if (Math.abs(invLine.tax_rate - expectedTaxRate) > 0.0001) {
        results.push(fail(
          'R-TAX',
          `Line ${invLine.line_number} tax rate ${invLine.tax_rate} does not match code ${invLine.tax_code} (expected ${expectedTaxRate})`,
          'TAX_MISMATCH',
          'MEDIUM',
          String(invLine.tax_rate),
          String(expectedTaxRate),
          'OPERATIONS_ANALYST',
        ));
      } else {
        results.push(pass('R-TAX', `Line ${invLine.line_number} tax code/rate valid`, invLine.tax_code));
      }
    }
  }

  // R-ARITHMETIC-LINE
  for (const invLine of invoiceLines) {
    const expectedSub = lineSubtotal(invLine.quantity, invLine.unit_price);
    const expectedTax = lineTax(expectedSub, invLine.tax_rate);
    const expectedTotal = lineTotal(expectedSub, expectedTax);
    const subOk = withinTolerance(invLine.line_subtotal, expectedSub, config.rounding_tolerance);
    const taxOk = withinTolerance(invLine.line_tax, expectedTax, config.rounding_tolerance);
    const totalOk = withinTolerance(invLine.line_total, expectedTotal, config.rounding_tolerance);
    if (!subOk || !taxOk || !totalOk) {
      results.push(fail(
        'R-ARITHMETIC-LINE',
        `Line ${invLine.line_number} arithmetic mismatch (sub=${invLine.line_subtotal}/${expectedSub}, tax=${invLine.line_tax}/${expectedTax}, total=${invLine.line_total}/${expectedTotal})`,
        'ARITHMETIC_ERROR',
        'HIGH',
        `sub=${invLine.line_subtotal},tax=${invLine.line_tax},total=${invLine.line_total}`,
        `sub=${expectedSub},tax=${expectedTax},total=${expectedTotal}`,
        'OPERATIONS_ANALYST',
      ));
    } else {
      results.push(pass('R-ARITHMETIC-LINE', `Line ${invLine.line_number} arithmetic reconciled`, String(invLine.line_total)));
    }
  }

  // R-ARITHMETIC-INVOICE
  const calcSub = round2(invoiceLines.reduce((a, l) => a + l.line_subtotal, 0));
  const calcTax = round2(invoiceLines.reduce((a, l) => a + l.line_tax, 0));
  const calcGrand = round2(calcSub + calcTax);
  const subOk = withinTolerance(invoice.subtotal, calcSub, config.rounding_tolerance);
  const taxOk = withinTolerance(invoice.tax_total, calcTax, config.rounding_tolerance);
  const grandOk = withinTolerance(invoice.grand_total, calcGrand, config.rounding_tolerance);
  if (!subOk || !taxOk || !grandOk) {
    results.push(fail(
      'R-ARITHMETIC-INVOICE',
      `Invoice totals mismatch (sub=${invoice.subtotal}/${calcSub}, tax=${invoice.tax_total}/${calcTax}, grand=${invoice.grand_total}/${calcGrand})`,
      'ARITHMETIC_ERROR',
      'HIGH',
      `sub=${invoice.subtotal},tax=${invoice.tax_total},grand=${invoice.grand_total}`,
      `sub=${calcSub},tax=${calcTax},grand=${calcGrand}`,
      'OPERATIONS_ANALYST',
    ));
  } else {
    results.push(pass('R-ARITHMETIC-INVOICE', 'Invoice totals reconcile with lines', String(invoice.grand_total)));
  }

  // Determine overall status
  const blocking = results.some((r) => r.severity === 'BLOCKING' && r.result === 'FAIL');
  const failures = results.filter((r) => r.result === 'FAIL');
  let overallStatus: MatchStatus;
  if (blocking) overallStatus = 'BLOCKED';
  else if (failures.length > 0) overallStatus = 'EXCEPTION';
  else if (results.some((r) => r.result === 'MATCHED_WITHIN_TOLERANCE')) overallStatus = 'MATCHED_WITHIN_TOLERANCE';
  else overallStatus = 'MATCHED';

  const exceptions = results.filter((r) => r.result === 'FAIL');

  return {
    invoice_id: invoice.invoice_id,
    processing_run_id: processingRunId,
    overall_status: overallStatus,
    results,
    exceptions,
    blocking,
  };
}

function aggregateAccepted(receiptLines: GoodsReceiptLine[], poLineId: string): number {
  return round2(
    receiptLines
      .filter((r) => r.po_line_id === poLineId)
      .reduce((acc, r) => acc + r.accepted_quantity, 0),
  );
}

function pass(ruleId: string, explanation: string, observed: string | null): RuleResult {
  return {
    rule_id: ruleId,
    rule_version: RULE_VERSION,
    result: 'PASS',
    observed_value: observed,
    expected_value: null,
    tolerance: null,
    difference: null,
    explanation,
    severity: 'LOW',
    issue_type: null,
    routed_to_role: null,
  };
}

function warn(
  ruleId: string,
  explanation: string,
  issueType: string,
  severity: RuleResult['severity'],
  observed: string | null,
  expected: string | null,
  routedTo: UserRole | null,
  tolerance: string | null = null,
  difference: string | null = null,
): RuleResult {
  return {
    rule_id: ruleId,
    rule_version: RULE_VERSION,
    result: 'WARN',
    observed_value: observed,
    expected_value: expected,
    tolerance,
    difference,
    explanation,
    severity,
    issue_type: issueType,
    routed_to_role: routedTo ?? (ROLE_BY_ISSUE_TYPE[issueType] as UserRole) ?? null,
  };
}

function fail(
  ruleId: string,
  explanation: string,
  issueType: string,
  severity: RuleResult['severity'],
  observed: string | null,
  expected: string | null,
  routedTo: UserRole | null,
  tolerance: string | null = null,
  difference: string | null = null,
): RuleResult {
  return {
    rule_id: ruleId,
    rule_version: RULE_VERSION,
    result: 'FAIL',
    observed_value: observed,
    expected_value: expected,
    tolerance,
    difference,
    explanation,
    severity,
    issue_type: issueType,
    routed_to_role: routedTo ?? (ROLE_BY_ISSUE_TYPE[issueType] as UserRole) ?? null,
  };
}
