import React from 'react';
import type {SiteResponse} from '@affiliate/shared';
import {CatalogCard} from './CatalogHome';
import {Metadata} from './Metadata';
export function CategoryPage({site,category,onSignup}:{site:SiteResponse;category:string;onSignup:Parameters<typeof CatalogCard>[0]['onSignup']}){
 const items=site.items.filter(i=>i.kind==='offer'&&String(i.data.category||'General')===category),description='Explore '+category+' resources, compare published product details and check provider terms before choosing.';
 return <main className="health-department"><Metadata title={category+' | '+site.name} description={description} path={'/categories/'+encodeURIComponent(category)} noindex={!items.length}/><nav className="health-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span>{category}</span></nav><header className="catalog-heading"><div><p className="eyebrow">Browse by interest</p><h1 className="text-3xl font-bold">{category}</h1><p>{description}</p></div><span>{items.length} resources</span></header><p className="affiliate-note">{site.disclosure}</p><h2 className="sr-only">Published resources</h2><div className="health-product-grid">{items.map(item=><CatalogCard key={item.id} item={item} disclosure={site.disclosure} detailPath={site.sections.health?.enabled&&site.sections.health.products.some(p=>p.offerId===item.id)?'/health/products/'+item.slug:undefined} onSignup={onSignup}/>)}</div>{!items.length&&<p>No published resources in this category. <a href="/">Browse all resources</a></p>}</main>;
}
