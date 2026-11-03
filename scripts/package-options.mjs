import {verifyRuntime} from './public-runtime.mjs';
const approved=new Set(Object.keys(verifyRuntime().files));
export function ignoreRuntimeFile(name){if(!name||name==='/')return false;const rel=name.replaceAll('\\','/').replace(/^\/+/, '');return !approved.has(rel)&&![...approved].some(p=>p.startsWith(rel+'/'));}
