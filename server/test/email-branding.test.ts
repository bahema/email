import { inlineSystemLogo } from '../src/mail/inline-logo.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings,settingsSchemas } from '../src/settings/schema.js';
import { renderEmail } from '../src/marketing/newsletters.js';
import { renderConfirmation } from '../src/mail/confirmation.js';
import { emailAssetUrl } from '../src/mail/branding.js';
const settings=()=>{const s=defaultSettings('http://127.0.0.1:5173','Africa/Kigali');s.domains.publicUrl='https://example.test';s.general.siteName='33 items';s.emailDefaults={...s.emailDefaults,address:'Kigali, Rwanda',contactEmail:'hello@example.test',contactPhone:'+250 000',websiteDescription:'Resources & useful offers',socialLinks:[{platform:'YouTube',url:'https://youtube.com/@fictional',iconUrl:'http://127.0.0.1:5173/media/7'},{platform:'Unused',url:'',iconUrl:''}]};return s;};
test('email branding uses public image URLs, social icons, contact details and a protected unsubscribe footer',()=>{
 const s=settings(),r=renderEmail({id:1,title:'Demo',subject:'Demo',html:'<img src="http://127.0.0.1:5173/media/3" alt="Demo"><a href="{unsubscribeUrl}">Leave</a>',preheader:'',status:'ready'},s,'Reader','https://example.test/unsubscribe/demo');
 assert.match(r.html,/src="https:\/\/example.test\/media\/3"/);assert.match(r.html,/src="https:\/\/example.test\/media\/7"/);assert.match(r.html,/Kigali, Rwanda/);assert.match(r.html,/hello@example.test/);assert.match(r.html,/youtube.com\/@fictional/);assert.match(r.html,/Resources &amp; useful offers/);assert.match(r.html,/unsubscribe\/demo/);assert.ok(!r.html.includes('Unused'));assert.match(r.text,/Kigali, Rwanda/);
 assert.equal(emailAssetUrl('javascript:alert(1)',s),'');assert.equal(emailAssetUrl('/media/5',s),'https://example.test/media/5');
});
test('welcome confirmation HTML sanitizes owner markup and always provides confirmation and unsubscribe controls',()=>{
 const s=settings(),r=renderConfirmation('Welcome','<p>Hello &lt;Reader&gt;</p><script>alert(1)</script><img src="/media/3" onerror="bad">',s,'https://example.test/confirm/demo','https://example.test/unsubscribe/demo');
 assert.match(r.html,/Confirm my subscription/);assert.match(r.html,/A warm welcome/);assert.match(r.html,/33-items-logo.jpg/);assert.match(r.html,/confirm\/demo/);assert.match(r.html,/unsubscribe\/demo/);assert.ok(!/<script\b|onerror\s*=/i.test(r.html));assert.match(r.text,/Confirm: https:/);
 const literal=renderConfirmation('Welcome','Hello <img src="https://evil.test/x">',s,'https://example.test/confirm/demo','https://example.test/unsubscribe/demo',false);assert.ok(!literal.html.includes("evil.test"));assert.ok(!/<img[^>]*src="https:\/\/evil.test\/x"/i.test(literal.html));
});
test('old email settings get defaults and invalid or private social icons are rejected',()=>{
 const old={identity:'Demo',footer:'',affiliateDisclosure:'Disclosure',unsubscribeText:'Unsubscribe'};assert.deepEqual(settingsSchemas.emailDefaults.parse(old).socialLinks,[]);
 for(const url of ['not a url','javascript:alert(1)','https://user:pass@example.test/a'])assert.equal(settingsSchemas.emailDefaults.safeParse({...old,socialLinks:[{platform:'Example',url,iconUrl:''}]}).success,false);
 for(const iconUrl of ['broken','https://example.test/api/admin/media/1/file','https://example.test/download/private'])assert.equal(settingsSchemas.emailDefaults.safeParse({...old,socialLinks:[{platform:'Example',url:'https://example.test',iconUrl}]}).success,false);
});


test('only confirmation emails have the automatic logo header and personalized greeting',()=>{
 const s=settings();s.general.siteName='Affiliate Engine';
 const name='Alex <img src=x onerror=bad> & Sam';
 const confirmation=renderConfirmation('Confirm','Please confirm.',s,'https://example.test/confirm/demo','https://example.test/unsubscribe/demo',false,name);
 const header=confirmation.html.split('WELCOME')[0]!;
 assert.ok(header.includes('Hello Alex &lt;img src=x onerror=bad&gt; &amp; Sam'));assert.ok(!header.includes('>Affiliate Engine</a>'));assert.ok(!confirmation.html.includes('WELCOME TO AFFILIATE ENGINE'));
 assert.match(confirmation.html,/33-items-logo.jpg/);assert.match(confirmation.html,/https:\/\/example.test\/unsubscribe\/demo/);assert.match(confirmation.text,/Unsubscribe:/);
 const marketing=renderEmail({id:1,title:'Email',subject:'Hello {name}',html:'<p>Hello {name}</p>',preheader:'',status:'ready'},s,'Alex','https://example.test/unsubscribe/demo');
 assert.ok(!marketing.html.includes('33-items-logo.jpg'));assert.ok(!marketing.html.includes('padding:22px 30px'));assert.ok(marketing.html.includes('Unsubscribe'));assert.match(marketing.text,/Unsubscribe:/);
});

test('system copy is immutable and confirmation header colour is editable',()=>{const s=settings();s.emailDefaults.headerBackground='#ffffff';const r=renderConfirmation('Override','Override content',s,'https://example.test/confirm/demo','https://example.test/unsubscribe/demo',false,'Reader');assert.equal(r.subject,'Confirm your subscription to 33 items');assert.ok(!r.html.includes('Override content'));assert.match(r.html,/What happens next/);assert.equal((r.html.match(/Confirm my subscription/g)||[]).length,1);assert.match(r.html,/background-color:#ffffff/);const n=renderEmail({id:1,title:'Editable',subject:'Promotion',html:'<h1>My custom promotion</h1>',preheader:'',status:'ready'},s,'Reader','https://example.test/unsubscribe/demo');assert.match(n.html,/My custom promotion/);assert.ok(!n.html.includes("33-items-logo"));assert.ok(!n.html.includes("padding:22px 30px"));assert.match(n.html,/unsubscribe\/demo/);assert.equal(settingsSchemas.emailDefaults.safeParse({...s.emailDefaults,headerBackground:'bad'}).success,false);});

test('bundled system logo is embedded without fetching arbitrary email image URLs',()=>{
 const s=settings(),r=renderConfirmation('','',s,'https://example.test/confirm/demo','https://example.test/unsubscribe/demo');const embedded=inlineSystemLogo(r.html);assert.equal(embedded.attachments.length,1);assert.ok(embedded.attachments[0]!.content.length>0);assert.match(embedded.html!,/src="cid:system-logo@33-items"/);assert.equal(inlineSystemLogo('<img src="http://127.0.0.1/private">').attachments.length,0);
 s.general.logoUrl='https://example.test/custom-logo.png';const custom=inlineSystemLogo(renderConfirmation('','',s,'https://example.test/confirm/demo','https://example.test/unsubscribe/demo').html);assert.equal(custom.attachments.length,0);assert.match(custom.html!,/custom-logo.png/);
});
