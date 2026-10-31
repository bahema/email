import {execFile} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {HttpError} from './http.js';

export const tikTokVideoInfo={width:1080,height:1920,durationSeconds:10,fps:30};
export interface TikTokLayer{key:string;image:Buffer;x:number;y:number;start:number;offsetX:number;offsetY:number;}
export interface TikTokScene{poster:Buffer;layers:TikTokLayer[];background?:string;}
export function tikTokOriginAllowed(origin:string|undefined,trusted:string[],allowLoopback:boolean){
 if(!origin)return true;if(trusted.includes(origin))return true;if(!allowLoopback)return false;
 try{const url=new URL(origin);return url.origin===origin&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)&&['5173','3001'].includes(url.port);}catch{return false;}
}
export type VideoEncoder=(scene:TikTokScene)=>Promise<Buffer>;
export async function renderTikTokVideo(scene:TikTokScene):Promise<Buffer>{
 const directory=await mkdtemp(join(tmpdir(),'affiliate-tiktok-'));
 try{
  if(!scene.layers.length||scene.layers.length>8)throw Error('Video scene is unavailable');
  const background=/^#[a-f0-9]{6}$/i.test(scene.background||'')?scene.background!.slice(1):'edf1e8';
  const output=join(directory,'product.mp4'),args=['-hide_banner','-loglevel','error','-nostdin','-y','-filter_complex_threads','1','-f','lavfi','-i','color=c=0x'+background+':s=1080x1920:r=30:d=10'];
  const filters:string[]=[];let previous='0:v';
  for(let i=0;i<scene.layers.length;i++){
   const layer=scene.layers[i]!,input=join(directory,'layer-'+i+'.png');await writeFile(input,layer.image);args.push('-protocol_whitelist','file,pipe','-loop','1','-framerate','1','-i',input);
   const progress=`pow(1-clip((t-${layer.start})/0.65,0,1),3)`,x=`${layer.x}+${layer.offsetX}*${progress}`,y=`${layer.y}+${layer.offsetY}*${progress}`;
   filters.push(`[${i+1}:v]fps=30,format=rgba,fade=t=in:st=${layer.start}:d=0.45:alpha=1[layer${i}]`);
   filters.push(`[${previous}][layer${i}]overlay=x='${x}':y='${y}':enable='gte(t,${layer.start})':shortest=1[stage${i}]`);previous='stage'+i;
  }
  filters.push(`[${previous}]fade=t=out:st=9.65:d=0.35,scale=in_range=tv:out_range=tv,format=yuv420p[video]`);
  args.push('-filter_complex',filters.join(';'),'-map','[video]','-t','10','-an','-pix_fmt','yuv420p','-color_range','tv','-map_metadata','-1','-c:v','libx264','-preset','veryfast','-crf','23','-maxrate','3M','-bufsize','6M','-threads','2','-movflags','+faststart',output);
  await new Promise<void>((resolve,reject)=>{execFile(process.env.FFMPEG_PATH||'ffmpeg',args,{windowsHide:true,timeout:90000,maxBuffer:128*1024,shell:false},error=>error?reject(new Error('Video rendering is unavailable. Download the poster instead, or try again later.')):resolve());});
  const video=await readFile(output);if(video.length>6*1024*1024||video.subarray(4,8).toString()!=='ftyp')throw new Error('Video export could not be completed. Download the poster instead.');return video;
 }finally{const target=relative(tmpdir(),directory);if(target.startsWith('affiliate-tiktok-')&&!target.includes('..')&&!isAbsolute(target))await rm(directory,{recursive:true,force:true});}
}
type Job={state:'queued'|'rendering'|'ready'|'failed';created:number;prepare:()=>Promise<TikTokScene>;video?:Buffer;};
export class TikTokVideoQueue{
 private jobs=new Map<string,Job>();private running=false;private renderStarts:number[]=[];
 constructor(private encoder:VideoEncoder=renderTikTokVideo){}
 private prune(){const now=Date.now();for(const [key,job]of this.jobs)if(['ready','failed'].includes(job.state)&&now-job.created>3600000)this.jobs.delete(key);}
 status(key:string){this.prune();return this.jobs.get(key)?.state??'idle';}
 video(key:string){this.prune();return this.jobs.get(key)?.video;}
 request(key:string,prepare:()=>Promise<TikTokScene>){
  this.prune();const existing=this.jobs.get(key);if(existing&&existing.state!=='failed')return existing.state;
  if([...this.jobs.values()].filter(j=>j.state==='queued'||j.state==='rendering').length>=3)throw new HttpError(503,'VIDEO_BUSY','Video rendering is busy. Try again shortly or download the poster.');
  const now=Date.now();this.renderStarts=this.renderStarts.filter(t=>now-t<3600000);if(this.renderStarts.length>=30)throw new HttpError(503,'VIDEO_LIMIT','The hourly video preparation limit has been reached. Download the poster or try again later.');
  if(existing)this.jobs.delete(key);
  while(this.jobs.size>=8){const old=[...this.jobs].find(([,j])=>j.state==='ready'||j.state==='failed');if(!old)throw new HttpError(503,'VIDEO_BUSY','Video rendering is busy. Try again shortly.');this.jobs.delete(old[0]);}
  this.renderStarts.push(now);this.jobs.set(key,{state:'queued',created:now,prepare});void this.pump();return this.status(key);
 }
 private async pump(){
  if(this.running)return;const entry=[...this.jobs].find(([,j])=>j.state==='queued');if(!entry)return;
  this.running=true;const [,job]=entry;job.state='rendering';
  try{const video=await this.encoder(await job.prepare());if(video.length>6*1024*1024)throw new Error('Video too large');job.video=video;job.state='ready';}catch{job.state='failed';}finally{job.prepare=async()=>{throw Error('Render completed');};this.running=false;void this.pump();}
 }
}
