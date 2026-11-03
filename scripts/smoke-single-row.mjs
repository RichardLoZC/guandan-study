import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),{Match}=require('../web/app/match.js');
const root=path.resolve(import.meta.dirname,'..'),output=process.env.OUTPUT_DIR;
if(!output||!process.env.ANDROID_WEB_ROOT)throw Error('Set OUTPUT_DIR and ANDROID_WEB_ROOT (extracted APK assets/web).');
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH}),errors=[],checks=[];
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml'};
try{
 for(const device of [{name:'mac',width:1380,height:900,platform:'darwin'},{name:'windows',width:1280,height:800,platform:'win32'},{name:'tablet',width:1280,height:800,kind:'tablet'},{name:'phone',width:844,height:390,kind:'phone'},{name:'short-phone',width:640,height:320,kind:'phone'}]){
  const web=device.kind?process.env.ANDROID_WEB_ROOT:path.join(root,'web');
  const server=http.createServer((req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname,file=path.join(web,pathname==='/'?'index.html':decodeURIComponent(pathname));if(!file.startsWith(web+path.sep))throw Error('outside');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);}catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const context=await browser.newContext({viewport:{width:device.width,height:device.height},screen:{width:device.width,height:device.height},hasTouch:Boolean(device.kind),isMobile:device.kind==='phone'});
  const match=new Match(),ids=match.hand.map(c=>c.id),key='solo:'+match.id+'|'+match.playerIds[0],legacy={version:1,key,source:'manual',rows:[ids.slice(0,7).reverse(),ids.slice(7)],groups:[]};
  await context.addInitScript(({device,state,legacy})=>{localStorage.setItem('guandan-trainer-v2',JSON.stringify(state));localStorage.setItem('guandan.hand-layout.v1',JSON.stringify([legacy]));localStorage.setItem('guandan.desktop.preferences.v1',JSON.stringify({paused:true,dealAnimation:false,eventAnimation:false,sound:false}));if(device.platform)window.GuandanDesktop={platform:device.platform,setLanguage(){}};if(device.kind)window.GuandanPadNative={deviceKind:()=>device.kind};},{device,state:match.state,legacy});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(device.name+': '+e.message));
  try{
   await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.querySelectorAll('#hand-cards .playing-card').length===27);
   assert.equal(await page.locator('#hand-cards .card-row').count(),1);assert.equal(await page.locator('#arrange-hand,#arrange-priority,.hand-tier-label').count(),0);
   assert.deepEqual(await page.evaluate(()=>currentLayout().rows[0]),[]);
   assert.deepEqual((await page.evaluate(()=>ownHand().map(c=>c.id))).sort(),[...ids].sort());
   if(device.kind!=='phone'){
    assert.deepEqual(await page.evaluate(()=>ownHand().map(c=>c.id)),legacy.rows.flat());
    const first=page.locator('#hand-cards .playing-card').first();await first.focus();await page.keyboard.press('Alt+ArrowUp');assert.deepEqual(await page.evaluate(()=>ownHand().map(c=>c.id)),legacy.rows.flat());
    await page.keyboard.press('Alt+ArrowRight');assert.notDeepEqual(await page.evaluate(()=>ownHand().map(c=>c.id)),legacy.rows.flat());
    await page.locator('#undo-arrange').click();assert.deepEqual(await page.evaluate(()=>ownHand().map(c=>c.id)),legacy.rows.flat());
    await page.locator('#hand-fan').click();assert.equal(await page.locator('#hand-cards .card-row').count(),1);
    assert.equal(await page.locator('html').getAttribute('data-hand-style'),'stack');
    const before=await page.evaluate(()=>ownHand().map(c=>c.id));const last=page.locator('#hand-cards .playing-card').last();const a=await last.boundingBox(),b=await page.locator('#hand-cards .playing-card').first().boundingBox();
    await page.mouse.move(a.x+8,a.y+10);await page.mouse.down();await page.mouse.move(b.x+1,b.y+12,{steps:12});await page.mouse.up();
    assert.equal(await page.locator('#hand-cards .card-row').count(),1);assert.deepEqual((await page.evaluate(()=>ownHand().map(c=>c.id))).sort(),[...ids].sort());
    assert.equal(await page.evaluate(()=>currentLayout().rows[0].length),0);
    await page.locator('#sort-hand').click();assert.deepEqual(await page.evaluate(()=>ownHand().map(c=>c.id)),ids);
   }
   await page.screenshot({path:path.join(output,device.name+'-single-row.png')});checks.push(device.name+': one region, legacy card migration, no automatic controls'+(device.kind==='phone'?'':', keyboard, undo, shape switch, drag and full-hand sort'));
  }finally{await context.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'single-row-result.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
