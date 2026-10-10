'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('GuandanEngine',Object.freeze({
  listen:handler=>ipcRenderer.on('guandan-engine-request',(_event,payload)=>handler(payload)),
  result:payload=>ipcRenderer.send('guandan-engine-result',payload),
}));
