export interface VideoPromotion {
 key:string;slug:string;title:string;status:'draft'|'active'|'inactive';
 eyebrow:string;description:string;body:string;benefits:string[];
 imageId:number|null;videoId:number|null;videoUrl:string;videoAutoplay:boolean;
 layout:'split'|'stacked';alignment:'left'|'center';background:string;textColor:string;accent:string;
 action:'offer'|'lead'|'none';offerTarget:'details'|'provider';offerId:number|null;leadPageId:number|null;ctaLabel:string;
 productIds:number[];relatedHeading:string;detailsHeading:string;leadHeading:string;leadDescription:string;
 seoTitle:string;seoDescription:string;noindex:boolean;uploadDate:string;
 startsAt:string;endsAt:string;
 notification:{enabled:boolean;title:string;message:string;imageId:number|null;label:string;side:'left'|'right';delaySeconds:number;durationSeconds:number;cooldownHours:number;pages:string[]};
}
export function promotionLive(p:VideoPromotion,now=Date.now()){return p.status==='active'&&(!p.startsAt||Date.parse(p.startsAt)<=now)&&(!p.endsAt||Date.parse(p.endsAt)>now);}
export function newVideoPromotion(key:string):VideoPromotion{return{key,slug:'',title:'',status:'draft',eyebrow:'Featured promotion',description:'',body:'',benefits:[],imageId:null,videoId:null,videoUrl:'',videoAutoplay:true,layout:'split',alignment:'left',background:'#eaf1f5',textColor:'#183343',accent:'#f2c75c',action:'none',offerTarget:'details',offerId:null,leadPageId:null,ctaLabel:'Explore this offer',productIds:[],relatedHeading:'Related discoveries',detailsHeading:'A closer look',leadHeading:'Get the details in your inbox',leadDescription:'Continue to our signup page to review what you will receive and confirm your subscription.',seoTitle:'',seoDescription:'',noindex:false,uploadDate:'',startsAt:'',endsAt:'',notification:{enabled:false,title:'',message:'',imageId:null,label:'Watch & explore',side:'right',delaySeconds:8,durationSeconds:10,cooldownHours:24,pages:['/']}};}

export function colorContrast(a:string,b:string){if(!/^#[0-9a-f]{6}$/i.test(a)||!/^#[0-9a-f]{6}$/i.test(b))return 0;const light=(v:string)=>{const c=v.replace('#','').match(/../g)!.map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*c[0]!+.7152*c[1]!+.0722*c[2]!;};const x=light(a),y=light(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function promotionButtonInk(background:string){return colorContrast(background,'#ffffff')>=colorContrast(background,'#000000')?'#ffffff':'#000000';}
