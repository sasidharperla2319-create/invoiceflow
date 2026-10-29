# Data Model

## Core Entities (9)

### Vendor → PurchaseOrder → PurchaseOrderLine
- Vendor (1) → PurchaseOrder (many)
- PurchaseOrder (1) → PurchaseOrderLine (1–8)
- `UNIQUE(purchase_order_id, line_number)`

### PurchaseOrder → GoodsReceipt → GoodsReceiptLine
- PurchaseOrder (1) → GoodsReceipt (many; supports partial deliveries)
- GoodsReceipt (1) → GoodsReceiptLine (many)
- GoodsReceiptLine.po_line_id → PurchaseOrderLine (many receipts per PO line)

### Vendor + PurchaseOrder → Invoice → InvoiceLine
- Invoice.vendor_id → Vendor
- Invoice.purchase_order_id → PurchaseOrder (optional — two-way match when null)
- Invoice (1) → InvoiceLine (many)
- InvoiceLine.po_line_id → PurchaseOrderLine (optional)

### Invoice → Approval
- Invoice (1) → Approval (many; multi-level)
- Approval.approver_user_id → User

### Invoice → Payment
- Invoice (1) → Payment (many; but at most one with status=PAID)
- Duplicate successful payments prevented by application check

## Supporting Entities

| Table | Purpose |
|-------|---------|
| users | Demo users with role assignment |
| exceptions | Per-rule failure findings with severity, status, routing |
| exception_assignments | Assignment + resolution history (append-only) |
| duplicate_findings | Pairs of invoices flagged as duplicates |
| audit_events | Append-only audit log across all entities |
| state_transitions | Lifecycle transition history per invoice |
| extraction_attempts | Extraction provider runs per invoice |
| rule_executions | Per-rule pass/fail results with observed vs expected |
| config_settings | Business tolerances and policies (key/value) |
| generation_manifests | Dataset generation metadata + checksums |
| evaluation_runs | Evaluation metrics per run |
| ground_truth | Expected labels per invoice (never read by matching engine) |

## Cardinality Summary

| Relationship | Cardinality |
|-------------|-------------|
| Vendor → PurchaseOrder | 1:N |
| PurchaseOrder → PurchaseOrderLine | 1:1-8 |
| PurchaseOrder → GoodsReceipt | 1:N |
| GoodsReceipt → GoodsReceiptLine | 1:N |
| PurchaseOrderLine → GoodsReceiptLine | 1:N (aggregated for receipt qty) |
| Vendor → Invoice | 1:N |
| PurchaseOrder → Invoice | 1:N (optional) |
| Invoice → InvoiceLine | 1:N |
| Invoice → Approval | 1:N |
| Invoice → Payment | 1:N (≤1 PAID) |
| Invoice → Exception | 1:N |
| Invoice → RuleExecution | 1:N |
| Invoice → StateTransition | 1:N |
| Exception → ExceptionAssignment | 1:N |

No many-to-many bridge tables are needed — every relationship is a simple FK.

## Lifecycle States

```
RECEIVED → EXTRACTED → VALIDATED → MATCHED → APPROVAL_PENDING → APPROVED → PAYMENT_READY → PAYMENT_SCHEDULED → PAID
                    ↘ EXCEPTION ↗              ↘ REJECTED
                    ↘ BLOCKED                   ↘ BLOCKED
                                                ↘ ON_HOLD
                                                                                          ↘ PAYMENT_FAILED → (retry) → PAYMENT_SCHEDULED
```

Valid transitions are defined in `src/domain/config.ts` (`VALID_TRANSITIONS`). Invalid transitions throw `LifecycleError`.
