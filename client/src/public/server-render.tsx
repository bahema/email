import React from 'react';
import {renderToString} from 'react-dom/server';
import {PublicApp} from './PublicApp';
import type {PublicBootstrap} from './bootstrap';
export function renderPublic(bootstrap:PublicBootstrap,path:string){return renderToString(<PublicApp initial={bootstrap} pathname={path}/>);}
