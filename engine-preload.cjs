'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('GuandanEngine',Object.freeze({
  listen:handler=>ipcRenderer.on('guandan-engine-request',(_event,payload)=>handler(payload)),
  result:payload=>ipcRenderer.send('guandan-engine-result',payload),
}));
if(process.platform==='darwin'&&process.arch==='arm64'&&process.argv.includes('--guandan-native-danlm'))contextBridge.exposeInMainWorld('GuandanNativeDanLM',Object.freeze({request:payload=>ipcRenderer.invoke('guandan-official-danlm',payload)}));
