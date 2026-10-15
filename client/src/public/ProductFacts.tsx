import React from 'react';
export function ProductReviewDate({value}:{value:unknown}){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const date=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return null;
 return <p className="product-provider-note">Last reviewed: <time dateTime={value}>{new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date)}</time></p>;
}
const labels:Record<string,string>={digital:'Digital access',physical:'Physical delivery',service:'Service',new:'New',used:'Used',refurbished:'Refurbished',available:'Available now',preorder:'Preorder',out_of_stock:'Out of stock'};
export function physicalMaterial(data:Record<string,unknown>){return data.materialType==='physical'||(!data.materialType||data.materialType==='unspecified')&&data.deliveryType==='physical';}
export function hasDeliveryDetails(data:Record<string,unknown>){return ['deliveryRegions','deliveryEstimate','deliveryCostNote','returnsPolicy','deliveryTerms'].some(key=>!!data[key])||(physicalMaterial(data)&&['new','used','refurbished'].includes(String(data.condition)))||['digital','physical','service'].includes(String(data.deliveryType));}
export function productAvailability(data:Record<string,unknown>,kind?:string){
 const availability=String(data.availability||'unspecified');
 if(availability==='available')return{label:'Available now',tone:'available'};
 if(availability==='preorder')return{label:'Preorder',tone:'upcoming'};
 if(availability==='out_of_stock')return{label:'Out of stock',tone:'unavailable'};
 if(kind==='upcoming'||data.action==='coming_soon')return{label:'Coming soon',tone:'upcoming'};
 return null;
}
export function ProductStatusBadge({data,kind}:{data:Record<string,unknown>;kind?:string}){
 const badge=productAvailability(data,kind);return badge?<span className={`product-status-tag product-availability is-${badge.tone}`}>{badge.label}</span>:null;
}
export function ProductFacts({data,kind,showAvailability=true}:{data:Record<string,unknown>;kind?:string;showAvailability?:boolean}){
 const mode=String(data.priceMode||'hidden'),paid=['fixed','from','subscription'].includes(mode)&&typeof data.priceAmount==='number';
 const money=(amount:number)=>{try{return new Intl.NumberFormat('en',{style:'currency',currency:String(data.currency||'USD')}).format(amount);}catch{return `${String(data.currency||'USD')} ${amount.toLocaleString('en')}`;}};
 const price=mode==='free'?'Free':paid?`${mode==='from'?'From ':''}${money(Number(data.priceAmount))}${mode==='subscription'?'/'+String(data.billingInterval||'month'):''}`:'';
 const availability=productAvailability(data,kind),tags=[...new Set([String(data.badgeLabel||''),physicalMaterial(data)?labels[String(data.condition)]||'':''].filter(tag=>!!tag&&tag.toLowerCase()!==availability?.label.toLowerCase()))];
 if(!price&&!tags.length&&!(showAvailability&&availability)&&!hasDeliveryDetails(data))return null;
 return <div className="product-facts">{(price||tags.length>0||(showAvailability&&availability))&&<div className="product-price-row">{price&&<strong className={`product-price-badge ${mode==='free'?'is-free':''}`}>{price}</strong>}{paid&&typeof data.compareAtPrice==='number'&&data.compareAtPrice>Number(data.priceAmount)&&<s className="product-comparison-price" aria-label={`Previous price ${money(data.compareAtPrice)}`}>{money(data.compareAtPrice)}</s>}{showAvailability&&<ProductStatusBadge data={data} kind={kind}/>} {tags.map((tag,i)=><span className={`product-status-tag ${data.availability==='out_of_stock'&&tag==='Out of stock'?'is-unavailable':''}`} key={i}>{tag}</span>)}</div>}{price&&!!data.priceNote&&<p className="product-price-note">{String(data.priceNote)}</p>}{hasDeliveryDetails(data)&&<div className="product-delivery-summary">{labels[String(data.deliveryType)]&&<span>{labels[String(data.deliveryType)]}</span>}{!!data.deliveryEstimate&&<span>{String(data.deliveryEstimate)}</span>}{!!data.deliveryRegions&&<span>Available in: {String(data.deliveryRegions)}</span>}{!!data.deliveryCostNote&&<span>{String(data.deliveryCostNote)}</span>}{!data.deliveryEstimate&&!data.deliveryRegions&&!data.deliveryCostNote&&(!!data.deliveryTerms||!!data.returnsPolicy)&&<span>Delivery conditions in full details</span>}</div>}</div>;
}
export function DeliveryDetails({data}:{data:Record<string,unknown>}){if(!hasDeliveryDetails(data))return null;const rows=[['Type',labels[String(data.deliveryType)]],['Item condition',physicalMaterial(data)?labels[String(data.condition)]:undefined],['Availability',labels[String(data.availability)]],['Delivery / access estimate',data.deliveryEstimate],['Countries / regions',data.deliveryRegions],['Shipping / access costs',data.deliveryCostNote]].filter(([,value])=>!!value);return <section id="resource-delivery" className="product-information-section"><h2>Delivery & conditions</h2>{rows.length>0&&<dl className="product-specifications">{rows.map(([label,value])=><div key={String(label)}><dt>{String(label)}</dt><dd>{String(value)}</dd></div>)}</dl>}{!!data.deliveryTerms&&<div className="product-delivery-policy"><h3>Delivery / access conditions</h3><p>{String(data.deliveryTerms)}</p></div>}{!!data.returnsPolicy&&<div className="product-delivery-policy"><h3>Returns / cancellation information</h3><p>{String(data.returnsPolicy)}</p></div>}<p className="product-provider-note">Check the provider’s current price, availability, delivery and return terms before ordering. Purchases and delivery are handled by the provider.</p></section>;}
