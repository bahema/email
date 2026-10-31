import {videoSource,videoEmbed} from './video.js';
export interface FaqEmbed{key:string;title:string;description:string;type:'website'|'video';url:string;offerId:number|null;imageId:number|null;status:'draft'|'active'|'inactive';providerReviewed:boolean;allowSameOrigin:boolean;}
export interface EmbedSettings{enabled:boolean;activeKey:string|null;height:number;items:FaqEmbed[];}
export const defaultEmbeds:EmbedSettings={enabled:false,activeKey:null,height:600,items:[]};
export function websiteEmbedUrl(value:string):URL|null{
 try{const url=new URL(value);const host=url.hostname.toLowerCase();if(url.protocol!=='https:'||url.username||url.password||url.port||/[\s\u0000-\u001f\\]/.test(value)||!host.includes('.')||!/[a-z]/i.test(host)||!/^[a-z0-9.-]+$/i.test(host)||/\.(?:local|localhost|internal|invalid|test)$/.test(host))return null;return url;}catch{return null;}
}
export function faqEmbedSource(item:FaqEmbed){if(item.type==='website')return websiteEmbedUrl(item.url)?.href??'';const video=videoSource(item.url);return video&&video.kind!=='file'?videoEmbed(video,false):'';}
export function activeFaqEmbed(settings:EmbedSettings|undefined){return settings?.enabled?settings.items.find(i=>i.key===settings.activeKey&&i.status==='active'):undefined;}
export function newFaqEmbed(key:string):FaqEmbed{return{key,title:'',description:'',type:'website',url:'',offerId:null,imageId:null,status:'draft',providerReviewed:false,allowSameOrigin:false};}
