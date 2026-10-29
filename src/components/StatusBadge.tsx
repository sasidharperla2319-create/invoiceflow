import type {
  MatchStatus,
  ApprovalStatus,
  PaymentStatus,
  ExceptionSeverity,
  ExceptionStatus,
  LifecycleState,
  ExtractionStatus,
  ValidationStatus,
} from '@/domain/types';

const MATCH_STATUS_STYLES: Record<MatchStatus, string> = {
  MATCHED: 'bg-success-50 text-success-700 ring-success-600/20',
  MATCHED_WITHIN_TOLERANCE: 'bg-success-50 text-success-700 ring-success-600/20',
  PARTIAL_MATCH: 'bg-warning-50 text-warning-700 ring-warning-600/20',
  UNMATCHED: 'bg-ink-100 text-ink-600 ring-ink-400/20',
  EXCEPTION: 'bg-warning-50 text-warning-700 ring-warning-600/20',
  BLOCKED: 'bg-danger-50 text-danger-700 ring-danger-600/20',
  PENDING_REVIEW: 'bg-warning-50 text-warning-700 ring-warning-600/20',
};

const APPROVAL_STATUS_STYLES: Record<ApprovalStatus, string> = {
  NOT_REQUIRED: 'bg-ink-100 text-ink-600 ring-ink-400/20',
  PENDING: 'bg-warning-50 text-warning-700 ring-warning-600/20',
  APPROVED: 'bg-success-50 text-success-700 ring-success-600/20',
  REJECTED: 'bg-danger-50 text-danger-700 ring-danger-600/20',
  BLOCKED: 'bg-danger-50 text-danger-700 ring-danger-600/20',
};

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  NOT_READY: 'bg-ink-100 text-ink-600 ring-ink-400/20',
  READY: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  SCHEDULED: 'bg-accent-500/10 text-accent-600 ring-accent-500/20',
  PAID: 'bg-success-50 text-success-700 ring-success-600/20',
  FAILED: 'bg-danger-50 text-danger-700 ring-danger-600/20',
  NOT_APPLICABLE: 'bg-ink-100 text-ink-500 ring-ink-400/20',
};

const SEVERITY_STYLES: Record<ExceptionSeverity, string> = {
  LOW: 'bg-ink-100 text-ink-600 ring-ink-400/20',
  MEDIUM: 'bg-warning-50 text-warning-700 ring-warning-600/20',
  HIGH: 'bg-danger-50 text-danger-700 ring-danger-600/20',
  BLOCKING: 'bg-danger-500 text-white ring-danger-600/30',
};

const EXCEPTION_STATUS_STYLES: Record<ExceptionStatus, string> = {
  OPEN: 'bg-warning-50 text-warning-700 ring-warning-600/20',
  ASSIGNED: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  RESOLVED: 'bg-success-50 text-success-700 ring-success-600/20',
  REJECTED: 'bg-danger-50 text-danger-700 ring-danger-600/20',
};

const LIFECYCLE_STYLES: Record<LifecycleState, string> = {
  RECEIVED: 'bg-ink-100 text-ink-600 ring-ink-400/20',
  EXTRACTED: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  VALIDATED: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  MATCHED: 'bg-success-50 text-success-700 ring-success-600/20',
  EXCEPTION: 'bg-warning-50 text-warning-700 ring-warning-600/20',
  APPROVAL_PENDING: 'bg-warning-50 text-warning-700 ring-warning-600/20',
  APPROVED: 'bg-success-50 text-success-700 ring-success-600/20',
  REJECTED: 'bg-danger-50 text-danger-700 ring-danger-600/20',
  BLOCKED: 'bg-danger-50 text-danger-700 ring-danger-600/20',
  ON_HOLD: 'bg-warning-50 text-warning-700 ring-warning-600/20',
  PAYMENT_READY: 'bg-accent-500/10 text-accent-600 ring-accent-500/20',
  PAYMENT_SCHEDULED: 'bg-accent-500/10 text-accent-600 ring-accent-500/20',
  PAID: 'bg-success-50 text-success-700 ring-success-600/20',
  PAYMENT_FAILED: 'bg-danger-50 text-danger-700 ring-danger-600/20',
};

