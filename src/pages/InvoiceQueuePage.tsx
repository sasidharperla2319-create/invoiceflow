import { useEffect, useState, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react';
import { fetchInvoices, PAGE_SIZE, type InvoiceListFilters } from '@/lib/queries';
import { formatMoney } from '@/domain/money';
import type { Invoice } from '@/domain/types';
import { LoadingState, ErrorState, PageHeader, EmptyState } from '@/components/States';
import { StatusBadge, ScenarioBadge } from '@/components/StatusBadge';

const SORT_FIELDS = [
  { key: 'received_at', label: 'Received Date' },
  { key: 'invoice_number', label: 'Invoice Number' },
  { key: 'grand_total', label: 'Amount' },
  { key: 'vendor_id', label: 'Vendor' },
  { key: 'due_date', label: 'Due Date' },
];

const MATCH_STATUSES = ['ALL', 'MATCHED', 'MATCHED_WITHIN_TOLERANCE', 'PARTIAL_MATCH', 'EXCEPTION', 'BLOCKED', 'PENDING_REVIEW'];
const APPROVAL_STATUSES = ['ALL', 'NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'BLOCKED'];
const PAYMENT_STATUSES = ['ALL', 'NOT_READY', 'READY', 'SCHEDULED', 'PAID', 'FAILED'];
const SCENARIOS = ['ALL', 'CLEAN_MATCH', 'PRICE_VARIANCE', 'QUANTITY_MISMATCH', 'DUPLICATE_INVOICE', 'MISSING_RECEIPT', 'TAX_OR_VENDOR_ERROR'];

export function InvoiceQueuePage({ onSelectInvoice }: { onSelectInvoice: (id: string) => void }) {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<InvoiceListFilters>({ page: 1, sortBy: 'received_at', sortDir: 'desc' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { rows, total } = await fetchInvoices(filters);
      setRows(rows);
      setTotal(total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const exportCsv = () => {
    const headers = ['invoice_id', 'invoice_number', 'vendor_id', 'po_number', 'invoice_date', 'grand_total', 'match_status', 'approval_status', 'payment_status', 'scenario_label'];
    const lines = rows.map((r) =>
      [r.invoice_id, r.invoice_number, r.vendor_id, r.purchase_order_id ?? '', r.invoice_date, r.grand_total, r.match_status, r.approval_status, r.payment_status, r.scenario_label ?? ''].join(','),
    );
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'invoices_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Invoice Queue"
        subtitle={`${total} invoices total`}
        actions={
          <button className="btn-secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={15} /> Export CSV
          </button>
        }
      />

      <div className="card p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <label className="label">Search</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                className="input pl-9"
                placeholder="Invoice number or ID…"
                value={filters.search ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
              />
            </div>
          </div>
          <div>
            <label className="label">Match Status</label>
            <select className="select" value={filters.matchStatus ?? 'ALL'} onChange={(e) => setFilters((f) => ({ ...f, matchStatus: e.target.value, page: 1 }))}>
              {MATCH_STATUSES.map((s) => (
                <option key={s} value={s}>{s === 'ALL' ? 'All' : s.replace(/_/g, ' ').toLowerCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Approval</label>
            <select className="select" value={filters.approvalStatus ?? 'ALL'} onChange={(e) => setFilters((f) => ({ ...f, approvalStatus: e.target.value, page: 1 }))}>
              {APPROVAL_STATUSES.map((s) => (
                <option key={s} value={s}>{s === 'ALL' ? 'All' : s.replace(/_/g, ' ').toLowerCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Payment</label>
            <select className="select" value={filters.paymentStatus ?? 'ALL'} onChange={(e) => setFilters((f) => ({ ...f, paymentStatus: e.target.value, page: 1 }))}>
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{s === 'ALL' ? 'All' : s.replace(/_/g, ' ').toLowerCase()}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <div>
            <label className="label">Scenario</label>
            <select className="select" value={filters.scenarioLabel ?? 'ALL'} onChange={(e) => setFilters((f) => ({ ...f, scenarioLabel: e.target.value, page: 1 }))}>
              {SCENARIOS.map((s) => (
                <option key={s} value={s}>{s === 'ALL' ? 'All' : s.replace(/_/g, ' ').toLowerCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Sort By</label>
            <select className="select" value={filters.sortBy ?? 'received_at'} onChange={(e) => setFilters((f) => ({ ...f, sortBy: e.target.value }))}>
              {SORT_FIELDS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Direction</label>
            <select className="select" value={filters.sortDir ?? 'desc'} onChange={(e) => setFilters((f) => ({ ...f, sortDir: e.target.value as 'asc' | 'desc' }))}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>
      </div>

      {error && <ErrorState message={error} />}
      {loading ? (
        <LoadingState label="Loading invoices…" />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState title="No invoices found" message="Try adjusting your filters or generate a dataset." icon={<FileText size={40} />} />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/50 text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Invoice</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Vendor</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Date</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Match</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Approval</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Payment</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Scenario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((inv) => (
                  <tr
                    key={inv.invoice_id}
                    className="table-row-hover cursor-pointer"
                    onClick={() => onSelectInvoice(inv.invoice_id)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-800">{inv.invoice_number}</p>
                      <p className="text-xs text-ink-400">{inv.invoice_id}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-600">{inv.vendor_id}</td>
                    <td className="px-4 py-3 text-ink-600">{inv.invoice_date}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink-800">{formatMoney(inv.grand_total, inv.currency)}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.match_status} type="match" /></td>
                    <td className="px-4 py-3"><StatusBadge status={inv.approval_status} type="approval" /></td>
                    <td className="px-4 py-3"><StatusBadge status={inv.payment_status} type="payment" /></td>
                    <td className="px-4 py-3">{inv.scenario_label ? <ScenarioBadge label={inv.scenario_label} /> : <span className="text-ink-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-ink-200">
            <p className="text-xs text-ink-500">
              Page {filters.page ?? 1} of {Math.max(1, totalPages)} · {total} results
            </p>
            <div className="flex gap-1">
              <button
                className="btn-secondary p-1.5"
                disabled={(filters.page ?? 1) <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="btn-secondary p-1.5"
                disabled={(filters.page ?? 1) >= totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
