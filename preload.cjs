'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('GuandanLanNative',Object.freeze({request:payload=>ipcRenderer.invoke('guandan-lan',payload)}));

contextBridge.exposeInMainWorld('GuandanDesktop',Object.freeze({platform:process.platform,autoFit:true,setLanguage:locale=>ipcRenderer.send('guandan-language',locale)}));
