import React,{useEffect,useRef,useState} from 'react';
import type { ContentItem } from '@affiliate/shared';
function PartnerLogo({item}:{item:ContentItem}){
 const [failedId,setFailedId]=useState<number|null>(null),id=typeof item.data.logoId==='number'?item.data.logoId:null,name=String(item.data.name||item.title);
 return <>{id&&failedId!==id?<img src={`/media/${id}`} alt="" width={200} height={200} loading="lazy" onError={()=>setFailedId(id)}/>:<span className="partner-wordmark">{name}</span>}<span className="partner-caption">{name}{item.data.industry?<small>{String(item.data.industry)}</small>:null}</span></>;
}
export function PartnerSlider({partners,preview=false}:{partners:ContentItem[];preview?:boolean}){
 const [paused,setPaused]=useState(preview),[overflow,setOverflow]=useState(false),viewport=useRef<HTMLDivElement>(null),original=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const windowEl=viewport.current,groupEl=original.current;if(!windowEl||!groupEl)return;
  function measure(){
   if(!windowEl||!groupEl)return;
   const groupStyle=getComputedStyle(groupEl),windowStyle=getComputedStyle(windowEl),cards=Array.from(groupEl.children) as HTMLElement[];
   const total=cards.reduce((sum,card)=>sum+card.offsetWidth,0)+Math.max(0,cards.length-1)*parseFloat(groupStyle.columnGap||'0');
   const available=windowEl.clientWidth-parseFloat(windowStyle.paddingLeft)-parseFloat(windowStyle.paddingRight);
   setOverflow(cards.length>1&&total>available+1);
  }
  measure();const observer=new ResizeObserver(measure);observer.observe(windowEl);observer.observe(groupEl);return()=>observer.disconnect();
 },[partners]);
 if(!partners.length)return null;
 function group(duplicate:boolean){return <div ref={duplicate?undefined:original} className={`partner-loop-group ${duplicate?'partner-loop-duplicate':''}`} aria-hidden={duplicate?true:undefined}>{partners.map(item=>{const name=String(item.data.name||item.title),url=String(item.data.url||'');return <div className="partner-tile" key={item.id}>{!preview&&url?<a href={url} tabIndex={duplicate?-1:0} aria-label={`Visit ${name}`} title={name}><PartnerLogo item={item}/></a>:<div aria-label={name} title={name}><PartnerLogo item={item}/></div>}</div>;})}</div>;}
 return <section id={preview?undefined:'partners'} className={`partner-showcase ${overflow?'is-scrolling':'is-static'} ${paused?'is-paused':''}`} aria-label="Partners and websites"><div className="partner-showcase-heading"><div><p className="eyebrow">Our network</p><h2>Partners & websites</h2><p>Explore the organizations and websites listed by our team.</p></div>{overflow&&<button className="partner-pause" type="button" aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?'Play logo slider':'Pause logo slider'}</button>}</div><div ref={viewport} className="partner-loop-window" onFocusCapture={()=>setPaused(true)}><div className="partner-loop-track" style={{animationDuration:`${Math.max(32,partners.length*5)}s`}}>{group(false)}{overflow&&group(true)}</div></div>{partners.some(item=>item.data.url)&&<p className="partner-showcase-hint">Select a logo to visit its website.</p>}</section>;
}
