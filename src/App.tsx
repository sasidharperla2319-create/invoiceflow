import { useState, useEffect } from 'react';
import { Layout, type PageKey } from '@/components/Layout';
import { OverviewPage } from '@/pages/OverviewPage';
import { InvoiceQueuePage } from '@/pages/InvoiceQueuePage';
import { InvoiceDetailPage } from '@/pages/InvoiceDetailPage';
import { InvoiceIntakePage } from '@/pages/InvoiceIntakePage';
import { ExceptionWorkbenchPage } from '@/pages/ExceptionWorkbenchPage';
import { ApprovalInboxPage } from '@/pages/ApprovalInboxPage';
import { PaymentReadinessPage } from '@/pages/PaymentReadinessPage';
import { DataLabPage } from '@/pages/DataLabPage';
import { AuditEvaluationPage } from '@/pages/AuditEvaluationPage';
import { AdminPage } from '@/pages/AdminPage';
import { getDatasetSummary } from '@/lib/seed';
import { isSupabaseConfigured } from '@/lib/supabase';

export default function App() {
  const [page, setPage] = useState<PageKey>('overview');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [hasData, setHasData] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setChecking(false);
      setHasData(false);
      return;
    }
    getDatasetSummary()
      .then((s) => setHasData(s.hasData))
      .catch(() => setHasData(false))
      .finally(() => setChecking(false));
  }, [page]);

  const navigate = (p: PageKey) => {
    setPage(p);
    setSelectedInvoiceId(null);
  };

  const selectInvoice = (id: string) => {
    setSelectedInvoiceId(id);
    setPage('invoices');
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-ink-50 flex items-center justify-center p-4">
        <div className="card max-w-lg w-full p-8 text-center shadow-elevated">
          <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">
            IF
          </div>
          <h1 className="text-2xl font-bold text-ink-800 mb-2">Configuration Required</h1>
          <p className="text-sm text-ink-500 mb-6 leading-relaxed">
            InvoiceFlow AI requires Supabase environment variables to connect to PostgreSQL.
          </p>
          <div className="text-left bg-ink-900 text-ink-100 rounded-lg p-4 font-mono text-xs mb-6 overflow-x-auto space-y-2">
            <p className="text-ink-400"># 1. Create a .env file from .env.example</p>
            <p className="text-success-400">cp .env.example .env</p>
            <p className="text-ink-400"># 2. Add your Supabase project credentials in .env</p>
            <p>VITE_SUPABASE_URL=https://your-project.supabase.co</p>
            <p>VITE_SUPABASE_ANON_KEY=your-anon-key</p>
          </div>
          <p className="text-xs text-ink-400">
            Once configured, restart the Vite development server to launch InvoiceFlow AI.
          </p>
        </div>
      </div>
    );
  }

  // Auto-redirect to Data Lab if no data and user lands on overview
  if (!checking && !hasData && page === 'overview') {
    return (
      <Layout current={page} onNavigate={navigate}>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center text-white font-bold text-2xl mb-4">
            IF
          </div>
          <h1 className="text-2xl font-semibold text-ink-800 mb-2">Welcome to InvoiceFlow AI</h1>
          <p className="text-ink-500 max-w-md mb-6">
            No invoice data has been generated yet. Head to the Data Lab to generate a synthetic dataset
            with a fixed seed — it only takes a moment and powers every page in the app.
          </p>
          <button className="btn-primary" onClick={() => navigate('datalab')}>
            Go to Data Lab
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout current={page} onNavigate={navigate}>
      {page === 'overview' && <OverviewPage onNavigate={navigate} />}
      {page === 'invoices' && !selectedInvoiceId && (
        <InvoiceQueuePage onSelectInvoice={selectInvoice} />
      )}
      {page === 'invoices' && selectedInvoiceId && (
        <InvoiceDetailPage invoiceId={selectedInvoiceId} onBack={() => setSelectedInvoiceId(null)} />
      )}
      {page === 'intake' && <InvoiceIntakePage onSelectInvoice={selectInvoice} />}
      {page === 'exceptions' && <ExceptionWorkbenchPage onSelectInvoice={selectInvoice} />}
      {page === 'approvals' && <ApprovalInboxPage onSelectInvoice={selectInvoice} />}
      {page === 'payments' && <PaymentReadinessPage />}
      {page === 'datalab' && <DataLabPage />}
      {page === 'audit' && <AuditEvaluationPage />}
      {page === 'admin' && <AdminPage />}
    </Layout>
  );
}
