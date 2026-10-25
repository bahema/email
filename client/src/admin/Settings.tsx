import {ProviderPicker} from './ProviderPicker';
import {DeliverySettings} from './DeliverySettings';
import {DnsReadiness} from './DnsReadiness';
import {EmailControl,SettingsPreview} from './EmailControl';
import { MediaUrlButton } from './MediaPicker';
import { useEffect, useState, type FormEvent } from 'react';
import type { SessionResponse, SettingsResponse, SettingsSection } from '@affiliate/shared';
import { api } from './api';
import { Security, System } from './Security';

type InputType = 'text' | 'email' | 'url' | 'number' | 'checkbox' | 'textarea' | 'select';
interface Field { placeholder?:string; key: string; label: string; type?: InputType; required?: boolean; options?: [string, string][]; help?: string; min?: number; max?: number; }
const sections: { id: SettingsSection | 'security' | 'system' | 'delivery'; label: string }[] = [
  {id:'delivery',label:'Delivery controls & feedback'}, { id: 'general', label: 'General' }, { id: 'smtp', label: 'Sender / SMTP' }, { id: 'emailDefaults', label: 'Email branding / footer' },
  {id:'activity',label:'Public activity slider'}, { id: 'tracking', label: 'Tracking' }, { id: 'domains', label: 'Domains / URLs' }, { id: 'compliance', label: 'Compliance' },
  { id: 'affiliate', label: 'Affiliate' }, { id: 'uploads', label: 'Uploads' }, { id: 'security', label: 'Security' }, { id: 'system', label: 'System' },
];
const fields: Record<SettingsSection, Field[]> = {
  activity:[{key:'enabled',label:'Show backend activity beside the logo',type:'checkbox'},{key:'showLocations',label:'Show aggregated subscriber countries',type:'checkbox',help:'Countries are supplied by subscribers, not inferred visitor locations. Small groups are hidden.'},{key:'days',label:'Activity window (days)',type:'number',min:1,max:90},{key:'intervalSeconds',label:'Rotation interval (seconds)',type:'number',min:5,max:30}],
  general: [
    {key:'seoTitle',label:'Homepage search title',max:120,help:'Optional stable homepage title. Leave empty to use the active hero headline.'},
    {key:'seoDescription',label:'Homepage search description',type:'textarea',max:200,help:'Describe the real published resources and audience. Avoid keyword lists or unsupported claims.'},
    {key:'googleSiteVerification',label:'Google Search Console verification token',max:200,help:'Paste only the content value from the HTML tag verification method, not the full tag. DNS verification can also be used.'},
    { key: 'siteName', label: 'Site name', required: true, max: 120 }, { key: 'siteUrl', label: 'Site URL', type: 'url', required: true },
    { key: 'adminEmail', label: 'Admin contact email', type: 'email', help: 'Contact address for the site. This does not change your login email.' },
    { key: 'timezone', label: 'Timezone', required: true, help: 'IANA name, for example Africa/Kigali.' },
    { key: 'logoUrl', label: 'Logo URL', type: 'url' }, { key: 'defaultSenderName', label: 'Default sender name', max: 120 },
  ],
  smtp: [
    { key: 'host', label: 'SMTP host', max: 253, placeholder:'smtp.gmail.com or your provider host' }, { key: 'port', label: 'SMTP port', type: 'number', required: true, min: 1, max: 65535 },
    { key: 'encryption', label: 'Encryption', type: 'select', options: [['starttls', 'STARTTLS (usually port 587)'], ['tls', 'TLS (usually port 465)'], ['none', 'None (local test server only)']] },
    { key: 'username', label: 'SMTP username', max: 254, help:'For Gmail, enter your complete Gmail address. Other providers may supply a different username.' }, { key: 'fromName', label: 'Sender name', max: 120 },
    { key: 'fromEmail', label: 'Sender email', type: 'email', help:'Use the mailbox or sender address authorized by your provider, for example worker@your-domain.com.' }, { key: 'replyTo', label: 'Reply-to email', type: 'email',help:'Replies go to this mailbox. It can differ from the sender; the site does not host an incoming inbox.' },
    {key:'maxPerHour',label:'Maximum automatic send attempts per hour',type:'number',required:true,min:1,max:100000,help:'Shared across confirmations, lead-page emails, sequences and campaigns. Leave headroom for manual tests and other apps using the mailbox. For a 500/hour plan, 450 provides headroom; trial plans may allow only 20/hour.'},
    {key:'maxPerMinute',label:'Maximum automatic send attempts per minute',type:'number',required:true,min:1,max:1000,help:'A shared rolling limit. Excess messages wait in the queue; failed attempts also consume allowance.'},
  ],
  emailDefaults: [
    {key:'headerBackground',label:'Confirmation email header background colour',required:true,max:7,placeholder:'#193f48',help:'Use a six-digit hex colour. Used by the system confirmation header only; text contrast adjusts automatically.'},
    {key:'websiteDescription',label:'About your website',type:'textarea',placeholder:'What visitors can expect from your website'}, {key:'address',label:'Public postal / business address',type:'textarea',placeholder:'Street, city, postal code, country'}, {key:'contactEmail',label:'Public contact email',type:'email',placeholder:'hello@your-website.com'}, {key:'contactPhone',label:'Public contact phone',placeholder:'+250 …'},
    { key: 'identity', label: 'Company / site identity', type: 'textarea' }, { key: 'footer', label: 'Default email footer', type: 'textarea', max: 10000 },
    { key: 'unsubscribeText', label: 'Unsubscribe link text', required: true, max: 500 }, { key: 'affiliateDisclosure', label: 'Default email affiliate disclosure', type: 'textarea', max: 5000 },
  ],
  tracking: [{key:'websiteVisits',label:'Count cookieless website visits',type:'checkbox',help:'Aggregate page views and daily network visitor estimates. No raw IPs, query strings or browser identifiers are stored. DNT and Global Privacy Control are respected.'},
    { key: 'opens', label: 'Enable email open tracking', type: 'checkbox', help: 'Open counts are approximate; email clients can block or preload images.' },
    { key: 'emailClicks', label: 'Enable email click tracking', type: 'checkbox' }, { key: 'affiliateClicks', label: 'Enable affiliate click tracking', type: 'checkbox' },
    { key: 'utm', label: 'Capture UTM acquisition parameters', type: 'checkbox' },
  ],
  domains: [{ key: 'publicUrl', label: 'Public link base URL', type: 'url', required: true, help: 'Base URL for public email links. Set SITE_URL in the server environment to change the trusted admin origin.' },{key:'dkimSelector',label:'DKIM selector for DNS checks',required:true,max:255,placeholder:'privateemail',help:'Use the selector supplied by your provider: privateemail for newer Namecheap plans, default for older plans. This saves checking preferences; it does not publish a DNS record.'}],
  compliance: [
    { key: 'doubleOptIn', label: 'Require email confirmation before marketing', type: 'checkbox' },
    { key: 'privacyUrl', label: 'Privacy page URL', type: 'url' }, { key: 'termsUrl', label: 'Terms page URL', type: 'url' },
    { key: 'affiliateDisclosureUrl', label: 'Affiliate disclosure page URL', type: 'url' },
    { key: 'consentText', label: 'Lead form consent text', type: 'textarea', required: true },
    { key: 'unsubscribeFooter', label: 'Unsubscribe footer text', type: 'textarea', required: true },
  ],
  affiliate: [{ key: 'disclosure', label: 'Website affiliate disclosure', type: 'textarea', max: 5000 }],
  uploads: [{ key: 'maxSizeMb', label: 'Maximum upload size (MB)', type: 'number', min: 1, max: 100, required: true }],
};
const extensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'pdf', 'txt', 'doc', 'docx', 'zip', 'mp4', 'webm'];

