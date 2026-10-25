import type {ContentItem} from './index.js';
export const healthCategories=['beauty','cosmetics','nutrition','wellness'] as const;
export type HealthCategory=typeof healthCategories[number];
export const healthCategoryLabels:Record<HealthCategory,string>={beauty:'Beauty & skincare',cosmetics:'Cosmetics',nutrition:'Food & nutrition',wellness:'Everyday wellness'};
export interface HealthSliderStyle {backgroundFrom:string;backgroundTo:string;text:string;muted:string;button:string;buttonText:string;imageBackground:string;priceBackground:string;shadow:'soft'|'defined'|'strong';}
export const defaultHealthSlider:HealthSliderStyle={backgroundFrom:'#142D4E',backgroundTo:'#245A86',text:'#FFFFFF',muted:'#DCE8F3',button:'#865563',buttonText:'#FFFFFF',imageBackground:'#FFF9F0',priceBackground:'#F2C75C',shadow:'defined'};
export interface HealthSection {
 slider?:HealthSliderStyle;
 enabled:boolean;headline:string;description:string;body:string;seoTitle:string;seoDescription:string;imageId:number|null;leadPageId:number|null;
 products:{offerId:number;category:HealthCategory;featured?:boolean}[];
 header:{background:string;text:string;accent:string;eyebrow:string;layout:'split'|'background'|'compact';alignment:'left'|'center';action:'browse'|'product'|'link'|'subscribe'|'none';buttonLabel:string;offerId:number|null;productTarget:'details'|'provider';url:string;leadPageId:number|null;secondaryLabel:string;secondaryUrl:string};
}
export const defaultHealth:HealthSection={enabled:false,headline:'Small rituals. Thoughtful choices.',description:'Explore beauty, personal care and everyday wellness with clear product details and useful context.',body:'Compare ingredients, read provider information and consider what fits your everyday routine. We explain the details so you can make your own choice.',seoTitle:'Health & Beauty',seoDescription:'Explore beauty, cosmetics, food and everyday wellness resources, with transparent affiliate recommendations and provider information.',imageId:null,leadPageId:null,products:[],header:{background:'#e9eee2',text:'#193b30',accent:'#215343',eyebrow:'Carefully considered · Clearly explained',layout:'split',alignment:'left',action:'browse',buttonLabel:'Explore the department',offerId:null,productTarget:'details',url:'',leadPageId:null,secondaryLabel:'',secondaryUrl:''}};

export function healthProducts(config:HealthSection,items:ContentItem[]){return config.products.flatMap(p=>{const offer=items.find(i=>i.id===p.offerId&&i.kind==='offer'&&i.status==='active');return offer?[{offer,category:p.category,featured:p.featured!==false}]:[];});}
export function healthSliderProducts(config:HealthSection,items:ContentItem[]){return config.enabled?healthProducts(config,items).filter(p=>p.featured).slice(0,6):[];}
