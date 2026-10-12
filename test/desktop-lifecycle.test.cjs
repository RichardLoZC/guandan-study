'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const source=fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8');
const createWindowSource=source.match(/async function createWindow\(\) \{[\s\S]*?\n\}/)[0];
async function desktop(isMac){
  const windows=[];let quitCount=0,flushCount=0;
  class Window extends EventEmitter{
    constructor(options){super();this.options=options;this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=()=>{};windows.push(this);}
    loadURL(){return Promise.resolve();}
    isDestroyed(){return false;}
  }
  const context={isMac,win:null,BrowserWindow:Window,app:{quit(){quitCount++;}},screen:{getPrimaryDisplay:()=>({workAreaSize:{width:1920,height:1080}})},
    fitDesktopWindow(){return ()=>{};},session:{defaultSession:{flushStorageData(){flushCount++;}}},
    path,__dirname:path.join(__dirname,'..'),APP_NAME:'Fixture',edition:'Fixture',ORIGIN:'guandan://app',log(){}};
  vm.createContext(context);vm.runInContext(createWindowSource,context);
  // A hidden model window already exists and deliberately remains open.
  const engine=new Window({show:false});await context.createWindow();
  const table=context.win;table.emit('close');table.emit('closed');
  return {quitCount,flushCount,win:context.win,engine,windows};
}
test('closing the visible Windows table quits even while the hidden LAN engine remains open',async()=>{
  const state=await desktop(false);assert.equal(state.windows.length,2);assert.equal(state.engine.options.show,false);
  assert.equal(state.quitCount,1);assert.equal(state.flushCount,1);assert.equal(state.win,null);
});
test('closing the Mac table flushes storage and keeps the application available in the Dock',async()=>{
  const state=await desktop(true);assert.equal(state.quitCount,0);assert.equal(state.flushCount,1);assert.equal(state.win,null);
});
