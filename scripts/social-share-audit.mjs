import {writeFileSync} from 'node:fs';
const origin='http://localhost:5173',api='http://localhost:3001';
const get=(url,headers={})=>fetch(url,{headers,signal:AbortSignal.timeout(20000)});
const site=await (await get(api+'/api/public/site')).json();
const items=site.items.filter(i=>['offer','upcoming'].includes(i.kind));
const agents={Facebook:'facebookexternalhit/1.1',LinkedIn:'LinkedInBot/1.0',X:'Twitterbot/1.0',WhatsApp:'WhatsApp/2.0'};
const decode=s=>s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
function tags(html){const head=html.split('</head>')[0],out={};for(const tag of head.match(/<meta\b[^>]*>/gi)??[]){const a=Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(m=>[m[1],decode(m[2])]));const k=a.property??a.name;if(k)(out[k]??=[]).push(a.content??'');}return out;}
function dimensions(b){if(b.subarray(1,4).toString()==='PNG')return{width:b.readUInt32BE(16),height:b.readUInt32BE(20)};if(b.subarray(0,3).toString()==='GIF')return{width:b.readUInt16LE(6),height:b.readUInt16LE(8)};if(b[0]===255&&b[1]===216){let p=2;while(p+9<b.length){if(b[p]!==255){p++;continue;}const m=b[p+1];p+=2;if(m===217||m===218)break;const n=b.readUInt16BE(p);if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(m))return{height:b.readUInt16BE(p+3),width:b.readUInt16BE(p+5)};if(n<2)break;p+=n;}}return null;}
const results=[],images=new Map();
for(const item of items){const path='/resources/'+item.kind+'/'+encodeURIComponent(item.slug),r={title:item.title,path,checks:[],warnings:[]};
 for(const [platform,ua] of Object.entries(agents)){try{const response=await get(origin+path,{'user-agent':ua,accept:'text/html'}),html=await response.text(),t=tags(html),issues=[];for(const k of ['og:title','og:description','og:image','og:url','twitter:card','twitter:title','twitter:description','twitter:image'])if(t[k]?.length!==1||!t[k][0])issues.push('missing, empty or duplicate '+k);
 if(t['og:title']?.[0]!==item.title+' | '+site.name)issues.push('wrong item title');
 if(new URL(t['og:url']?.[0]??origin).pathname!==path)issues.push('wrong item destination');
 if(!html.includes('data-rendered="true"'))issues.push('missing initial rendered HTML');
 if(response.status!==200)issues.push('HTTP '+response.status);
 if(t['twitter:card']?.[0]!=='summary_large_image')issues.push('wrong X card type');
 const image=t['og:image']?.[0];if(image&&!images.has(image)){try{const u=new URL(image);if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw new Error('External image not fetched by local audit');const img=await get(image,{'user-agent':ua}),buffer=Buffer.from(await img.arrayBuffer());images.set(image,{status:img.status,type:img.headers.get('content-type'),bytes:buffer.length,dimensions:dimensions(buffer),attachment:img.headers.get('content-disposition'),publicAccessible:img.status===200&&img.headers.get('content-type')?.startsWith('image/')&&buffer.length>0});}catch(e){images.set(image,{error:e.message,publicAccessible:false});}}
 if(!images.get(image)?.publicAccessible)issues.push('image inaccessible');
 if(!t['og:image:width']||!t['og:image:height']){if(!r.warnings.includes('Image dimensions absent from metadata'))r.warnings.push('Image dimensions absent from metadata');}
 r.checks.push({platform,status:response.status,title:t['og:title']?.[0],description:t['og:description']?.[0],image,url:t['og:url']?.[0],issues,localPass:issues.length===0});
 }catch(e){r.checks.push({platform,localPass:false,error:e.message});}}
 if(/demo|fictional|replace with/i.test(item.title+' '+item.data.description))r.warnings.push('Demo content remains public');results.push(r);
}
const report={checkedAt:new Date().toISOString(),method:'Local unauthenticated HTTP fetches with crawler user-agent strings. No actual social platform fetched, rendered or cached these pages.',siteName:site.name,itemCount:items.length,checks:results.flatMap(r=>r.checks).length,passed:results.flatMap(r=>r.checks).filter(c=>c.localPass).length,publicPlatformValidation:'NOT TESTED: localhost is not reachable by external social crawlers.',results,images:Object.fromEntries(images)};
writeFileSync('.agent-churn-control/social-share-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
