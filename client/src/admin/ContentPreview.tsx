import { api } from './api';
import { useEffect,useState } from 'react';
import { PartnerSlider } from '../public/PartnerSlider';
import { TestimonialCard } from '../public/TestimonialCard';
import { ResourceView } from '../public/ResourceView';
import type { ContentItem,LeadPage,HeaderSlide } from '@affiliate/shared';
import { HeroHeader } from '../public/HeroHeader';
import { CatalogCard } from '../public/CatalogHome';
import { EditorialImage } from '../ui/EditorialImage';
export function ContentPreview({item,items=[],pages=[],consentText='I agree to receive emails.'}:{item:ContentItem;items?:ContentItem[];pages?:LeadPage[];consentText?:string}){
 const [view,setView]=useState('card');
 if(['offer','upcoming'].includes(item.kind))return <><div className="compact-tabs product-preview-tabs" role="group" aria-label="Resource preview"><button type="button" aria-pressed={view==='card'} onClick={()=>setView('card')}>Catalog card</button><button type="button" aria-pressed={view==='details'} onClick={()=>setView('details')}>Full details</button></div>{view==='card'?<CatalogCard item={item} preview/>:<ResourceView item={item} disclosure="We may earn a commission through affiliate links." onSignup={()=>{}} preview/>}</>;
 if(item.kind==='partner')return <PartnerSlider key={item.id} partners={[...items.filter(i=>i.kind==='partner'&&i.status==='active'&&i.id!==item.id),item].sort((a,b)=>a.position-b.position)} preview/>;
 if(item.kind==='review')return <div className="testimonial-preview"><TestimonialCard item={item}/></div>;
 const text=(key:string)=>String(item.data[key]??'');
 if(item.kind==='hero')return <HeroPreview pages={pages} key={String(item.id)+String(item.data.type)} hero={item} offers={items.filter(i=>i.kind==='offer'&&i.status==='active')} siteName="Your headline" description="" eyebrow="Header preview" consentText={consentText} disclosure="We may earn a commission through affiliate links." preview/>;

 return <section className="content-live-preview"><p className="eyebrow">{item.kind==='offer'||item.kind==='upcoming'?text('category'):item.kind}</p>{['offer','upcoming','partner','review'].includes(item.kind)&&<EditorialImage id={item.data.imageId??item.data.logoId??item.data.avatarId} alt=""/>}<h1>{item.kind==='faq'?text('question'):item.title||'Your title'}</h1><p>{text('description')||text('answer')||text('text')}</p>{item.kind==='upcoming'&&!!item.data.startDate&&<p>{new Date(text('startDate')).toLocaleString()}</p>}{item.data.action==='affiliate'&&<p className="affiliate-note">We may earn a commission through this link. Read our affiliate disclosure.</p>}{!!item.data.ctaLabel&&<button disabled className="public-button">{text('ctaLabel')}</button>}{item.kind==='navigation'&&<span className="text-link">{text('label')} → {text('href')}</span>}</section>;
}

function HeroPreview({hero,pages,...props}:React.ComponentProps<typeof HeroHeader>&{pages:LeadPage[]}){const [journeys,setJourneys]=useState<Record<number,HeaderSlide['journey']>>({});const ids=(hero?.data.slides as HeaderSlide[]??[]).map(s=>s.signup?.leadPageId).filter((id):id is number=>!!id),identity=ids.join(',');useEffect(()=>{let live=true;void Promise.all([...new Set(ids)].map(async id=>{const saved=pages.find(p=>p.id===id);if(!saved||saved.status!=='active')return[id,undefined] as const;try{const p=await api<{data:LeadPage['data']}>(`/api/public/lead-pages/${saved.slug}`);return[id,{mode:p.data.deliveryMode??'double',questions:p.data.questions,formMode:p.data.formMode??'single'}] as const;}catch{return[id,undefined] as const;}})).then(entries=>{if(live)setJourneys(Object.fromEntries(entries) as Record<number,HeaderSlide['journey']>);});return()=>{live=false;};},[identity,pages]);return <HeroHeader {...props} hero={hero?{...hero,data:{...hero.data,slides:(hero.data.slides as HeaderSlide[]).map(s=>({...s,journey:s.signup?.leadPageId?journeys[s.signup.leadPageId]:undefined}))}}:undefined}/>;}
