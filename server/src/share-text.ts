import {join} from 'node:path';
import sharp from 'sharp';
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export interface TextBox{width:number;height:number;maxSize:number;minSize:number;bold?:boolean;maxLines?:number;color:string;}
// Render and measure with the same font engine: character counts cannot bound glyph widths.
export async function fitShareText(value:string,box:TextBox){
 const normalized=value.replace(/\s+/gu,' ').trim();if(!normalized)return null;const parts:string[]=[];for(const entry of new Intl.Segmenter('en',{granularity:'grapheme'}).segment(normalized)){if(parts.length===512)break;parts.push(entry.segment);}const clean=parts.join('')+(parts.join('').length<normalized.length?'…':'');
 const render=async(text:string,size:number)=>{const result=await sharp({text:{text:`<span foreground="${box.color}">${escape(text)}</span>`,font:`${process.platform==='win32'?'Arial':'DejaVu Sans'}${box.bold?' Bold':''} ${size}`,...(process.platform==='win32'?{fontfile:join(process.env.SystemRoot||'C:/Windows','Fonts',box.bold?'arialbd.ttf':'arial.ttf')}:{}),width:box.width,wrap:'word-char',rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});return{buffer:result.data,width:result.info.width,height:result.info.height,fontSize:size,text};};
 const fits=(r:{width:number;height:number;fontSize:number})=>r.width<=box.width&&r.height<=Math.min(box.height,box.maxLines?Math.ceil(r.fontSize*1.25*box.maxLines):box.height);
 let low=box.minSize,high=box.maxSize,best:Awaited<ReturnType<typeof render>>|null=null;
 while(low<=high){const size=Math.floor((low+high)/2),result=await render(clean,size);if(fits(result)){best=result;low=size+1;}else high=size-1;}
 if(best)return best;
 const graphemes=Array.from(new Intl.Segmenter('en',{granularity:'grapheme'}).segment(clean),s=>s.segment);low=0;high=graphemes.length;
 while(low<=high){const count=Math.floor((low+high)/2),result=await render(graphemes.slice(0,count).join('').trimEnd()+'…',box.minSize);if(fits(result)){best=result;low=count+1;}else high=count-1;}
 if(!best)throw Error('Share text does not fit its reserved space');return best;
}
