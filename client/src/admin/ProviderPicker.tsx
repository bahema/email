import React,{useCallback,useEffect,useState} from 'react';
import {Modal} from '../ui/Modal';
import {api} from './api';
import {DeliverySettings} from './DeliverySettings';

type Transport='smtp'|'mailgun';
export function ProviderPicker({disabled=false,onDirtyChange}:{disabled?:boolean;onDirtyChange?:(dirty:boolean)=>void}){
 const [active,setActive]=useState<Transport|null>(null),[editing,setEditing]=useState<Transport|null>(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const changed=useCallback((value:boolean)=>{setDirty(value);onDirtyChange?.(value);},[onDirtyChange]);
 useEffect(()=>{let alive=true;const refresh=()=>{void api<{config:{transport:Transport}}>('/api/admin/email-delivery/status').then(r=>{if(alive){setActive(r.config.transport);setError('');}}).catch(()=>{if(alive)setError('Provider status could not be loaded. Reload settings before switching.');});};refresh();window.addEventListener('settings-saved',refresh);return()=>{alive=false;window.removeEventListener('settings-saved',refresh);};},[]);
 function close(){if(dirty||busy)return;setEditing(null);changed(false);}
 return <section className="email-provider-picker" aria-labelledby="email-provider-title">
  <h2 id="email-provider-title">Choose your sending provider</h2>
  <p role="status">Saved provider: {active==='smtp'?'Private Email / SMTP':active==='mailgun'?'Mailgun API':'Loading…'}</p>
  <div className="flex flex-wrap gap-3" role="group" aria-label="Email provider setup">
   {(['smtp','mailgun'] as const).map(transport=><button key={transport} type="button" className={active===transport?'button':'button-secondary'} aria-pressed={active===transport} disabled={disabled||!active||!!error} onClick={()=>setEditing(transport)}>{transport==='smtp'?'Private Email / SMTP':'Mailgun API'} · {active===transport?'Active · configure':'Set up / switch'}</button>)}
  </div>
  <p className="field-help">Save sender edits below before opening setup. Opening an option does not switch providers; save delivery settings to apply it. Both saved configurations are retained. Sender, Reply-To and limits below apply to the active provider.</p>
  {error&&<p role="alert">{error}</p>}
  {editing&&<Modal labelledBy="provider-setup-title" className="email-provider-dialog" close={close}>
   <header className="dialog-heading"><h2 id="provider-setup-title">{editing==='mailgun'?'Mailgun API setup':'Private Email / SMTP selection'}</h2><button type="button" className="button-secondary" disabled={dirty||busy} onClick={close}>Close</button></header>
   <p className="field-help">Save or discard changes before closing. Saved secrets are never loaded into these inputs. SMTP mailbox credentials remain in the sender form behind this dialog.</p>
   <DeliverySettings preferredTransport={editing} onDirtyChange={changed} onBusyChange={setBusy}/>
  </Modal>}
 </section>;
}
