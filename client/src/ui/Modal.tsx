import React from 'react';
import { useEffect,useRef,type ReactNode } from 'react';
let openDialogs=0,originalOverflow='';
export function Modal({children,labelledBy,close,className='studio-dialog'}:{children:ReactNode;labelledBy:string;close:()=>void;className?:string}){
 const ref=useRef<HTMLDialogElement>(null),closeRef=useRef(close);closeRef.current=close;
 useEffect(()=>{const dialog=ref.current!,previous=document.activeElement as HTMLElement|null;dialog.showModal();if(openDialogs++===0)originalOverflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{dialog.close();if(--openDialogs===0)document.body.style.overflow=originalOverflow;if(previous?.isConnected)previous.focus();};},[]);
 return <dialog ref={ref} className={className} aria-labelledby={labelledBy} onCancel={e=>{e.preventDefault();closeRef.current();}} onClick={e=>{if(e.target===e.currentTarget){const box=e.currentTarget.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)closeRef.current();}}}>{children}</dialog>;
}
