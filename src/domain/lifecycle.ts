import type {
  Invoice,
  Approval,
  Payment,
  LifecycleState,
  MatchStatus,
  ExceptionFinding,
  UserRole,
} from './types';
import { isValidTransition } from './config';

export class LifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LifecycleError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export function assertTransition(from: LifecycleState, to: LifecycleState): void {
  if (!isValidTransition(from, to)) {
    throw new LifecycleError(`Invalid transition: ${from} -> ${to}`);
  }
}

export function isPaymentReady(invoice: Invoice, exceptions: ExceptionFinding[]): boolean {
  const blocking = exceptions.some(
    (e) => e.status !== 'RESOLVED' && e.status !== 'REJECTED' && e.severity === 'BLOCKING',
  );
  if (blocking) return false;
  if (invoice.match_status === 'BLOCKED' || invoice.match_status === 'EXCEPTION') {
    const unresolved = exceptions.filter((e) => e.status === 'OPEN' || e.status === 'ASSIGNED');
    if (unresolved.length > 0) return false;
  }
  if (invoice.validation_status !== 'VALIDATED') return false;
  if (invoice.extraction_status !== 'EXTRACTED' && invoice.extraction_status !== 'SIMULATED') return false;
  if (invoice.approval_status !== 'APPROVED') return false;
  if (invoice.payment_status === 'PAID') return false;
  return true;
}

export function isApprovalEligible(invoice: Invoice): boolean {
  if (invoice.match_status === 'BLOCKED') return false;
  if (invoice.lifecycle_state === 'EXCEPTION' || invoice.lifecycle_state === 'BLOCKED') return false;
  if (invoice.match_status === 'MATCHED' || invoice.match_status === 'MATCHED_WITHIN_TOLERANCE') return true;
  if (invoice.match_status === 'PARTIAL_MATCH') return true;
  return false;
}

const APPROVER_ROLES: UserRole[] = ['APPROVER', 'PROCESS_OWNER'];

export function approve(
  approval: Approval,
  decision: 'APPROVED' | 'REJECTED',
  approverRole: UserRole,
  reason: string,
  comments?: string,
): Approval {
  if (!APPROVER_ROLES.includes(approverRole)) {
    throw new AuthorizationError(`Role ${approverRole} cannot approve invoices`);
  }
  if (approval.status !== 'PENDING') {
    throw new LifecycleError(`Approval ${approval.approval_id} is not pending (current: ${approval.status})`);
  }
  return {
    ...approval,
    status: decision,
    decided_at: new Date().toISOString(),
    decision_reason: reason,
    comments: comments ?? null,
  };
}

export function canResolveException(role: UserRole, exception: ExceptionFinding): boolean {
  if (exception.status === 'RESOLVED' || exception.status === 'REJECTED') return false;
  const allowed: UserRole[] = ['OPERATIONS_ANALYST', 'PROCESS_OWNER'];
  return allowed.includes(role);
}

export function canApprove(role: UserRole): boolean {
  return APPROVER_ROLES.includes(role);
}

export function nextLifecycleOnApproval(invoice: Invoice, decision: 'APPROVED' | 'REJECTED'): LifecycleState {
  if (decision === 'APPROVED') {
    assertTransition(invoice.lifecycle_state, 'APPROVED');
    return 'APPROVED';
  } else {
    assertTransition(invoice.lifecycle_state, 'REJECTED');
    return 'REJECTED';
  }
}

export function canSchedulePayment(invoice: Invoice): boolean {
  return (
    invoice.lifecycle_state === 'PAYMENT_READY' &&
    invoice.payment_status === 'READY' &&
    isPaymentReady(invoice, []) // double-check no blocking
  );
}

export function markScheduled(invoice: Invoice): Invoice {
  assertTransition(invoice.lifecycle_state, 'PAYMENT_SCHEDULED');
  return {
    ...invoice,
    lifecycle_state: 'PAYMENT_SCHEDULED',
    payment_status: 'SCHEDULED',
  };
}

