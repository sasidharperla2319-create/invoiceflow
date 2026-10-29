import { useEffect, useState, useCallback } from 'react';
import { Wallet, Play, CheckCircle2, XCircle, RefreshCw, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchPayments, fetchPaidInvoices, schedulePayment, markPaymentPaid, markPaymentFailed, retryPayment } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { formatMoney } from '@/domain/money';
import type { Invoice, Payment } from '@/domain/types';
import { LoadingState, ErrorState, PageHeader, EmptyState, StatCard } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/Modal';

export function PaymentReadinessPage() {
  const { user } = useSession();
  const [ready, setReady] = useState<Invoice[]>([]);
  const [blocked, setBlocked] = useState<Invoice[]>([]);
  const [scheduled, setScheduled] = useState<Invoice[]>([]);
  const [paid, setPaid] = useState<Invoice[]>([]);
  const [failed, setFailed] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ action: () => Promise<void>; title: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, b, s, p, f, pays] = await Promise.all([
        supabase.from('invoices').select('*').eq('payment_status', 'READY').order('due_date'),
        supabase.from('invoices').select('*').eq('match_status', 'BLOCKED').order('received_at', { ascending: false }).limit(50),
        supabase.from('invoices').select('*').eq('payment_status', 'SCHEDULED').order('due_date'),
        fetchPaidInvoices(50),
        supabase.from('invoices').select('*').eq('payment_status', 'FAILED').order('received_at', { ascending: false }),
        fetchPayments('ALL'),
      ]);
      setReady((r.data as Invoice[]) ?? []);
      setBlocked((b.data as Invoice[]) ?? []);
      setScheduled((s.data as Invoice[]) ?? []);
      setPaid(p ?? []);
      setFailed((f.data as Invoice[]) ?? []);
      setPayments(pays);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const paidAmount = paid.reduce((a, i) => a + i.grand_total, 0);
  const scheduledAmount = scheduled.reduce((a, i) => a + i.grand_total, 0);
  const readyAmount = ready.reduce((a, i) => a + i.grand_total, 0);

  if (loading) return <LoadingState label="Loading payment data…" />;

  return (
    <div>
      <PageHeader title="Payment Readiness" subtitle="Simulated payment scheduling and execution" />

      {actionError && <div className="mb-3"><ErrorState message={actionError} /></div>}
      {error && <ErrorState message={error} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Payment Ready" value={ready.length} icon={<Wallet size={20} />} tone="brand" />
        <StatCard label="Scheduled" value={scheduled.length} icon={<Clock size={20} />} />
        <StatCard label="Paid" value={paid.length} icon={<CheckCircle2 size={20} />} tone="success" />
        <StatCard label="Failed" value={failed.length} icon={<XCircle size={20} />} tone="danger" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <div className="card p-4">
          <p className="text-xs text-ink-400">Ready Amount</p>
          <p className="text-xl font-semibold text-brand-700">{formatMoney(readyAmount)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-ink-400">Scheduled Amount</p>
          <p className="text-xl font-semibold text-accent-600">{formatMoney(scheduledAmount)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-ink-400">Paid Amount</p>
          <p className="text-xl font-semibold text-success-700">{formatMoney(paidAmount)}</p>
        </div>
      </div>

      {/* Payment Ready */}
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-semibold text-ink-700 mb-3">Payment-Ready Invoices</h3>
        {ready.length === 0 ? <EmptyState title="None ready" /> : (
          <div className="space-y-2">
            {ready.slice(0, 20).map((inv) => (
              <div key={inv.invoice_id} className="flex items-center justify-between border-b border-ink-50 pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-ink-700">{inv.invoice_number}</p>
                  <p className="text-xs text-ink-400">{inv.invoice_id} · due {inv.due_date}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-ink-700">{formatMoney(inv.grand_total, inv.currency)}</span>
                  <button
                    className="btn-primary text-xs"
                    disabled={busy}
                    onClick={() => setConfirm({
                      action: () => schedulePayment(inv.invoice_id, user?.user_id ?? ''),
                      title: 'Schedule Payment',
                      message: `Schedule payment for ${inv.invoice_number} (${formatMoney(inv.grand_total, inv.currency)})?`,
                    })}
                  >
                    <Play size={13} /> Schedule
                  </button>
                </div>
              </div>
            ))}
            {ready.length > 20 && <p className="text-xs text-ink-400 pt-1">Showing 20 of {ready.length}</p>}
          </div>
        )}
      </div>

      {/* Scheduled */}
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-semibold text-ink-700 mb-3">Scheduled Payments</h3>
        {scheduled.length === 0 ? <EmptyState title="None scheduled" /> : (
          <div className="space-y-2">
            {scheduled.map((inv) => {
              const pay = payments.find((p) => p.invoice_id === inv.invoice_id && p.status === 'SCHEDULED');
              return (
                <div key={inv.invoice_id} className="flex items-center justify-between border-b border-ink-50 pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-ink-700">{inv.invoice_number}</p>
                    <p className="text-xs text-ink-400">{pay?.payment_reference ?? inv.invoice_id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-success text-xs"
                      disabled={busy}
                      onClick={() => pay && setConfirm({
                        action: () => markPaymentPaid(pay.payment_id, inv.invoice_id, user?.user_id ?? ''),
                        title: 'Mark Paid',
                        message: `Mark ${inv.invoice_number} as paid?`,
                      })}
                    >
                      <CheckCircle2 size={13} /> Mark Paid
                    </button>
                    <button
                      className="btn-danger text-xs"
                      disabled={busy}
                      onClick={() => pay && setConfirm({
                        action: () => markPaymentFailed(pay.payment_id, inv.invoice_id, 'Simulated bank rejection', user?.user_id ?? ''),
                        title: 'Mark Failed',
                        message: `Mark payment for ${inv.invoice_number} as failed?`,
                      })}
                    >
                      <XCircle size={13} /> Fail
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Failed */}
      {failed.length > 0 && (
        <div className="card p-5 mb-4 border-danger-200">
          <h3 className="text-sm font-semibold text-ink-700 mb-3">Failed Payments</h3>
          <div className="space-y-2">
            {failed.map((inv) => (
              <div key={inv.invoice_id} className="flex items-center justify-between border-b border-ink-50 pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-ink-700">{inv.invoice_number}</p>
                  <p className="text-xs text-danger-600">{payments.find((p) => p.invoice_id === inv.invoice_id && p.status === 'FAILED')?.failure_reason ?? 'Failed'}</p>
                </div>
                <button
                  className="btn-secondary text-xs"
                  disabled={busy}
                  onClick={() => setConfirm({
                    action: () => retryPayment(inv.invoice_id, user?.user_id ?? ''),
                    title: 'Retry Payment',
                    message: `Retry payment for ${inv.invoice_number}?`,
                  })}
                >
                  <RefreshCw size={13} /> Retry
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently Paid */}
      {paid.length > 0 && (
        <div className="card p-5 mb-4">
          <h3 className="text-sm font-semibold text-ink-700 mb-3">Recently Paid Invoices</h3>
          <div className="space-y-2">
            {paid.slice(0, 15).map((inv) => {
              const pay = payments.find((p) => p.invoice_id === inv.invoice_id && p.status === 'PAID');
              return (
                <div key={inv.invoice_id} className="flex items-center justify-between border-b border-ink-50 pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-ink-700">{inv.invoice_number}</p>
                    <p className="text-xs text-ink-400">
                      {pay?.payment_reference ?? inv.invoice_id}
                      {pay?.paid_at ? ` · paid ${pay.paid_at.slice(0, 10)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-success-700">{formatMoney(inv.grand_total, inv.currency)}</span>
                    <StatusBadge status={inv.payment_status} type="payment" />
                  </div>
                </div>
              );
            })}
            {paid.length > 15 && <p className="text-xs text-ink-400 pt-1">Showing 15 of {paid.length} paid invoices</p>}
          </div>
        </div>
      )}

      {/* Blocked */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-ink-700 mb-3">Blocked Invoices</h3>
        {blocked.length === 0 ? <EmptyState title="None blocked" /> : (
          <div className="space-y-2">
            {blocked.slice(0, 20).map((inv) => (
              <div key={inv.invoice_id} className="flex items-center justify-between border-b border-ink-50 pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-ink-700">{inv.invoice_number}</p>
                  <p className="text-xs text-ink-400">{inv.invoice_id} · {inv.vendor_id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={inv.match_status} type="match" />
                  <StatusBadge status={inv.lifecycle_state} type="lifecycle" />
                </div>
              </div>
            ))}
            {blocked.length > 20 && <p className="text-xs text-ink-400 pt-1">Showing 20 of {blocked.length}</p>}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && runAction(confirm.action)}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.title ?? 'Confirm'}
      />
    </div>
  );
}
