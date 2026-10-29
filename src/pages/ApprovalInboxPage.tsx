import { useEffect, useState, useCallback } from 'react';
import { CheckSquare, ThumbsUp, ThumbsDown, FileText } from 'lucide-react';
import { fetchApprovals, fetchInvoiceDetail, decideApproval, type InvoiceDetail } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { formatMoney } from '@/domain/money';
import type { Approval } from '@/domain/types';
import { LoadingState, ErrorState, PageHeader, EmptyState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';

export function ApprovalInboxPage({ onSelectInvoice }: { onSelectInvoice: (id: string) => void }) {
  const { user } = useSession();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('PENDING');
  const [decisionTarget, setDecisionTarget] = useState<{ approval: Approval; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [reason, setReason] = useState('');
  const [comments, setComments] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, InvoiceDetail>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const a = await fetchApprovals(filterStatus);
      setApprovals(a);
      // Load details for pending approvals
      const details: Record<string, InvoiceDetail> = {};
      for (const ap of a.slice(0, 20)) {
        const d = await fetchInvoiceDetail(ap.invoice_id);
        if (d) details[ap.invoice_id] = d;
      }
      setDetailCache(details);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const canApprove = user && ['APPROVER', 'PROCESS_OWNER'].includes(user.role);

  const handleDecide = async () => {
    if (!decisionTarget || !user) return;
    setActionError(null);
    try {
      await decideApproval(
        decisionTarget.approval.approval_id,
        decisionTarget.approval.invoice_id,
        decisionTarget.decision,
        user.role,
        user.user_id,
        reason,
        comments,
      );
      setDecisionTarget(null);
      setReason('');
      setComments('');
      load();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Approval Inbox"
        subtitle="Review and decide on invoices awaiting approval"
        actions={
          <select className="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 'auto' }}>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        }
      />

      {actionError && <div className="mb-3"><ErrorState message={actionError} /></div>}
      {error && <ErrorState message={error} />}

      {loading ? (
        <LoadingState label="Loading approvals…" />
      ) : approvals.length === 0 ? (
        <div className="card"><EmptyState title="No approvals" message={`No ${filterStatus.toLowerCase()} approval tasks.`} icon={<CheckSquare size={40} />} /></div>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => {
            const detail = detailCache[a.invoice_id];
            const inv = detail?.invoice;
            return (
              <div key={a.approval_id} className="card p-4">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink-800 text-sm">{a.approval_id}</span>
                      <StatusBadge status={a.status} type="approval" />
                      <span className="text-xs text-ink-400">Level {a.approval_level}</span>
                    </div>
                    {inv && (
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div><p className="text-xs text-ink-400">Invoice</p><p className="font-medium text-ink-700">{inv.invoice_number}</p></div>
                        <div><p className="text-xs text-ink-400">Vendor</p><p className="font-medium text-ink-700">{inv.vendor_id}</p></div>
                        <div><p className="text-xs text-ink-400">Amount</p><p className="font-medium text-ink-700">{formatMoney(inv.grand_total, inv.currency)}</p></div>
                        <div><p className="text-xs text-ink-400">Match</p><StatusBadge status={inv.match_status} type="match" /></div>
                      </div>
                    )}
                    {detail && detail.exceptions.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-ink-400 mb-1">Open Exceptions ({detail.exceptions.filter(e => e.status === 'OPEN' || e.status === 'ASSIGNED').length})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {detail.exceptions.slice(0, 5).map((e) => (
                            <span key={e.exception_id} className="badge bg-warning-50 text-warning-700">{e.issue_type.replace(/_/g, ' ').toLowerCase()}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {a.decision_reason && <p className="mt-2 text-xs text-ink-500">Reason: {a.decision_reason}</p>}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button className="btn-secondary text-xs" onClick={() => onSelectInvoice(a.invoice_id)}>
                      <FileText size={13} /> View Details
                    </button>
                    {a.status === 'PENDING' && canApprove && (() => {
                      const hasBlocking = detail?.exceptions.some((e) => (e.status === 'OPEN' || e.status === 'ASSIGNED') && e.severity === 'BLOCKING');
                      return (
                        <div className="flex flex-col gap-1 items-end">
                          <div className="flex gap-2">
                            <button
                              className="btn-success text-xs"
                              disabled={hasBlocking}
                              title={hasBlocking ? 'Cannot approve: invoice has unresolved blocking exceptions' : undefined}
                              onClick={() => setDecisionTarget({ approval: a, decision: 'APPROVED' })}
                            >
                              <ThumbsUp size={13} /> Approve
                            </button>
                            <button className="btn-danger text-xs" onClick={() => setDecisionTarget({ approval: a, decision: 'REJECTED' })}>
                              <ThumbsDown size={13} /> Reject
                            </button>
                          </div>
                          {hasBlocking && (
                            <span className="text-[10px] text-danger-600 font-medium">Blocking exception open</span>
                          )}
                        </div>
                      );
                    })()}
                    {a.status === 'PENDING' && !canApprove && (
                      <p className="text-xs text-ink-400">Your role cannot approve</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!decisionTarget}
        onClose={() => setDecisionTarget(null)}
        title={decisionTarget?.decision === 'APPROVED' ? 'Approve Invoice' : 'Reject Invoice'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDecisionTarget(null)}>Cancel</button>
            <button
              className={decisionTarget?.decision === 'APPROVED' ? 'btn-success' : 'btn-danger'}
              onClick={handleDecide}
              disabled={!reason.trim()}
            >
              {decisionTarget?.decision === 'APPROVED' ? 'Approve' : 'Reject'}
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600 mb-3">
          {decisionTarget?.decision === 'APPROVED' ? 'Approving' : 'Rejecting'} invoice {decisionTarget?.approval.invoice_id}
        </p>
        <label className="label">Decision Reason *</label>
        <input className="input mb-3" placeholder="Required reason…" value={reason} onChange={(e) => setReason(e.target.value)} />
        <label className="label">Comments</label>
        <textarea className="input min-h-[60px]" placeholder="Optional comments…" value={comments} onChange={(e) => setComments(e.target.value)} />
      </Modal>
    </div>
  );
}
