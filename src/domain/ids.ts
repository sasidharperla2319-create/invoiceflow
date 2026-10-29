// Business ID formatters
const padN = (n: number, width: number) => String(n).padStart(width, '0');

export const vendorId = (n: number) => `VND-${padN(n, 5)}`;
export const vendorCode = (n: number) => `V${padN(n, 4)}`;
export const poId = (n: number) => `PO-2026-${padN(n, 6)}`;
export const poNumber = (n: number) => `PO-2026-${padN(n, 6)}`;
export const poLineId = (poN: number, line: number) => `POL-2026-${padN(poN, 6)}-${padN(line, 2)}`;
export const grnId = (n: number) => `GRN-2026-${padN(n, 6)}`;
export const grnNumber = (n: number) => `GRN-2026-${padN(n, 6)}`;
export const grlId = (grnN: number, line: number) => `GRL-2026-${padN(grnN, 6)}-${padN(line, 2)}`;
export const invoiceId = (vendorCodeStr: string, n: number) =>
  `INV-${vendorCodeStr}-2026-${padN(n, 6)}`;
export const invoiceLineId = (invId: string, line: number) => `INVL-${invId}-${padN(line, 2)}`;
export const approvalId = (n: number) => `APR-${padN(n, 7)}`;
export const paymentId = (n: number) => `PAY-${padN(n, 7)}`;
export const exceptionId = (n: number) => `EXC-${padN(n, 7)}`;
export const assignmentId = (n: number) => `ASG-${padN(n, 7)}`;
export const duplicateId = (n: number) => `DUP-${padN(n, 7)}`;
export const auditId = (n: number) => `AUD-${padN(n, 8)}`;
export const transitionId = (n: number) => `TRN-${padN(n, 8)}`;
export const attemptId = (n: number) => `EXT-${padN(n, 7)}`;
export const executionId = (n: number) => `RUL-${padN(n, 8)}`;
export const manifestId = (seed: string, scale: string) => `MAN-${seed}-${scale}`;
export const evaluationRunId = (n: number) => `EVAL-${padN(n, 6)}`;
export const userId = (n: number) => `USR-${padN(n, 4)}`;
export const duplicateGroupId = (n: number) => `DUPGRP-${padN(n, 5)}`;

export function normalizeInvoiceNumber(num: string): string {
  return num.trim().toUpperCase().replace(/[\s\-_/\\]+/g, '');
}
