import { useEffect, useState, type FormEvent } from 'react';
import type { SessionResponse, SystemResponse } from '@affiliate/shared';
import { api, rememberSession } from './api';

export function Security({ onSession }: { onSession: (session: SessionResponse) => void }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage(''); setError('');
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return; }
    setBusy(true);
    try {
      const session = await api<SessionResponse>('/api/auth/password', 'POST', { currentPassword, newPassword });
      rememberSession(session); onSession(session); setCurrent(''); setNew(''); setConfirm('');
      setMessage('Password changed. Other sessions were logged out.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Password change failed'); }
    finally { setBusy(false); }
  }
  return <form className="space-y-5" onSubmit={submit}>
    <h2 className="text-xl font-semibold">Security</h2>
    <p className="text-sm text-slate-600">Change your password. All other sessions will be revoked.</p>
    <label className="field">Current password<input required autoComplete="current-password" type="password" value={currentPassword} maxLength={128} onChange={e => setCurrent(e.target.value)} /></label>
    <label className="field">New password<input required autoComplete="new-password" type="password" minLength={12} maxLength={128} value={newPassword} onChange={e => setNew(e.target.value)} /></label>
    <label className="field">Confirm new password<input required autoComplete="new-password" type="password" minLength={12} maxLength={128} value={confirmPassword} onChange={e => setConfirm(e.target.value)} /></label>
    {message && <p role="status" className="text-sm text-teal-700">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button className="button" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</button>
  </form>;
}

export function System({ compact = false }: { compact?: boolean }) {
  const [system, setSystem] = useState<SystemResponse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api<SystemResponse>('/api/admin/system').then(value => { if (alive) setSystem(value); }).catch(failure => { if (alive) setError(failure instanceof Error ? failure.message : 'Unable to load status'); });
    return () => { alive = false; };
  }, []);
  if (error) return <p role="alert" className="text-red-700">{error}</p>;
  if (!system) return <p role="status">Loading system status…</p>;
  const values: [string, string][] = [
    ['Database', `Connected · schema ${system.schemaVersion}`], ['SMTP configuration', system.smtpConfigured ? 'Saved (use SMTP tests to verify)' : 'Not configured'],
    ['Settings encryption', system.encryptionConfigured ? 'Configured' : 'Missing'], ['Session lifetime', `${system.sessionHours} hours`], ['Active admin sessions', String(system.activeSessions)],
    ['Confirmation queue', `Pending ${system.outboxPending} · failed ${system.outboxFailed}`], ['Confirmation worker', system.worker === 'running' ? 'Running' : 'Stopped'],
    ['Marketing queue', `Pending ${system.marketingPending} · failed ${system.marketingFailed}`], ['Marketing worker',system.marketingWorker==='running'?'Running':'Stopped'],
  ];
  if (!compact) values.push(['Runtime', system.runtime], ['Environment', system.environment], ['Uptime', `${system.uptimeSeconds} seconds`], ['Secure cookies', system.secureCookies ? 'Enabled' : 'Disabled for local HTTP development']);
  return <section><h2 className="text-xl font-semibold">{compact ? 'System overview' : 'System'}</h2><dl className="mt-5 divide-y divide-slate-200">{values.map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-2"><dt className="text-sm text-slate-600">{label}</dt><dd className="break-words text-sm font-medium">{value}</dd></div>)}</dl></section>;
}

