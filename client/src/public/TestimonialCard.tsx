import React,{useState} from 'react';
import type { ContentItem } from '@affiliate/shared';
export function TestimonialAvatar({name,avatarId}:{name:string;avatarId:unknown}){
 const [failedId,setFailedId]=useState<number|null>(null),id=typeof avatarId==='number'?avatarId:null;
 const initials=name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>Array.from(part)[0]).join('').toUpperCase()||'?';
 return id&&failedId!==id?<img className="testimonial-avatar" src={`/media/${id}`} alt="" width={56} height={56} loading="lazy" onError={()=>setFailedId(id)}/>:<span className="testimonial-avatar testimonial-initials" aria-hidden="true">{initials}</span>;
}
export function TestimonialCard({item}:{item:ContentItem}){
 const name=String(item.data.name||'Reviewer'),rating=Math.max(1,Math.min(5,Number(item.data.rating)||1));
 return <figure className="review-card"><div className="testimonial-rating" role="img" aria-label={`${rating} out of 5 stars`}><span aria-hidden="true">{'★'.repeat(rating)}{'☆'.repeat(5-rating)}</span></div><blockquote>{String(item.data.text||'')}</blockquote><figcaption><TestimonialAvatar name={name} avatarId={item.data.avatarId}/><span className="testimonial-name">{name}</span></figcaption></figure>;
}
