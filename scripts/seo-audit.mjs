import {mkdir,writeFile,readFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const base=process.env.AUDIT_URL||'http://127.0.0.1:5173',out=resolve('.agent-churn-control/seo-audit');await mkdir(out,{recursive:true});
const site=await(await fetch(base+'/api/public/site')).json(),sitemap=await(await fetch(base+'/sitemap.xml')).text(),robots=await(await fetch(base+'/robots.txt')).text();
const paths=[...new Set(['/',...Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g),m=>new URL(m[1].replaceAll('&amp;','&')).pathname)])];
const findings=[],pages=[],files=[];if(!robots.includes('Sitemap:'))findings.push({path:'/robots.txt',issue:'Missing sitemap declaration'});
for(const [index,path]of paths.entries()){
 if(/^\/(admin|confirm|unsubscribe|downloads?|go|email)(\/|$)/.test(path)){findings.push({path,issue:'Private/action URL in sitemap'});continue;}
 const response=await fetch(base+path,{headers:{Accept:'text/html'}}),html=await response.text(),file=resolve(out,index+'.html');await writeFile(file,html);files.push(file);
 const count=(pattern)=>(html.match(pattern)||[]).length;
 for(const [valid,issue]of [[response.status===200,'Public page does not return 200'],[count(/<title>/gi)===1,'Expected one title'],[count(/rel="canonical"/gi)===1,'Expected one canonical'],[count(/name="description"/gi)===1,'Expected one description'],[/<!doctype html>/i.test(html),'Missing HTML doctype'],[/<html[^>]*lang="en"/i.test(html),'Missing document language'],[/name="viewport"/i.test(html),'Missing mobile viewport'],[/property="og:image"/i.test(html),'Missing social image'],[!/<meta name="robots" content="noindex/i.test(html),'Noindex URL is listed in sitemap']])if(!valid)findings.push({path,issue});
 for(const img of html.matchAll(/<img\b[^>]*>/gi))if(!/\balt=/.test(img[0]))findings.push({path,issue:'Image missing alt attribute'});
 try{for(const data of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g))JSON.parse(data[1]);}catch{findings.push({path,issue:'Invalid JSON-LD'});}
 pages.push({path,status:response.status,title:html.match(/<title>(.*?)<\/title>/)?.[1]});
}
const jar=process.env.VNU_JAR||resolve('.agent-churn-control/tools/vnu.jar');let htmlValidation={available:false,errors:[],warnings:[],informationCount:0};
try{await access(jar);const result=spawnSync('java',['-jar',jar,'--format','json',...files],{encoding:'utf8',maxBuffer:20*1024*1024});if(result.error)throw result.error;const report=JSON.parse(result.stderr||result.stdout);await writeFile(resolve(out,'nu.json'),JSON.stringify(report,null,2));htmlValidation={available:true,errors:report.messages.filter(m=>m.type==='error'),warnings:report.messages.filter(m=>m.subType==='warning'),informationCount:report.messages.filter(m=>m.type==='info'&&!m.subType).length};}catch(error){htmlValidation.reason=error.message;}
const report={checkedAt:new Date().toISOString(),base,publishedItems:site.items.filter(i=>i.kind==='offer').length,pages,findings,htmlValidation};await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pages:pages.length,metadataFindings:findings,nuAvailable:htmlValidation.available,nuErrors:htmlValidation.errors.map(m=>({message:m.message,url:m.url})),nuWarnings:htmlValidation.warnings.length,report:resolve(out,'report.json')},null,2));if(findings.length||htmlValidation.errors.length)process.exitCode=1;
