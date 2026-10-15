import {useContext,useEffect,useState} from 'react';
import {BootstrapContext} from './bootstrap';
export function usePublicClock(intervalMs=60000){const bootstrap=useContext(BootstrapContext);const [now,setNow]=useState(()=>bootstrap?.renderedAt??Date.now());useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),intervalMs);return()=>clearInterval(timer);},[intervalMs]);return now;}
export function publicDate(value:string){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('en-GB',{timeZone:'UTC',year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'})+' UTC':'Date to be announced';}
