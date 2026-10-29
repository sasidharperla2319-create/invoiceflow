# Evaluation

The evaluation service (`src/domain/evaluation.ts`) compares operational decisions (from the matching engine) against the separate `ground_truth` table.

## Metrics

| Metric | How calculated |
|--------|---------------|
| Match decision accuracy | `# invoices where outcome.overall_status == gt.expected_match_outcome / total` |
| Exception precision | `TP / (TP + FP)` across all issue types |
| Exception recall | `TP / (TP + FN)` across all issue types |
| Exception F1 | `2 * P * R / (P + R)` |
| Duplicate precision | pair-based: detected ∧ true-positive / detected |
| Duplicate recall | detected ∧ true-positive / all true duplicates |
| Duplicate F1 | harmonic mean |
| Arithmetic pass rate | `# R-ARITHMETIC-INVOICE passes / # invoices with that rule` |
| Blocked marked payment-ready | count of `match_status=BLOCKED ∧ payment_status=READY` — **must be 0** |
| Rejected marked paid | count of `approval_status=REJECTED ∧ payment_status=PAID` — must be 0 |
| % without manual intervention | CLEAN_MATCH ∧ MATCHED ∧ no exceptions / total |
| Confusion matrix | expected vs actual match status |
| Exception counts by category | per issue_type |

## Denominator handling
- `safeDiv(a, b)` returns 0 when `b == 0` — undefined metrics (no positive examples) report as 0, not NaN.
- Duplicate detection is evaluated on invoice IDs belonging to duplicate groups, not arbitrary pairs.

## Critical acceptance target
**Zero blocked invoices marked payment-ready.** The generator, validation, and evaluation all check this.

## Reports
- Evaluation run is persisted in `evaluation_runs` with full metrics JSON + formatted summary.
- Audit & Evaluation page shows run history and full metric breakdown.
- Data Lab page shows the latest run's summary after generation.
- Ground truth is exportable as CSV and JSON from Data Lab.

## Ground-truth separation
`ground_truth` is a separate table. The matching engine never reads `scenario_label`, `expected_*` fields — those are evaluation-only. The `scenario_label` column on `invoices` is demo metadata for display; it is not an input feature to any rule.
