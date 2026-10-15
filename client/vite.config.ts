import {readFile} from 'node:fs/promises';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {isPublicDocument,requestInitialDocument} from './document-startup.ts';

export default defineConfig({
  plugins: [react(), tailwindcss(), {name:'initial-public-document',configureServer(server){server.middlewares.use(async(req,res,next)=>{const url=req.url||'/',path=url.split(/[?#]/)[0]!;if(path.startsWith('/downloads/'))return next();if(!isPublicDocument(path,req.headers.accept))return next();try{const response=await requestInitialDocument(url.split('#')[0]!,req.headers.host||'127.0.0.1:5173',(input,init)=>{const headers=new Headers(init?.headers);if(/(?:^|;\s*)affiliate_storage_notice=1(?:;|$)/.test(req.headers.cookie||''))headers.set('Cookie','affiliate_storage_notice=1');return fetch(input,{...init,headers});});if(!response)return next();const document=response.html;let html=await readFile(new URL('./index.html',import.meta.url),'utf8');const head=document.match(/<head>([\s\S]*?)<\/head>/)?.[1]||'',body=document.match(/<body>([\s\S]*?)<\/body>/)?.[1]||'';html=html.replace(/<title>.*?<\/title>/s,'').replace('</head>',head+'</head>').replace('<div id="root"></div>',body);html=await server.transformIndexHtml(url,html);res.statusCode=response.status;res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');res.end(html);}catch(error){next(error);}});}}],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001', '/media': 'http://127.0.0.1:3001', '/go': 'http://127.0.0.1:3001', '/email': 'http://127.0.0.1:3001','/download':'http://127.0.0.1:3001', '/sitemap.xml':'http://127.0.0.1:3001', '/robots.txt':'http://127.0.0.1:3001' } },
});

