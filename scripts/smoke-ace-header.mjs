import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';

const require=createRequire(import.meta.url),core=require('../web/app/core.js');
const {create}=require('../web/app/match.js'),{finished}=require('../test/helpers/series-fixtures.cjs');
const project=path.resolve(import.meta.dirname,'..');
const web=path.resolve(process.env.ANDROID_WEB_ROOT||path.join(project,'web'));
const output=process.env.OUTPUT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'guandan-ace-header-'));
fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg'};
const server=http.createServer((request,response)=>{
  try{
    const name=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const file=path.resolve(web,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(web+path.sep))throw Error('outside web root');
    response.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});
    fs.createReadStream(file).on('error',()=>response.destroy()).pipe(response);
  }catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const playing=(levels,attempts)=>{
  const state=core.newMatch();state.level='A';state.levels=levels;state.aceAttempts=attempts;
  for(const player of state.game.players)for(const card of player.hand)card.isWild=card.suit==='hearts'&&card.rank==='A';
  return state;
};
const errors=[],checks=[];
const devices=process.env.ANDROID_WEB_ROOT?
  [{name:'android-pad',width:1280,height:800,kind:'tablet'},{name:'android-portrait-pad',width:768,height:1024,kind:'tablet'},{name:'android-phone',width:844,height:390,kind:'phone'},{name:'android-short-phone',width:640,height:320,kind:'phone'}]:
  [{name:'web-desktop',width:1380,height:900},{name:'windows',width:1280,height:800,platform:'win32'},
    {name:'web-tablet',width:1024,height:768},{name:'web-portrait-tablet',width:768,height:1024},{name:'web-phone',width:844,height:390,kind:'phone'},
    {name:'web-short-phone',width:640,height:320,kind:'phone'}];
const close=(a,b)=>a.x<b.x+b.width-1&&a.x+a.width>b.x+1&&a.y<b.y+b.height-1&&a.y+a.height>b.y+1;
try{
  for(const device of devices){
    const context=await browser.newContext({viewport:{width:device.width,height:device.height},screen:{width:device.width,height:device.height},hasTouch:Boolean(device.kind),isMobile:device.kind==='phone'});
    await context.addInitScript(({device,state})=>{
      localStorage.setItem('guandan.desktop.preferences.v1',JSON.stringify({paused:true,dealAnimation:false,eventAnimation:false,sound:false}));
      localStorage.setItem('guandan-trainer-v2',JSON.stringify(state));
      if(device.platform)window.GuandanDesktop={platform:device.platform,setLanguage(){}};
      if(device.kind)window.GuandanPadNative={deviceKind:()=>device.kind};
    },{device,state:playing(['A','A'],[1,2])});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(device.name+': '+error.message));
    const setState=state=>page.evaluate(value=>{stopBots();feedback.clear();liveRound=new GuandanMatch.Match(value);renderGame();},state);
    const geometry=async(withReceipt=false)=>{
      if(withReceipt)await page.evaluate(()=>{const receipt=document.querySelector('#tribute-receipt');receipt.hidden=false;document.querySelector('#tribute-receipt-title').textContent='进贡';document.querySelector('#tribute-receipt-leader').textContent='查看详情';});
      const positions=await page.evaluate(()=>{
        const rect=selector=>{const node=document.querySelector(selector),r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,visible:!!(r.width&&r.height)};};
        return {strip:rect('.match-strip'),score:rect('#classic-score'),level:rect('.level-label'),ours:rect('#our-ace-progress'),theirs:rect('#their-ace-progress'),menu:rect('#phone-menu-toggle'),mode:rect('#open-lan'),receipt:rect('#tribute-receipt'),info:rect('#phone-top-info'),table:rect('.table-seats')};
      });
      for(const id of ['ours','theirs']){
        const badge=positions[id];assert.ok(badge.visible,JSON.stringify({device,id,positions}));
        assert.ok(badge.x>=positions.strip.x-1&&badge.x+badge.width<=positions.strip.x+positions.strip.width+1&&badge.y>=positions.strip.y-1&&badge.y+badge.height<=positions.strip.y+positions.strip.height+1,JSON.stringify({device,id,positions}));
      }
      assert.ok(!close(positions.score,positions.level),JSON.stringify({device,positions}));
      if(device.kind==='phone'){
        for(const item of ['score','level'])for(const control of ['mode','menu'])assert.ok(!close(positions[item],positions[control]),JSON.stringify({device,item,control,positions}));
        if(withReceipt){assert.ok(positions.receipt.visible&&positions.receipt.width>=30,JSON.stringify({device,positions}));assert.ok(!close(positions.strip,positions.receipt),JSON.stringify({device,positions}));}
      }else assert.ok(positions.strip.y+positions.strip.height<=positions.table.y+1,JSON.stringify({device,positions}));
      return positions;
    };
    try{
      await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.querySelectorAll('#hand-cards .playing-card').length===27);
      await page.waitForFunction(()=>model.ready||fault,{timeout:30000});assert.equal(await page.evaluate(()=>fault),null);
      assert.equal(await page.locator('#our-ace-progress').innerText(),'冲 A 1/3');assert.equal(await page.locator('#their-ace-progress').innerText(),'冲 A 2/3');
      assert.match(await page.locator('#our-ace-progress').getAttribute('aria-label'),/连续三副第一＋第四退回 2/);
      await geometry();await page.screenshot({path:path.join(output,device.name+'-zh.png')});
      if(device.kind==='phone')await geometry(true);
      await page.evaluate(()=>GuandanI18n.setLocale('en'));
      assert.equal(await page.locator('#our-ace-progress').innerText(),'A 1/3');assert.match(await page.locator('#their-ace-progress').getAttribute('aria-label'),/Opponents A attempts 2\/3/);
      await geometry(device.kind==='phone');await page.screenshot({path:path.join(output,device.name+'-en.png')});
      await page.evaluate(()=>GuandanI18n.setLocale('zh-CN'));
      await page.evaluate(()=>{document.documentElement.dataset.theme='night';document.documentElement.classList.add('large-type');});
      if(device.kind==='phone')await page.evaluate(()=>{document.querySelector('#open-lan').textContent='局域网牌桌 · 123456';});
      await geometry(device.kind==='phone');
      await setState(playing(['A','K'],[0,0]));assert.equal(await page.locator('#our-ace-progress').innerText(),'冲 A 0/3');assert.equal(await page.locator('#their-ace-progress').isHidden(),true);
      await setState(playing(['K','K'],[0,0]));assert.equal(await page.locator('#our-ace-progress').isHidden(),true);assert.equal(await page.locator('#their-ace-progress').isHidden(),true);
      await setState(finished([0,1,3,2],{attempts:[2,0]}).state);assert.equal(await page.locator('#our-ace-progress').innerText(),'冲 A 3/3');assert.match(await page.locator('#round-end-banner h2').innerText(),/退回 2/);
      await setState(finished([0,2,1,3]).state);assert.equal(await page.locator('#our-ace-progress').isHidden(),true);assert.equal(await page.locator('#their-ace-progress').isHidden(),true);
      await setState(create('tuo3').state);assert.equal(await page.locator('#our-ace-progress').isHidden(),true);assert.equal(await page.locator('#their-ace-progress').isHidden(),true);
      checks.push(device.name+': both counts, clear/demotion/victory, Tuo 3, Chinese/English and header geometry');
    }finally{await context.close();}
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors,output},null,2));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
