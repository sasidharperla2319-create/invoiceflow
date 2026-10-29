# Business Rules

## Matching Engine (`src/domain/matchingEngine.ts`)

### Vendor checks
- **R-VENDOR-EXISTS**: vendor record must exist.
- **R-VENDOR-STATUS**: vendor must be ACTIVE. CLOSED/ON_HOLD → BLOCKING exception routed to Process Owner.

### Duplicate checks
- **R-DUPLICATE**: normalize invoice number (trim, uppercase, strip separators) + vendor ID. Any other invoice with the same key → HIGH exception (DUPLICATE_INVOICE). Does NOT flag every invoice from a vendor — only same normalized number + vendor.

### Price checks
- **R-PRICE**: per line, compare invoice unit price to PO line unit price. Pass if within absolute tolerance (default $0.50) OR percentage tolerance (default 1%). Records observed, expected, difference.

### Quantity checks
- **R-QUANTITY-PO**: invoice line quantity must not exceed PO ordered quantity. Exceed → MEDIUM (QUANTITY_EXCEEDS_PO).
- **R-RECEIPT**: accepted receipt quantity (aggregated across all receipt lines for the PO line) must be ≥ invoice quantity. Zero accepted → HIGH (MISSING_RECEIPT). Less than invoice → MEDIUM (QUANTITY_EXCEEDS_RECEIVED). Partial receipts are valid; only invoiced-but-not-received triggers an exception.

### Tax checks
- **R-TAX**: tax code must exist in policy; tax rate must match the configured rate for that code. Mismatch → MEDIUM (TAX_MISMATCH).

### Arithmetic checks
- **R-ARITHMETIC-LINE**: recalc line_subtotal = qty × price, line_tax = subtotal × rate, line_total = subtotal + tax. Compare to stored values within rounding tolerance (0.02). Mismatch → HIGH (ARITHMETIC_ERROR).
- **R-ARITHMETIC-INVOICE**: sum of line subtotals/taxes/totals must equal invoice header totals within tolerance.

### Date checks
- **R-DATE-BEFORE-PO**: invoice date must be ≥ PO date. Earlier → MEDIUM (DATE_BEFORE_PO).

### PO-vendor match
- **R-PO-VENDOR**: when a PO is supplied, invoice vendor must match PO vendor. Mismatch → BLOCKING (VENDOR_MISMATCH).

### Two-way match (no PO)
- **R-PO-PRESENT**: when invoice has no PO and policy is WARN → LOW warning (NO_PO).

## Overall status derivation
1. Any BLOCKING failure → `BLOCKED`
2. Any other failure → `EXCEPTION`
3. Any MATCHED_WITHIN_TOLERANCE → `MATCHED_WITHIN_TOLERANCE`
4. Otherwise → `MATCHED`

## Severity → routing
| Issue type | Severity | Routed to |
|-----------|----------|-----------|
| VENDOR_CLOSED | BLOCKING | Process Owner |
| VENDOR_ON_HOLD | BLOCKING | Process Owner |
| VENDOR_MISMATCH | BLOCKING | Operations Analyst |
| DUPLICATE_INVOICE | HIGH | Operations Analyst |
| ARITHMETIC_ERROR | HIGH | Operations Analyst |
| MISSING_RECEIPT | HIGH | Operations Analyst |
| PRICE_VARIANCE | MEDIUM | Operations Analyst |
| QUANTITY_* | MEDIUM | Operations Analyst |
| TAX_MISMATCH | MEDIUM | Operations Analyst |
| DATE_BEFORE_PO | MEDIUM | Operations Analyst |
| NO_PO | LOW | Operations Analyst |

## Lifecycle

Payment readiness requires ALL of:
- Extraction completed (EXTRACTED or SIMULATED)
- Validation passed (VALIDATED)
- No unresolved blocking exception
- No unresolved OPEN/ASSIGNED exceptions (for EXCEPTION-status invoices)
- Approval status = APPROVED
- Not already PAID

## Currency rounding
- Line subtotals/taxes/totals: round to 2 dp.
- Unit prices and tax rates: round to 4 dp.
- Comparisons use tolerance of 0.02.

## Reproducibility
- PRNG: mulberry32 seeded with `hashSeed(seed + ':' + scale)`.
- No Math.random, no Date.now in generator.
- Checksum = FNV-1a hash of `{rowCounts, scenarioCounts, seed, scale}`.
