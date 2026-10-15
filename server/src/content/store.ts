import {EditorialStore} from './editorial.js';
import type { DatabaseSync } from 'node:sqlite';
import type { ContentItem, ContentKind, WebsiteSections, SiteResponse } from '@affiliate/shared';
import { contentSchemas, defaultSections, itemSchema, sectionSchemas } from './schema.js';
import { validateReferences,updateReferences } from '../media/storage.js';
import { HttpError } from '../http.js';
import { transaction,event } from '../db/helpers.js';
import type { SettingsStore } from '../settings/store.js';
import { LeadPageStore } from '../lead-pages/store.js';

export function contentItem(row:Record<string,unknown>):ContentItem{return{id:Number(row.id),kind:row.kind as ContentKind,slug:String(row.slug),title:String(row.title),position:Number(row.position),status:String(row.status),data:row.kind==='hero'?contentSchemas.hero.parse({...JSON.parse(String(row.data)),slides:JSON.parse(String(row.data)).slides.map((v:Record<string,unknown>,i:number)=>({...v,key:v.key||'slide-'+(i+1)}))}):JSON.parse(String(row.data)) as Record<string,unknown>};}
export class ContentStore {
  constructor(private db:DatabaseSync,private settings:SettingsStore){}
  items(){return this.db.prepare('SELECT * FROM content_items ORDER BY position,id').all().map(contentItem);}
  publicItems(){return this.db.prepare('SELECT * FROM content_items ORDER BY position,id').all().map(row=>row.kind==='hero'&&row.published_header?contentItem({...row,...JSON.parse(String(row.published_header)),data:JSON.stringify(JSON.parse(String(row.published_header)).data),status:row.status}):contentItem(row));}
  activateHeader(id:number){return transaction(this.db,()=>{const old=this.items().find(i=>i.id===id&&i.kind==='hero');if(!old)throw new HttpError(404,'NOT_FOUND','Header not found');const {id:itemId,...input}=old;const item=this.saveItem({...input,status:'active'},id);const sections=this.saveSection('homepage',{...this.sections().homepage,activeHeroId:id});return{item,sections};});}
  sections():WebsiteSections{
    const sections:WebsiteSections=defaultSections();
    for(const row of this.db.prepare('SELECT * FROM website_sections').all())if(Object.hasOwn(sectionSchemas,String(row.key)))Object.assign(sections,{[String(row.key)]:sectionSchemas[String(row.key) as keyof typeof sectionSchemas].parse(JSON.parse(String(row.value)))});
    return sections;
  }
  saveItem(input:unknown,id?:number,draftOnly=false):ContentItem{
    const item=itemSchema.parse(input);if(draftOnly){if(item.kind!=='hero')throw new HttpError(400,'INVALID_KIND','Header drafts only');const previous=id?this.db.prepare('SELECT status FROM content_items WHERE id=?').get(id)?.status:'draft';item.status=previous==='active'?'active':previous==='inactive'?'inactive':'draft';}
    if(item.kind==='hero'&&Array.isArray(item.data.slides))item.data.slides=item.data.slides.map((v,i)=>({...v as object,key:(v as Record<string,unknown>).key||'slide-'+(i+1)}));const data=contentSchemas[item.kind].parse(item.data);
    const statuses=item.kind==='review'?['pending','approved','rejected']:['active','inactive','draft'];
    if(!statuses.includes(item.status))throw new HttpError(400,'INVALID_STATUS','Invalid status for this content type');
    const existing=id?this.db.prepare('SELECT kind FROM content_items WHERE id=?').get(id):undefined;
    if(id&&!existing)throw new HttpError(404,'NOT_FOUND','Content item not found');
    if(existing&&existing.kind!==item.kind)throw new HttpError(400,'INVALID_KIND','Content type cannot be changed');
    if(this.db.prepare('SELECT id FROM content_items WHERE kind=? AND slug=? AND id<>?').get(item.kind,item.slug,id??0))throw new HttpError(409,'DUPLICATE_SLUG','This slug is already used');
    validateReferences(this.db,data);
    if(item.kind==='hero')for(const slide of (data as {slides:{action:string;offerId:number|null}[]}).slides)if(slide.action==='affiliate'){
      const offer=this.db.prepare("SELECT data FROM content_items WHERE id=? AND kind='offer' AND status='active'").get(slide.offerId);
      if(!offer||JSON.parse(String(offer.data)).action!=='affiliate')throw new HttpError(400,'INVALID_OFFER','Choose an active affiliate offer');
    }
    if(item.kind==='hero'){
      const hero=data as ReturnType<typeof contentSchemas.hero.parse>;if(new Set(hero.slides.map(s=>s.key)).size!==hero.slides.length)throw new HttpError(400,'DUPLICATE_PROMOTION','Advertisement identifiers must be unique');if(!hero.slides.some(s=>!s.hidden))throw new HttpError(400,'EMPTY_HEADER','Keep at least one advertisement visible');for(const slide of hero.slides){const layout=slide.layout==='inherit'?(hero.type==='slider'?'image':hero.type):slide.layout;if(slide.signup.leadPageId){const p=new LeadPageStore(this.db).get(slide.signup.leadPageId);if(['browse','campaign'].includes(p.data.deliveryMode))throw new HttpError(400,'INVALID_JOURNEY','Connect a signup funnel, not a browse or audience campaign');if(item.status==='active'&&!draftOnly){const live=new LeadPageStore(this.db).active(p.slug);new LeadPageStore(this.db).validateDelivery({name:live.name,slug:live.slug,type:live.type,status:'active',data:live.data});}}if(item.status==='active'&&!draftOnly&&!slide.hidden&&layout==='video'&&!slide.videoId&&!slide.videoUrl)throw new HttpError(400,'VIDEO_REQUIRED','Choose an uploaded video or supported video link before activating this advertisement');if(layout==='background'&&!slide.appearance.backgroundImageId&&!slide.imageId)throw new HttpError(400,'BACKGROUND_REQUIRED','Choose a background image or use a text-only layout');for(const offerId of [...slide.collectionOfferIds,...(slide.featuredOfferId?[slide.featuredOfferId]:[])])if(!this.db.prepare("SELECT id FROM content_items WHERE id=? AND kind='offer' AND status='active'").get(offerId))throw new HttpError(400,'INVALID_OFFER','Choose published header resources');if(layout==='featured_offer'&&!slide.featuredOfferId&&!hero.featuredOfferId)throw new HttpError(400,'INVALID_OFFER','Select a product spotlight');if(layout==='collection'&&!slide.collectionOfferIds.length&&!hero.collectionOfferIds.length)throw new HttpError(400,'INVALID_COLLECTION','Select resources for this advertisement');}
      if(hero.type==='featured_offer'&&!hero.featuredOfferId&&!hero.slides[0]?.featuredOfferId)throw new HttpError(400,'INVALID_OFFER','Select a published featured offer');
      if(hero.type==='collection'&&!hero.collectionOfferIds.length&&!hero.slides[0]?.collectionOfferIds.length)throw new HttpError(400,'INVALID_COLLECTION','Select at least one published resource');
      const ids=[...(hero.featuredOfferId?[hero.featuredOfferId]:[]),...hero.collectionOfferIds];
      if(new Set(hero.collectionOfferIds).size!==hero.collectionOfferIds.length)throw new HttpError(400,'INVALID_COLLECTION','Choose each resource once');
      for(const offerId of ids)if(!this.db.prepare("SELECT id FROM content_items WHERE id=? AND kind='offer' AND status='active'").get(offerId))throw new HttpError(400,'INVALID_OFFER','Choose published offers for header features');
    }
    return transaction(this.db,()=>{
      let savedId=id;
      if(id)this.db.prepare("UPDATE content_items SET slug=?,title=?,position=?,status=?,data=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(item.slug,item.title,item.position,item.status,JSON.stringify(data),id);
      else savedId=Number(this.db.prepare('INSERT INTO content_items(kind,slug,title,position,status,data) VALUES(?,?,?,?,?,?)').run(item.kind,item.slug,item.title,item.position,item.status,JSON.stringify(data)).lastInsertRowid);
      if(item.kind==='hero'&&!draftOnly)this.db.prepare('UPDATE content_items SET published_header=? WHERE id=?').run(item.status==='active'?JSON.stringify({...item,data}):null,savedId!);const liveHeader=this.db.prepare('SELECT published_header FROM content_items WHERE id=?').get(savedId!);updateReferences(this.db,`item:${savedId}`,{draft:data,live:liveHeader?.published_header?JSON.parse(String(liveHeader.published_header)).data:null});event(this.db,'website_content_saved',{id:savedId,kind:item.kind});
      return contentItem(this.db.prepare('SELECT * FROM content_items WHERE id=?').get(savedId!)!);
    });
  }
  saveSection(key:string,input:unknown):WebsiteSections{
    if(!Object.hasOwn(sectionSchemas,key))throw new HttpError(404,'NOT_FOUND','Website section not found');
    const value=sectionSchemas[key as keyof typeof sectionSchemas].parse(input);
    validateReferences(this.db,value);
    if(key==='homepage'&&(value as {activeHeroId:number|null}).activeHeroId&&!this.db.prepare("SELECT id FROM content_items WHERE id=? AND kind='hero' AND status='active'").get((value as {activeHeroId:number}).activeHeroId))throw new HttpError(400,'INVALID_HERO','Select an active hero configuration');
    if(key==='homepage'){
      const home=value as WebsiteSections['homepage'];
      if(home.featuredOfferId&&!this.db.prepare("SELECT id FROM content_items WHERE id=? AND kind='offer' AND status='active'").get(home.featuredOfferId))throw new HttpError(400,'INVALID_OFFER','Choose a published offer');
      if(home.featuredLeadPageId&&!this.db.prepare("SELECT id FROM lead_pages WHERE id=? AND status='active'").get(home.featuredLeadPageId))throw new HttpError(400,'INVALID_LEAD_PAGE','Choose a published lead page');
    }
    return transaction(this.db,()=>{this.db.prepare('INSERT INTO website_sections(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));updateReferences(this.db,`section:${key}`,value);event(this.db,'website_section_saved',{key});return this.sections();});
  }
  remove(id:number){
    if(this.db.prepare("SELECT e.id FROM editorial_pages e,json_each(e.data,'$.productIds') j WHERE j.value=? LIMIT 1").get(id))throw new HttpError(409,'CONTENT_IN_USE','Remove this product from its guides or collections first');
    if(!this.db.prepare('SELECT id FROM content_items WHERE id=?').get(id))throw new HttpError(404,'NOT_FOUND','Content not found');
    if(this.sections().homepage.activeHeroId===id)throw new HttpError(409,'CONTENT_IN_USE','Choose a different active hero before deleting this one');
    if(this.sections().homepage.featuredOfferId===id)throw new HttpError(409,'CONTENT_IN_USE','Choose a different featured resource before deleting this one');
    if(this.items().some(item=>item.kind==='hero'&&(item.data.featuredOfferId===id||(item.data.collectionOfferIds as number[]|undefined)?.includes(id))))throw new HttpError(409,'CONTENT_IN_USE','Remove this resource from saved headers first');
    if(this.items().some(item=>item.kind==='hero'&&(item.data.slides as {offerId:number|null}[]).some(slide=>slide.offerId===id)))throw new HttpError(409,'CONTENT_IN_USE','Remove this offer from saved hero configurations first');
    transaction(this.db,()=>{this.db.prepare('DELETE FROM media_usage WHERE owner_key=?').run(`item:${id}`);this.db.prepare('DELETE FROM content_items WHERE id=?').run(id);event(this.db,'website_content_deleted',{id});});
  }
  publicSite():SiteResponse{
    const settings=this.settings.read();
    const pagesForHero=new LeadPageStore(this.db);const items=this.publicItems().filter(item=>item.kind==='review'?item.status==='approved':item.status==='active').map(item=>{
      const data={...item.data};
      if(['offer','upcoming'].includes(item.kind)){
        data.href=data.action==='affiliate'?`/go/${item.kind==='upcoming'?'upcoming/':''}${item.slug}`:data.action==='download'?`/media/${data.resourceId}`:data.destination;
        if(data.action==='affiliate')delete data.destination;
      }
      if(item.kind==='hero')data.slides=(data.slides as Record<string,unknown>[]).map(slide=>{
        const offer=slide.offerId?this.db.prepare("SELECT slug FROM content_items WHERE id=? AND kind='offer' AND status='active'").get(Number(slide.offerId)):undefined;
        const journey=slide.signup&&typeof slide.signup==='object'?(slide.signup as {leadPageId?:number}).leadPageId:null;let summary:Record<string,unknown>|undefined={mode:settings.compliance.doubleOptIn?'double':'single',questions:[],formMode:'single'};if(journey){try{const p=pagesForHero.get(Number(journey)),live=pagesForHero.active(p.slug);if(['double','single'].includes(live.data.deliveryMode))summary={mode:live.data.deliveryMode,questions:live.data.questions,formMode:live.data.formMode};}catch{}}return{...slide,journey:summary,href:slide.action==='affiliate'?(offer?`/go/${offer.slug}?hero=${item.id}&promotion=${encodeURIComponent(String(slide.key))}`:''):slide.destination};
      });
      return{...item,data};
    });
    const pages=new LeadPageStore(this.db),leadPages=pages.list().filter(p=>p.status==='active').map(p=>{const live=pages.active(p.slug);return{id:live.id,slug:live.slug,type:live.type,headline:live.data.headline,description:live.data.description,cta:live.data.cta,imageId:live.data.imageId,hasResource:!!live.data.resourceId};});
    return{editorial:new EditorialStore(this.db).publicPages(),name:settings.general.siteName,logoUrl:settings.general.logoUrl,disclosure:settings.affiliate.disclosure,consentText:settings.compliance.consentText,items,sections:this.sections(),leadPages};
  }
}
