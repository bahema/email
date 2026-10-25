import React from 'react';
import {promotionButtonInk,type SiteResponse,type VideoPromotion} from '@affiliate/shared';
import {VideoPlayer} from '../ui/VideoPlayer';
import {CatalogCard} from './CatalogHome';
import {Metadata} from './Metadata';
import type {LeadSource} from './LeadForm';
export function VideoPromotionPage({site,page,preview=false,onSignup}:{site:SiteResponse;page?:VideoPromotion;preview?:boolean;onSignup?:(title:string,source:LeadSource)=>void}){
 if(!page)return <main className="state-screen"><h1>Promotion unavailable</h1><p>This promotion is not currently published or its scheduled period has ended.</p><a href="/">Explore our website</a></main>;
 const offer=site.items.find(i=>i.id===page.offerId&&i.kind==='offer'),lead=site.leadPages?.find(p=>p.id===page.leadPageId),products=page.productIds.map(id=>site.items.find(i=>i.id===id&&i.kind==='offer')).filter(i=>!!i);
 const href=page.action==='offer'&&offer?(page.offerTarget==='provider'&&offer.data.action==='affiliate'?String(offer.data.href||'/resources/offer/'+offer.slug):'/resources/offer/'+offer.slug):page.action==='lead'&&lead?'/p/'+lead.slug:'';
 return <main className="video-promotion-page" style={{'--promotion-bg':page.background,'--promotion-ink':page.textColor,'--promotion-accent':page.accent,'--promotion-button-ink':promotionButtonInk(page.accent)} as React.CSSProperties}>
  {!preview&&<Metadata title={(page.seoTitle||page.title)+' | '+site.name} description={page.seoDescription||page.description} path={'/promotions/'+page.slug} image={page.imageId?'/media/'+page.imageId:site.logoUrl} noindex={page.noindex}/>}
  <section className={'promotion-hero '+page.layout+' align-'+page.alignment}><div className="promotion-hero-copy"><p className="eyebrow">{page.eyebrow}</p><h1>{page.title||'Your promotion headline'}</h1><p className="promotion-intro">{page.description}</p>{page.benefits.length>0&&<ul>{page.benefits.map((b,i)=><li key={i}>{b}</li>)}</ul>}{href&&<a className="promotion-cta" href={preview?undefined:href} rel={page.action==='offer'&&page.offerTarget==='provider'?'sponsored noopener':undefined}>{page.ctaLabel} →</a>}<p className="affiliate-note">{site.disclosure} {!preview&&<a href="/affiliate-disclosure">Read our disclosure</a>}</p></div><VideoPlayer key={page.videoUrl||page.videoId||'empty'} mediaId={page.videoId} url={page.videoUrl} posterId={page.imageId} title={page.title} autoplay={page.videoAutoplay} preview={preview}/></section>
  {page.body&&<section className="promotion-details"><p className="eyebrow">Explore the details</p><h2>{page.detailsHeading}</h2><div className="promotion-body">{page.body}</div></section>}
  {products.length>0&&<section className="promotion-products"><h2>{page.relatedHeading}</h2><div className="promotion-product-grid">{products.map(item=><CatalogCard key={item.id} item={item} disclosure={site.disclosure} onSignup={(title,source)=>{if(!preview)onSignup?.(title,source);}}/>)}</div></section>}
  {lead&&<section className="promotion-signup"><div><h2>{page.leadHeading}</h2><p>{page.leadDescription}</p></div><a className="public-button" href={preview?undefined:'/p/'+lead.slug}>{lead.cta} →</a></section>}
 </main>;
}
