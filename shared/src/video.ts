export type VideoSource={kind:'file';src:string}|{kind:'youtube'|'vimeo';id:string;hash?:string};
/** Parse known video links, never arbitrary HTML or iframe URLs. */
export function videoSource(value:string):VideoSource|null{
 if(!value||value.length>2000||/[\s\\\u0000-\u001f]/.test(value))return null;
 if(/^\/media\/[1-9]\d*$/.test(value))return{kind:'file',src:value};
 let u:URL;try{u=new URL(value);}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const host=u.hostname.toLowerCase(),parts=u.pathname.split('/').filter(Boolean);
 if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com','youtu.be'].includes(host)){
 const id=host==='youtu.be'?parts[0]:parts[0]==='watch'?u.searchParams.get('v'):['embed','shorts','live'].includes(parts[0]??'')?parts[1]:null;
 return id&&/^[\w-]{11}$/.test(id)?{kind:'youtube',id}:null;
 }
 if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)){
 const id=host==='player.vimeo.com'&&parts[0]==='video'?parts[1]:parts[0],hash=u.searchParams.get('h')??parts[1];
 if(!id||!/^\d{1,12}$/.test(id))return null;
 return{kind:'vimeo',id,...(hash&&/^[a-f0-9]{6,32}$/i.test(hash)?{hash}:{})};
 }
 if(/\.(mp4|webm|ogv|ogg)$/i.test(u.pathname))return{kind:'file',src:u.href};
 return null;
}
export function videoEmbed(source:Exclude<VideoSource,{kind:'file'}>,autoplay:boolean){
 if(source.kind==='youtube')return 'https://www.youtube-nocookie.com/embed/'+source.id+'?'+new URLSearchParams({autoplay:autoplay?'1':'0',mute:'1',playsinline:'1',controls:'1',rel:'0'});
 return 'https://player.vimeo.com/video/'+source.id+'?'+new URLSearchParams({autoplay:autoplay?'1':'0',muted:'1',playsinline:'1',controls:'1',dnt:'1',...(source.hash?{h:source.hash}:{})});
}
