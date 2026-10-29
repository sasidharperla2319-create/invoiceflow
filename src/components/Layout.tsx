import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  FileText,
  AlertTriangle,
  CheckSquare,
  Wallet,
  FlaskConical,
  ShieldCheck,
  Settings,
  FilePlus2,
  Menu,
  ChevronDown,
} from 'lucide-react';
import { useSession } from '@/lib/session';
import { RoleBadge } from './StatusBadge';

export type PageKey =
  | 'overview'
  | 'invoices'
  | 'intake'
  | 'exceptions'
  | 'approvals'
  | 'payments'
  | 'datalab'
  | 'audit'
  | 'admin';

interface NavItem {
  key: PageKey;
  label: string;
  icon: ReactNode;
  roles?: string[];
}

const NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} /> },
  { key: 'invoices', label: 'Invoice Queue', icon: <FileText size={18} /> },
  { key: 'intake', label: 'Invoice Intake', icon: <FilePlus2 size={18} /> },
  { key: 'exceptions', label: 'Exception Workbench', icon: <AlertTriangle size={18} /> },
  { key: 'approvals', label: 'Approval Inbox', icon: <CheckSquare size={18} /> },
  { key: 'payments', label: 'Payment Readiness', icon: <Wallet size={18} /> },
  { key: 'datalab', label: 'Data Lab', icon: <FlaskConical size={18} /> },
  { key: 'audit', label: 'Audit & Evaluation', icon: <ShieldCheck size={18} /> },
  { key: 'admin', label: 'Administration', icon: <Settings size={18} /> },
];

export function Layout({ current, onNavigate, children }: { current: PageKey; onNavigate: (p: PageKey) => void; children: ReactNode }) {
  const { user, demoUsers, switchUser } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navItems = NAV;

  const Sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-ink-200">
        <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm">
          IF
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-800 leading-tight">InvoiceFlow AI</p>
          <p className="text-[11px] text-ink-400 leading-tight">Three-Way Matching</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => {
          const active = current === item.key;
          return (
            <button
              key={item.key}
              onClick={() => {
                onNavigate(item.key);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/20'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-800'
              }`}
            >
              <span className={active ? 'text-brand-600' : 'text-ink-400'}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t border-ink-200">
        <p className="text-[11px] text-ink-400 px-3 mb-2">Demo · Assessment Build</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-ink-50">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-white border-r border-ink-200 flex-col fixed inset-y-0">
        {Sidebar}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-white border-r border-ink-200 flex flex-col animate-slide-in">
            {Sidebar}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-ink-200 px-4 lg:px-8 py-3 flex items-center justify-between">
          <button className="lg:hidden btn-ghost p-1.5" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="hidden lg:block">
            <p className="text-sm text-ink-500">
              {NAV.find((n) => n.key === current)?.label ?? 'Dashboard'}
            </p>
          </div>
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-ink-100 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-semibold">
                {user?.full_name?.split(' ').map((n) => n[0]).join('') ?? '?'}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-ink-700 leading-tight">{user?.full_name ?? 'Loading'}</p>
                <p className="text-[10px] text-ink-400 leading-tight">{user?.role.replace(/_/g, ' ').toLowerCase()}</p>
              </div>
              <ChevronDown size={14} className="text-ink-400" />
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-64 card shadow-elevated z-50 py-2 animate-fade-in">
                  <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                    Switch demo role
                  </p>
                  {demoUsers.map((u) => (
                    <button
                      key={u.user_id}
                      onClick={() => {
                        switchUser(u.user_id);
                        setUserMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-ink-50 transition-colors ${
                        user?.user_id === u.user_id ? 'bg-brand-50/50 text-brand-700' : 'text-ink-700'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-ink-100 text-ink-600 flex items-center justify-center text-[10px] font-semibold">
                          {u.full_name.split(' ').map((n) => n[0]).join('')}
                        </span>
                        {u.full_name}
                      </span>
                      <RoleBadge role={u.role} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 lg:px-8 py-6 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
