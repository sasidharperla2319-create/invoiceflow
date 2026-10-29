import { useEffect, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  Ban,
  CheckSquare,
  Wallet,
  TrendingUp,
  CircleDollarSign,
} from 'lucide-react';
import { fetchDashboardStats } from '@/lib/queries';
import { formatMoney } from '@/domain/money';
import { LoadingState, ErrorState, StatCard, PageHeader, EmptyState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';

const MATCH_COLORS: Record<string, string> = {
  MATCHED: '#16a34a',
  MATCHED_WITHIN_TOLERANCE: '#22c55e',
  EXCEPTION: '#f59e0b',
  BLOCKED: '#ef4444',
  PARTIAL_MATCH: '#0ea5e9',
  UNMATCHED: '#94a3b8',
  PENDING_REVIEW: '#d97706',
};

const SCENARIO_COLORS: Record<string, string> = {
  CLEAN_MATCH: '#16a34a',
  PRICE_VARIANCE: '#f59e0b',
  QUANTITY_MISMATCH: '#d97706',
  DUPLICATE_INVOICE: '#ef4444',
  MISSING_RECEIPT: '#b91c1c',
  TAX_OR_VENDOR_ERROR: '#7c3aed',
};

export function OverviewPage({ onNavigate }: { onNavigate: (p: 'invoices' | 'exceptions' | 'approvals' | 'payments' | 'datalab') => void }) {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof fetchDashboardStats>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardStats()
      .then((s) => setStats(s))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Loading dashboard metrics…" />;
  if (error) return <ErrorState message={error} />;
  if (!stats) return null;

  if (stats.total === 0) {
    return (
      <div>
        <PageHeader title="Overview Dashboard" subtitle="Accounts-payable automation at a glance" />
        <EmptyState
          title="No invoices yet"
          message="Generate a synthetic dataset from the Data Lab to populate the dashboard."
          icon={<FileText size={40} />}
        />
        <div className="mt-4 text-center">
          <button className="btn-primary" onClick={() => onNavigate('datalab')}>
            Go to Data Lab
          </button>
        </div>
      </div>
    );
  }

  const matchData = stats.byMatchStatus.map((d) => ({ name: d.status, value: d.count }));
  const scenarioData = stats.byScenario
    .filter((d) => d.label !== 'null' && d.label !== 'UNKNOWN')
    .map((d) => ({ name: d.label, value: d.count }));
  const trendData = stats.byDay.slice(-14);

  return (
    <div>
      <PageHeader title="Overview Dashboard" subtitle="Accounts-payable automation at a glance" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <button className="text-left" onClick={() => onNavigate('invoices')}>
          <StatCard label="Total Invoices" value={stats.total} icon={<FileText size={20} />} tone="brand" />
        </button>
        <button className="text-left" onClick={() => onNavigate('invoices')}>
          <StatCard label="Clean Matches" value={stats.cleanMatches} icon={<CheckCircle2 size={20} />} tone="success" />
        </button>
        <button className="text-left" onClick={() => onNavigate('exceptions')}>
          <StatCard label="Exceptions" value={stats.exceptions} icon={<AlertTriangle size={20} />} tone="warning" />
        </button>
        <button className="text-left" onClick={() => onNavigate('invoices')}>
          <StatCard label="Blocked" value={stats.blocked} icon={<Ban size={20} />} tone="danger" />
        </button>
        <button className="text-left" onClick={() => onNavigate('approvals')}>
          <StatCard label="Pending Approvals" value={stats.pendingApprovals} icon={<CheckSquare size={20} />} />
        </button>
        <button className="text-left" onClick={() => onNavigate('payments')}>
          <StatCard label="Payment Ready" value={stats.paymentReady} icon={<Wallet size={20} />} tone="brand" />
        </button>
        <StatCard label="Paid Amount" value={formatMoney(stats.paidAmount)} icon={<CircleDollarSign size={20} />} tone="success" />
        <StatCard label="Outstanding" value={formatMoney(stats.outstandingAmount)} icon={<TrendingUp size={20} />} tone="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink-700 mb-1">Match Status Distribution</h3>
          <p className="text-xs text-ink-400 mb-4">How invoices are classified by the matching engine</p>
          {matchData.length === 0 ? (
            <EmptyState title="No data" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={matchData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {matchData.map((d) => (
                    <Cell key={d.name} fill={MATCH_COLORS[d.name] ?? '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v: number) => [v, 'Invoices']}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="space-y-1.5 mt-2">
            {matchData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: MATCH_COLORS[d.name] ?? '#94a3b8' }} />
                  <StatusBadge status={d.name} type="match" />
                </span>
                <span className="font-semibold text-ink-700">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink-700 mb-1">Scenario Distribution</h3>
          <p className="text-xs text-ink-400 mb-4">Ground-truth labels from the synthetic dataset</p>
          {scenarioData.length === 0 ? (
            <EmptyState title="No data" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={scenarioData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v: number) => [v, 'Invoices']}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {scenarioData.map((d) => (
                    <Cell key={d.name} fill={SCENARIO_COLORS[d.name] ?? '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink-700 mb-1">Invoice Processing Trend</h3>
          <p className="text-xs text-ink-400 mb-4">Invoices received per day (last 14 days)</p>
          {trendData.length === 0 ? (
            <EmptyState title="No data" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} fill="url(#trendGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
