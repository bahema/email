import { useState, type FormEvent } from 'react';
import type { SessionResponse } from '@affiliate/shared';
import { api, loadSession, rememberSession } from './api';
import { Icon,BrandMark } from '../ui/Icon';

export function Login({ session, onLogin }: { session: SessionResponse; onLogin: (session: SessionResponse) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      // Refresh expired anonymous sessions before login.
      await loadSession();
      const next = await api<SessionResponse>('/api/auth/login', 'POST', { email: email.trim(), password });
      setPassword(''); rememberSession(next); onLogin(next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Login failed'); }
    finally { setBusy(false); }
  }
 return <main className="login-layout"><section className="login-story"><a href="/" className="site-brand"><BrandMark/><span>Affiliate Engine</span></a><h2>A thoughtful place to grow your next idea.</h2><p>Your content, your audience, your recommendations. Manage everything from one private workspace.</p><img src="/design/editorial-workspace.jpg" alt="Books, a notebook and a quiet workspace"/></section><section className="login-form-side"><div className="login-content"><p className="eyebrow"><Icon name="lock" width="13" height="13"/>Owner workspace</p><h1>{session.setupRequired?'Set up your workspace':'Welcome back.'}</h1><p className="login-subtitle">{session.setupRequired?'Create your sole admin account to get started.':'Sign in to manage your website and audience.'}</p>{session.setupRequired?<div className="panel"><h2 className="font-semibold">Create your admin account</h2><p className="mt-3 text-sm text-slate-600">Run <code>npm run admin:setup</code> in the project terminal, then reload this page. There is no default password.</p><button type="button" className="button mt-5" onClick={()=>window.location.reload()}>Check again<Icon name="arrow" width="16" height="16"/></button></div>:<form className="panel space-y-5" onSubmit={submit}><label className="field">Email address<input required autoComplete="username" type="email" maxLength={254} placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="field">Password<input required autoComplete="current-password" type="password" maxLength={128} placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<button className="button" disabled={busy}>{busy?'Signing in…':'Sign in to workspace'}<Icon name="arrow" width="17" height="17"/></button></form>}<a className="login-back" href="/"><Icon name="arrow" width="14" height="14" style={{transform:'rotate(180deg)'}}/>Back to the public website</a><p className="login-privacy"><Icon name="shield" width="14" height="14"/>Private access for the website owner.</p></div></section></main>;
}