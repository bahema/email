import {createContext} from 'react';
import type {SiteResponse,LeadPage,CountryOption} from '@affiliate/shared';
export interface ActionInfo {completed:boolean;headline:string;message:string;returnLabel:string;returnUrl:string;downloadUrl?:string|null;offerUrl?:string|null;recommendations?:{title:string;message:string;href:string;affiliate:boolean}[];}
export interface PublicBootstrap {query?:string;countries?:CountryOption[];renderedAt?:number;publicOrigin?:string;storageSaved?:boolean;action?:{info:ActionInfo|null;error:string}|null;site:SiteResponse;funnel:{slug:string;host:string}|null;page:{id:number;type:string;data:Omit<LeadPage['data'],'downloadPageId'|'directNewsletterId'|'resourceId'|'automationId'|'confirmationSubject'|'confirmationBody'>;hasResource:boolean}|null;pageSlug:string|null;activity:{enabled:boolean;intervalSeconds:number;messages:{text:string}[]};}
export function readBootstrap():PublicBootstrap|null{try{const node=document.getElementById('public-bootstrap');return node?JSON.parse(node.textContent||'null'):null;}catch{return null;}}

export const BootstrapContext=createContext<PublicBootstrap|null>(null);
