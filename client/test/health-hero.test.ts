import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {defaultHealth,type HealthSection,type SiteResponse,type ContentItem} from '@affiliate/shared';
import {HealthHero} from '../src/public/HealthHero.tsx';
import {HealthPromo} from '../src/public/HealthPromo.tsx';
import {sectionSchemas} from '../../server/src/content/schema.ts';
import {openDatabase} from '../../server/src/db/database.ts';
import {migrate} from '../../server/src/db/migrations.ts';
import {ContentStore} from '../../server/src/content/store.ts';
import {SettingsStore} from '../../server/src/settings/store.ts';
import {LeadPageStore} from '../../server/src/lead-pages/store.ts';
import {NewsletterStore} from '../../server/src/marketing/newsletters.ts';
import {ContactStore} from '../../server/src/contacts/store.ts';
function fixture(){const db=openDatabase(':memory:');migrate(db);const settings=new SettingsStore(db,'ab'.repeat(32),'https://example.test','UTC'),content=new ContentStore(db,settings);return{db,settings,content};}
const render=(config:HealthSection,site:SiteResponse,preview=false)=>renderToStaticMarkup(React.createElement(HealthHero,{config,site,preview}));
test('legacy header palettes receive compatible actions and unsafe links cannot be saved',()=>{
 const old=sectionSchemas.health.parse({...defaultHealth,header:{background:'#e9eee2',text:'#193b30',accent:'#215343'}});assert.equal(old.header.action,'browse');assert.equal(old.header.layout,'split');
 for(const key of ['url','secondaryUrl'])assert.equal(sectionSchemas.health.safeParse({...defaultHealth,header:{...defaultHealth.header,[key]:'javascript:alert(1)'}}).success,false);
});
test('hero supports browse, safe direct and secondary links while previews never navigate',()=>{
 const f=fixture();try{const site=f.content.publicSite(),config={...defaultHealth,enabled:true};assert.match(render(config,site),/href="#health-products"/);
 const linked={...config,header:{...config.header,action:'link' as const,url:'/guides/care',buttonLabel:'Read our guide',secondaryLabel:'Browse products',secondaryUrl:'#health-products',layout:'compact' as const,alignment:'center' as const}};
 const html=render(linked,site);assert.match(html,/href="\/guides\/care"/);assert.match(html,/Read our guide/);assert.match(html,/health-hero-layout-compact/);assert.match(html,/health-hero-align-center/);assert.doesNotMatch(render(linked,site,true),/href="\/guides\/care"/);
 assert.doesNotMatch(render({...config,header:{...config.header,action:'none'}},site),/class="public-button"/);
 }finally{f.db.close();}
});
test('promoted product actions use the same detail page or affiliate redirect and fail closed when unpublished',()=>{
 const f=fixture();try{const product=f.content.saveItem({kind:'offer',slug:'care',title:'Care sample',status:'active',position:0,data:{description:'Product details',action:'affiliate',destination:'https://example.org/provider'}}),config:HealthSection={...defaultHealth,enabled:true,products:[{offerId:product.id,category:'beauty'}],header:{...defaultHealth.header,action:'product',offerId:product.id,buttonLabel:'Explore this item'}};f.content.saveSection('health',config);let site=f.content.publicSite();
 assert.match(render(config,site),/href="\/health\/products\/care"/);
 const provider={...config,header:{...config.header,productTarget:'provider' as const}};const html=render(provider,site);assert.match(html,/href="\/go\/care"/);assert.match(html,/rel="sponsored noopener"/);assert.match(html,/health-hero-disclosure/);
 const {id,...input}=product;f.content.saveItem({...input,status:'inactive'},id);site=f.content.publicSite();assert.match(render(provider,site),/currently unavailable/);assert.doesNotMatch(render(provider,site),/href="\/go\//);
 assert.throws(()=>f.content.saveSection('health',{...config,products:[]}),/Connect the promoted product/);
 assert.throws(()=>f.content.saveSection('health',{...defaultHealth,enabled:true,header:{...defaultHealth.header,action:'link'}}),/Enter a destination/);
 }finally{f.db.close();}
});
test('hero lead capture uses the published page consent, duplicate protection and email connection',()=>{
 const f=fixture();try{const email=new NewsletterStore(f.db).save({title:'Care follow-up',subject:'Your care guide',html:'<p>Here is your guide.</p>',status:'ready'}),pages=new LeadPageStore(f.db),page=pages.save({name:'Care signup',slug:'care-signup',type:'newsletter',status:'active',data:{deliveryMode:'double',headline:'Get care updates',subheadline:'',description:'Useful product context',body:'',cta:'Subscribe',imageId:null,videoId:null,resourceId:null,automationId:null,directNewsletterId:email.id,tags:['care'],confirmationSubject:'Confirm signup',confirmationBody:'Confirm: {confirmationUrl}',successHeadline:'Confirmed',successMessage:'Thank you',returnLabel:'Return',returnUrl:'/health',offerId:null,questions:[]}});
 const config:HealthSection={...defaultHealth,enabled:true,header:{...defaultHealth.header,action:'subscribe',buttonLabel:'Get care updates',leadPageId:page.id}};f.content.saveSection('health',config);const html=render(config,f.content.publicSite());assert.match(html,/Get care updates/);assert.doesNotMatch(html,/href="\/p\/care-signup"/);
 const contacts=new ContactStore(f.db,f.settings,f.content,'ab'.repeat(32)),input={name:'Test reader',email:'reader@example.test',country:'RW',consent:true,source:{type:'lead_page',id:page.slug}};
 assert.throws(()=>contacts.signup({...input,consent:false}));contacts.signup(input);contacts.signup(input);assert.equal(f.db.prepare('SELECT count(*) n FROM contacts').get()!.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM lead_submissions').get()!.n,1);assert.equal(f.db.prepare('SELECT status FROM contacts').get()!.status,'pending');assert.equal(f.db.prepare('SELECT count(*) n FROM transactional_outbox').get()!.n,1);const snapshot=JSON.parse(String(f.db.prepare('SELECT page_snapshot FROM lead_submissions').get()!.page_snapshot));assert.equal(snapshot.directNewsletterId,email.id);
 pages.pause(page.id);assert.throws(()=>f.content.saveSection('health',config));assert.match(render(config,f.content.publicSite()),/Signup is currently unavailable/);
 }finally{f.db.close();}
});
test('slider uses labeled SVG controls and product dots, and hides controls for one item',()=>{
 const items:ContentItem[]=[1,2].map(id=>({id,kind:'offer',slug:'product-'+id,title:'Product '+id,status:'active',position:id,data:{description:'Details'}})),config:HealthSection={...defaultHealth,enabled:true,products:items.map(i=>({offerId:i.id,category:'beauty'}))};
 const html=renderToStaticMarkup(React.createElement(HealthPromo,{config,items}));assert.match(html,/Previous health product/);assert.match(html,/Next health product/);assert.match(html,/Pause health products/);assert.match(html,/Choose health product/);assert.match(html,/Show product 2: Product 2/);assert.match(html,/<svg/);assert.match(html,/aria-current="true"/);
 const single=renderToStaticMarkup(React.createElement(HealthPromo,{config,items:items.slice(0,1)}));assert.doesNotMatch(single,/health-promo-controls/);assert.doesNotMatch(single,/health-slide-dots/);
});
