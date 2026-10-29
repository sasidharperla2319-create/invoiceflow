import { useEffect, useState } from 'react';
import { FilePlus2, Upload, FileJson, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { fetchVendors, processInvoiceIntake, type IntakeResult } from '@/lib/queries';
import type { Vendor } from '@/domain/types';
import { LoadingState, ErrorState, PageHeader, EmptyState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';

const SAMPLE_JSON = `{
  "invoice_number": "INV-MANUAL-001",
  "vendor_id": "VND-00001",
  "purchase_order_id": null,
  "invoice_date": "2026-10-15",
  "due_date": "2026-11-14",
  "currency": "USD",
  "lines": [
    {
      "sku": "SKU-1234",
      "description": "Office supplies",
      "quantity": 10,
      "unit_price": 25.50,
      "tax_code": "STANDARD",
      "tax_rate": 0.10
    }
  ]
}`;

const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

export function InvoiceIntakePage({ onSelectInvoice }: { onSelectInvoice: (id: string) => void }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState(SAMPLE_JSON);
  const [importing, setImporting] = useState(false);
  const [intakeResult, setIntakeResult] = useState<IntakeResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<{ provider: string; confidence: number; fields: Record<string, unknown> } | null>(null);

  useEffect(() => {
    fetchVendors(50)
      .then(setVendors)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    setIntakeResult(null);
    try {
      const parsed = JSON.parse(jsonText);
      const res = await processInvoiceIntake(parsed);
      setIntakeResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleFile = (file: File) => {
    setUploadError(null);
    setExtraction(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Only PDF, PNG, JPEG, and WebP files are allowed.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError('File too large (max 5 MB).');
      return;
    }
    // Simulated extraction — no real OCR/LLM is invoked.
    setExtraction({
      provider: 'SIMULATED',
      confidence: 0.0,
      fields: {
        filename: file.name,
        size_bytes: file.size,
        mime_type: file.type,
        note: 'Simulated extraction. No OCR/LLM provider configured. Use structured JSON import for reliable testing.',
      },
    });
  };

  if (loading) return <LoadingState label="Loading intake form…" />;

  return (
    <div>
      <PageHeader title="Invoice Intake" subtitle="Upload documents or import structured invoice data" />

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Document upload */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><Upload size={16} /> Document Upload</h3>
          <div
            className="border-2 border-dashed border-ink-200 rounded-lg p-8 text-center hover:border-brand-400 transition-colors cursor-pointer"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            }}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <Upload size={32} className="mx-auto text-ink-300 mb-2" />
            <p className="text-sm text-ink-600">Drop a PDF or image here, or click to browse</p>
            <p className="text-xs text-ink-400 mt-1">PDF, PNG, JPEG, WebP · max 5 MB</p>
            <input
              id="file-input"
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
          {uploadError && <p className="mt-3 text-sm text-danger-600 flex items-center gap-1.5"><AlertCircle size={14} /> {uploadError}</p>}
          {extraction && (
            <div className="mt-4 border border-brand-200 bg-brand-50/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={15} className="text-brand-600" />
                <span className="text-sm font-semibold text-ink-700">Extraction Result</span>
                <span className="badge bg-brand-50 text-brand-700">{extraction.provider}</span>
              </div>
              <div className="text-xs text-ink-500 mb-2">
                Confidence: {(extraction.confidence * 100).toFixed(0)}% — extraction is simulated because no OCR/LLM provider is configured.
              </div>
              <pre className="text-xs bg-white rounded p-2 overflow-x-auto scrollbar-thin font-mono border border-ink-100">
                {JSON.stringify(extraction.fields, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Structured import */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><FileJson size={16} /> Structured JSON Import</h3>
          <p className="text-xs text-ink-400 mb-3">
            Paste a JSON invoice. Vendor IDs available: {vendors.slice(0, 5).map((v) => v.vendor_id).join(', ')}…
          </p>
          <textarea
            className="input min-h-[200px] font-mono text-xs"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-ink-400">Lines are calculated using Decimal arithmetic with currency rounding.</p>
            <button className="btn-primary" onClick={handleImport} disabled={importing || !jsonText.trim()}>
              <FilePlus2 size={15} /> {importing ? 'Importing…' : 'Import Invoice'}
            </button>
          </div>
          {intakeResult && (
            <div className="mt-3 border border-success-200 bg-success-50/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-success-600" />
                <span className="text-sm font-medium text-success-700">Processed & Matched Successfully</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink-700">
                <div>
                  <span className="text-ink-400">Invoice ID: </span>
                  <span className="font-mono font-medium">{intakeResult.invoiceId}</span>
                </div>
                <div>
                  <span className="text-ink-400">Match Status: </span>
                  <StatusBadge status={intakeResult.finalMatchStatus} type="match" />
                </div>
                <div>
                  <span className="text-ink-400">Lifecycle State: </span>
                  <span className="badge bg-ink-100 text-ink-700 font-mono text-[10px]">{intakeResult.finalLifecycleState}</span>
                </div>
                <div>
                  <span className="text-ink-400">Exceptions: </span>
                  <span className={`font-medium ${intakeResult.exceptionsCreated > 0 ? 'text-warning-600' : 'text-success-600'}`}>
                    {intakeResult.exceptionsCreated} created
                  </span>
                </div>
              </div>
              {intakeResult.approvalCreated && (
                <p className="text-xs text-brand-700 mt-2 font-medium bg-brand-50 p-1.5 rounded">
                  Pending approval task automatically created in Approval Inbox.
                </p>
              )}
              <button className="btn-secondary text-xs mt-3" onClick={() => onSelectInvoice(intakeResult.invoiceId)}>
                View Invoice Detail
              </button>
            </div>
          )}
        </div>

        {/* Vendor reference */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-ink-700 mb-3">Available Vendors (reference)</h3>
          {vendors.length === 0 ? <EmptyState title="No vendors" message="Generate a dataset first." /> : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-400 border-b border-ink-100">
                    <th className="py-2 pr-3">Vendor ID</th>
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Currency</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {vendors.slice(0, 20).map((v) => (
                    <tr key={v.vendor_id}>
                      <td className="py-2 pr-3 font-mono text-xs">{v.vendor_id}</td>
                      <td className="py-2 pr-3 text-ink-600">{v.vendor_code}</td>
                      <td className="py-2 pr-3 text-ink-700">{v.legal_name}</td>
                      <td className="py-2 pr-3 text-ink-600">{v.currency}</td>
                      <td className="py-2 pr-3"><StatusBadge status={v.status} type="match" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
