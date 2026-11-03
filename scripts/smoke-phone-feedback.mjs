import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),{finished}=require('../test/helpers/series-fixtures.cjs');
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),web=path.join(project,'web');
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'guandan-phone-feedback-'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg'};
const server=http.createServer(async(req,res)=>{
  try{const url=new URL(req.url,'http://localhost'),file=path.join(web,decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(web+path.sep))throw Error('outside');
    let body=await fs.readFile(file);if(file.endsWith('index.html'))body=Buffer.from(body.toString().replace('<html lang=', '<html data-platform="pad" lang='));
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(body);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const checks=[],errors=[];
try{
  for(const device of [{kind:'phone',width:844,height:390},{kind:'phone',width:640,height:320},{kind:'tablet',width:1280,height:800}]){
    const context=await browser.newContext({viewport:{width:device.width,height:device.height},screen:{width:device.width,height:device.height},hasTouch:true,isMobile:device.kind==='phone'});
    await context.addInitScript(({kind,state})=>{window.GuandanPadNative={deviceKind:()=>kind};localStorage.setItem('guandan.desktop.preferences.v1',JSON.stringify({paused:true,dealAnimation:false}));localStorage.setItem('guandan-trainer-v2',JSON.stringify(state));},{kind:device.kind,state:finished([0,1,3,2],{attempts:[2,0]}).state});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#round-end-banner').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-phone'),String(device.kind==='phone'));
    assert.match(await page.locator('#our-ace-progress').innerText(),/3\/3/);
    await page.evaluate(()=>feedback.enqueue([{kind:'demotion',result:GuandanSeries.settlement(liveRound.state)}]));
    const bounds=await page.locator('#next-round').boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=device.width+1&&bounds.y+bounds.height<=device.height+1,JSON.stringify({device,bounds}));
    await page.screenshot({path:path.join(scratch,device.kind+'-demotion.png')});
    await page.locator('#next-round').click();assert.deepEqual(await page.evaluate(()=>liveRound.state.levels),['2','A']);
    await page.evaluate(state=>{liveRound=new GuandanMatch.Match(state);feedback.prime(liveRound);renderGame();},finished([0,2,1,3]).state);
    await page.evaluate(()=>feedback.enqueue([{kind:'victory',result:GuandanSeries.settlement(liveRound.state)}]));
    assert.match(await page.locator('#next-round').innerText(),/再开一场/);assert.equal(await page.locator('#series-standings span').count(),4);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('#game-event')).opacity==='1');
    const shown=await page.locator('#series-standings').boundingBox();assert.ok(shown.y>=0&&shown.y+shown.height<=device.height+1,JSON.stringify({device,shown}));
    await page.screenshot({path:path.join(scratch,device.kind+'-'+device.width+'-victory.png')});
    await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>feedback.paint());assert.equal(await page.locator('#game-event').getAttribute('data-motion'),'false');
    checks.push(device.kind+' layout, new rules, result and reduced motion');await context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,errors,scratch},null,2));
}finally{await browser.close();server.close();}
