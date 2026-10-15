import { config } from '../config.js';
import { openDatabase } from '../db/database.js';
import { migrate } from '../db/migrations.js';
import { SettingsStore } from '../settings/store.js';
import { ContentStore } from '../content/store.js';
import type { ContentKind } from '@affiliate/shared';
import { NewsletterStore } from '../marketing/newsletters.js';
import { SegmentStore } from '../marketing/segments.js';
import { CampaignStore } from '../marketing/campaigns.js';
import { LeadPageStore } from '../lead-pages/store.js';
import { AutomationStore } from '../automations/store.js';
import { LocalStorage } from '../media/storage.js';

const db=openDatabase(config.databasePath);
try{
  migrate(db);const settings=new SettingsStore(db,config.SETTINGS_ENCRYPTION_KEY??'',config.SITE_URL,config.TIMEZONE),store=new ContentStore(db,settings);
  const add=(kind:ContentKind,slug:string,title:string,data:Record<string,unknown>,position=0,status='active')=>store.items().find(item=>item.kind===kind&&item.slug===slug)??store.saveItem({kind,slug,title,data,position,status});
  [['home','Home','/'],['offers','Offers','/#offers'],['categories','Categories','/#categories'],['upcoming','Upcoming','/#upcoming'],['faq','FAQ','/#faq'],['subscribe','Subscribe','/#subscribe']].forEach(([slug,label,href],index)=>add('navigation',`demo-${slug}`,label!,{label,href},index));
  add('offer','demo-software-toolkit','Demo Software Toolkit',{description:'A fictional software offer for evaluating affiliate redirects. Replace with your own offer.',category:'Software',action:'affiliate',destination:'https://example.com/demo-software',ctaLabel:'View official offer',imageId:null,resourceId:null,tags:['software']},0);
  add('offer','demo-business-guide','Demo Business Guide',{description:'A fictional guide interest form. Join with consent and confirm your email.',category:'Business',action:'lead_capture',destination:'',ctaLabel:'Get guide updates',imageId:null,resourceId:null,tags:['business','guide']},1);
  add('offer','demo-reading-resources','Demo Reading Resources',{description:'A fictional collection demonstrating a second affiliate destination.',category:'Books',action:'affiliate',destination:'https://example.com/demo-books',ctaLabel:'Learn more',imageId:null,resourceId:null,tags:['books']},2);
  add('upcoming','demo-workshop','Demo Business Workshop',{description:'A fictional upcoming workshop. Register interest for future updates.',category:'Events',action:'lead_capture',destination:'',ctaLabel:'Register interest',imageId:null,resourceId:null,tags:['events'],startDate:'2026-10-20T14:00:00.000Z',endDate:''});
  add('upcoming','demo-tool-launch','Demo Toolkit Launch',{description:'A fictional upcoming resource launch.',category:'Resources',action:'coming_soon',destination:'',ctaLabel:'Join the waiting list',imageId:null,resourceId:null,tags:['waiting-list'],startDate:'2026-11-01T08:00:00.000Z',endDate:''},1);
  const hero=add('hero','demo-default','Demo Default Header',{type:'image',tags:['newsletter'],slides:[{headline:'Practical resources. Clear recommendations.',description:'Explore guides, tools and upcoming resources selected for curious readers. This is a fictional demo website.',imageId:null,videoId:null,ctaLabel:'Explore offers',action:'internal',destination:'#offers',offerId:null}]});
  add('hero','demo-resource-signup','Demo Signup Header',{type:'lead_capture',tags:['guide'],slides:[{headline:'Join for practical guides',description:'A saved alternative header with a consenting signup form.',imageId:null,videoId:null,ctaLabel:'Subscribe',action:'lead_capture',destination:'',offerId:null}]});
  if(store.sections().homepage.activeHeroId===null)store.saveSection('homepage',{activeHeroId:hero.id});
  add('faq','demo-affiliate','How do affiliate offers work?',{question:'How do affiliate offers work?',answer:'Offers are provided by third parties. This website may earn a commission through affiliate links. The website does not process payments.'});
  add('faq','demo-subscribe','How do I subscribe?',{question:'How do I subscribe?',answer:'Complete a form with your name, email, country and consent, then confirm using the email sent to your inbox.'},1);
  add('faq','demo-unsubscribe','Can I unsubscribe?',{question:'Can I unsubscribe?',answer:'Yes. Use the unsubscribe link in your email or request a link through the unsubscribe page.'},2);
  add('review','demo-review-one','Demo reader review',{name:'Demo reader — fictional',rating:5,text:'This is a fictional sample review. Replace it with an authorized real testimonial before publication.',avatarId:null},0,'approved');
  ['Demo Partner A','Demo Partner B','Demo Partner C'].forEach((name,index)=>add('partner',`demo-partner-${index}`,name,{name,logoId:null,url:''},index,'draft'));
  const newsletters=new NewsletterStore(db),segments=new SegmentStore(db),campaigns=new CampaignStore(db);
  const welcomeTitle='Demo Welcome Newsletter';
  const welcome=newsletters.list().find(item=>item.title===welcomeTitle)??newsletters.save({title:welcomeTitle,subject:'Welcome, {name}',preheader:'A fictional welcome email for evaluating the editor.',html:'<h1>Welcome, {name}</h1><p>This is a fictional demo newsletter. Replace this content before sending a real campaign.</p><p><a href="/go/demo-software-toolkit" style="background-color:#0f766e;color:#ffffff;padding:12px 20px;text-decoration:none">Explore demo offer</a></p><p><a href="{unsubscribeUrl}">Unsubscribe</a></p>',status:'ready'});
  if(!newsletters.list().some(item=>item.title==='Demo Educational Follow-up'))newsletters.save({title:'Demo Educational Follow-up',subject:'Your next resource, {name}',preheader:'A fictional educational follow-up.',html:'<h2>A practical next step</h2><p>Add your educational content here. This demo does not make product claims.</p><p><a href="https://example.com/demo-resource">Read the demo resource</a></p>',status:'draft'});
  const africa=segments.list().find(item=>item.name==='Demo Confirmed African Leads')??segments.save({name:'Demo Confirmed African Leads',mode:'and',rules:[{field:'status',operator:'eq',value:'confirmed'},{field:'continent',operator:'eq',value:'Africa'}]});
  if(!segments.list().some(item=>item.name==='Demo Engaged Leads'))segments.save({name:'Demo Engaged Leads',mode:'and',rules:[{field:'status',operator:'eq',value:'confirmed'},{field:'opened_within',operator:'within',value:'30'}]});
  if(!campaigns.list().some(item=>item.name==='Demo Campaign — Draft Only'))campaigns.save({name:'Demo Campaign — Draft Only',newsletterId:Number(welcome.id),audience:{type:'segment',segmentId:Number(africa.id)}});
  const sequenceTitles=['Demo Guide Welcome','Demo Guide Education','Demo Guide Recommendation'];
  const sequenceNewsletters=sequenceTitles.map((title,index)=>newsletters.list().find(n=>n.title===title)??newsletters.save({title,subject:index===0?'Your demo guide, {name}':index===1?'A practical next step':'Explore the demo resource',preheader:'Fictional guide sequence',html:index===0?'<p>Hello {name}, your fictional resource is ready.</p><p><a href="{downloadUrl}">Download your guide</a></p>':index===1?'<p>Add your educational follow-up here. This is fictional demo content.</p>':'<p><a href="/go/demo-software-toolkit">Explore the fictional offer</a></p>',status:'ready'}));
  const automations=new AutomationStore(db),pages=new LeadPageStore(db);
  const automation=automations.list().find(a=>a.name==='Demo Free Guide Sequence')??automations.save({name:'Demo Free Guide Sequence',status:'paused',steps:[0,1440,4320].map((delayMinutes,index)=>({delayMinutes,newsletterId:Number(sequenceNewsletters[index]!.id)}))});
  if(!pages.list().some(p=>p.slug==='demo-free-guide')){
    let resource=db.prepare("SELECT id FROM media WHERE filename='demo-free-guide.txt' AND visibility='private'").get();
    if(!resource){const bytes=Buffer.from('Fictional demo guide. Replace this resource before a real launch.');const storage=new LocalStorage(config.uploadDir),storageName=storage.save(bytes,'txt');const result=db.prepare("INSERT INTO media(filename,storage_name,mime,size,extension,category,visibility) VALUES('demo-free-guide.txt',?,'text/plain',?,'txt','document','private')").run(storageName,bytes.length);resource={id:Number(result.lastInsertRowid)};}
    pages.save({name:'Demo Free Guide',slug:'demo-free-guide',type:'lead_magnet',status:'active',data:{headline:'Get the fictional demo guide',subheadline:'Evaluate the signup and download flow',description:'This sample page links to a paused three-step sequence.',body:'Replace the guide and copy before using this page publicly.',cta:'Get demo guide',imageId:null,videoId:null,resourceId:Number(resource.id),automationId:automation.id,tags:['demo-guide'],confirmationSubject:'Confirm your demo guide',confirmationBody:'Hello {name},\nConfirm: {confirmationUrl}\nUnsubscribe: {unsubscribeUrl}',successHeadline:'Your demo guide is ready',successMessage:'Use the protected download below.',returnLabel:'Return to website',returnUrl:'/',offerId:null,questions:[]}});
  }
  console.info('Demo content, lead page, private resource and paused sequence ready. No subscribers, credentials or email sends were created.');
}finally{db.close();}

