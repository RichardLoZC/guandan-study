'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('GuandanLanNative',Object.freeze({request:payload=>ipcRenderer.invoke('guandan-lan',payload)}));

contextBridge.exposeInMainWorld('GuandanDesktop',Object.freeze({platform:process.platform,setLanguage:locale=>ipcRenderer.send('guandan-language',locale)}));
