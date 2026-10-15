import React from 'react';
import {BootstrapContext,readBootstrap} from './bootstrap';
import { useContext,useEffect,useState } from 'react';
import type { LeadPage,ContentItem,SiteResponse } from '@affiliate/shared';
import { api } from '../admin/api';
import { LeadExperience } from './LeadExperience';
import { Metadata } from './Metadata';
export function LeadPageView({slug,consentText,disclosure,offers=[],brand}:{slug:string;consentText:string;disclosure:string;offers?:ContentItem[];brand?:{name:string;logoUrl?:string;footer?:SiteResponse['sections']['footer']}}){
 const initial=useContext(BootstrapContext);
 const [page,setPage]=useState<{id:number;type:string;data:NonNullable<import('./bootstrap').PublicBootstrap['page']>['data'];hasResource:boolean}|null>(()=>{const b=initial||readBootstrap();return b?.pageSlug===slug?b.page:null;}),[error,setError]=useState('');
 useEffect(()=>{const b=initial||readBootstrap();if(b?.pageSlug===slug&&b.page)return;let live=true;api<typeof page>(`/api/public/lead-pages/${encodeURIComponent(slug)}`).then(p=>{if(live)setPage(p);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[slug]);
 if(error)return <main className="lead-success"><Metadata title="Page unavailable" description="This page is unavailable." noindex/><h1>Page unavailable</h1><p role="alert">{error}</p><a className="public-button" href="/">Explore our resources</a></main>;
 if(!page)return <main className="p-8"><h1>Discover your next resource</h1><a href="/">Explore resources</a></main>;
 return <><Metadata title={page.data.seo?.title||page.data.headline} description={page.data.seo?.description||page.data.description||page.data.subheadline} noindex={page.data.seo?.noindex} image={page.data.imageId?`/media/${page.data.imageId}`:undefined} path={`/p/${slug}`}/><LeadExperience page={{...page,slug,data:{...page.data,automationId:null,confirmationSubject:'',confirmationBody:'',resourceId:page.hasResource?1:null}}} consentText={consentText} disclosure={disclosure} offers={offers} brand={brand}/></>;
}
