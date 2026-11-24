import {Router} from 'express';
import type {DatabaseSync} from 'node:sqlite';
import type {Sessions} from '../security/sessions.js';
import {HttpError} from '../http.js';
import {BlogStore} from './store.js';
import {z} from 'zod';
export function blogRoutes(db:DatabaseSync,sessions:Sessions){const admin=Router(),pub=Router(),store=new BlogStore(db);admin.use(sessions.requireAdmin,sessions.csrf);
 admin.get('/settings',(_q,r)=>r.json(store.settings()));admin.put('/settings',(q,r)=>r.json(store.saveSettings(q.body)));
 admin.get('/categories',(_q,r)=>r.json({categories:store.categories()}));admin.post('/categories',(q,r)=>r.status(201).json(store.saveCategory(q.body)));admin.put('/categories/:id',(q,r)=>r.json(store.saveCategory(q.body,z.coerce.number().int().positive().parse(q.params.id))));admin.delete('/categories/:id',(q,r)=>{store.deleteCategory(z.coerce.number().int().positive().parse(q.params.id));r.json({message:'Category deleted'});});
 admin.get('/articles',(_q,r)=>r.json({articles:store.articles()}));admin.post('/articles',(q,r)=>r.status(201).json(store.saveArticle(q.body)));admin.put('/articles/:id',(q,r)=>r.json(store.saveArticle(q.body,z.coerce.number().int().positive().parse(q.params.id))));admin.delete('/articles/:id',(q,r)=>{store.deleteArticle(z.coerce.number().int().positive().parse(q.params.id));r.json({message:'Article deleted'});});
 pub.get('/',(_q,r)=>{const settings=store.settings();if(!settings.enabled)throw new HttpError(404,'NOT_FOUND','Blog is unavailable');const categories=store.publicCategories(),articles=store.publicArticles();r.json({categories,articles,products:Object.fromEntries(articles.map(a=>[a.id,store.publicProducts(a.productIds)]))});});
 pub.get('/category/:slug',(q,r)=>{const settings=store.settings();if(!settings.enabled)throw new HttpError(404,'NOT_FOUND','Blog is unavailable');const category=store.publicCategories().find(c=>c.slug===q.params.slug);if(!category)throw new HttpError(404,'NOT_FOUND','Blog category not found');const articles=store.publicArticles(category.id);r.json({category,articles,products:Object.fromEntries(articles.map(a=>[a.id,store.publicProducts(a.productIds)]))});});
 pub.get('/article/:slug',(q,r)=>{const settings=store.settings();if(!settings.enabled)throw new HttpError(404,'NOT_FOUND','Blog is unavailable');const article=store.getBySlug(String(q.params.slug));if(!article)throw new HttpError(404,'NOT_FOUND','Blog article not found');const related=article.relatedArticleIds.map(id=>{try{return store.getArticle(id);}catch{return null;}}).filter((v):v is NonNullable<typeof v>=>!!v&&v.status==='active');r.json({article,category:store.publicCategories().find(c=>c.id===article.categoryId)||null,products:store.publicProducts(article.productIds),related});});
 return{admin,pub,store};}
