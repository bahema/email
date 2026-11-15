export function normalizeShareBackground(value:string){return /^#[a-f0-9]{6}$/i.test(value)?value.toUpperCase():null;}
const luminance=(hex:string)=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*rgb[0]!+.7152*rgb[1]!+.0722*rgb[2]!;};
export function shareContrast(a:string,b:string){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function shareAppearance(background:string){const normalized=normalizeShareBackground(background);if(!normalized)throw Error('Invalid share background');const foreground=shareContrast(normalized,'#193B30')>=4.5?'#193B30':shareContrast(normalized,'#FFFFFF')>=4.5?'#FFFFFF':'#000000';return{background:normalized,foreground};}
export function shareQuery(path:string,key:string,value:string){const [base,query='']=path.split('?'),params=new URLSearchParams(query);params.set(key,value);return base+'?'+params.toString();}
