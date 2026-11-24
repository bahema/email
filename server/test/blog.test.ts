import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db/database.js';
import {migrate} from '../src/db/migrations.js';
import {BlogStore} from '../src/blog/store.js';

test('Blog defaults to private and settings are independently configurable',()=>{
 const db=openDatabase(':memory:');try{migrate(db);const blog=new BlogStore(db);assert.deepEqual(blog.settings().enabled,false);assert.equal(blog.settings().showWhenEmpty,false);const saved=blog.saveSettings({enabled:true,showWhenEmpty:true});assert.equal(saved.enabled,true);assert.equal(saved.showWhenEmpty,true);}finally{db.close();}
});
test('Blog categories and articles validate, sanitize rich content and publish only when scheduled',()=>{
 const db=openDatabase(':memory:');try{migrate(db);const blog=new BlogStore(db);const cat=blog.saveCategory({title:'Technology',slug:'technology',description:'Technology articles',status:'active',position:0});const article=blog.saveArticle({title:'A useful article',slug:'a-useful-article',excerpt:'A practical guide to this subject.',categoryId:cat.id,author:'Editorial team',status:'active',bodyHtml:'<h2>Introduction</h2><p>This is a sufficiently detailed article body that provides practical context for readers.</p><script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(2)">',coverMediaId:null,coverAlt:'',featured:true,seoTitle:'',seoDescription:'',canonicalUrl:'',publishedAt:null,scheduledAt:null,productIds:[],relatedArticleIds:[]});assert.equal(article.status,'active');assert.equal(article.bodyHtml.includes('<script'),false);assert.equal(article.bodyHtml.includes('javascript:'),false);assert.equal(article.bodyHtml.includes('onerror'),false);assert.equal(blog.publicArticles().length,1);const future=blog.saveArticle({title:'Scheduled article',slug:'scheduled-article',excerpt:'A future article.',categoryId:cat.id,author:'',status:'active',bodyHtml:'<p>This article contains enough useful words to pass the publication validation requirements.</p>',coverMediaId:null,coverAlt:'',featured:false,seoTitle:'',seoDescription:'',canonicalUrl:'',publishedAt:null,scheduledAt:'2999-01-01T00:00:00.000Z',productIds:[],relatedArticleIds:[]});assert.equal(blog.publicArticles().some(a=>a.id===future.id),false);assert.equal(blog.publicArticles(cat.id).length,1);}finally{db.close();}
});
