import {socialShareLinks} from './socialShareLinks';
import {ShareStudio} from './ShareStudio';
import {BootstrapContext} from '../public/bootstrap';
import React, { useContext, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
export function ShareTools({title,path,affiliate=false}:{title:string;path:string;affiliate?:boolean}){
 const [studio,setStudio]=useState(false);
 const [open,setOpen]=useState(false),[message,setMessage]=useState('');
 const menuId=useId(),menu=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 function toggleMenu(){const node=menu.current,button=trigger.current;if(!node||!button)return;const rect=button.getBoundingClientRect(),width=Math.min(280,window.innerWidth-24);node.style.width=width+'px';node.style.left=Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12))+'px';const below=window.innerHeight-rect.bottom;node.style.top=below>=280?rect.bottom+8+'px':'auto';node.style.bottom=below>=280?'auto':Math.max(12,window.innerHeight-rect.top+8)+'px';node.togglePopover();}
 const bootstrap=useContext(BootstrapContext);
 const url=new URL(path,bootstrap?.publicOrigin||(typeof window==='undefined'?'http://localhost':window.location.origin));url.search='';url.hash='';
 const text=affiliate?`${title}. This page contains affiliate links; the owner may earn a commission.`:title;
 async function copy(){try{await navigator.clipboard.writeText(url.href);setMessage('Link copied');}catch{setMessage('Copy this link: '+url.href);}}
 async function share(){setStudio(true);}

 return <div className="share-tools"><button type="button" className="button-secondary share-trigger" onClick={()=>void share()} aria-label={`Share ${title}`}><Icon name="external" width="15" height="15"/>Share</button><button ref={trigger} type="button" className="share-more" aria-controls={menuId} aria-expanded={open} aria-label="More sharing options" onClick={toggleMenu}>⋯</button><div ref={menu} id={menuId} popover="auto" onToggle={e=>setOpen((e.nativeEvent as ToggleEvent).newState==='open')} className="share-links"><button type="button" onClick={()=>{menu.current?.hidePopover();setStudio(true);}}>Images &amp; more platforms</button><button type="button" onClick={()=>void copy()}>Copy link</button>{socialShareLinks({title,url:url.href,caption:text+'\n'+url.href,affiliate}).map(([label,href])=><a key={label} target={label==='Email'?undefined:'_blank'} rel="noopener noreferrer" href={href}>{label}</a>)}</div>{message&&<p className="share-feedback" role="status">{message}</p>}{studio&&<ShareStudio affiliate={affiliate} title={title} url={url.href} caption={text+'\n'+url.href} close={()=>setStudio(false)}/>}</div>;
}
