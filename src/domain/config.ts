import type { LifecycleState, MatchConfig, ScenarioLabel } from './types';

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  price_abs_tolerance: 0.5,
  price_pct_tolerance: 0.01, // 1%
  quantity_tolerance_pct: 0.0, // strict by default
  rounding_tolerance: 0.02,
  require_receipt: true,
  two_way_match_policy: 'WARN',
  tax_codes: {
    STANDARD: 0.1,
    ZERO: 0.0,
    REDUCED: 0.05,
  },
};

export const SCENARIO_DISTRIBUTION: Record<ScenarioLabel, number> = {
  CLEAN_MATCH: 0.7,
  PRICE_VARIANCE: 0.1,
  QUANTITY_MISMATCH: 0.08,
  DUPLICATE_INVOICE: 0.05,
  MISSING_RECEIPT: 0.04,
  TAX_OR_VENDOR_ERROR: 0.03,
};

export const SCENARIO_ORDER: ScenarioLabel[] = [
  'CLEAN_MATCH',
  'PRICE_VARIANCE',
  'QUANTITY_MISMATCH',
  'DUPLICATE_INVOICE',
  'MISSING_RECEIPT',
  'TAX_OR_VENDOR_ERROR',
];

export const DATASET_PROFILES = {
  starter: {
    vendors: 20,
    purchaseOrders: 60,
    poLinesTarget: 100,
    goodsReceipts: 70,
    invoices: 120,
  },
  full: {
    vendors: 300,
    purchaseOrders: 1500,
    poLinesTarget: 2200,
    goodsReceipts: 1800,
    invoices: 2000,
  },
} as const;

export type DatasetScale = keyof typeof DATASET_PROFILES;

// Deterministic scenario counts using largest-remainder method.
export function computeScenarioCounts(
  total: number,
  distribution: Record<ScenarioLabel, number> = SCENARIO_DISTRIBUTION,
): Record<ScenarioLabel, number> {
  const labels = SCENARIO_ORDER.filter((l) => distribution[l] > 0);
  const raw = labels.map((l) => ({ label: l, value: total * distribution[l] }));
  const floor = raw.map((r) => Math.floor(r.value));
  let allocated = floor.reduce((a, b) => a + b, 0);
  const remainder = raw
    .map((r, i) => ({ i, frac: r.value - Math.floor(r.value) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (allocated < total && k < remainder.length) {
    floor[remainder[k].i] += 1;
    allocated += 1;
    k++;
  }
  // If rounding didn't distribute enough (very small totals), top up CLEAN_MATCH.
  while (allocated < total) {
    floor[0] += 1;
    allocated += 1;
  }
  const result = {} as Record<ScenarioLabel, number>;
  labels.forEach((l, i) => (result[l] = floor[i]));
  return result;
}

// Valid lifecycle transitions.
export const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  RECEIVED: ['EXTRACTED', 'BLOCKED'],
  EXTRACTED: ['VALIDATED', 'EXCEPTION', 'BLOCKED'],
  VALIDATED: ['MATCHED', 'EXCEPTION', 'BLOCKED', 'ON_HOLD'],
  MATCHED: ['APPROVAL_PENDING', 'PAYMENT_READY', 'ON_HOLD'],
  EXCEPTION: ['APPROVAL_PENDING', 'BLOCKED', 'ON_HOLD', 'MATCHED'],
  APPROVAL_PENDING: ['APPROVED', 'REJECTED', 'BLOCKED', 'ON_HOLD'],
  APPROVED: ['PAYMENT_READY', 'ON_HOLD'],
  REJECTED: [],
  BLOCKED: ['ON_HOLD', 'EXCEPTION'],
  ON_HOLD: ['APPROVAL_PENDING', 'EXCEPTION', 'MATCHED', 'BLOCKED'],
  PAYMENT_READY: ['PAYMENT_SCHEDULED'],
  PAYMENT_SCHEDULED: ['PAID', 'PAYMENT_FAILED'],
  PAID: [],
  PAYMENT_FAILED: ['PAYMENT_SCHEDULED', 'BLOCKED'],
};

export function isValidTransition(from: LifecycleState, to: LifecycleState): boolean {
  if (from === to) return false;
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

export const ROLE_BY_ISSUE_TYPE: Record<string, string> = {
  PRICE_VARIANCE: 'OPERATIONS_ANALYST',
  QUANTITY_MISMATCH: 'OPERATIONS_ANALYST',
  QUANTITY_EXCEEDS_PO: 'OPERATIONS_ANALYST',
  QUANTITY_EXCEEDS_RECEIVED: 'OPERATIONS_ANALYST',
  MISSING_RECEIPT: 'OPERATIONS_ANALYST',
  DUPLICATE_INVOICE: 'OPERATIONS_ANALYST',
  TAX_MISMATCH: 'OPERATIONS_ANALYST',
  VENDOR_MISMATCH: 'OPERATIONS_ANALYST',
  VENDOR_CLOSED: 'PROCESS_OWNER',
  VENDOR_ON_HOLD: 'PROCESS_OWNER',
  ARITHMETIC_ERROR: 'OPERATIONS_ANALYST',
  DATE_BEFORE_PO: 'OPERATIONS_ANALYST',
  EXTRACTION_INCOMPLETE: 'OPERATIONS_ANALYST',
  APPROVAL_REQUIRED: 'APPROVER',
};

export function severityForIssueType(issueType: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKING' {
  if (issueType === 'VENDOR_CLOSED' || issueType === 'VENDOR_MISMATCH') return 'BLOCKING';
  if (
    issueType === 'DUPLICATE_INVOICE' ||
    issueType === 'ARITHMETIC_ERROR' ||
    issueType === 'MISSING_RECEIPT'
  )
    return 'HIGH';
  if (
    issueType === 'PRICE_VARIANCE' ||
    issueType === 'QUANTITY_MISMATCH' ||
    issueType === 'TAX_MISMATCH' ||
    issueType === 'QUANTITY_EXCEEDS_PO' ||
    issueType === 'QUANTITY_EXCEEDS_RECEIVED'
  )
    return 'MEDIUM';
  return 'LOW';
}
