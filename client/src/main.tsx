import React,{lazy,Suspense} from 'react';
import { createRoot,hydrateRoot } from 'react-dom/client';
const AdminApp=lazy(()=>import('./admin/AdminApp').then(m=>({default:m.AdminApp})));
import {PublicApp} from './public/PublicApp';
import {readBootstrap} from './public/bootstrap';
const root=document.getElementById('root')!,bootstrap=readBootstrap();
const app=<React.StrictMode>{window.location.pathname.startsWith('/admin')?<Suspense fallback={<main className="state-screen" role="status">Loading your workspace…</main>}><AdminApp/></Suspense>:<PublicApp initial={bootstrap}/>}</React.StrictMode>;
if(root.dataset.rendered==='true'&&bootstrap)hydrateRoot(root,app);else createRoot(root).render(app);
