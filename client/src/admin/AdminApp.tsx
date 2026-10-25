import {VideoPromotions} from './VideoPromotions';
import {Health} from './Health';
import {Downloads} from './Downloads';
import {EmailControl} from './EmailControl';
import { HeaderNotifications } from './HeaderNotifications';
import { useEffect, useState,lazy,Suspense } from 'react';
import type { SessionResponse } from '@affiliate/shared';
import { api, loadSession } from './api';
import { Login } from './Login';
import { Settings } from './Settings';
import { WebsiteContent } from './WebsiteContent';
import { Uploads } from './Uploads';
import { Leads } from './Leads';
import { Newsletters } from './Newsletters';
import { Segments } from './Segments';
import { Campaigns } from './Campaigns';
import { Dashboard } from './Dashboard';
const LeadPages=lazy(()=>import('./LeadPages').then(m=>({default:m.LeadPages})));
import { Automations } from './Automations';
import { Logs } from './Logs';
import { Icon,BrandMark } from '../ui/Icon';
import { Metadata } from '../public/Metadata';

export function AdminApp() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [error, setError] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [menu,setMenu]=useState(false);
  useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(false);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[]);
  useEffect(() => {
    let alive = true;
    loadSession().then(value => { if (alive) { setSession(value); if (!value.authenticated) window.history.replaceState(null, '', '/admin/login'); else if (window.location.pathname === '/admin/login') window.history.replaceState(null, '', '/admin'); } }).catch(failure => { if (alive) setError(failure instanceof Error ? failure.message : 'Admin unavailable'); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    function expired() { window.history.replaceState(null, '', '/admin/login'); setSession(previous => previous ? { ...previous, authenticated: false, admin: null } : null); }
    window.addEventListener('admin-session-expired', expired);
    const timeout = session?.authenticated ? window.setTimeout(expired, Math.max(0, Date.parse(session.expiresAt) - Date.now())) : undefined;
    return () => { window.removeEventListener('admin-session-expired', expired); if (timeout !== undefined) clearTimeout(timeout); };
  }, [session]);
  function loggedIn(next: SessionResponse) { window.history.replaceState(null, '', '/admin'); setSession(next); }
  async function logout() {
    setLogoutBusy(true); setError('');
    try { await api('/api/auth/logout', 'POST', {}); window.history.replaceState(null, '', '/admin/login'); setSession(await loadSession()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Logout failed'); }
    finally { setLogoutBusy(false); }
  }
  if (!session) return <main className="mx-auto max-w-md px-6 py-16">{error ? <><p role="alert">{error}</p><button className="button mt-4" onClick={() => window.location.reload()}>Retry</button></> : <p role="status">Checking admin session…</p>}</main>;
  if (!session.authenticated) return <Login session={session} onLogin={loggedIn} />;
 const view=window.location.pathname.split('/')[2]??'';
 const navigation=[['','Overview','grid'],['analytics','Analytics','chart'],['newsletters','Newsletters','mail'],['campaigns','Campaigns','send'],['automations','Email sequences','sequence'],['leads','Leads & tags','users'],['segments','Segments','filter'],['lead-pages','Lead pages','file'],['content','Website content','globe'],['video-promotions','Video promotions','file'],['health','Health','heart'],['downloads','Downloads','file'],['uploads','Media library','image'],['settings','Settings','settings']];
 const label=view==='logs'?'Activity & delivery logs':navigation.find(([key])=>key===view)?.[1]??'Overview';
 return <div className="admin-workspace"><Metadata title={`${label} | Owner workspace`} description="Private owner workspace" noindex/>{menu&&<button className="admin-nav-scrim" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}<aside id="admin-sidebar" className={`admin-sidebar ${menu?'is-open':''}`}><a href="/admin" className="workspace-brand"><BrandMark/><span>Affiliate Engine<small>Owner workspace</small></span></a><p className="sidebar-section">Manage your engine</p><nav aria-label="Admin navigation" className="workspace-navigation">{navigation.map(([key,text,icon])=><a key={key} href={`/admin${key?`/${key}`:''}`} aria-current={view===key?'page':undefined}><Icon name={icon!}/><span>{text}</span></a>)}<a href="/admin/logs" aria-current={view==='logs'?'page':undefined}><Icon name="chart"/><span>Activity & delivery logs</span></a></nav><div className="sidebar-bottom"><a href="/"><Icon name="external" width="16" height="16"/>View public website<Icon name="arrow" width="15" height="15"/></a><p className="sidebar-note"><Icon name="lock" width="12" height="12"/>Single-owner workspace</p></div></aside><div className="admin-body"><header className="admin-topbar"><div className="flex items-center gap-3"><button className="admin-mobile-toggle" aria-label="Toggle admin navigation" aria-expanded={menu} aria-controls="admin-sidebar" onClick={()=>setMenu(!menu)}><Icon name="menu"/></button><div className="admin-breadcrumb"><span>Workspace</span><Icon name="chevron" width="13" height="13"/><strong>{label}</strong></div></div><div className="admin-user"><HeaderNotifications/><details className="record-menu admin-create"><summary className="button-secondary">+ Create</summary><div><a href="/admin/lead-pages?create=1">Lead page</a><a href="/admin/newsletters">Newsletter</a><a href="/admin/campaigns">Campaign</a><a href="/admin/automations">Email sequence</a></div></details><a className="admin-public-preview" href="/" target="_blank" rel="noopener"><Icon name="external" width="15" height="15"/>View website</a><span className="admin-user-avatar" aria-hidden="true">{session.admin?.email.slice(0,1).toUpperCase()}</span><span className="admin-user-email">{session.admin?.email}</span><button className="button-secondary" disabled={logoutBusy} onClick={()=>void logout()}><Icon name="logout" width="14" height="14"/>Log out</button></div></header><main className="admin-main">{['campaigns','newsletters','automations','lead-pages'].includes(view)&&<EmailControl compact/>}{error&&<p role="alert" className="mb-5 text-red-700">{error}</p>}{view==='video-promotions'?<VideoPromotions/>:view==='health'?<Health/>:view==='logs'?<Logs/>:view==='content'?<WebsiteContent/>:view==='downloads'?<Downloads/>:view==='uploads'?<Uploads/>:view==='leads'?<Leads/>:view==='newsletters'?<Newsletters/>:view==='segments'?<Segments/>:view==='campaigns'?<Campaigns/>:view==='lead-pages'?<Suspense fallback={<p role="status" className="preview-loading">Loading lead studio…</p>}><LeadPages/></Suspense>:view==='automations'?<Automations/>:view==='settings'?<Settings onSession={setSession}/>:<Dashboard detailed={view==='analytics'}/>}</main></div></div>;
}