export function Settings({ onSession }: { onSession: (session: SessionResponse) => void }) {
  const [deliveryDirty,setDeliveryDirty]=useState(false);
  const [saved,setSaved]=useState<SettingsResponse|null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [section, setSection] = useState<SettingsSection | 'security' | 'system' | 'delivery'>(()=>sections.find(s=>s.id===location.hash.slice(1))?.id??'general');
  const [dirty, setDirty] = useState<Set<SettingsSection>>(new Set());
  const [password, setPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api<SettingsResponse>('/api/admin/settings').then(value => { if (alive) { setSettings(value); setSaved(value); setRecipient(value.general.adminEmail); } }).catch(failure => { if (alive) setError(failure instanceof Error ? failure.message : 'Settings unavailable'); });
    return () => { alive = false; };
  }, []);
  useEffect(()=>{const changed=()=>{const next=sections.find(s=>s.id===location.hash.slice(1));if(next)setSection(next.id);};window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[]);
  useEffect(()=>{if(!dirty.size)return;const leave=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[dirty]);
  function discard(){if(!saved||section==='security'||section==='system'||section==='delivery')return;setSettings(previous=>previous?{...previous,[section]:saved[section]}:saved);setDirty(previous=>{const next=new Set(previous);next.delete(section);return next;});setPassword('');setClearPassword(false);setError('');setMessage('Draft changes discarded.');}
  function mediaUrl(url:string){return new URL(url,settings?.domains.publicUrl||location.origin).href;}
  function update(key: string, value: unknown) {
    if (section === 'security' || section === 'system' || section === 'delivery') return;
    setSettings(previous => previous ? { ...previous, [section]: { ...previous[section], [key]: value } } : previous);
    setDirty(previous => new Set(previous).add(section)); setMessage('');setError('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings || section === 'security' || section === 'system' || section === 'delivery') return;
    setBusy(true); setError(''); setMessage('');
    let payload: unknown = settings[section];
    if (section === 'smtp') {
      const { passwordSet: _hasPassword, ...smtp } = settings.smtp;
      payload = { ...smtp, ...(password ? { password } : {}), ...(clearPassword ? { clearPassword: true } : {}) };
    }
    try {
      const result = await api<SettingsResponse>(`/api/admin/settings/${section}`, 'PUT', payload);
      setSettings(previous => previous ? { ...previous, [section]: result[section] } : result);
      setSaved(result);window.dispatchEvent(new Event('settings-saved'));
      setDirty(previous => { const next = new Set(previous); next.delete(section); return next; });
      if (section === 'smtp') { setPassword(''); setClearPassword(false); }
      setMessage('Settings saved.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Save failed'); }
    finally { setBusy(false); }
  }
  async function smtpTest(mode: 'verify' | 'test') {
    setBusy(true); setError(''); setMessage('');
    try { const result = await api<{ message: string }>(`/api/admin/smtp/${mode}`, 'POST', mode === 'test' ? { recipient } : {}); setMessage(result.message);window.dispatchEvent(new Event('settings-saved')); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'SMTP test failed'); }
    finally { setBusy(false); }
  }
  function field(definition: Field, current: SettingsSection) {
    const value = (settings![current] as unknown as Record<string, unknown>)[definition.key];
    if(definition.key==='logoUrl')return <div key={definition.key} className="space-y-3"><label className="field">Logo URL<input type="url" value={String(value??'')} onChange={e=>update('logoUrl',e.target.value)}/></label><MediaUrlButton select={url=>update('logoUrl',mediaUrl(url))}/></div>;
    const id = `${current}-${definition.key}`;
    const fieldError=error.split('; ').find(message=>message.startsWith(definition.key+':'));
    if (definition.type === 'checkbox') return <div key={id}><label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={Boolean(value)} onChange={e => update(definition.key, e.target.checked)} />{definition.label}</label>{fieldError&&<p id={id+'-error'} className="text-sm text-red-700">{fieldError}</p>}{definition.help && <p className="mt-1 text-sm text-slate-500">{definition.help}</p>}</div>;
    const common = { id, 'aria-invalid':!!fieldError, 'aria-describedby':fieldError?id+'-error':undefined, placeholder:definition.placeholder, required: definition.required, value: String(value ?? ''), onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => update(definition.key, definition.type === 'number' ? Number(event.target.value) : event.target.value) };
    return <div key={id}><label className="field" htmlFor={id}>{definition.label}
      {definition.type === 'textarea' ? <textarea {...common} rows={4} maxLength={definition.max ?? 2000} /> : definition.type === 'select' ? <select {...common}>{definition.options!.map(([option, label]) => <option key={option} value={option}>{label}</option>)}</select> : <input {...common} type={definition.type ?? 'text'} min={definition.min} max={definition.max} maxLength={definition.max ?? 2000} />}
    </label>{fieldError&&<p id={id+'-error'} className="text-sm text-red-700">{fieldError}</p>}{definition.help && <p className="mt-1 text-sm text-slate-500">{definition.help}</p>}</div>;
  }
  return <div>
    <h1 className="text-3xl font-bold">Email & website settings</h1><p className="mt-2 mb-5 text-slate-600">Configure your sender, subscriber journey and shared branding.</p><EmailControl/><div className={'settings-workspace'+(section==='delivery'?' is-delivery':'')}>
    <nav aria-label="Settings sections" className="settings-navigation">{sections.map(item => <button key={item.id} type="button" disabled={busy||(deliveryDirty&&item.id!==section)} aria-current={section === item.id ? 'page' : undefined} className={`rounded-lg border px-3 py-2 text-sm ${section === item.id ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white hover:bg-slate-100'}`} onClick={() => { setSection(item.id);window.history.replaceState(null,'','#'+item.id); setMessage(''); setError(''); }}>{item.label}{dirty.has(item.id as SettingsSection) ? ' •' : ''}</button>)}</nav>
    <div className="panel settings-editor">
      {section === 'delivery' ? <DeliverySettings onDirtyChange={setDeliveryDirty}/> : section === 'security' ? <Security onSession={onSession} /> : section === 'system' ? <System /> : !settings ? <p role="status">Loading settings…</p> : <>
        {section==='smtp'&&<ProviderPicker disabled={busy||dirty.has('smtp')} onDirtyChange={setDeliveryDirty}/>}
        <form className="space-y-5" onSubmit={save}>
          <h2 className="text-xl font-semibold">{sections.find(item => item.id === section)?.label}</h2>
          {section==='smtp'&&<div className="settings-link-examples"><strong>Gmail now, business email later</strong><p className="field-help">For Gmail use smtp.gmail.com, port 587 with STARTTLS (or port 465 with TLS), your full Gmail address as username and sender, and a Google app password. Enable 2-Step Verification first. <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer">Google app password instructions</a></p><p className="field-help">This engine supports SMTP username/password authentication; OAuth-only providers require an additional integration. When you change providers, replace the credentials and sender, save, then run both tests. Existing contacts, newsletters and sequences remain saved. Test results become stale when the SMTP configuration changes.</p></div>}
          {section==='compliance'&&<p className="field-help">This is the global subscription default. Lead pages can explicitly choose confirmation or consent-based immediate delivery. Existing acquired journeys retain their captured settings. Unsubscribed and suppressed contacts remain protected. <a href="/admin/lead-pages">Review page overrides</a></p>}
          {(section==='domains'||section==='smtp')&&<DnsReadiness disabled={dirty.has('smtp')||dirty.has('domains')}/>}{section==='domains'&&<div className="settings-link-examples"><strong>Draft public link examples</strong>{['/confirm/demo-preview','/unsubscribe/demo-preview','/media/123','/email/click/demo-preview/0'].map(path=><code key={path}>{settings.domains.publicUrl.replace(/\/$/,'')+path}</code>)}<p className="field-help">Examples only. Availability and DNS authentication are not verified. Localhost links work only on this computer. After deployment set the public HTTPS origin here and review policy and image URLs. New links use the saved origin; already sent emails and acquired funnel origins retain their original URLs. Keep old public domains available when moving domains. Set SITE_URL in the server environment and restart to change the trusted admin origin. DNS records and SSL certificates are configured with your hosting and email providers.</p></div>}
          {section==='tracking'&&<p className="field-help">These defaults feed campaign analytics and acquisition reports. Open counts are estimates. Website cookie preferences and email tracking are separate controls.</p>}
          <fieldset disabled={busy} className="settings-fields">
            {fields[section].map(definition => field(definition, section))}
            {section === 'smtp' && <>
              <label className="field">SMTP password / app password<input autoComplete="new-password" type="password" maxLength={1024} value={password} disabled={clearPassword} onChange={e => { setPassword(e.target.value); setDirty(previous => new Set(previous).add('smtp')); }} /><span className="text-sm font-normal text-slate-500">{settings.smtp.passwordSet ? 'A password is stored. Leave blank to keep it.' : 'No password stored.'}</span></label>
              {settings.smtp.passwordSet && <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={clearPassword} onChange={e => { setClearPassword(e.target.checked); setPassword(''); setDirty(previous => new Set(previous).add('smtp')); }} />Clear the saved SMTP password</label>}
            </>}
            {section==='emailDefaults'&&<div className="email-social-settings"><h3 className="font-semibold">Social accounts and icon images</h3><p className="field-help">Only profiles with a link appear in email footers. Use public uploaded images for icons; text labels remain visible when images are blocked.</p>{(settings.emailDefaults.socialLinks??[]).map((social,index)=><div className="email-social-setting" key={index}><div className="grid gap-3 sm:grid-cols-2"><label className="field">Platform / label<input required maxLength={60} value={social.platform} placeholder="YouTube, Facebook, Instagram, Meta Suite…" onChange={e=>update('socialLinks',(settings.emailDefaults.socialLinks??[]).map((s,i)=>i===index?{...s,platform:e.target.value}:s))}/></label><label className="field">Your account URL<input type="url" value={social.url} placeholder={'https://'+(social.platform.toLowerCase().includes('youtube')?'youtube.com/@yourchannel':social.platform.toLowerCase().includes('instagram')?'instagram.com/youraccount':'your-social-site.com/youraccount')} onChange={e=>update('socialLinks',(settings.emailDefaults.socialLinks??[]).map((s,i)=>i===index?{...s,url:e.target.value}:s))}/></label></div><label className="field">Public icon image URL<input type="url" value={social.iconUrl} placeholder="https://your-website.com/media/123" onChange={e=>update('socialLinks',(settings.emailDefaults.socialLinks??[]).map((s,i)=>i===index?{...s,iconUrl:e.target.value}:s))}/></label><div className="flex flex-wrap gap-3 items-center">{social.iconUrl&&<img src={social.iconUrl} alt={social.platform+' icon preview'} width="32" height="32"/>}<MediaUrlButton select={url=>update('socialLinks',(settings.emailDefaults.socialLinks??[]).map((s,i)=>i===index?{...s,iconUrl:mediaUrl(url)}:s))}/><button type="button" className="text-link" onClick={()=>update('socialLinks',(settings.emailDefaults.socialLinks??[]).filter((_,i)=>i!==index))}>Remove profile</button></div></div>)}<div className="flex flex-wrap gap-2">{['YouTube','Facebook','Instagram','Meta Suite','LinkedIn','Custom'].map(platform=><button type="button" key={platform} className="button-secondary" disabled={(settings.emailDefaults.socialLinks??[]).length>=20} onClick={()=>update('socialLinks',[...(settings.emailDefaults.socialLinks??[]),{platform,url:'',iconUrl:''}])}>+ {platform}</button>)}</div></div>}
            {section === 'uploads' && <fieldset><legend className="mb-3 text-sm font-medium">Allowed file extensions</legend><div className="flex flex-wrap gap-4">{extensions.map(extension => <label key={extension} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.uploads.allowedExtensions.includes(extension)} onChange={e => update('allowedExtensions', e.target.checked ? [...settings.uploads.allowedExtensions, extension] : settings.uploads.allowedExtensions.filter(value => value !== extension))} />.{extension}</label>)}</div></fieldset>}
          </fieldset>
          <div className="settings-savebar"><button className="button" disabled={busy||!dirty.has(section)}>{busy ? 'Working…' : 'Save settings'}</button>{dirty.has(section)&&<button type="button" className="button-secondary" disabled={busy} onClick={discard}>Discard changes</button>}{dirty.has(section) && <span className="text-sm text-slate-500">Unsaved changes</span>}</div>
        </form>
        {section === 'smtp' && <section className="mt-8 border-t border-slate-200 pt-6">
          <h3 className="font-semibold">Test saved sending settings</h3>
          {dirty.has('smtp') && <p className="mt-2 text-sm text-slate-600">Save sender changes before testing.</p>}
          <button type="button" className="button-secondary mt-4" disabled={busy || deliveryDirty || dirty.has('smtp')} onClick={() => void smtpTest('verify')}>Test connection</button>
          <form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); void smtpTest('test'); }}><label className="field">Test recipient<input required type="email" maxLength={254} value={recipient} onChange={e => setRecipient(e.target.value)} /></label><button className="button-secondary" disabled={busy || dirty.has('smtp')}>Send test email</button></form>
        </section>}
      </>}
      {message && <p role="status" className="mt-5 text-sm text-teal-700">{message}</p>}
      {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}
    </div>{settings&&section!=='security'&&section!=='system'&&section!=='delivery'&&<SettingsPreview settings={settings}/>}</div>
  </div>;
}
