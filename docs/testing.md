# Testing

## Automated checks

The dataset validator (`src/domain/validation.ts`) runs every time a dataset is generated and covers:

- Primary-key uniqueness (all core tables)
- Foreign-key integrity (invoices→vendors, invoices→POs, lines→PO lines, receipts→POs, receipt lines→PO lines)
- Business ID format regex (`VND-\d{5}`, `PO-2026-\d{6}`, `GRN-2026-\d{6}`, `INV-…`)
- PO line counts between 1 and 8
- Invoice line number uniqueness per invoice
- Invoice totals reconcile with line sums (within 0.02 tolerance)
- Duplicate invoice numbers are scenario-labelled
- Ground-truth scenario counts match generator counts
- Ground truth covers all invoices
- CLEAN_MATCH invoices are payment-ready or paid
- No blocked invoice is payment-ready
- Rejected invoices not paid
- No duplicate successful payments

## Reproducibility

Running `generateDataset(seed, scale)` twice produces identical row counts, scenario counts, and checksum. The checksum is an FNV-1a hash of `{rowCounts, scenarioCounts, seed, scale}`.

## Edge cases covered by the generator

1. Duplicate invoice number (DUPLICATE_INVOICE scenario + sibling)
2. Same invoice submitted twice (sibling with identical invoice_number)
3. Invoice total differs from line-item totals — caught by R-ARITHMETIC-INVOICE
4. Invoice date before PO date — DATE_BEFORE_PO rule
5. Partial delivery — goods receipt lines with < ordered qty; valid if invoice ≤ accepted
6. Closed vendor — TAX_OR_VENDOR_ERROR with CLOSED vendor → BLOCKED
7. Vendor mismatch — R-PO-VENDOR
8. Tax code/rate mismatch — TAX_OR_VENDOR_ERROR flips tax rate
9. Invoice quantity exceeds PO quantity — QUANTITY_MISMATCH scenario
10. Invoice quantity exceeds accepted received quantity — R-RECEIPT
11. Missing goods receipt — MISSING_RECEIPT scenario (no receipt lines for PO line)
12. Price variance — PRICE_VARIANCE scenario (price +3–7%)
13. Valid invoice with multiple partial receipts — multiple GRN lines aggregated
14. Missing extraction fields — structured import can omit fields
15. Invoice with no PO — two-way match (R-PO-PRESENT warning)
16. Rejected approval — APPROVAL_INBOX allows reject
17. Duplicate payment attempt — `markPaymentPaid` checks existing PAID
18. Failed payment + retry — Payment Readiness page supports fail then retry
19. Illegal lifecycle transition — `assertTransition` throws LifecycleError
20. Unauthorized approval/resolve — role check in `queries.ts` throws

## Running tests

The validator runs automatically on every Data Lab generation. To preview validation without writing to the database, use the **Preview Validation** button in Data Lab.

## Manual test plan

1. Generate starter dataset → check Overview populates
2. Open Invoice Queue → filter by EXCEPTION → open an invoice
3. Switch to Operations Analyst role → resolve an exception
4. Switch to Approver → approve a pending invoice (if any)
5. Go to Payment Readiness → schedule a ready invoice → mark paid
6. Check Audit & Evaluation → verify metrics
7. Generate full dataset → verify row counts match targets
