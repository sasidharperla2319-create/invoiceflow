import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Building2, ShoppingBag, Truck, ShieldCheck, History, GitBranch, Copy } from 'lucide-react';
import { fetchInvoiceDetail, type InvoiceDetail } from '@/lib/queries';
import { formatMoney } from '@/domain/money';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';
import { StatusBadge, ScenarioBadge } from '@/components/StatusBadge';

export function InvoiceDetailPage({ invoiceId, onBack }: { invoiceId: string; onBack: () => void }) {
  const [data, setData] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'matching' | 'exceptions' | 'approvals' | 'payments' | 'audit'>('overview');

  useEffect(() => {
    setLoading(true);
    fetchInvoiceDetail(invoiceId)
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  if (loading) return <LoadingState label="Loading invoice detail…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <EmptyState title="Invoice not found" />;

  const { invoice: inv, vendor, po, poLines, receipts, receiptLines, invoiceLines, exceptions, approvals, payments, ruleExecutions, auditEvents, stateTransitions, groundTruth, duplicates } = data;

  const acceptedByPoLine = new Map<string, number>();
  for (const rl of receiptLines) {
    acceptedByPoLine.set(rl.po_line_id, (acceptedByPoLine.get(rl.po_line_id) ?? 0) + rl.accepted_quantity);
  }

  const tabs: { key: typeof tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'matching', label: 'Matching Results', count: ruleExecutions.length },
    { key: 'exceptions', label: 'Exceptions', count: exceptions.length },
    { key: 'approvals', label: 'Approvals', count: approvals.length },
    { key: 'payments', label: 'Payments', count: payments.length },
    { key: 'audit', label: 'Audit Timeline', count: auditEvents.length + stateTransitions.length },
  ];

  return (
    <div>
      <button onClick={onBack} className="btn-ghost mb-4 -ml-2">
        <ArrowLeft size={16} /> Back to queue
      </button>

      <div className="card p-5 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold text-ink-800">{inv.invoice_number}</h1>
              {inv.scenario_label && <ScenarioBadge label={inv.scenario_label} />}
            </div>
            <p className="text-xs text-ink-400 mt-0.5">{inv.invoice_id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={inv.match_status} type="match" />
            <StatusBadge status={inv.approval_status} type="approval" />
            <StatusBadge status={inv.payment_status} type="payment" />
            <StatusBadge status={inv.lifecycle_state} type="lifecycle" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-ink-100">
          <div>
            <p className="text-xs text-ink-400">Invoice Date</p>
            <p className="text-sm font-medium text-ink-700">{inv.invoice_date}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Due Date</p>
            <p className="text-sm font-medium text-ink-700">{inv.due_date}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Currency</p>
            <p className="text-sm font-medium text-ink-700">{inv.currency}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Extraction Confidence</p>
            <p className="text-sm font-medium text-ink-700">{(inv.extraction_confidence * 100).toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Subtotal</p>
            <p className="text-sm font-medium text-ink-700">{formatMoney(inv.subtotal, inv.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Tax Total</p>
            <p className="text-sm font-medium text-ink-700">{formatMoney(inv.tax_total, inv.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Grand Total</p>
            <p className="text-sm font-semibold text-ink-800">{formatMoney(inv.grand_total, inv.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Received</p>
            <p className="text-sm font-medium text-ink-700">{inv.received_at.slice(0, 10)}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-ink-200 overflow-x-auto scrollbar-thin">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:text-ink-700'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`ml-1.5 text-xs ${tab === t.key ? 'text-brand-500' : 'text-ink-400'}`}>({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><Building2 size={16} /> Vendor</h3>
            {vendor ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink-400">Code</dt><dd className="font-medium text-ink-700">{vendor.vendor_code}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-400">Legal Name</dt><dd className="font-medium text-ink-700">{vendor.legal_name}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-400">Tax ID</dt><dd className="font-medium text-ink-700">{vendor.tax_identifier}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-400">Status</dt><dd><StatusBadge status={vendor.status} type="match" /></dd></div>
                <div className="flex justify-between"><dt className="text-ink-400">Payment Terms</dt><dd className="font-medium text-ink-700">{vendor.payment_terms_days} days</dd></div>
              </dl>
            ) : <EmptyState title="No vendor" />}
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><ShoppingBag size={16} /> Purchase Order</h3>
            {po ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink-400">PO Number</dt><dd className="font-medium text-ink-700">{po.po_number}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-400">PO Date</dt><dd className="font-medium text-ink-700">{po.po_date}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-400">Status</dt><dd className="font-medium text-ink-700">{po.status}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-400">Currency</dt><dd className="font-medium text-ink-700">{po.currency}</dd></div>
              </dl>
            ) : <p className="text-sm text-ink-400">No PO (two-way match)</p>}
          </div>

          <div className="card p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><FileText size={16} /> Invoice Lines</h3>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-400 border-b border-ink-100">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">SKU</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3 text-right">Qty</th>
                    <th className="py-2 pr-3 text-right">Unit Price</th>
                    <th className="py-2 pr-3">Tax</th>
                    <th className="py-2 pr-3 text-right">Subtotal</th>
                    <th className="py-2 pr-3 text-right">Tax</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {invoiceLines.map((l) => (
                    <tr key={l.invoice_line_id}>
                      <td className="py-2 pr-3 text-ink-400">{l.line_number}</td>
                      <td className="py-2 pr-3 font-medium text-ink-700">{l.sku}</td>
                      <td className="py-2 pr-3 text-ink-600">{l.description}</td>
                      <td className="py-2 pr-3 text-right text-ink-600">{l.quantity}</td>
                      <td className="py-2 pr-3 text-right text-ink-600">{formatMoney(l.unit_price, inv.currency)}</td>
                      <td className="py-2 pr-3 text-ink-600">{l.tax_code} ({(l.tax_rate * 100).toFixed(0)}%)</td>
                      <td className="py-2 pr-3 text-right text-ink-600">{formatMoney(l.line_subtotal, inv.currency)}</td>
                      <td className="py-2 pr-3 text-right text-ink-600">{formatMoney(l.line_tax, inv.currency)}</td>
                      <td className="py-2 pr-3 text-right font-medium text-ink-700">{formatMoney(l.line_total, inv.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {poLines.length > 0 && (
            <div className="card p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><Truck size={16} /> PO Lines & Receipts</h3>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-400 border-b border-ink-100">
                      <th className="py-2 pr-3">Line</th>
                      <th className="py-2 pr-3">SKU</th>
                      <th className="py-2 pr-3 text-right">Ordered</th>
                      <th className="py-2 pr-3 text-right">Accepted Receipt</th>
                      <th className="py-2 pr-3 text-right">Unit Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50">
                    {poLines.map((p) => (
                      <tr key={p.po_line_id}>
                        <td className="py-2 pr-3 text-ink-400">{p.line_number}</td>
                        <td className="py-2 pr-3 font-medium text-ink-700">{p.sku}</td>
                        <td className="py-2 pr-3 text-right text-ink-600">{p.ordered_quantity}</td>
                        <td className="py-2 pr-3 text-right text-ink-600">{acceptedByPoLine.get(p.po_line_id) ?? 0}</td>
                        <td className="py-2 pr-3 text-right text-ink-600">{formatMoney(p.unit_price, inv.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {receipts.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {receipts.map((r) => (
                    <span key={r.goods_receipt_id} className="badge bg-ink-100 text-ink-600">{r.receipt_number} · {r.receipt_date}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {groundTruth && (
            <div className="card p-5 lg:col-span-2 border-brand-200 bg-brand-50/30">
              <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><ShieldCheck size={16} /> Ground Truth (Evaluation Only)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><p className="text-xs text-ink-400">Scenario</p><p className="font-medium">{groundTruth.scenario_label.replace(/_/g, ' ').toLowerCase()}</p></div>
                <div><p className="text-xs text-ink-400">Expected Match</p><StatusBadge status={groundTruth.expected_match_outcome} type="match" /></div>
                <div><p className="text-xs text-ink-400">Approval Eligible</p><p className="font-medium">{groundTruth.expected_approval_eligible ? 'Yes' : 'No'}</p></div>
                <div><p className="text-xs text-ink-400">Payment Ready</p><p className="font-medium">{groundTruth.expected_payment_ready ? 'Yes' : 'No'}</p></div>
              </div>
              {groundTruth.expected_exception_codes.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-ink-400 mb-1">Expected Exceptions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {groundTruth.expected_exception_codes.map((c) => (
                      <span key={c} className="badge bg-warning-50 text-warning-700">{c.replace(/_/g, ' ').toLowerCase()}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {duplicates.length > 0 && (
            <div className="card p-5 lg:col-span-2 border-danger-200 bg-danger-50/30">
              <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><Copy size={16} /> Duplicate Findings</h3>
              {duplicates.map((d) => (
                <div key={d.duplicate_id} className="text-sm text-ink-600">
                  Group <span className="font-medium">{d.duplicate_group_id}</span>: {d.invoice_id_a} ↔ {d.invoice_id_b} — {d.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'matching' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-500 border-b border-ink-200 bg-ink-50/50">
                  <th className="px-4 py-2.5">Rule</th>
                  <th className="px-4 py-2.5">Result</th>
                  <th className="px-4 py-2.5">Observed</th>
                  <th className="px-4 py-2.5">Expected</th>
                  <th className="px-4 py-2.5">Explanation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {ruleExecutions.map((r) => (
                  <tr key={r.execution_id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-700">{r.rule_id}</p>
                      <p className="text-xs text-ink-400">v{r.rule_version}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${
                        r.result === 'PASS' ? 'bg-success-50 text-success-700' :
                        r.result === 'FAIL' ? 'bg-danger-50 text-danger-700' :
                        r.result === 'WARN' ? 'bg-warning-50 text-warning-700' :
                        'bg-ink-100 text-ink-600'
                      }`}>{r.result}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-600 text-xs font-mono">{r.observed_value ?? '—'}</td>
                    <td className="px-4 py-3 text-ink-600 text-xs font-mono">{r.expected_value ?? '—'}</td>
                    <td className="px-4 py-3 text-ink-600">{r.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'exceptions' && (
        <div className="space-y-3">
          {exceptions.length === 0 ? <div className="card"><EmptyState title="No exceptions" message="This invoice passed all checks." /></div> :
            exceptions.map((e) => (
              <div key={e.exception_id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink-800 text-sm">{e.issue_type.replace(/_/g, ' ').toLowerCase()}</span>
                      <StatusBadge status={e.severity} type="severity" />
                      <StatusBadge status={e.status} type="exception" />
                    </div>
                    <p className="text-sm text-ink-600 mt-1.5">{e.explanation}</p>
                  </div>
                  <div className="text-right text-xs text-ink-400 shrink-0">
                    <p>{e.rule_id}</p>
                    <p>Routed: {e.routed_to_role?.replace(/_/g, ' ').toLowerCase() ?? '—'}</p>
                  </div>
                </div>
                {(e.observed_value || e.expected_value) && (
                  <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-ink-100 text-xs">
                    <div><p className="text-ink-400">Observed</p><p className="font-mono text-ink-700">{e.observed_value ?? '—'}</p></div>
                    <div><p className="text-ink-400">Expected</p><p className="font-mono text-ink-700">{e.expected_value ?? '—'}</p></div>
                    <div><p className="text-ink-400">Tolerance</p><p className="font-mono text-ink-700">{e.tolerance ?? '—'}</p></div>
                  </div>
                )}
              </div>
            ))
          }
        </div>
      )}

      {tab === 'approvals' && (
        <div className="space-y-3">
          {approvals.length === 0 ? <div className="card"><EmptyState title="No approvals" /></div> :
            approvals.map((a) => (
              <div key={a.approval_id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-ink-800 text-sm">Level {a.approval_level}</span>
                    <span className="ml-2 text-xs text-ink-400">{a.approval_id}</span>
                  </div>
                  <StatusBadge status={a.status} type="approval" />
                </div>
                <div className="mt-2 text-sm text-ink-600">
                  <p>Approver: {a.approver_user_id ?? 'Unassigned'}</p>
                  {a.decision_reason && <p className="mt-1">Reason: {a.decision_reason}</p>}
                  {a.comments && <p className="mt-1 text-ink-500">Comments: {a.comments}</p>}
                </div>
              </div>
            ))
          }
        </div>
      )}

      {tab === 'payments' && (
        <div className="space-y-3">
          {payments.length === 0 ? <div className="card"><EmptyState title="No payments" /></div> :
            payments.map((p) => (
              <div key={p.payment_id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-ink-800 text-sm">{p.payment_reference}</p>
                    <p className="text-xs text-ink-400">{p.payment_id}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={p.status} type="payment" />
                    <p className="text-sm font-semibold text-ink-700 mt-1">{formatMoney(p.amount, p.currency)}</p>
                  </div>
                </div>
                {p.failure_reason && <p className="mt-2 text-sm text-danger-600">Failure: {p.failure_reason}</p>}
              </div>
            ))
          }
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><GitBranch size={16} /> Lifecycle Transitions</h3>
            <div className="space-y-2">
              {stateTransitions.map((t) => (
                <div key={t.transition_id} className="flex items-center gap-3 text-sm">
                  <StatusBadge status={t.from_state} type="lifecycle" />
                  <span className="text-ink-300">→</span>
                  <StatusBadge status={t.to_state} type="lifecycle" />
                  <span className="text-ink-500 text-xs ml-auto">{t.reason ?? ''}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><History size={16} /> Audit Events</h3>
            <div className="space-y-2">
              {auditEvents.map((a) => (
                <div key={a.audit_id} className="flex items-center gap-3 text-sm border-b border-ink-50 pb-2 last:border-0">
                  <span className="badge bg-ink-100 text-ink-600">{a.action}</span>
                  <span className="text-ink-500 text-xs">{a.entity_type}:{a.entity_id}</span>
                  <span className="text-ink-400 text-xs ml-auto">{new Date(a.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
