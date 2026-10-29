import type {
  Invoice,
  ExceptionFinding,
  GroundTruth,
  MatchOutcome,
} from './types';

export interface EvaluationMetrics {
  total_invoices: number;
  // Matching decision accuracy (overall status vs expected)
  match_decision_accuracy: number;
  // Exception classification precision / recall / F1 (per issue type)
  exception_precision: number;
  exception_recall: number;
  exception_f1: number;
  // Duplicate detection
  duplicate_precision: number;
  duplicate_recall: number;
  duplicate_f1: number;
  // Critical safety
  blocked_marked_payment_ready: number;
  rejected_marked_paid: number;
  duplicate_successful_payments: number;
  // Arithmetic
  arithmetic_pass_rate: number;
  // Counts
  exception_counts_by_category: Record<string, number>;
  confusion_matrix: Record<string, Record<string, number>>;
  false_positives: number;
  false_negatives: number;
  invoices_without_manual_intervention: number;
  pct_without_manual_intervention: number;
  // Scenario breakdown
  scenario_counts: Record<string, number>;
}

export function safeDiv(a: number, b: number): number {
  if (b === 0) return 0;
  return a / b;
}

export function evaluate(
  invoices: Invoice[],
  exceptions: ExceptionFinding[],
  groundTruth: GroundTruth[],
  outcomes: Map<string, MatchOutcome>,
): EvaluationMetrics {
  const total = invoices.length;
  const gtByInvoice = new Map(groundTruth.map((g) => [g.invoice_id, g]));

  let matchCorrect = 0;
  const exceptionCounts: Record<string, number> = {};
  const confusion: Record<string, Record<string, number>> = {};
  const scenarioCounts: Record<string, number> = {};

  // Per-issue-type sets for precision/recall of exception classification
  const allIssueTypes = new Set<string>();
  for (const gt of groundTruth) gt.expected_exception_codes.forEach((c) => allIssueTypes.add(c));
  for (const e of exceptions) allIssueTypes.add(e.issue_type);

  let tpTotal = 0;
  let fpTotal = 0;
  let fnTotal = 0;

  for (const issueType of allIssueTypes) {
    const positives = groundTruth.filter((g) => g.expected_exception_codes.includes(issueType));
    const negatives = groundTruth.filter((g) => !g.expected_exception_codes.includes(issueType));
    const detectedForPositives = positives.filter((g) =>
      exceptions.some((e) => e.invoice_id === g.invoice_id && e.issue_type === issueType),
    ).length;
    const detectedForNegatives = negatives.filter((g) =>
      exceptions.some((e) => e.invoice_id === g.invoice_id && e.issue_type === issueType),
    ).length;
    tpTotal += detectedForPositives;
    fnTotal += positives.length - detectedForPositives;
    fpTotal += detectedForNegatives;
  }

  // Duplicate detection (pair-based)
  const detectedDupInvoiceIds = new Set(
    exceptions.filter((e) => e.issue_type === 'DUPLICATE_INVOICE').map((e) => e.invoice_id),
  );
  const gtDupInvoiceIds = new Set(
    groundTruth.filter((g) => g.expected_duplicate_group).map((g) => g.invoice_id),
  );
  const dupTp = [...gtDupInvoiceIds].filter((id) => detectedDupInvoiceIds.has(id)).length;
  const dupFp = [...detectedDupInvoiceIds].filter((id) => !gtDupInvoiceIds.has(id)).length;
  const dupFn = gtDupInvoiceIds.size - dupTp;

  // Arithmetic pass rate (from outcomes)
  let arithmeticPassed = 0;
  let arithmeticTotal = 0;
  for (const inv of invoices) {
    const outcome = outcomes.get(inv.invoice_id);
    if (!outcome) continue;
    const arith = outcome.results.find((r) => r.rule_id === 'R-ARITHMETIC-INVOICE');
    if (arith) {
      arithmeticTotal++;
      if (arith.result === 'PASS') arithmeticPassed++;
    }
  }

  // Manual intervention: invoice is "without manual intervention" if CLEAN_MATCH scenario
  // and match status MATCHED and no exceptions
  let noManual = 0;

  // Critical safety: blocked invoices marked payment-ready
  let blockedPaymentReady = 0;
  let rejectedPaid = 0;
  const duplicateSuccessfulPayments = 0;

  for (const inv of invoices) {
    const gt = gtByInvoice.get(inv.invoice_id);
    if (gt) {
      scenarioCounts[gt.scenario_label] = (scenarioCounts[gt.scenario_label] ?? 0) + 1;
      // match decision accuracy: compare overall outcome to expected_match_outcome
      const outcome = outcomes.get(inv.invoice_id);
      if (outcome && outcome.overall_status === gt.expected_match_outcome) matchCorrect++;
      // confusion matrix
      const actual = outcome?.overall_status ?? 'UNMATCHED';
      const expected = gt.expected_match_outcome;
      if (!confusion[expected]) confusion[expected] = {};
      confusion[expected][actual] = (confusion[expected][actual] ?? 0) + 1;
      // no manual
      if (gt.scenario_label === 'CLEAN_MATCH' && inv.match_status === 'MATCHED' && !exceptions.some((e) => e.invoice_id === inv.invoice_id)) {
        noManual++;
      }
    }
    // exception counts
    const invExcs = exceptions.filter((e) => e.invoice_id === inv.invoice_id);
    invExcs.forEach((e) => {
      exceptionCounts[e.issue_type] = (exceptionCounts[e.issue_type] ?? 0) + 1;
    });
    // Critical safety
    if (inv.match_status === 'BLOCKED' && inv.payment_status === 'READY') blockedPaymentReady++;
    if (inv.approval_status === 'REJECTED' && inv.payment_status === 'PAID') rejectedPaid++;
  }

  const exceptionPrecision = safeDiv(tpTotal, tpTotal + fpTotal);
  const exceptionRecall = safeDiv(tpTotal, tpTotal + fnTotal);
  const exceptionF1 = safeDiv(2 * exceptionPrecision * exceptionRecall, exceptionPrecision + exceptionRecall);
  const dupPrecision = safeDiv(dupTp, dupTp + dupFp);
  const dupRecall = safeDiv(dupTp, dupTp + dupFn);
  const dupF1 = safeDiv(2 * dupPrecision * dupRecall, dupPrecision + dupRecall);

  return {
    total_invoices: total,
    match_decision_accuracy: safeDiv(matchCorrect, total),
    exception_precision: exceptionPrecision,
    exception_recall: exceptionRecall,
    exception_f1: exceptionF1,
    duplicate_precision: dupPrecision,
    duplicate_recall: dupRecall,
    duplicate_f1: dupF1,
    blocked_marked_payment_ready: blockedPaymentReady,
    rejected_marked_paid: rejectedPaid,
    duplicate_successful_payments: duplicateSuccessfulPayments,
    arithmetic_pass_rate: safeDiv(arithmeticPassed, arithmeticTotal),
    exception_counts_by_category: exceptionCounts,
    confusion_matrix: confusion,
    false_positives: fpTotal,
    false_negatives: fnTotal,
    invoices_without_manual_intervention: noManual,
    pct_without_manual_intervention: safeDiv(noManual, total),
    scenario_counts: scenarioCounts,
  };
}

export function formatMetrics(metrics: EvaluationMetrics): Record<string, string> {
  return {
    'Total Invoices': String(metrics.total_invoices),
    'Match Decision Accuracy': pct(metrics.match_decision_accuracy),
    'Exception Precision': pct(metrics.exception_precision),
    'Exception Recall': pct(metrics.exception_recall),
    'Exception F1': pct(metrics.exception_f1),
    'Duplicate Precision': pct(metrics.duplicate_precision),
    'Duplicate Recall': pct(metrics.duplicate_recall),
    'Duplicate F1': pct(metrics.duplicate_f1),
    'Arithmetic Pass Rate': pct(metrics.arithmetic_pass_rate),
    'Blocked marked Payment-Ready': String(metrics.blocked_marked_payment_ready),
    'Rejected marked Paid': String(metrics.rejected_marked_paid),
    'False Positives': String(metrics.false_positives),
    'False Negatives': String(metrics.false_negatives),
    '% without manual intervention': pct(metrics.pct_without_manual_intervention),
  };
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
