import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, UserCog, CheckCircle2 } from 'lucide-react';
import { fetchExceptions, fetchUsers, resolveException, assignException } from '@/lib/queries';
import { useSession } from '@/lib/session';
import type { ExceptionFinding, User } from '@/domain/types';
import { LoadingState, ErrorState, PageHeader, EmptyState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';

const ISSUE_TYPES = ['ALL', 'PRICE_VARIANCE', 'QUANTITY_EXCEEDS_PO', 'QUANTITY_EXCEEDS_RECEIVED', 'MISSING_RECEIPT', 'DUPLICATE_INVOICE', 'TAX_MISMATCH', 'VENDOR_MISMATCH', 'VENDOR_CLOSED', 'VENDOR_ON_HOLD', 'ARITHMETIC_ERROR', 'DATE_BEFORE_PO'];
const STATUSES = ['ALL', 'OPEN', 'ASSIGNED', 'RESOLVED', 'REJECTED'];

export function ExceptionWorkbenchPage({ onSelectInvoice }: { onSelectInvoice: (id: string) => void }) {
  const { user } = useSession();
  const [exceptions, setExceptions] = useState<ExceptionFinding[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('OPEN');
  const [filterType, setFilterType] = useState('ALL');
  const [filterAssigned, setFilterAssigned] = useState('ALL');
  const [resolveTarget, setResolveTarget] = useState<ExceptionFinding | null>(null);
  const [assignTarget, setAssignTarget] = useState<ExceptionFinding | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [assignUserId, setAssignUserId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [excs, usrs] = await Promise.all([
        fetchExceptions({ status: filterStatus, issueType: filterType, assignedTo: filterAssigned }),
        fetchUsers(),
      ]);
      setExceptions(excs);
      setUsers(usrs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType, filterAssigned]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolve = async () => {
    if (!resolveTarget || !user) return;
    setActionError(null);
    try {
      await resolveException(resolveTarget.exception_id, user.role, user.user_id, resolutionNotes);
      setResolveTarget(null);
      setResolutionNotes('');
      load();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const handleAssign = async () => {
    if (!assignTarget || !user || !assignUserId) return;
    setActionError(null);
    try {
      await assignException(assignTarget.exception_id, assignUserId, user.user_id);
      setAssignTarget(null);
      setAssignUserId('');
      load();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const canResolve = user && ['OPERATIONS_ANALYST', 'PROCESS_OWNER'].includes(user.role);

  return (
    <div>
      <PageHeader title="Exception Workbench" subtitle="Investigate and resolve matching exceptions" />

      {actionError && <div className="mb-3"><ErrorState message={actionError} /></div>}
      {error && <ErrorState message={error} />}

      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Status</label>
            <select className="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All' : s.replace(/_/g, ' ').toLowerCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Issue Type</label>
            <select className="select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              {ISSUE_TYPES.map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All' : s.replace(/_/g, ' ').toLowerCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Assignment</label>
            <select className="select" value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value)}>
              <option value="ALL">All</option>
              <option value="UNASSIGNED">Unassigned</option>
              {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading exceptions…" />
      ) : exceptions.length === 0 ? (
        <div className="card"><EmptyState title="No exceptions" message="No exceptions match the current filters." icon={<AlertTriangle size={40} />} /></div>
      ) : (
        <div className="space-y-3">
          {exceptions.map((e) => (
            <div key={e.exception_id} className="card p-4">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink-800 text-sm">{e.issue_type.replace(/_/g, ' ').toLowerCase()}</span>
                    <StatusBadge status={e.severity} type="severity" />
                    <StatusBadge status={e.status} type="exception" />
                    <span className="badge bg-ink-100 text-ink-500">{e.priority.toLowerCase()}</span>
                  </div>
                  <p className="text-sm text-ink-600 mt-1.5">{e.explanation}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-ink-400">
                    <span>{e.rule_id}</span>
                    <span>Routed: {e.routed_to_role?.replace(/_/g, ' ').toLowerCase() ?? '—'}</span>
                    <span>Assigned: {e.assigned_to_user_id ?? 'unassigned'}</span>
                  </div>
                  {(e.observed_value || e.expected_value) && (
                    <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-ink-100 text-xs">
                      <div><p className="text-ink-400">Observed</p><p className="font-mono text-ink-700">{e.observed_value ?? '—'}</p></div>
                      <div><p className="text-ink-400">Expected</p><p className="font-mono text-ink-700">{e.expected_value ?? '—'}</p></div>
                      <div><p className="text-ink-400">Difference</p><p className="font-mono text-ink-700">{e.difference ?? '—'}</p></div>
                    </div>
                  )}
                  {e.resolution_notes && <p className="mt-2 text-xs text-success-700">Resolved: {e.resolution_notes}</p>}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button className="btn-secondary text-xs" onClick={() => onSelectInvoice(e.invoice_id)}>
                    View Invoice
                  </button>
                  {e.status !== 'RESOLVED' && e.status !== 'REJECTED' && (
                    <>
                      <button className="btn-secondary text-xs" onClick={() => setAssignTarget(e)}>
                        <UserCog size={13} /> Assign
                      </button>
                      {canResolve && (
                        <button className="btn-success text-xs" onClick={() => setResolveTarget(e)}>
                          <CheckCircle2 size={13} /> Resolve
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!resolveTarget}
        onClose={() => setResolveTarget(null)}
        title="Resolve Exception"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setResolveTarget(null)}>Cancel</button>
            <button className="btn-success" onClick={handleResolve} disabled={!resolutionNotes.trim()}>
              Resolve
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600 mb-3">
          Resolving <span className="font-medium">{resolveTarget?.issue_type.replace(/_/g, ' ').toLowerCase()}</span> for invoice {resolveTarget?.invoice_id}
        </p>
        <label className="label">Resolution Notes</label>
        <textarea
          className="input min-h-[80px]"
          placeholder="Describe the resolution…"
          value={resolutionNotes}
          onChange={(e) => setResolutionNotes(e.target.value)}
        />
      </Modal>

      <Modal
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        title="Assign Exception"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAssignTarget(null)}>Cancel</button>
            <button className="btn-primary" onClick={handleAssign} disabled={!assignUserId}>Assign</button>
          </>
        }
      >
        <label className="label">Assign To</label>
        <select className="select" value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)}>
          <option value="">Select user…</option>
          {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name} ({u.role.replace(/_/g, ' ').toLowerCase()})</option>)}
        </select>
      </Modal>
    </div>
  );
}
