import React, { useState } from 'react';
export function EditorialImage({id,category='',alt='',className='',eager=false}:{id?:unknown;category?:string;alt?:string;className?:string;eager?:boolean}){
 const supplied=typeof id==='number'?`/media/${id}`:null;
 const [failed,setFailed]=useState<string|null>(null);
 const fallback=/book|read|guide|business/i.test(category)?'/design/reading.jpg':/software|tool|tech/i.test(category)?'/design/tools.jpg':'/design/editorial-workspace.jpg';
 const source=supplied&&failed!==supplied?supplied:fallback;
 return <img width={960} height={640} src={source} alt={supplied&&failed!==supplied?alt:''} className={className} loading={eager?'eager':'lazy'} decoding="async" onError={()=>{if(supplied&&source===supplied)setFailed(supplied);}}/>;
}
