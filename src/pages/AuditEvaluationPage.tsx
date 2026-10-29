import { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, History, Activity, BarChart3 } from 'lucide-react';
import { fetchAuditEvents, fetchEvaluationRuns } from '@/lib/queries';
import type { AuditEvent, EvaluationRun } from '@/domain/types';
import { LoadingState, ErrorState, PageHeader, EmptyState } from '@/components/States';

export function AuditEvaluationPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'timeline' | 'evaluation'>('timeline');
  const [selectedRun, setSelectedRun] = useState<EvaluationRun | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [e, r] = await Promise.all([fetchAuditEvents(undefined, 200), fetchEvaluationRuns()]);
      setEvents(e);
      setRuns(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState label="Loading audit data…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader title="Audit & Evaluation" subtitle="Event timeline, rule results, and evaluation metrics" />

      <div className="flex gap-1 mb-4 border-b border-ink-200">
        <button onClick={() => setTab('timeline')} className={`px-3.5 py-2 text-sm font-medium border-b-2 ${tab === 'timeline' ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500'}`}>
          <History size={14} className="inline mr-1.5" /> Audit Timeline
        </button>
        <button onClick={() => setTab('evaluation')} className={`px-3.5 py-2 text-sm font-medium border-b-2 ${tab === 'evaluation' ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500'}`}>
          <BarChart3 size={14} className="inline mr-1.5" /> Evaluation Runs
        </button>
      </div>

      {tab === 'timeline' && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><Activity size={16} /> Recent Events</h3>
          {events.length === 0 ? <EmptyState title="No events" /> : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-thin">
              {events.map((e) => (
                <div key={e.audit_id} className="flex items-center gap-3 border-b border-ink-50 pb-2 last:border-0">
                  <span className="badge bg-ink-100 text-ink-600 shrink-0">{e.action}</span>
                  <span className="text-xs text-ink-500 font-mono">{e.entity_type}:{e.entity_id}</span>
                  {e.actor_user_id && <span className="text-xs text-ink-400">by {e.actor_user_id}</span>}
                  <span className="text-xs text-ink-300 ml-auto">{new Date(e.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'evaluation' && (
        <div className="space-y-4">
          {runs.length === 0 ? <div className="card"><EmptyState title="No evaluation runs" message="Generate a dataset to create one." /></div> : (
            runs.map((r) => (
              <div key={r.run_id} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className="text-brand-600" />
                      <span className="font-semibold text-ink-800 text-sm">{r.run_id}</span>
                      <span className="badge bg-success-50 text-success-700">{r.status}</span>
                    </div>
                    <p className="text-xs text-ink-400 mt-0.5">Seed {r.seed ?? '—'} · Scale {r.scale ?? '—'} · {new Date(r.started_at).toLocaleString()}</p>
                  </div>
                  <button className="btn-secondary text-xs" onClick={() => setSelectedRun(selectedRun?.run_id === r.run_id ? null : r)}>
                    {selectedRun?.run_id === r.run_id ? 'Hide' : 'View Metrics'}
                  </button>
                </div>
                {r.summary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    {Object.entries(r.summary as Record<string, string>).slice(0, 8).map(([k, v]) => (
                      <div key={k} className="bg-ink-50 rounded-lg px-3 py-2">
                        <p className="text-ink-400">{k}</p>
                        <p className="font-semibold text-ink-700 mt-0.5">{v}</p>
                      </div>
                    ))}
                  </div>
                )}
                {selectedRun?.run_id === r.run_id && r.metrics && (
                  <div className="mt-4 pt-4 border-t border-ink-100">
                    <p className="text-xs font-semibold text-ink-500 mb-2">Full Metrics</p>
                    <pre className="text-xs bg-ink-900 text-ink-100 rounded-lg p-3 overflow-x-auto scrollbar-thin font-mono">
                      {JSON.stringify(r.metrics, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
