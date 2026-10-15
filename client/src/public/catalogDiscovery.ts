import type {ContentItem} from '@affiliate/shared';
export const materialLabels:Record<string,string>={digital:'Digital resource',software:'Software',physical:'Physical product',service:'Service',event:'Event / course'};
export interface CatalogFilters{material:string;price:string;availability:string;currency:string;min:string;max:string;sort:string;}
export const emptyCatalogFilters:CatalogFilters={material:'',price:'',availability:'',currency:'',min:'',max:'',sort:'recommended'};
export function knownPrice(i:ContentItem){const mode=String(i.data.priceMode||'hidden');return mode==='free'?0:['fixed','from','subscription'].includes(mode)&&typeof i.data.priceAmount==='number'?i.data.priceAmount:null;}
export function materialType(i:ContentItem){return String(i.data.materialType&&i.data.materialType!=='unspecified'?i.data.materialType:i.data.deliveryType&&i.data.deliveryType!=='none'?i.data.deliveryType:'unspecified');}
export function availabilityType(i:ContentItem){return i.data.availability&&i.data.availability!=='unspecified'?String(i.data.availability):i.kind==='upcoming'||i.data.action==='coming_soon'?'coming_soon':'unspecified';}
export function discoverItems(items:ContentItem[],f:CatalogFilters){
 const limit=(s:string)=>s!==''&&Number.isFinite(Number(s))&&Number(s)>=0?Number(s):null,min=f.currency?limit(f.min):null,max=f.currency?limit(f.max):null;
 const result=items.filter(i=>{const price=knownPrice(i);return(!f.material||materialType(i)===f.material)&&(!f.price||(f.price==='free'?i.data.priceMode==='free':['fixed','from','subscription'].includes(String(i.data.priceMode))))&&(!f.availability||availabilityType(i)===f.availability)&&(!f.currency||i.data.priceMode==='free'||i.data.currency===f.currency)&&(min===null||(price!==null&&price>=min))&&(max===null||(price!==null&&price<=max));});
 if(f.sort==='name')result.sort((a,b)=>a.title.localeCompare(b.title,'en'));
 if(f.currency&&['price_low','price_high'].includes(f.sort))result.sort((a,b)=>{const ap=knownPrice(a),bp=knownPrice(b);return ap===null?bp===null?0:1:bp===null?-1:(ap-bp)*(f.sort==='price_high'?-1:1);});
 return result;
}
export function boundedIds(value:unknown,max=100){return Array.isArray(value)?[...new Set(value.filter((id):id is number=>typeof id==='number'&&Number.isSafeInteger(id)&&id>0))].slice(0,max):[];}

export function parseCatalogQuery(query:string){const q=new URLSearchParams(query),filters={...emptyCatalogFilters};for(const k of Object.keys(filters) as (keyof CatalogFilters)[])filters[k]=q.get(k)?.slice(0,100)||emptyCatalogFilters[k];if(!Object.hasOwn(materialLabels,filters.material))filters.material='';if(!['','free','paid'].includes(filters.price))filters.price='';if(!['','available','coming_soon','preorder','out_of_stock'].includes(filters.availability))filters.availability='';if(!/^[A-Z]{3}$/.test(filters.currency))filters.currency='';if(!['recommended','name','price_low','price_high'].includes(filters.sort))filters.sort='recommended';for(const k of ['min','max'] as const)if(filters[k]&&(!Number.isFinite(Number(filters[k]))||Number(filters[k])<0||Number(filters[k])>1e12))filters[k]='';return{filters,category:q.get('category')?.slice(0,200)||'All',search:q.get('q')?.slice(0,200)||''};}
