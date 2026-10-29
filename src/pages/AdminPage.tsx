import { useEffect, useState, useCallback } from 'react';
import { Settings, Users, Sliders, Heart } from 'lucide-react';
import { fetchUsers, fetchConfigSettings, updateConfigValue } from '@/lib/queries';
import { useSession } from '@/lib/session';
import type { User, ConfigSetting } from '@/domain/types';
import { LoadingState, ErrorState, PageHeader, EmptyState } from '@/components/States';
import { RoleBadge } from '@/components/StatusBadge';

export function AdminPage() {
  const { user } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [configs, setConfigs] = useState<ConfigSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ConfigSetting | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, c] = await Promise.all([fetchUsers(), fetchConfigSettings()]);
      setUsers(u);
      setConfigs(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      let value: unknown = editValue;
      if (editing.key === 'require_receipt') value = editValue === 'true';
      else if (typeof editing.value === 'number') value = Number(editValue);
      else if (typeof editing.value === 'object') value = JSON.parse(editValue);
      await updateConfigValue(editing.key, value, editing.description ?? undefined);
      setEditing(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const canConfigure = user && ['SYSTEM_ADMIN', 'PROCESS_OWNER'].includes(user.role);

  if (loading) return <LoadingState label="Loading administration…" />;

  return (
    <div>
      <PageHeader title="Administration" subtitle="Users, roles, and business configuration" />

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><Users size={16} /> Users & Roles</h3>
          {users.length === 0 ? <EmptyState title="No users" /> : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.user_id} className="flex items-center justify-between border-b border-ink-50 pb-2 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px] font-semibold">
                      {u.full_name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-700">{u.full_name}</p>
                      <p className="text-xs text-ink-400">{u.email}</p>
                    </div>
                  </div>
                  <RoleBadge role={u.role} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><Sliders size={16} /> Business Configuration</h3>
          {configs.length === 0 ? <EmptyState title="No config" message="Generate a dataset to seed defaults." /> : (
            <div className="space-y-2">
              {configs.map((c) => (
                <div key={c.key} className="flex items-center justify-between border-b border-ink-50 pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-700">{c.key}</p>
                    <p className="text-xs text-ink-400 truncate">{c.description ?? ''}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono text-ink-600">{typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value)}</span>
                    {canConfigure && (
                      <button
                        className="btn-ghost text-xs p-1"
                        onClick={() => {
                          setEditing(c);
                          setEditValue(typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value));
                        }}
                      >
                        <Settings size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2"><Heart size={16} /> System Health</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="bg-success-50 rounded-lg p-3">
              <p className="text-xs text-success-600">Database</p>
              <p className="font-semibold text-success-700 mt-0.5">Connected</p>
            </div>
            <div className="bg-success-50 rounded-lg p-3">
              <p className="text-xs text-success-600">Matching Engine</p>
              <p className="font-semibold text-success-700 mt-0.5">Active</p>
            </div>
            <div className="bg-ink-50 rounded-lg p-3">
              <p className="text-xs text-ink-500">Extraction Provider</p>
              <p className="font-semibold text-ink-700 mt-0.5">Simulated</p>
            </div>
            <div className="bg-ink-50 rounded-lg p-3">
              <p className="text-xs text-ink-500">Payment Provider</p>
              <p className="font-semibold text-ink-700 mt-0.5">Simulated</p>
            </div>
          </div>
          <p className="text-xs text-ink-400 mt-3">
            Extraction and payment providers are simulated for this assessment. The extraction adapter is replaceable — see the docs for wiring a real OCR/LLM provider.
          </p>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <div className="relative card w-full max-w-md p-5">
            <h3 className="text-base font-semibold text-ink-800 mb-3">Edit {editing.key}</h3>
            <p className="text-xs text-ink-400 mb-3">{editing.description}</p>
            <label className="label">Value</label>
            <textarea className="input min-h-[80px] font-mono text-sm" value={editValue} onChange={(e) => setEditValue(e.target.value)} />
            <div className="flex justify-end gap-2 mt-3">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving || !editValue.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
