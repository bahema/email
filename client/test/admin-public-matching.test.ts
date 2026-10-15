import {PreviewFrame} from '../src/ui/PreviewFrame.tsx';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {sectionSchemas,defaultSections} from '../../server/src/content/schema.ts';
import type {SiteResponse,EditorialPage} from '@affiliate/shared';
import {renderPublic} from '../src/public/server-render.tsx';
import {EditorialArticle} from '../src/public/EditorialPages.tsx';
const page:EditorialPage={id:1,kind:'guide',title:'Guide',slug:'guide',status:'active',position:0,createdAt:'',updatedAt:'',data:{description:'A guide',body:'Guide content',category:'',imageId:null,productIds:[],guideIds:[],leadPageId:null,featured:false,seoTitle:'',seoDescription:''}};
function site():SiteResponse{return{name:'33 items',logoUrl:'/brand/33-items-logo.jpg',disclosure:'Independent affiliate recommendations',consentText:'Explicit consent required',items:[{id:1,kind:'navigation',slug:'guides-nav',title:'Learn',position:0,status:'active',data:{href:'/guides',label:'Learn'}}],sections:defaultSections(),editorial:[page]};}
test('admin theme colors and discovery headings reach server-rendered client markup',()=>{const s=site();s.sections.theme=sectionSchemas.theme.parse({...s.sections.theme,navBackground:'#123456',navText:'#ffffff',catalogBackground:'#e1e2e3',catalogAction:'#789abc',catalogActionText:'#112233'});s.sections.discovery!.savedHeading='My shortlist';const html=renderPublic({site:s,funnel:null,page:null,pageSlug:null,activity:{enabled:false,intervalSeconds:8,messages:[]}},'/');for(const text of ['--site-nav-bg:#123456','--site-nav-text:#ffffff','--catalog-bg:#e1e2e3','--catalog-action:#789abc','--catalog-action-text:#112233'])assert.ok(html.includes(text));assert.equal(html.split('href="/guides"').length-1,1);assert.match(html,/>Learn</);});
test('linked signup section appears in editorial preview without a working navigation action',()=>{const html=renderToStaticMarkup(React.createElement(EditorialArticle,{page,pages:[page],products:[],preview:true,disclosure:'Affiliate disclosure',leadHref:'/p/existing-journey'}));assert.match(html,/Receive related information/);assert.match(html,/aria-disabled="true"/);assert.ok(!html.includes('href="/p/existing-journey"'));});
test('existing theme records receive compatible new defaults without replacing original palette values',()=>{const theme=sectionSchemas.theme.parse({primary:'#112233',secondary:'#223344',accent:'#334455',background:'#ffffff'});assert.equal(theme.primary,'#112233');assert.equal(theme.navBackground,'#1b283b');assert.equal(theme.catalogAction,'#f2c75c');});

test('admin preview frame receives the same catalog and navigation colors as the public page',()=>{const theme=sectionSchemas.theme.parse({...defaultSections().theme,catalogAction:'#789abc',navBackground:'#123456'});const html=renderToStaticMarkup(React.createElement(PreviewFrame,{theme},React.createElement('p',null,'Preview')));assert.match(html,/--catalog-action:#789abc/);assert.match(html,/--site-nav-bg:#123456/);});
