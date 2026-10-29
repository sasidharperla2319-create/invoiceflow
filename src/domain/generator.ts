import { Rng, hashSeed } from './rng';
import { round2, lineSubtotal, lineTax, lineTotal } from './money';
import * as ids from './ids';
import { computeScenarioCounts, DATASET_PROFILES, type DatasetScale } from './config';
import type {
  Vendor,
  PurchaseOrder,
  PurchaseOrderLine,
  GoodsReceipt,
  GoodsReceiptLine,
  Invoice,
  InvoiceLine,
  Approval,
  Payment,
  GroundTruth,
  User,
  ScenarioLabel,
  LifecycleState,
} from './types';

export interface GeneratedDataset {
  users: User[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
  purchaseOrderLines: PurchaseOrderLine[];
  goodsReceipts: GoodsReceipt[];
  goodsReceiptLines: GoodsReceiptLine[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  approvals: Approval[];
  payments: Payment[];
  groundTruth: GroundTruth[];
  scenarioCounts: Record<ScenarioLabel, number>;
  rowCounts: Record<string, number>;
  seed: string;
  scale: DatasetScale;
  checksum: string;
}

const COMPANY_PREFIXES = [
  'Apex', 'Summit', 'Vertex', 'Catalyst', 'Nimbus', 'Atlas', 'Pioneer', 'Quantum',
  'Pinnacle', 'Horizon', 'Beacon', 'Sterling', 'Crest', 'Lumen', 'Forge', 'Vantage',
  'Cardinal', 'Meridian', 'Solstice', 'Cascade', 'Granite', 'Echo', 'Radiant', 'Trident',
  'Aurora', 'Boreal', 'Cobalt', 'Delta', 'Equinox', 'Falcon', 'Galaxy', 'Helix',
  'Ingenium', 'Junction', 'Keystone', 'Lattice', 'Monarch', 'Nexus', 'Orbit', 'Paragon',
];
const COMPANY_SUFFIXES = [
  'Industries', 'Manufacturing', 'Supplies', 'Logistics', 'Materials', 'Systems',
  'Components', 'Solutions', 'Distributors', 'Group', 'Technologies', 'Parts',
  'Trading', 'Enterprises', 'Holdings', 'Equipment',
];
const SKU_PREFIXES = ['SKU', 'ART', 'PRT', 'CMP', 'ASM', 'RAW', 'FIN'];
const CURRENCIES = ['USD', 'USD', 'USD', 'USD', 'EUR', 'GBP'];
const TAX_CODES = ['STANDARD', 'STANDARD', 'STANDARD', 'ZERO', 'REDUCED'];
const TAX_RATES: Record<string, number> = { STANDARD: 0.1, ZERO: 0.0, REDUCED: 0.05 };
const UOMS = ['EA', 'EA', 'EA', 'BOX', 'KG', 'L', 'M'];

function makeUsers(): User[] {
  const defs: { name: string; role: User['role'] }[] = [
    { name: 'Avery Chen', role: 'BUSINESS_REQUESTER' },
    { name: 'Jordan Patel', role: 'BUSINESS_REQUESTER' },
    { name: 'Riley Okafor', role: 'PROCESS_OWNER' },
    { name: 'Morgan Reyes', role: 'APPROVER' },
    { name: 'Sam Delgado', role: 'APPROVER' },
    { name: 'Taylor Brooks', role: 'OPERATIONS_ANALYST' },
    { name: 'Casey Nguyen', role: 'OPERATIONS_ANALYST' },
    { name: 'Drew Iverson', role: 'SYSTEM_ADMIN' },
  ];
  return defs.map((d, i) => ({
    user_id: ids.userId(i + 1),
    email: d.name.toLowerCase().replace(' ', '.') + '@yottaflex.ai',
    full_name: d.name,
    role: d.role,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  }));
}

function makeVendors(rng: Rng, count: number): Vendor[] {
  const vendors: Vendor[] = [];
  for (let i = 1; i <= count; i++) {
    const code = ids.vendorCode(i);
    let status: Vendor['status'] = 'ACTIVE';
    const roll = rng.next();
    if (i > 5 && roll < 0.05) status = 'CLOSED';
    else if (i > 5 && roll < 0.12) status = 'ON_HOLD';
    vendors.push({
      vendor_id: ids.vendorId(i),
      vendor_code: code,
      legal_name: `${rng.pick(COMPANY_PREFIXES)} ${rng.pick(COMPANY_SUFFIXES)}`,
      tax_identifier: `TIN-${String(1000000 + rng.int(0, 8999999))}`,
      currency: rng.pick(CURRENCIES),
      payment_terms_days: rng.pick([15, 30, 30, 30, 45, 60]),
      status,
      effective_from: '2024-01-01',
      effective_to: status === 'CLOSED' ? '2026-06-30' : null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
  }
  return vendors;
}

function makePurchaseOrders(
  rng: Rng,
  vendors: Vendor[],
  count: number,
): { pos: PurchaseOrder[]; poLines: PurchaseOrderLine[] } {
  const pos: PurchaseOrder[] = [];
  const poLines: PurchaseOrderLine[] = [];
  const activeVendors = vendors.filter((v) => v.status !== 'CLOSED');
  for (let i = 1; i <= count; i++) {
    const v = rng.pick(activeVendors);
    const poDate = `2026-${String(rng.int(1, 9)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`;
    const lineCount = rng.int(1, 8);
    const po = {
      purchase_order_id: ids.poId(i),
      po_number: ids.poNumber(i),
      vendor_id: v.vendor_id,
      po_date: poDate,
      expected_delivery_date: null,
      currency: v.currency,
      status: 'OPEN' as PurchaseOrder['status'],
      created_at: poDate + 'T00:00:00Z',
    };
    pos.push(po);
    for (let l = 1; l <= lineCount; l++) {
      const qty = rng.int(5, 200);
      const price = round2(rng.decimal(2, 500, 2));
      const taxCode = rng.pick(TAX_CODES);
      poLines.push({
        po_line_id: ids.poLineId(i, l),
        purchase_order_id: po.purchase_order_id,
        line_number: l,
        sku: `${rng.pick(SKU_PREFIXES)}-${rng.int(1000, 9999)}`,
        description: `${rng.pick(COMPANY_PREFIXES)} ${rng.pick(['Widget', 'Gadget', 'Module', 'Assembly', 'Component'])} ${l}`,
        ordered_quantity: qty,
        unit_price: price,
        tax_code: taxCode,
        tax_rate: TAX_RATES[taxCode],
        unit_of_measure: rng.pick(UOMS),
      });
    }
  }
  return { pos, poLines };
}

function makeGoodsReceipts(
  rng: Rng,
  pos: PurchaseOrder[],
  poLinesByPo: Map<string, PurchaseOrderLine[]>,
  count: number,
): { grns: GoodsReceipt[]; grlLines: GoodsReceiptLine[] } {
  const grns: GoodsReceipt[] = [];
  const grlLines: GoodsReceiptLine[] = [];
  // Distribute receipts across POs (some POs get multiple, some get none)
  for (let i = 1; i <= count; i++) {
    const po = rng.pick(pos);
    const poLineList = poLinesByPo.get(po.purchase_order_id) ?? [];
    if (poLineList.length === 0) continue;
    const receiptDate = addDays(po.po_date, rng.int(5, 40));
    const grn = {
      goods_receipt_id: ids.grnId(i),
      receipt_number: ids.grnNumber(i),
      purchase_order_id: po.purchase_order_id,
      receipt_date: receiptDate,
      status: 'RECEIVED',
      created_at: receiptDate + 'T00:00:00Z',
    };
    grns.push(grn);
    // Receipt a random subset of PO lines
    const linesToReceive = rng.int(1, poLineList.length);
    const chosen = rng.sample(poLineList, linesToReceive);
    for (const pol of chosen) {
      const received = Math.max(1, Math.floor(pol.ordered_quantity * rng.decimal(0.3, 1.0, 2)));
      const rejected = rng.bool(0.05) ? Math.floor(received * 0.1) : 0;
      const accepted = received - rejected;
      grlLines.push({
        receipt_line_id: ids.grlId(i, chosen.indexOf(pol) + 1),
        goods_receipt_id: grn.goods_receipt_id,
        po_line_id: pol.po_line_id,
        received_quantity: received,
        accepted_quantity: accepted,
        rejected_quantity: rejected,
        created_at: receiptDate + 'T00:00:00Z',
      });
    }
  }
  return { grns, grlLines };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function generateDataset(seed: string, scale: DatasetScale = 'starter'): GeneratedDataset {
  const profile = DATASET_PROFILES[scale];
  const rng = new Rng(hashSeed(`${seed}:${scale}`));

  const users = makeUsers();
  const vendors = makeVendors(rng, profile.vendors);

  const { pos, poLines } = makePurchaseOrders(rng, vendors, profile.purchaseOrders);
  const poLinesByPo = new Map<string, PurchaseOrderLine[]>();
  for (const pol of poLines) {
    const arr = poLinesByPo.get(pol.purchase_order_id) ?? [];
    arr.push(pol);
    poLinesByPo.set(pol.purchase_order_id, arr);
  }

  const { grns, grlLines } = makeGoodsReceipts(rng, pos, poLinesByPo, profile.goodsReceipts);

  // Aggregate accepted receipt qty by po_line_id
  const acceptedByPoLine = new Map<string, number>();
  for (const grl of grlLines) {
    acceptedByPoLine.set(
      grl.po_line_id,
      (acceptedByPoLine.get(grl.po_line_id) ?? 0) + grl.accepted_quantity,
    );
  }

  const scenarioCounts = computeScenarioCounts(profile.invoices);

  // Build invoices per scenario
  const invoices: Invoice[] = [];
  const invoiceLines: InvoiceLine[] = [];
  const groundTruth: GroundTruth[] = [];
  const approvals: Approval[] = [];
  const payments: Payment[] = [];

  let invCounter = 0;
  let apprCounter = 0;
  let payCounter = 0;

  const activeVendors = vendors.filter((v) => v.status === 'ACTIVE');
  const allVendors = vendors;
  const posByVendor = new Map<string, PurchaseOrder[]>();
  for (const po of pos) {
    const arr = posByVendor.get(po.vendor_id) ?? [];
    arr.push(po);
    posByVendor.set(po.vendor_id, arr);
  }

  const scenarioPlan: ScenarioLabel[] = [];
  (Object.keys(scenarioCounts) as ScenarioLabel[]).forEach((s) => {
    for (let i = 0; i < scenarioCounts[s]; i++) scenarioPlan.push(s);
  });
  // Shuffle deterministically so scenarios interleave
  const orderedPlan = rng.shuffle(scenarioPlan);

  const duplicateGroupCounter = { n: 0 };
  const usedInvoiceNumbers = new Set<string>();

  for (const scenario of orderedPlan) {
    invCounter++;
    const vendor = scenario === 'TAX_OR_VENDOR_ERROR' && rng.bool(0.4)
      ? rng.pick(allVendors)
      : rng.pick(activeVendors);
    const vCode = vendor.vendor_code;
    const invId = ids.invoiceId(vCode, invCounter);
    let invoiceNumber = `INV-${vCode}-${String(rng.int(1000, 9999))}`;
    while (usedInvoiceNumbers.has(ids.normalizeInvoiceNumber(invoiceNumber))) {
      invoiceNumber = `INV-${vCode}-${String(rng.int(1000, 9999))}`;
    }
    usedInvoiceNumbers.add(ids.normalizeInvoiceNumber(invoiceNumber));

    const vendorPOs = posByVendor.get(vendor.vendor_id) ?? [];
    const usePO = scenario !== 'CLEAN_MATCH' ? rng.bool(0.85) : rng.bool(0.9);
    const po = usePO && vendorPOs.length > 0 ? rng.pick(vendorPOs) : null;
    const poLineList = po ? poLinesByPo.get(po.purchase_order_id) ?? [] : [];

    const invoiceDate = po
      ? addDays(po.po_date, rng.int(20, 60))
      : `2026-${String(rng.int(1, 9)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`;
    const dueDate = addDays(invoiceDate, vendor.payment_terms_days);

    // Build invoice lines (1-5), possibly referencing PO lines
    const lineCount = Math.min(poLineList.length > 0 ? poLineList.length : rng.int(1, 4), 5);
    const lines: InvoiceLine[] = [];
    const usedPolIds = new Set<string>();
    for (let l = 1; l <= lineCount; l++) {
      let pol: PurchaseOrderLine | null = null;
      if (poLineList.length > 0 && l <= poLineList.length) {
        pol = poLineList[l - 1];
      } else if (poLineList.length > 0) {
        const remaining = poLineList.filter((p) => !usedPolIds.has(p.po_line_id));
        if (remaining.length > 0) pol = rng.pick(remaining);
      }
      let qty: number;
      let price: number;
      let taxCode: string;
      let taxRate: number;
      if (pol) {
        usedPolIds.add(pol.po_line_id);
        qty = pol.ordered_quantity;
        price = pol.unit_price;
        taxCode = pol.tax_code;
        taxRate = pol.tax_rate;
        const accepted = acceptedByPoLine.get(pol.po_line_id) ?? 0;
        if (scenario === 'CLEAN_MATCH') {
          qty = accepted > 0 ? accepted : qty;
        } else if (scenario === 'PRICE_VARIANCE' && l === 1) {
          // push price just above tolerance (~3-7%)
          price = round2(pol.unit_price * (1 + rng.pick([0.03, 0.04, 0.05, 0.07])));
        } else if (scenario === 'QUANTITY_MISMATCH' && l === 1) {
          qty = Math.floor(pol.ordered_quantity * rng.pick([1.15, 1.25, 1.5]));
        } else if (scenario === 'MISSING_RECEIPT' && l === 1) {
          qty = pol.ordered_quantity;
        } else if (scenario === 'TAX_OR_VENDOR_ERROR' && l === 1) {
          taxCode = 'STANDARD';
          taxRate = pol.tax_rate === 0.1 ? 0.05 : 0.1;
        }
      } else {
        qty = rng.int(1, 100);
        price = round2(rng.decimal(2, 200, 2));
        taxCode = rng.pick(TAX_CODES);
        taxRate = TAX_RATES[taxCode];
      }

      const sub = lineSubtotal(qty, price);
      const tax = lineTax(sub, taxRate);
      const total = lineTotal(sub, tax);
      lines.push({
        invoice_line_id: ids.invoiceLineId(invId, l),
        invoice_id: invId,
        line_number: l,
        sku: pol?.sku ?? `${rng.pick(SKU_PREFIXES)}-${rng.int(1000, 9999)}`,
        description: pol?.description ?? 'Direct purchase item',
        quantity: qty,
        unit_price: price,
        tax_code: taxCode,
        tax_rate: taxRate,
        line_subtotal: sub,
        line_tax: tax,
        line_total: total,
        po_line_id: pol?.po_line_id ?? null,
      });
    }

    const subtotal = round2(lines.reduce((a, l) => a + l.line_subtotal, 0));
    const taxTotal = round2(lines.reduce((a, l) => a + l.line_tax, 0));
    const grandTotal = round2(subtotal + taxTotal);

    // Lifecycle & statuses per scenario
    let matchStatus: Invoice['match_status'] = 'MATCHED';
    let lifecycle: LifecycleState = 'MATCHED';
    const approvalStatus: Invoice['approval_status'] = 'NOT_REQUIRED';
    let paymentStatus: Invoice['payment_status'] = 'NOT_READY';
    let duplicateGroupId: string | null = null;
    const expectedExceptionCodes: string[] = [];

    if (scenario === 'CLEAN_MATCH') {
      matchStatus = 'MATCHED';
      lifecycle = 'PAYMENT_READY';
      paymentStatus = 'READY';
    } else if (scenario === 'PRICE_VARIANCE') {
      matchStatus = 'EXCEPTION';
      lifecycle = 'EXCEPTION';
      expectedExceptionCodes.push('PRICE_VARIANCE');
    } else if (scenario === 'QUANTITY_MISMATCH') {
      matchStatus = 'EXCEPTION';
      lifecycle = 'EXCEPTION';
      expectedExceptionCodes.push('QUANTITY_EXCEEDS_PO');
    } else if (scenario === 'MISSING_RECEIPT') {
      matchStatus = 'EXCEPTION';
      lifecycle = 'EXCEPTION';
      expectedExceptionCodes.push('MISSING_RECEIPT');
    } else if (scenario === 'TAX_OR_VENDOR_ERROR') {
      matchStatus = 'EXCEPTION';
      lifecycle = 'EXCEPTION';
      if (vendor.status === 'CLOSED') {
        expectedExceptionCodes.push('VENDOR_CLOSED');
        lifecycle = 'BLOCKED';
        matchStatus = 'BLOCKED';
      } else if (vendor.status === 'ON_HOLD') {
        expectedExceptionCodes.push('VENDOR_ON_HOLD');
        lifecycle = 'BLOCKED';
        matchStatus = 'BLOCKED';
      } else {
        expectedExceptionCodes.push('TAX_MISMATCH');
      }
    } else if (scenario === 'DUPLICATE_INVOICE') {
      // Create a duplicate: reuse the same invoice number as a previous invoice from same vendor
      matchStatus = 'EXCEPTION';
      lifecycle = 'EXCEPTION';
      expectedExceptionCodes.push('DUPLICATE_INVOICE');
      // We'll pair duplicates after building all invoices; for now mark with a group placeholder
      duplicateGroupCounter.n++;
      duplicateGroupId = ids.duplicateGroupId(duplicateGroupCounter.n);
    }

    const inv: Invoice = {
      invoice_id: invId,
      invoice_number: invoiceNumber,
      vendor_id: vendor.vendor_id,
      purchase_order_id: po?.purchase_order_id ?? null,
      invoice_date: invoiceDate,
      received_at: invoiceDate + 'T09:00:00Z',
      due_date: dueDate,
      currency: vendor.currency,
      subtotal,
      tax_total: taxTotal,
      grand_total: grandTotal,
      extracted_fields_json: null,
      extraction_confidence: scenario === 'CLEAN_MATCH' ? 0.98 : rng.decimal(0.7, 0.99, 2),
      extraction_status: 'SIMULATED',
      validation_status: 'VALIDATED',
      match_status: matchStatus,
      approval_status: approvalStatus,
      payment_status: paymentStatus,
      lifecycle_state: lifecycle,
      source_document_ref: null,
      scenario_label: scenario,
      duplicate_group_id: duplicateGroupId,
      created_at: invoiceDate + 'T09:00:00Z',
      updated_at: invoiceDate + 'T09:00:00Z',
    };
    invoices.push(inv);
    invoiceLines.push(...lines);

    // Ground truth
    const gt: GroundTruth = {
      invoice_id: invId,
      scenario_label: scenario,
      expected_match_outcome: matchStatus,
      expected_exception_codes: expectedExceptionCodes,
      expected_duplicate_group: duplicateGroupId,
      expected_approval_eligible: false,
      expected_payment_ready: scenario === 'CLEAN_MATCH',
      expected_payment_outcome: scenario === 'CLEAN_MATCH' ? 'PAID' : null,
      notes: null,
    };
    groundTruth.push(gt);

    // For CLEAN_MATCH: create approval (auto-approved) + payment (paid)
    if (scenario === 'CLEAN_MATCH') {
      apprCounter++;
      approvals.push({
        approval_id: ids.approvalId(apprCounter),
        invoice_id: invId,
        approver_user_id: 'USR-0004',
        approval_level: 1,
        status: 'APPROVED',
        assigned_at: invoiceDate + 'T10:00:00Z',
        decided_at: invoiceDate + 'T11:00:00Z',
        decision_reason: 'Auto-approved: clean three-way match',
        comments: 'All checks passed',
      });
      payCounter++;
      payments.push({
        payment_id: ids.paymentId(payCounter),
        invoice_id: invId,
        payment_reference: `PMT-${vCode}-${payCounter}`,
        amount: grandTotal,
        currency: vendor.currency,
        status: 'PAID',
        scheduled_at: invoiceDate + 'T12:00:00Z',
        paid_at: invoiceDate + 'T14:00:00Z',
        failure_reason: null,
        created_at: invoiceDate + 'T12:00:00Z',
      });
    }
  }

  // Resolve duplicate pairs: for each duplicate-group invoice, create a sibling with same invoice_number
  const dupInvoices = invoices.filter((i) => i.scenario_label === 'DUPLICATE_INVOICE');
  for (const dup of dupInvoices) {
    invCounter++;
    const vCode = dup.invoice_id.split('-')[1];
    const siblingId = ids.invoiceId(vCode, invCounter);
    const siblingLines = invoiceLines
      .filter((l) => l.invoice_id === dup.invoice_id)
      .map((l, idx) => ({
        ...l,
        invoice_line_id: ids.invoiceLineId(siblingId, idx + 1),
        invoice_id: siblingId,
      }));
    const sibling: Invoice = {
      ...dup,
      invoice_id: siblingId,
      received_at: addDays(dup.invoice_date, 1) + 'T09:00:00Z',
      created_at: addDays(dup.invoice_date, 1) + 'T09:00:00Z',
      updated_at: addDays(dup.invoice_date, 1) + 'T09:00:00Z',
      match_status: 'EXCEPTION',
      lifecycle_state: 'EXCEPTION',
      payment_status: 'NOT_READY',
    };
    invoices.push(sibling);
    invoiceLines.push(...siblingLines);
    groundTruth.push({
      invoice_id: siblingId,
      scenario_label: 'DUPLICATE_INVOICE',
      expected_match_outcome: 'EXCEPTION',
      expected_exception_codes: ['DUPLICATE_INVOICE'],
      expected_duplicate_group: dup.duplicate_group_id,
      expected_approval_eligible: false,
      expected_payment_ready: false,
      expected_payment_outcome: null,
      notes: 'Sibling duplicate of ' + dup.invoice_id,
    });
  }

  const rowCounts = {
    users: users.length,
    vendors: vendors.length,
    purchase_orders: pos.length,
    purchase_order_lines: poLines.length,
    goods_receipts: grns.length,
    goods_receipt_lines: grlLines.length,
    invoices: invoices.length,
    invoice_lines: invoiceLines.length,
    approvals: approvals.length,
    payments: payments.length,
    ground_truth: groundTruth.length,
  };

  const checksum = computeChecksum(rowCounts, scenarioCounts, seed, scale);

  return {
    users,
    vendors,
    purchaseOrders: pos,
    purchaseOrderLines: poLines,
    goodsReceipts: grns,
    goodsReceiptLines: grlLines,
    invoices,
    invoiceLines,
    approvals,
    payments,
    groundTruth,
    scenarioCounts,
    rowCounts,
    seed,
    scale,
    checksum,
  };
}

function computeChecksum(
  rowCounts: Record<string, number>,
  scenarioCounts: Record<string, number>,
  seed: string,
  scale: string,
): string {
  // Simple deterministic checksum
  const payload = JSON.stringify({ rowCounts, scenarioCounts, seed, scale });
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
