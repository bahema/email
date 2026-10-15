import React from 'react';
import { useEffect } from 'react';
interface PageMeta {title:string;description:string;image:string;imageAlt:string;imageWidth?:number;imageHeight?:number;imageType?:string;canonical:string;noindex:boolean;siteName:string;locale:string;themeColor:string;structuredData:Record<string,unknown>|null;}
export function Metadata({title,description,image,path,noindex=false}:{title:string;description:string;image?:string;path?:string;noindex?:boolean}){
 useEffect(()=>{
  const abort=new AbortController();
  const update=(key:string,value:string,property=false)=>{let el=document.head.querySelector<HTMLMetaElement>(`meta[${property?'property':'name'}="${key}"]`);if(!value){el?.remove();return;}if(!el){el=document.createElement('meta');el.setAttribute(property?'property':'name',key);document.head.append(el);}el.content=value;};
  const canonical=(href:string)=>{let link=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(!link){link=document.createElement('link');link.rel='canonical';document.head.append(link);}link.href=href;};
  const apply=(m:PageMeta)=>{document.title=m.title;canonical(m.canonical);update('description',m.description.slice(0,200));update('robots',m.noindex?'noindex, nofollow':'index, follow');update('application-name',m.siteName);update('theme-color',m.themeColor);update('color-scheme','light');
   for(const [key,value] of Object.entries({'og:title':m.title,'og:description':m.description.slice(0,200),'og:url':m.canonical,'og:type':'website','og:site_name':m.siteName,'og:locale':m.locale,'og:image':m.image,'og:image:alt':m.imageAlt,'og:image:secure_url':m.image.startsWith('https:')?m.image:'','og:image:width':m.imageWidth?String(m.imageWidth):'','og:image:height':m.imageHeight?String(m.imageHeight):'','og:image:type':m.imageType||''}))update(key,value,true);
   update('twitter:card',m.image?'summary_large_image':'summary');update('twitter:title',m.title);update('twitter:description',m.description.slice(0,200));update('twitter:image',m.image);update('twitter:image:alt',m.imageAlt);
   let script=document.getElementById('page-structured-data');if(!m.structuredData){script?.remove();}else{if(!script){script=document.createElement('script');script.id='page-structured-data';script.setAttribute('type','application/ld+json');document.head.append(script);}script.textContent=JSON.stringify(m.structuredData);}
  };
  apply({title,description,image:new URL(image||'/brand/33-items-logo.jpg',location.origin).href,imageAlt:title,canonical:new URL(noindex?'/':path??location.pathname,location.origin).href,noindex,siteName:document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')||'',locale:'en_US',themeColor:'#163f46',structuredData:null});
  fetch('/api/public/page-metadata?path='+encodeURIComponent(path??location.pathname),{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('Metadata unavailable');return r.json() as Promise<PageMeta>;}).then(m=>{if(!abort.signal.aborted)apply({...m,noindex:noindex||m.noindex,structuredData:noindex?null:m.structuredData,canonical:noindex?new URL('/',m.canonical).href:m.canonical});}).catch(()=>{});
  return()=>abort.abort();
 },[title,description,image,path,noindex]);return null;
}
