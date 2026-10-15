import { useEffect,useState,useId } from 'react';
import type { CountryOption,SegmentRule } from '@affiliate/shared';
import { api } from './api';
import { Modal } from '../ui/Modal';
export const continents=['Africa','Asia','Europe','North America','South America','Oceania'];
export function GeographyValue({rule,change}:{rule:SegmentRule;change:(rule:SegmentRule)=>void}){
 const group=useId();
 const [countries,setCountries]=useState<CountryOption[]>([]),[search,setSearch]=useState('');
 useEffect(()=>{if(rule.field==='country')void api<CountryOption[]>('/api/public/countries').then(setCountries).catch(()=>{});},[rule.field]);
 const options=rule.field==='continent'?continents.map(c=>({code:c,name:c})):countries;
 const selected=rule.value?rule.value.split('|'):[];
 return <div className="space-y-2"><label className="field">Search {rule.field}<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name"/></label><p className="field-help">{selected.length?selected.map(v=>options.find(o=>o.code===v)?.name??v).join(', '):'Nothing selected'}</p><div className="geography-options">{options.filter(o=>(o.name+' '+o.code).toLowerCase().includes(search.toLowerCase())).map(o=><label key={o.code}><input type={rule.operator==='in'?'checkbox':'radio'} name={group} checked={selected.includes(o.code)} onChange={e=>change({...rule,value:rule.operator==='in'?(e.target.checked?[...selected,o.code]:selected.filter(v=>v!==o.code)).join('|'):o.code})}/>{o.name}</label>)}</div></div>;
}
export function SearchPicker({title,items,value,change,emptyMessage='No items are available.'}:{title:string;items:{id:number;label:string;description?:string}[];value:number;change:(id:number)=>void;emptyMessage?:string}){
 const [open,setOpen]=useState(false),[search,setSearch]=useState(''),headingId=useId();
 const matches=items.filter(i=>(i.label+' '+(i.description??'')).toLowerCase().includes(search.trim().toLowerCase()));
 return <div className="media-field"><strong>{title}</strong><span>{items.find(i=>i.id===value)?.label??'Nothing selected'}</span><button type="button" className="button-secondary" onClick={()=>{setSearch('');setOpen(true);}}>Choose / change</button>{open&&<Modal labelledBy={headingId} close={()=>setOpen(false)} className="email-tool-dialog"><h2 id={headingId}>{title}</h2><label className="field">Search<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name"/></label><p className="field-help" role="status">{!items.length?emptyMessage:!matches.length?'No matching items. Try another name.':`${matches.length} ${matches.length===1?'item':'items'} available`}</p><div className="selection-list">{matches.map(i=><button type="button" key={i.id} aria-pressed={i.id===value} onClick={()=>{change(i.id);setOpen(false);}}><strong>{i.label}</strong>{i.description&&<p className="field-help">{i.description}</p>}</button>)}</div><button type="button" className="button-secondary" onClick={()=>setOpen(false)}>Close</button></Modal>}</div>;
}
export function audienceDescription(rules:SegmentRule[],mode:string){return rules.map(r=>`${r.field.replaceAll('_',' ')} ${r.operator==='in'?'in':r.operator==='eq'?'is':r.operator==='neq'?'is not':r.operator} ${r.value.split('|').join(', ')||'…'}`).join(mode==='or'?' OR ':' AND ');}
