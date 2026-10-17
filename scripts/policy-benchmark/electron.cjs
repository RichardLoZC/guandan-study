'use strict';
// Computation-only renderer. It runs the shipped browser/ONNX worker, without
// opening the game UI, connecting to an existing app, or reading its saves.
const {app,BrowserWindow,powerSaveBlocker}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'guandan-benchmark-profile-')));
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
const windows=[];
app.whenReady().then(async()=>{
  app.dock?.hide();powerSaveBlocker.start('prevent-app-suspension');
  for(let lane=0;lane<Number(process.env.GUANDAN_BENCH_LANES||2);lane++){
    const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
    windows.push(win);
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('render-process-gone',(_event,details)=>{console.error(JSON.stringify(details));app.exit(1);});
    await win.loadURL(process.env.GUANDAN_BENCH_URL+'/?lane='+lane);
  }
}).catch(error=>{console.error(error);app.exit(1);});
