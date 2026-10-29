import {ContactStore} from './contacts/store.js';
import type {PublicBootstrap} from '../../client/src/public/bootstrap.js';
import type {DatabaseSync} from 'node:sqlite';
import type {SettingsStore} from './settings/store.js';
import {ContentStore} from './content/store.js';
import {FunnelDomains} from './lead-pages/domains.js';
import {LeadPageStore} from './lead-pages/store.js';
import {countryInfo,countryOptions} from './contacts/countries.js';
import {escapeHtml,pageMetadata,renderPageHtml} from './seo.js';
type PublicRenderer=(bootstrap:PublicBootstrap,path:string)=>string;
let renderer:PublicRenderer|null=null;
const whopPixel='<script>!function(w,d,s,u,n,a,b){if(w[n])return;a=w[n]={q:[],t:+new Date,s:[],o:u,track:function(){a.q.push([+new Date].concat([].slice.call(arguments)))},setScope:function(){a.s=[].slice.call(arguments).filter(function(x){return typeof x==="string"});a.q.push([+new Date,"setScope"].concat(a.s))},scope:function(){var c=[].slice.call(arguments);return{track:function(){a.q.push([+new Date].concat([].slice.call(arguments)).concat([{__scope:c}]))}}}};b=d.createElement(s);b.async=1;b.src=u+"/s.js";d.getElementsByTagName(s)[0].parentNode.insertBefore(b,d.getElementsByTagName(s)[0])}(window,document,"script","https://t.whop.tw","whop");whop.setScope("biz_EpLybXC6qH7jZx");whop.track("page");</script>';
export function setPublicRenderer(value:PublicRenderer){renderer=value;}
export function publicActivity(db:DatabaseSync,settings:SettingsStore){
 const config=settings.read().activity;if(!config.enabled)return {enabled:false,intervalSeconds:config.intervalSeconds,messages:[]};
 const rows=db.prepare("SELECT country,count(*) count FROM contacts WHERE status='confirmed' AND email_verified_at IS NOT NULL AND confirmed_at>=? AND lower(email) NOT LIKE '%.test' AND lower(email) NOT LIKE '%@example.%' AND lower(name) NOT LIKE '%demo%' AND lower(name) NOT LIKE '%fictional%' GROUP BY country HAVING count(*)>=5").all(new Date(Date.now()-config.days*86400000).toISOString());
 const messages=rows.map(row=>({text:config.showLocations?`${Number(row.count)} email-verified subscribers from ${countryInfo(String(row.country)).name} in the last ${config.days} days`:`${Number(row.count)} email-verified subscribers in a regional group in the last ${config.days} days`}));
 if(!messages.length){const count=new ContentStore(db,settings).publicItems().filter(i=>i.kind==='offer'&&i.status==='active').length;if(count)messages.push({text:`Explore ${count} published resources`});}
 return {enabled:true,intervalSeconds:config.intervalSeconds,messages};
}
function safeDecode(value:string){try{return decodeURIComponent(value);}catch{return '';}}
export function publicBootstrap(db:DatabaseSync,settings:SettingsStore,path:string,host:string,storageSaved=false,query=''){
 const site=new ContentStore(db,settings).publicSite(),funnel=new FunnelDomains(db).resolve(host),slug=path.startsWith('/p/')?safeDecode(path.slice(3)):path==='/'?(funnel?.slug??null):null;
 let page=null;if(slug){try{page=new LeadPageStore(db).publicPage(slug);}catch{}}
 let action:PublicBootstrap['action']=null;const match=path.match(/^\/(confirm|unsubscribe)\/([^/]+)$/);
 if(match){try{action={info:new ContactStore(db,settings,new ContentStore(db,settings),'').inspect(match[2]!,match[1] as 'confirm'|'unsubscribe'),error:''};}catch(error){action={info:null,error:error instanceof Error?error.message:'Link unavailable'};}}
 return {query,countries:countryOptions,site,funnel,page,pageSlug:slug,activity:publicActivity(db,settings),action,storageSaved,renderedAt:Date.now(),publicOrigin:funnel?'https://'+funnel.host:settings.read().domains.publicUrl};
}
export function initialHtml(html:string,db:DatabaseSync,settings:SettingsStore,path:string,host:string,storageSaved=false,query=''){
 const meta=pageMetadata(db,settings,path,host);let output=renderPageHtml(html,meta);if(path.startsWith('/admin'))return output;output=output.replace('</head>',whopPixel+'</head>');
 const bootstrap=publicBootstrap(db,settings,path,host,storageSaved,query),site=bootstrap.site,e=escapeHtml,home=path==='/'&&!bootstrap.funnel;
 const resources=site.items.filter(i=>i.kind==='offer');
 const header=`<header class="site-header"><nav class="site-nav" aria-label="Main navigation"><a class="site-brand" href="/" aria-label="${e(site.name)} home"><img class="website-logo" src="${e(site.logoUrl||'/brand/33-items-logo.jpg')}" alt="${e(site.name)} logo" width="56" height="56"></a><div class="site-nav-links">${site.items.filter(i=>i.kind==='navigation').map(i=>`<a href="${e(i.data.href)}">${e(i.data.label)}</a>`).join('')}</div><a class="admin-entry" href="/admin/login">Admin</a></nav></header>`;
 const content=home?`<main class="catalog-home"><section class="initial-welcome"><h1>${e(meta.title)}</h1><p>${e(meta.description)}</p></section><section class="initial-resources">${resources.map(i=>`<article class="panel">${i.data.imageId?`<img src="/media/${Number(i.data.imageId)}" alt="${e(i.title)}" width="300" height="180">`:''}<h2><a href="/resources/offer/${e(i.slug)}">${e(i.title)}</a></h2><p>${e(i.data.description)}</p></article>`).join('')}</section></main>`:`<main class="legal-page">${meta.body}</main>`;
 const fallback=`<div class="public-site">${header}${content}<footer class="initial-footer"><p>${e(site.disclosure)}</p><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/affiliate-disclosure">Affiliate disclosure</a></footer></div>`;
 output=output.replace('<div id="root"></div>',renderer?`<div id="root" data-rendered="true">${renderer(bootstrap,path)}</div>`:`<div id="root">${fallback}</div>`);
 return output.replace('</head>',`<script type="application/json" id="public-bootstrap">${JSON.stringify(bootstrap).replace(/</g,'\\u003c')}</script></head>`);
}
