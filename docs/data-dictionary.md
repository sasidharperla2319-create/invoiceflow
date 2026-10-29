# Data Dictionary

## vendors
| Column | Type | Notes |
|--------|------|-------|
| vendor_id | text PK | `VND-00001` |
| vendor_code | text unique | `V0001` |
| legal_name | text | |
| tax_identifier | text | |
| currency | text | ISO 4217 |
| payment_terms_days | integer | |
| status | text | ACTIVE, ON_HOLD, CLOSED |
| effective_from | date | |
| effective_to | date nullable | |
| created_at, updated_at | timestamptz | |

## purchase_orders
| Column | Type | Notes |
|--------|------|-------|
| purchase_order_id | text PK | `PO-2026-000001` |
| po_number | text unique | same as ID |
| vendor_id | text FK → vendors | |
| po_date | date | |
| expected_delivery_date | date nullable | |
| currency | text | |
| status | text | DRAFT, OPEN, PARTIALLY_RECEIVED, FULLY_RECEIVED, CLOSED, CANCELLED |

## purchase_order_lines
| Column | Type | Notes |
|--------|------|-------|
| po_line_id | text PK | `POL-2026-000001-01` |
| purchase_order_id | text FK | |
| line_number | integer | unique per PO |
| sku | text | |
| ordered_quantity | numeric(14,3) | |
| unit_price | numeric(14,4) | |
| tax_code | text | STANDARD, ZERO, REDUCED |
| tax_rate | numeric(6,4) | |
| unit_of_measure | text | |

## goods_receipts
| Column | Type | Notes |
|--------|------|-------|
| goods_receipt_id | text PK | `GRN-2026-000001` |
| receipt_number | text unique | |
| purchase_order_id | text FK | |
| receipt_date | date | |
| status | text | RECEIVED |

## goods_receipt_lines
| Column | Type | Notes |
|--------|------|-------|
| receipt_line_id | text PK | `GRL-2026-000001-01` |
| goods_receipt_id | text FK | |
| po_line_id | text FK | |
| received_quantity | numeric(14,3) | |
| accepted_quantity | numeric(14,3) | received - rejected |
| rejected_quantity | numeric(14,3) | |

## invoices
| Column | Type | Notes |
|--------|------|-------|
| invoice_id | text PK | `INV-V0001-2026-000001` (immutable) |
| invoice_number | text | vendor's invoice number; normalized for dedup |
| vendor_id | text FK | |
| purchase_order_id | text FK nullable | null = two-way match |
| invoice_date | date | |
| received_at | timestamptz | |
| due_date | date | |
| currency | text | |
| subtotal, tax_total, grand_total | numeric(14,2) | |
| extracted_fields_json | jsonb nullable | |
| extraction_confidence | numeric(5,2) | 0–1 |
| extraction_status | text | PENDING, EXTRACTED, EXTRACTION_FAILED, SIMULATED |
| validation_status | text | PENDING, VALIDATED, VALIDATION_FAILED |
| match_status | text | UNMATCHED, MATCHED, MATCHED_WITHIN_TOLERANCE, PARTIAL_MATCH, EXCEPTION, BLOCKED, PENDING_REVIEW |
| approval_status | text | NOT_REQUIRED, PENDING, APPROVED, REJECTED, BLOCKED |
| payment_status | text | NOT_READY, READY, SCHEDULED, PAID, FAILED, NOT_APPLICABLE |
| lifecycle_state | text | see data-model.md |
| scenario_label | text nullable | ground-truth label (demo) |
| duplicate_group_id | text nullable | |

## invoice_lines
| Column | Type | Notes |
|--------|------|-------|
| invoice_line_id | text PK | `INVL-<invoice_id>-01` |
| invoice_id | text FK | |
| line_number | integer | unique per invoice |
| quantity | numeric(14,3) | |
| unit_price | numeric(14,4) | |
| tax_code, tax_rate | | |
| line_subtotal, line_tax, line_total | numeric(14,2) | computed via Decimal rounding |
| po_line_id | text FK nullable | |

## approvals
| approval_id | approver_user_id | approval_level | status (PENDING/APPROVED/REJECTED) | assigned_at | decided_at | decision_reason | comments |

## payments
| payment_id | invoice_id | payment_reference | amount | currency | status (SCHEDULED/PAID/FAILED) | scheduled_at | paid_at | failure_reason |

## exceptions
| exception_id | invoice_id | rule_id | issue_type | severity (LOW/MEDIUM/HIGH/BLOCKING) | status (OPEN/ASSIGNED/RESOLVED/REJECTED) | observed_value | expected_value | tolerance | difference | explanation | routed_to_role | assigned_to_user_id | priority | resolution_notes | resolved_at |

## ground_truth
| invoice_id (PK) | scenario_label | expected_match_outcome | expected_exception_codes[] | expected_duplicate_group | expected_approval_eligible | expected_payment_ready | expected_payment_outcome | notes |

## config_settings
| key (PK) | value (jsonb) | description | updated_at |

## Generation manifest, evaluation_run, audit_event, state_transition, extraction_attempt, rule_execution, exception_assignment, duplicate_findings — see schema SQL for full columns.
