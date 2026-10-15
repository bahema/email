import {publicThemeStyle} from '../public/theme';
import type {WebsiteSections} from '@affiliate/shared';
import React from 'react';
import { useId,useState,type ReactNode,type CSSProperties } from 'react';
import { Modal } from './Modal';
export function PreviewFrame({children,label='Preview',stages,stage,onStage,theme}:{children:ReactNode;label?:string;stages?:[string,string][];stage?:string;onStage?:(value:string)=>void;theme?:WebsiteSections['theme']}){
 const [device,setDevice]=useState('desktop'),[full,setFull]=useState(false),headingId=useId();
 const surface=<section className={`preview-shell ${full?'preview-fullscreen':''}`} aria-label={label}><header className="preview-toolbar"><strong id={headingId}>{label}</strong><div className="compact-tabs" role="group" aria-label="Preview device">{['desktop','tablet','phone'].map(d=><button type="button" aria-pressed={device===d} className={device===d?'selected':''} onClick={()=>setDevice(d)} key={d}>{d}</button>)}</div><button type="button" className="button-secondary" onClick={()=>setFull(!full)}>{full?'Close full screen':'Expand'}</button></header>{stages&&<div className="preview-stages" role="group" aria-label="Preview signup stage">{stages.map(([value,text])=><button type="button" key={value} aria-pressed={stage===value} className={stage===value?'selected':''} onClick={()=>onStage?.(value)}>{text}</button>)}</div>}<p className="preview-warning">Simulation · no emails, subscribers or tracking events</p><div className={`preview-canvas preview-${device}`}><div className="public-site preview-content" style={theme?publicThemeStyle(theme):undefined}>{children}</div></div></section>;
 return full?<Modal labelledBy={headingId} className="preview-modal" close={()=>setFull(false)}>{surface}</Modal>:surface;
}
