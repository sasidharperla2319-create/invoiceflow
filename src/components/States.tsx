import { Loader2 } from 'lucide-react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-ink-400">
      <Loader2 className="animate-spin mr-2" size={18} />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title, message, icon }: { title: string; message?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-3 text-ink-300">{icon}</div>}
      <h3 className="text-sm font-semibold text-ink-600">{title}</h3>
      {message && <p className="mt-1 text-sm text-ink-400 max-w-sm">{message}</p>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="card border-danger-500/30 bg-danger-50/50 px-4 py-3">
      <p className="text-sm text-danger-700">{message}</p>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-800 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: string; positive: boolean };
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'brand';
}) {
  const tones: Record<string, string> = {
    default: 'text-ink-800',
    success: 'text-success-700',
    warning: 'text-warning-700',
    danger: 'text-danger-700',
    brand: 'text-brand-700',
  };
  return (
    <div className="card card-hover p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
          <p className={`text-2xl font-semibold mt-1.5 ${tones[tone]}`}>{value}</p>
        </div>
        {icon && <div className="text-ink-300">{icon}</div>}
      </div>
      {trend && (
        <p className={`text-xs mt-2 ${trend.positive ? 'text-success-600' : 'text-danger-600'}`}>{trend.value}</p>
      )}
    </div>
  );
}