const EXTRACTION_STYLES: Record<ExtractionStatus, string> = {
  PENDING: 'bg-ink-100 text-ink-600 ring-ink-400/20',
  EXTRACTED: 'bg-success-50 text-success-700 ring-success-600/20',
  EXTRACTION_FAILED: 'bg-danger-50 text-danger-700 ring-danger-600/20',
  SIMULATED: 'bg-brand-50 text-brand-700 ring-brand-600/20',
};

const VALIDATION_STYLES: Record<ValidationStatus, string> = {
  PENDING: 'bg-ink-100 text-ink-600 ring-ink-400/20',
  VALIDATED: 'bg-success-50 text-success-700 ring-success-600/20',
  VALIDATION_FAILED: 'bg-danger-50 text-danger-700 ring-danger-600/20',
};

export function StatusBadge({ status, type }: { status: string; type: 'match' | 'approval' | 'payment' | 'severity' | 'exception' | 'lifecycle' | 'extraction' | 'validation' }) {
  let cls = 'bg-ink-100 text-ink-600 ring-ink-400/20';
  if (type === 'match') cls = MATCH_STATUS_STYLES[status as MatchStatus] ?? cls;
  if (type === 'approval') cls = APPROVAL_STATUS_STYLES[status as ApprovalStatus] ?? cls;
  if (type === 'payment') cls = PAYMENT_STATUS_STYLES[status as PaymentStatus] ?? cls;
  if (type === 'severity') cls = SEVERITY_STYLES[status as ExceptionSeverity] ?? cls;
  if (type === 'exception') cls = EXCEPTION_STATUS_STYLES[status as ExceptionStatus] ?? cls;
  if (type === 'lifecycle') cls = LIFECYCLE_STYLES[status as LifecycleState] ?? cls;
  if (type === 'extraction') cls = EXTRACTION_STYLES[status as ExtractionStatus] ?? cls;
  if (type === 'validation') cls = VALIDATION_STYLES[status as ValidationStatus] ?? cls;

  const label = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  return <span className={`badge ring-1 ring-inset ${cls}`}>{label}</span>;
}

export function ScenarioBadge({ label }: { label: string }) {
  const styles: Record<string, string> = {
    CLEAN_MATCH: 'bg-success-50 text-success-700 ring-success-600/20',
    PRICE_VARIANCE: 'bg-warning-50 text-warning-700 ring-warning-600/20',
    QUANTITY_MISMATCH: 'bg-warning-50 text-warning-700 ring-warning-600/20',
    DUPLICATE_INVOICE: 'bg-danger-50 text-danger-700 ring-danger-600/20',
    MISSING_RECEIPT: 'bg-danger-50 text-danger-700 ring-danger-600/20',
    TAX_OR_VENDOR_ERROR: 'bg-danger-50 text-danger-700 ring-danger-600/20',
  };
  const cls = styles[label] ?? 'bg-ink-100 text-ink-600 ring-ink-400/20';
  const text = label.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className={`badge ring-1 ring-inset ${cls}`}>{text}</span>;
}

export function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    BUSINESS_REQUESTER: 'bg-brand-50 text-brand-700 ring-brand-600/20',
    PROCESS_OWNER: 'bg-accent-500/10 text-accent-600 ring-accent-500/20',
    APPROVER: 'bg-success-50 text-success-700 ring-success-600/20',
    OPERATIONS_ANALYST: 'bg-warning-50 text-warning-700 ring-warning-600/20',
    SYSTEM_ADMIN: 'bg-ink-100 text-ink-700 ring-ink-400/20',
  };
  const cls = styles[role] ?? 'bg-ink-100 text-ink-600 ring-ink-400/20';
  const text = role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className={`badge ring-1 ring-inset ${cls}`}>{text}</span>;
}
