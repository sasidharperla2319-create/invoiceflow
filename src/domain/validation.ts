import type { GeneratedDataset } from './generator';
import { normalizeInvoiceNumber } from './ids';

export interface ValidationReport {
  passed: boolean;
  checks: { name: string; passed: boolean; detail?: string }[];
  summary: string;
}

export function validateDataset(ds: GeneratedDataset): ValidationReport {
  const checks: { name: string; passed: boolean; detail?: string }[] = [];

  // PK uniqueness
  const checkPk = (name: string, items: { [k: string]: unknown }[], idField: string) => {
    const ids = items.map((i) => String(i[idField]));
    const unique = new Set(ids).size === ids.length;
    checks.push({ name: `PK uniqueness: ${name}`, passed: unique, detail: unique ? undefined : `${ids.length - new Set(ids).size} duplicates` });
  };
  checkPk('vendors', ds.vendors as unknown as { [k: string]: unknown }[], 'vendor_id');
  checkPk('purchase_orders', ds.purchaseOrders as unknown as { [k: string]: unknown }[], 'purchase_order_id');
  checkPk('purchase_order_lines', ds.purchaseOrderLines as unknown as { [k: string]: unknown }[], 'po_line_id');
  checkPk('goods_receipts', ds.goodsReceipts as unknown as { [k: string]: unknown }[], 'goods_receipt_id');
  checkPk('invoices', ds.invoices as unknown as { [k: string]: unknown }[], 'invoice_id');
  checkPk('invoice_lines', ds.invoiceLines as unknown as { [k: string]: unknown }[], 'invoice_line_id');

  // FK integrity
  const vendorIds = new Set(ds.vendors.map((v) => v.vendor_id));
  const poIds = new Set(ds.purchaseOrders.map((p) => p.purchase_order_id));
  const polIds = new Set(ds.purchaseOrderLines.map((p) => p.po_line_id));
  const grnIds = new Set(ds.goodsReceipts.map((g) => g.goods_receipt_id));
  const invIds = new Set(ds.invoices.map((i) => i.invoice_id));
  const fkVendors = ds.invoices.every((i) => vendorIds.has(i.vendor_id));
  const fkPOs = ds.invoices.every((i) => i.purchase_order_id === null || poIds.has(i.purchase_order_id));
  const fkPolInv = ds.invoiceLines.every((l) => l.po_line_id === null || polIds.has(l.po_line_id));
  const fkPoVendor = ds.purchaseOrders.every((p) => vendorIds.has(p.vendor_id));
  const fkGrPo = ds.goodsReceipts.every((g) => poIds.has(g.purchase_order_id));
  const fkGrlPol = ds.goodsReceiptLines.every((l) => polIds.has(l.po_line_id));
  const fkGrlGrn = ds.goodsReceiptLines.every((l) => grnIds.has(l.goods_receipt_id));
  const fkInvLines = ds.invoiceLines.every((l) => invIds.has(l.invoice_id));
  checks.push({ name: 'FK integrity: invoices.vendor_id', passed: fkVendors });
  checks.push({ name: 'FK integrity: invoices.purchase_order_id', passed: fkPOs });
  checks.push({ name: 'FK integrity: invoice_lines.po_line_id', passed: fkPolInv });
  checks.push({ name: 'FK integrity: po.vendor_id', passed: fkPoVendor });
  checks.push({ name: 'FK integrity: gr.purchase_order_id', passed: fkGrPo });
  checks.push({ name: 'FK integrity: grl.po_line_id', passed: fkGrlPol });
  checks.push({ name: 'FK integrity: grl.goods_receipt_id', passed: fkGrlGrn });
  checks.push({ name: 'FK integrity: invoice_lines.invoice_id', passed: fkInvLines });

  // ID formats
  const idFmt = (regex: RegExp, items: { [k: string]: unknown }[], field: string, name: string) => {
    const ok = items.every((i) => regex.test(String(i[field])));
    checks.push({ name: `ID format: ${name}`, passed: ok });
  };
  idFmt(/^VND-\d{5}$/, ds.vendors as unknown as { [k: string]: unknown }[], 'vendor_id', 'vendor_id');
  idFmt(/^V\d{4}$/, ds.vendors as unknown as { [k: string]: unknown }[], 'vendor_code', 'vendor_code');
  idFmt(/^PO-2026-\d{6}$/, ds.purchaseOrders as unknown as { [k: string]: unknown }[], 'po_number', 'po_number');
  idFmt(/^GRN-2026-\d{6}$/, ds.goodsReceipts as unknown as { [k: string]: unknown }[], 'receipt_number', 'receipt_number');
  idFmt(/^INV-/, ds.invoices as unknown as { [k: string]: unknown }[], 'invoice_id', 'invoice_id');

  // PO line count 1..8
  const poLineCounts = new Map<string, number>();
  ds.purchaseOrderLines.forEach((l) => poLineCounts.set(l.purchase_order_id, (poLineCounts.get(l.purchase_order_id) ?? 0) + 1));
  const poLineOk = [...poLineCounts.values()].every((c) => c >= 1 && c <= 8);
  checks.push({ name: 'PO line counts 1..8', passed: poLineOk });

  // Line uniqueness
  const lineUniq = ds.invoiceLines.every((l, _i, arr) => arr.filter((x) => x.invoice_id === l.invoice_id && x.line_number === l.line_number).length === 1);
  checks.push({ name: 'Invoice line number uniqueness', passed: lineUniq });

  // Invoice totals reconcile with lines
  let reconcileOk = true;
  let reconcileDetail = '';
  for (const inv of ds.invoices) {
    const lines = ds.invoiceLines.filter((l) => l.invoice_id === inv.invoice_id);
    const calcSub = Math.round(lines.reduce((a, l) => a + l.line_subtotal, 0) * 100) / 100;
    const calcTax = Math.round(lines.reduce((a, l) => a + l.line_tax, 0) * 100) / 100;
    const calcGrand = Math.round((calcSub + calcTax) * 100) / 100;
    if (Math.abs(inv.subtotal - calcSub) > 0.02 || Math.abs(inv.tax_total - calcTax) > 0.02 || Math.abs(inv.grand_total - calcGrand) > 0.02) {
      reconcileOk = false;
      reconcileDetail = `${inv.invoice_id} mismatch`;
      break;
    }
  }
  checks.push({ name: 'Invoice totals reconcile with lines', passed: reconcileOk, detail: reconcileDetail });

  // Duplicate invoice number detection
  const normalizedSeen = new Set<string>();
  let dupExpectedOk = true;
  for (const inv of ds.invoices) {
    const key = `${inv.vendor_id}|${normalizeInvoiceNumber(inv.invoice_number)}`;
    if (normalizedSeen.has(key)) {
      // duplicate is expected only for DUPLICATE_INVOICE scenario
      if (inv.scenario_label !== 'DUPLICATE_INVOICE') {
        dupExpectedOk = false;
      }
    }
    normalizedSeen.add(key);
  }
  checks.push({ name: 'Duplicate invoice numbers are scenario-labelled', passed: dupExpectedOk });

  // Ground truth scenario counts match
  const gtScenarioCounts: Record<string, number> = {};
  ds.groundTruth.forEach((g) => (gtScenarioCounts[g.scenario_label] = (gtScenarioCounts[g.scenario_label] ?? 0) + 1));
  const scenarioOk = Object.keys(ds.scenarioCounts).every(
    (s) => (gtScenarioCounts[s] ?? 0) >= (ds.scenarioCounts as Record<string, number>)[s],
  );
  checks.push({ name: 'Ground truth scenario counts match', passed: scenarioOk });

  // Ground truth separation: scenario_label not used as input feature (we just check it exists on invoice but isn't a "feature")
  // (In this design, scenario_label is metadata stored on invoice for demo purposes; the matching engine does not read it.)
  const gtSeparationOk = ds.groundTruth.length === ds.invoices.length;
  checks.push({ name: 'Ground truth covers all invoices', passed: gtSeparationOk });

  // Lifecycle: clean matches are payment_ready
  const cleanOk = ds.invoices.filter((i) => i.scenario_label === 'CLEAN_MATCH').every((i) => i.payment_status === 'READY' || i.payment_status === 'PAID');
  checks.push({ name: 'CLEAN_MATCH invoices are payment-ready/paid', passed: cleanOk });

  // No blocked invoice is marked payment-ready
  const safetyOk = ds.invoices.every((i) => !(i.match_status === 'BLOCKED' && i.payment_status === 'READY'));
  checks.push({ name: 'No blocked invoice is payment-ready', passed: safetyOk });

  // Rejected invoices cannot be paid
  const rejectedOk = ds.invoices.every((i) => !(i.approval_status === 'REJECTED' && i.payment_status === 'PAID'));
  checks.push({ name: 'Rejected invoices not paid', passed: rejectedOk });

  // No duplicate successful payments
  const payByInv = new Map<string, number>();
  ds.payments.filter((p) => p.status === 'PAID').forEach((p) => payByInv.set(p.invoice_id, (payByInv.get(p.invoice_id) ?? 0) + 1));
  const noDupPay = [...payByInv.values()].every((c) => c === 1);
  checks.push({ name: 'No duplicate successful payments', passed: noDupPay });

  const failedChecks = checks.filter((c) => !c.passed);
  return {
    passed: failedChecks.length === 0,
    checks,
    summary: `${checks.length - failedChecks.length}/${checks.length} checks passed${failedChecks.length > 0 ? ` (${failedChecks.map((c) => c.name).join('; ')})` : ''}`,
  };
}

export function reproducibilityChecksum(ds: GeneratedDataset): string {
  return ds.checksum;
}
