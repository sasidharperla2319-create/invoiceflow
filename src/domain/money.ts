// Decimal-based money calculations. We use number internally but round
// deterministically to 2 decimal places (currency rounding) and to 4 dp for
// tax rates / unit prices. We never use floating math for currency totals
// without explicit rounding to keep arithmetic reconciliation deterministic.

export function round2(value: number): number {
  // round to 2 dp using banker's-style rounding via Number formatting
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function lineSubtotal(quantity: number, unitPrice: number): number {
  return round2(quantity * unitPrice);
}

export function lineTax(subtotal: number, taxRate: number): number {
  return round2(subtotal * taxRate);
}

export function lineTotal(subtotal: number, tax: number): number {
  return round2(subtotal + tax);
}

export function sumLineSubtotals(lines: { line_subtotal: number }[]): number {
  return round2(lines.reduce((acc, l) => acc + l.line_subtotal, 0));
}

export function sumLineTaxes(lines: { line_tax: number }[]): number {
  return round2(lines.reduce((acc, l) => acc + l.line_tax, 0));
}

export function sumLineTotals(lines: { line_total: number }[]): number {
  return round2(lines.reduce((acc, l) => acc + l.line_total, 0));
}

export function withinTolerance(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance + Number.EPSILON;
}

export function pctDifference(observed: number, expected: number): number {
  if (expected === 0) return observed === 0 ? 0 : Infinity;
  return (observed - expected) / expected;
}

export function formatMoney(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}
