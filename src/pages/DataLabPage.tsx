import { useEffect, useState, useCallback } from 'react';
import { FlaskConical, Play, Download, CheckCircle2, XCircle, Database, Hash } from 'lucide-react';
import { seedDataset, type SeedResult } from '@/lib/seed';
import { fetchManifests, fetchGroundTruth } from '@/lib/queries';
import { getDatasetSummary } from '@/lib/seed';
import { generateDataset } from '@/domain/generator';
import { validateDataset } from '@/domain/validation';
import type { GenerationManifest, GroundTruth } from '@/domain/types';
import { LoadingState, ErrorState, PageHeader, EmptyState, StatCard } from '@/components/States';
import { ScenarioBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';

const DEFAULT_SEED = '20261022';

export function DataLabPage() {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [scale, setScale] = useState<'starter' | 'full'>('starter');
  const [manifests, setManifests] = useState<GenerationManifest[]>([]);
  const [groundTruth, setGroundTruth] = useState<GroundTruth[]>([]);
  const [summary, setSummary] = useState<{ invoices: number; exceptions: number; approvals: number; payments: number; hasData: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, gt, s] = await Promise.all([fetchManifests(), fetchGroundTruth(), getDatasetSummary()]);
      setManifests(m);
      setGroundTruth(gt);
      setSummary(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSeed = async () => {
    setSeeding(true);
    setError(null);
    setSeedResult(null);
    try {
      const result = await seedDataset(seed, scale);
      setSeedResult(result);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSeeding(false);
    }
  };

  const exportGroundTruth = (format: 'csv' | 'json') => {
    const data = groundTruth;
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ground_truth.json';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['invoice_id', 'scenario_label', 'expected_match_outcome', 'expected_exception_codes', 'expected_duplicate_group', 'expected_approval_eligible', 'expected_payment_ready'];
      const lines = data.map((g) => [
        g.invoice_id, g.scenario_label, g.expected_match_outcome,
        g.expected_exception_codes.join(';'),
        g.expected_duplicate_group ?? '',
        String(g.expected_approval_eligible),
        String(g.expected_payment_ready),
      ].join(','));
      const csv = [headers.join(','), ...lines].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ground_truth.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const previewValidation = () => {
    const ds = generateDataset(seed, scale);
    const report = validateDataset(ds);
    setSeedResult({
      manifest: { row_counts: ds.rowCounts, scenario_counts: ds.scenarioCounts, checksum: ds.checksum },
      validation: report,
      evaluation: {} as SeedResult['evaluation'],
      evaluationFormatted: {},
      duplicatesCreated: 0,
      exceptionsCreated: 0,
      ruleExecutionsCreated: 0,
    });
    setShowValidation(true);
  };

  if (loading) return <LoadingState label="Loading data lab…" />;

  return (
    <div>
      <PageHeader title="Data Lab" subtitle="Synthetic dataset generation, validation, and evaluation" />

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><Database size={16} /> Dataset Generation</h3>
          <div className="space-y-3">
            <div>
              <label className="label">Random Seed</label>
              <input className="input font-mono" value={seed} onChange={(e) => setSeed(e.target.value)} />
              <p className="text-xs text-ink-400 mt-1">Same seed + scale always reproduces the same dataset.</p>
            </div>
            <div>
              <label className="label">Scale</label>
              <select className="select" value={scale} onChange={(e) => setScale(e.target.value as 'starter' | 'full')}>
                <option value="starter">Starter (120 invoices, ~20 vendors)</option>
                <option value="full">Full (2000 invoices, 300 vendors)</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={handleSeed} disabled={seeding}>
                <Play size={15} /> {seeding ? 'Generating…' : 'Generate & Seed Database'}
              </button>
              <button className="btn-secondary" onClick={previewValidation} disabled={seeding}>
                <FlaskConical size={15} /> Preview Validation
              </button>
            </div>
            <p className="text-xs text-ink-400">
              Generating clears all existing data and inserts a fresh dataset, runs the matching engine, and produces an evaluation report.
            </p>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><Hash size={16} /> Current Dataset</h3>
          {summary && summary.hasData ? (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Invoices" value={summary.invoices} tone="brand" />
              <StatCard label="Exceptions" value={summary.exceptions} tone="warning" />
              <StatCard label="Approvals" value={summary.approvals} />
              <StatCard label="Payments" value={summary.payments} tone="success" />
            </div>
          ) : (
            <EmptyState title="No data loaded" message="Generate a dataset to begin." />
          )}
          {manifests.length > 0 && (
            <div className="mt-4 pt-4 border-t border-ink-100">
              <p className="text-xs font-semibold text-ink-500 mb-2">Generation Manifests</p>
              <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin">
                {manifests.slice(0, 5).map((m) => (
                  <div key={m.manifest_id} className="text-xs flex items-center justify-between">
                    <span className="text-ink-600">seed {m.seed} · {m.scale}</span>
                    <span className="font-mono text-ink-400">{m.checksum}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {seedResult && (
        <div className="card p-5 mb-4">
          <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2">
            {seedResult.validation?.passed ? <CheckCircle2 size={16} className="text-success-600" /> : <XCircle size={16} className="text-danger-600" />}
            Validation & Generation Report
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-ink-400 mb-1">Summary</p>
              <p className="text-sm text-ink-700">{seedResult.validation?.summary ?? '—'}</p>
              {seedResult.manifest?.checksum && (
                <p className="text-xs font-mono text-ink-400 mt-2">Checksum: {seedResult.manifest.checksum}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-ink-400 mb-1">Row Counts</p>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {seedResult.manifest?.row_counts && Object.entries(seedResult.manifest.row_counts).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-ink-500">{k}</span><span className="font-medium text-ink-700">{v}</span></div>
                ))}
              </div>
            </div>
          </div>
          {seedResult.validation && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-ink-500 mb-2">Checks</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-48 overflow-y-auto scrollbar-thin">
                {seedResult.validation.checks.map((c) => (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    {c.passed ? <CheckCircle2 size={12} className="text-success-600 shrink-0" /> : <XCircle size={12} className="text-danger-600 shrink-0" />}
                    <span className={c.passed ? 'text-ink-600' : 'text-danger-600'}>{c.name}</span>
                    {c.detail && <span className="text-ink-400">({c.detail})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {seedResult.evaluationFormatted && Object.keys(seedResult.evaluationFormatted).length > 0 && (
            <div className="mt-4 pt-4 border-t border-ink-100">
              <p className="text-xs font-semibold text-ink-500 mb-2">Evaluation Metrics</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {Object.entries(seedResult.evaluationFormatted).map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-ink-50 pb-1">
                    <span className="text-ink-500">{k}</span>
                    <span className="font-medium text-ink-700">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink-700">Ground Truth Export</h3>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" onClick={() => exportGroundTruth('csv')} disabled={groundTruth.length === 0}>
              <Download size={13} /> CSV
            </button>
            <button className="btn-secondary text-xs" onClick={() => exportGroundTruth('json')} disabled={groundTruth.length === 0}>
              <Download size={13} /> JSON
            </button>
          </div>
        </div>
        {groundTruth.length === 0 ? <EmptyState title="No ground truth" /> : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400 border-b border-ink-100">
                  <th className="py-2 pr-3">Invoice</th>
                  <th className="py-2 pr-3">Scenario</th>
                  <th className="py-2 pr-3">Expected Match</th>
                  <th className="py-2 pr-3">Payment Ready</th>
                  <th className="py-2 pr-3">Exceptions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {groundTruth.slice(0, 50).map((g) => (
                  <tr key={g.invoice_id}>
                    <td className="py-2 pr-3 text-xs font-mono text-ink-600">{g.invoice_id}</td>
                    <td className="py-2 pr-3"><ScenarioBadge label={g.scenario_label} /></td>
                    <td className="py-2 pr-3 text-xs text-ink-600">{g.expected_match_outcome.replace(/_/g, ' ').toLowerCase()}</td>
                    <td className="py-2 pr-3 text-xs">{g.expected_payment_ready ? 'Yes' : 'No'}</td>
                    <td className="py-2 pr-3 text-xs text-ink-500">{g.expected_exception_codes.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {groundTruth.length > 50 && <p className="text-xs text-ink-400 pt-2">Showing 50 of {groundTruth.length}</p>}
          </div>
        )}
      </div>

      <Modal open={showValidation} onClose={() => setShowValidation(false)} title="Preview Validation (no DB write)">
        <p className="text-sm text-ink-600 mb-3">This generates the dataset in-memory and validates it without writing to the database.</p>
        {seedResult?.validation && (
          <div className="space-y-1 max-h-80 overflow-y-auto scrollbar-thin">
            {seedResult.validation.checks.map((c) => (
              <div key={c.name} className="flex items-center gap-2 text-sm">
                {c.passed ? <CheckCircle2 size={14} className="text-success-600" /> : <XCircle size={14} className="text-danger-600" />}
                <span className={c.passed ? 'text-ink-600' : 'text-danger-600'}>{c.name}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
