import React,{useEffect,useRef,useState} from 'react';
import {promotionLive,type VideoPromotion} from '@affiliate/shared';
const seen=new Map<string,number>();
const storageKey='33items_promotion_notice';
export function noticeMatches(page:VideoPromotion,path:string,now=Date.now()){
 return promotionLive(page,now)&&page.notification.enabled&&/^\/(?:$|health(?:\/|$)|resources\/|categories\/|guides(?:\/|$)|collections(?:\/|$))/.test(path)&&page.notification.pages.some(p=>p===path||(p!=='/'&&path.startsWith(p.replace(/\/$/,'')+'/')));
}
export function noticeClock(delaySeconds:number,durationSeconds:number){let waited=0,remaining=durationSeconds*1000,shown=false,done=false;return{tick(delta:number,{blocked=false,paused=false,eligible=true}={}){if(!eligible)done=true;if(done||blocked)return{visible:false,first:false,done};if(!shown){waited+=delta;if(waited<delaySeconds*1000)return{visible:false,first:false,done};shown=true;return{visible:true,first:true,done};}if(!paused)remaining-=delta;if(remaining<=0)done=true;return{visible:!done,first:false,done};}};}
export function PromotionNotice({pages,path}:{pages:VideoPromotion[];path:string}){
 const [page,setPage]=useState<VideoPromotion|null>(null),[visible,setVisible]=useState(false),[closed,setClosed]=useState(false),paused=useRef(false);
 useEffect(()=>{try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'{}');for(const [key,value] of Object.entries(saved))if(typeof value==='number'&&Number.isFinite(value))seen.set(key,value);}catch{}const now=Date.now();setPage(pages.find(p=>noticeMatches(p,path,now)&&now-(seen.get(p.key)||0)>=p.notification.cooldownHours*3600000)||null);},[pages,path]);
 useEffect(()=>{
  if(!page||closed)return;const clock=noticeClock(page.notification.delaySeconds,page.notification.durationSeconds);let last=Date.now();
  const timer=window.setInterval(()=>{const now=Date.now(),delta=Math.min(now-last,1000);last=now;const blocked=document.hidden||!!document.querySelector('.storage-notice,dialog[open],[aria-modal="true"]');
   if(blocked)paused.current=false;const state=clock.tick(delta,{blocked,paused:paused.current,eligible:promotionLive(page,now)});
   if(state.first){seen.set(page.key,now);try{sessionStorage.setItem(storageKey,JSON.stringify(Object.fromEntries([...seen].slice(-40))));}catch{}}
   setVisible(state.visible);if(state.done)setClosed(true);
  },250);return()=>window.clearInterval(timer);
 },[page,closed]);
 if(!page||!visible||closed)return null;
 const notice=page.notification,imageId=notice.imageId||page.imageId;
 return <aside className={'promotion-notice side-'+notice.side} aria-label="Featured video promotion" onMouseEnter={()=>{paused.current=true;}} onMouseLeave={()=>{paused.current=false;}} onFocusCapture={()=>{paused.current=true;}} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))paused.current=false;}}>
  <button type="button" className="promotion-notice-close" aria-label="Dismiss video promotion" onClick={()=>{setClosed(true);setVisible(false);}}>×</button>
  {imageId&&<img src={'/media/'+imageId} alt="" width={72} height={72}/>}
  <div><p className="eyebrow">Featured promotion</p><p className="promotion-notice-title" role="status" aria-live="polite">{notice.title||page.title}</p><p className="promotion-notice-message">{notice.message||page.description}</p><a href={'/promotions/'+page.slug}>{notice.label} →</a></div>
 </aside>;
}
