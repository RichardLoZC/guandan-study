'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('GuandanLanNative',Object.freeze({request:payload=>ipcRenderer.invoke('guandan-lan',payload)}));

contextBridge.exposeInMainWorld('GuandanDesktop',Object.freeze({platform:process.platform,arch:process.arch,nativeDanLM:process.platform==='darwin'&&process.arch==='arm64'&&process.argv.includes('--guandan-native-danlm'),autoFit:true,setLanguage:locale=>ipcRenderer.send('guandan-language',locale),setTheme:theme=>ipcRenderer.send('guandan-theme',theme)}));
if(process.platform==='darwin'&&process.arch==='arm64'&&process.argv.includes('--guandan-native-danlm'))contextBridge.exposeInMainWorld('GuandanNativeDanLM',Object.freeze({request:payload=>ipcRenderer.invoke('guandan-official-danlm',payload)}));
