import React from 'react';
import {useContext,useEffect,useState} from 'react';
import {BootstrapContext,readBootstrap,type PublicBootstrap} from './bootstrap';
export function ActivityTicker(){const bootstrap=useContext(BootstrapContext);const [feed,setFeed]=useState<PublicBootstrap['activity']|null>(()=>bootstrap?.activity||readBootstrap()?.activity||null),[index,setIndex]=useState(0),[paused,setPaused]=useState(false),[reduced,setReduced]=useState(false);
 useEffect(()=>{let alive=true;const load=()=>{if(document.hidden)return;void fetch('/api/public/activity').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(f=>{if(alive)setFeed(f);}).catch(()=>{});};const timer=setInterval(load,60000);return()=>{alive=false;clearInterval(timer);};},[]);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(media.matches);change();media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 useEffect(()=>{if(paused||reduced||!feed||feed.messages.length<2)return;const timer=setInterval(()=>setIndex(n=>n+1),feed.intervalSeconds*1000);return()=>clearInterval(timer);},[feed,paused,reduced]);
 if(!feed?.enabled||!feed.messages.length)return null;
 return <div className="nav-activity" aria-label="Recorded site activity" onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)}><span className="nav-activity-dot" aria-hidden="true"/><span title="Subscriber countries are self-reported; messages use aggregated backend records.">{feed.messages[index%feed.messages.length]?.text}</span>{feed.messages.length>1&&<button type="button" aria-label={paused?'Resume activity rotation':'Pause activity rotation'} onClick={()=>setPaused(p=>!p)}>{paused?'Play':'Pause'}</button>}</div>;}
