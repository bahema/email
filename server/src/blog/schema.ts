import {z} from 'zod';

const slug=z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/,'Use lowercase words separated by hyphens');
const safeHttpUrl=z.string().trim().max(2000).refine(value=>{
 if(!value)return true;
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}
 catch{return false;}
},'Use a valid HTTP or HTTPS URL');

export const blogSettingsSchema=z.object({
 enabled:z.boolean(),
 showWhenEmpty:z.boolean().default(false)
}).strict();

export const blogCategorySchema=z.object({
 title:z.string().trim().min(1).max(120),
 slug,
 description:z.string().trim().max(1000).default(''),
 status:z.enum(['active','inactive']).default('active'),
 position:z.number().int().min(0).max(10000).default(0)
}).strict();

const uniqueIds=z.array(z.number().int().positive()).max(50).refine(ids=>new Set(ids).size===ids.length,'Remove duplicate selections');

export const blogArticleSchema=z.object({
 title:z.string().trim().min(1).max(200),
 slug,
 excerpt:z.string().trim().min(1).max(1000),
 categoryId:z.number().int().positive().nullable().default(null),
 author:z.string().trim().max(120).default(''),
 status:z.enum(['draft','active','inactive']).default('draft'),
 bodyHtml:z.string().max(100000),
 coverMediaId:z.number().int().positive().nullable().default(null),
 coverAlt:z.string().trim().max(300).default(''),
 featured:z.boolean().default(false),
 seoTitle:z.string().trim().max(120).default(''),
 seoDescription:z.string().trim().max(200).default(''),
 canonicalUrl:safeHttpUrl.default(''),
 publishedAt:z.iso.datetime({offset:true}).nullable().default(null),
 scheduledAt:z.iso.datetime({offset:true}).nullable().default(null),
 productIds:uniqueIds.default([]),
 relatedArticleIds:uniqueIds.default([])
}).strict();
