import type {CountryOption} from '@affiliate/shared';
const continents=new Set(['Africa','Asia','Europe','North America','South America','Oceania']);
export function validCountries(value:unknown):value is CountryOption[]{
 return Array.isArray(value)&&value.length>0&&value.length<=300&&value.every(c=>c&&typeof c==='object'&&typeof c.code==='string'&&/^[A-Z]{2}$/.test(c.code)&&typeof c.name==='string'&&c.name.length>0&&c.name.length<=200&&continents.has(c.continent))&&new Set(value.map(c=>c.code)).size===value.length;
}
export function createCountryLoader(request:(signal:AbortSignal)=>Promise<unknown>,timeoutMs=8000){
 let cached:CountryOption[]|null=null,pending:Promise<CountryOption[]>|null=null;
 return function load():Promise<CountryOption[]>{if(cached)return Promise.resolve(cached);if(pending)return pending;
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Country request timed out'));},timeoutMs);});
 pending=Promise.race([Promise.resolve().then(()=>request(controller.signal)),timeout]).then(data=>{if(!validCountries(data))throw new Error('Country response unavailable');cached=data;return data;}).finally(()=>{clearTimeout(timer);pending=null;});return pending;
 };
}
export const loadCountries=createCountryLoader(async signal=>{const response=await fetch('/api/public/countries',{signal,credentials:'same-origin',headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Country response unavailable');return response.json();});