export function markPaid(invoice: Invoice, existingPayments: Payment[]): { invoice: Invoice; payment: Payment } {
  assertTransition(invoice.lifecycle_state, 'PAID');
  const alreadyPaid = existingPayments.some(
    (p) => p.invoice_id === invoice.invoice_id && p.status === 'PAID',
  );
  if (alreadyPaid) {
    throw new LifecycleError(`Invoice ${invoice.invoice_id} already has a successful payment`);
  }
  return {
    invoice: { ...invoice, lifecycle_state: 'PAID', payment_status: 'PAID' },
    payment: {
      payment_id: '',
      invoice_id: invoice.invoice_id,
      payment_reference: '',
      amount: invoice.grand_total,
      currency: invoice.currency,
      status: 'PAID',
      scheduled_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
      failure_reason: null,
      created_at: new Date().toISOString(),
    },
  };
}

export function markPaymentFailed(invoice: Invoice, reason: string): Invoice {
  void reason;
  assertTransition(invoice.lifecycle_state, 'PAYMENT_FAILED');
  return {
    ...invoice,
    lifecycle_state: 'PAYMENT_FAILED',
    payment_status: 'FAILED',
  };
}

export interface ExceptionResolutionOutcome {
  matchStatus: MatchStatus;
  lifecycleState: LifecycleState;
  approvalStatus: Invoice['approval_status'];
  paymentStatus: Invoice['payment_status'];
  requiresApprovalTask: boolean;
  unresolvedCount: number;
}

export function evaluateExceptionResolution(
  invoice: Invoice,
  exceptions: ExceptionFinding[],
): ExceptionResolutionOutcome {
  const unresolved = exceptions.filter(
    (e) => e.status !== 'RESOLVED' && e.status !== 'REJECTED',
  );

  // 1. Partial resolution: unresolved exceptions remain
  if (unresolved.length > 0) {
    const hasBlocking = unresolved.some((e) => e.severity === 'BLOCKING');
    if (hasBlocking) {
      return {
        matchStatus: 'BLOCKED',
        lifecycleState: 'BLOCKED',
        approvalStatus: invoice.approval_status === 'APPROVED' ? 'APPROVED' : invoice.approval_status,
        paymentStatus: 'NOT_READY',
        requiresApprovalTask: false,
        unresolvedCount: unresolved.length,
      };
    } else {
      return {
        matchStatus: 'EXCEPTION',
        lifecycleState: 'EXCEPTION',
        approvalStatus: invoice.approval_status,
        paymentStatus: 'NOT_READY',
        requiresApprovalTask: false,
        unresolvedCount: unresolved.length,
      };
    }
  }

  // 2. All exceptions resolved (or rejected)
  const newMatchStatus: MatchStatus = 'MATCHED';

  if (invoice.approval_status === 'APPROVED') {
    const candidateInv: Invoice = {
      ...invoice,
      match_status: newMatchStatus,
      lifecycle_state: 'APPROVED',
      approval_status: 'APPROVED',
    };
    if (isPaymentReady(candidateInv, exceptions)) {
      return {
        matchStatus: newMatchStatus,
        lifecycleState: 'PAYMENT_READY',
        approvalStatus: 'APPROVED',
        paymentStatus: 'READY',
        requiresApprovalTask: false,
        unresolvedCount: 0,
      };
    } else {
      return {
        matchStatus: newMatchStatus,
        lifecycleState: 'APPROVED',
        approvalStatus: 'APPROVED',
        paymentStatus: invoice.payment_status,
        requiresApprovalTask: false,
        unresolvedCount: 0,
      };
    }
  }

  // Not yet approved: transition to APPROVAL_PENDING (never auto-approve or auto-mark payment-ready)
  return {
    matchStatus: newMatchStatus,
    lifecycleState: 'APPROVAL_PENDING',
    approvalStatus: 'PENDING',
    paymentStatus: 'NOT_READY',
    requiresApprovalTask: true,
    unresolvedCount: 0,
  };
}

