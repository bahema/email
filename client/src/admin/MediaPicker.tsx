import {useEffect,useState} from 'react';
import type {MediaAsset} from '@affiliate/shared';
import {api} from './api';
import {Modal} from '../ui/Modal';
import {MediaLibrary} from './MediaLibrary';
export function MediaPicker({kind='image',visibility='public',select,close}:{kind?:'image'|'video'|'any';visibility?:'public'|'private';select:(asset:MediaAsset)=>void;close:()=>void}){return <Modal labelledBy="media-picker-title" close={close} className="asset-dialog"><header className="asset-dialog-header"><div><p className="workspace-eyebrow">Reusable media library</p><h2 id="media-picker-title">Choose {kind==='any'?'a file':kind==='image'?'an image':'a video'}</h2></div><button type="button" className="button-secondary" onClick={close}>Close</button></header><MediaLibrary kind={kind} visibility={visibility} select={asset=>{select(asset);close();}}/></Modal>;}
export function MediaField({label,value,onChange,kind='image',visibility='public'}:{label:string;value:number|null;onChange:(id:number|null,asset?:MediaAsset)=>void;kind?:'image'|'video'|'any';visibility?:'public'|'private'}){
 const [open,setOpen]=useState(false),[asset,setAsset]=useState<MediaAsset|null>(null);
 useEffect(()=>{let alive=true;if(!value){setAsset(null);return;}void api<MediaAsset>(`/api/admin/media/${value}/details`).then(a=>{if(alive)setAsset(a);}).catch(()=>{});return()=>{alive=false;};},[value]);
 return <div className="media-field"><strong>{label}</strong>{asset&&<div className="media-field-selected">{asset.mime.startsWith('image/')&&<img src={asset.url} alt=""/>}<span>{asset.filename}</span></div>}<div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" onClick={()=>setOpen(true)}>{value?'Replace':'Choose / upload'}</button>{value&&<button type="button" className="text-link" onClick={()=>onChange(null)}>Remove</button>}</div>{open&&<MediaPicker kind={kind} visibility={visibility} close={()=>setOpen(false)} select={a=>{setAsset(a);onChange(a.id,a);}}/>}</div>;
}

export function MediaUrlButton({select}:{select:(url:string)=>void}){const [open,setOpen]=useState(false);return <><button type="button" className="button-secondary" onClick={()=>setOpen(true)}>Choose / upload image</button>{open&&<MediaPicker close={()=>setOpen(false)} select={a=>select(a.url)}/>}</>;}
