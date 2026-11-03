import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),{Match}=require('../web/app/match.js');
const project=path.resolve(import.meta.dirname,'..'),web=path.resolve(process.env.ANDROID_WEB_ROOT||path.join(project,'web'));
const output=process.env.OUTPUT_DIR||path.join(project,'test-results/card-counts');fs.mkdirSync(output,{recursive:true});
const first=new Match(),initial=structuredClone(first.state);initial.game.currentPlayer=initial.game.starter=1;
const m=new Match(initial),states={27:structuredClone(m.state)};
let guard=400;
while(m.game.players[1].hand.length&&guard--){
  const seat=m.actingSeat;m.commit(seat,seat===1?[m.game.players[1].hand[0].id]:[]);
  if(m.actingSeat===1&&!m.game.tablePlay)states[m.game.players[1].hand.length]=structuredClone(m.state);
}
assert.ok(guard>0);states[0]=structuredClone(m.state);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(web,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(web+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||chromium.executablePath()});
const errors=[],checks=[];
try{
  for(const device of [{name:'desktop',width:1380,height:900},{name:'tablet',width:1280,height:800,kind:'tablet'},{name:'portrait-tablet',width:768,height:1024,kind:'tablet'},{name:'phone',width:844,height:390,kind:'phone'},{name:'short-phone',width:640,height:320,kind:'phone'}]){
    const context=await browser.newContext({viewport:{width:device.width,height:device.height},screen:{width:device.width,height:device.height},hasTouch:Boolean(device.kind),isMobile:device.kind==='phone'});
    await context.addInitScript(({state,device})=>{
      localStorage.setItem('guandan-trainer-v2',JSON.stringify(state));localStorage.setItem('guandan.desktop.preferences.v1',JSON.stringify({paused:true,dealAnimation:false,eventAnimation:false,sound:false}));
      if(device.kind)window.GuandanPadNative={deviceKind:()=>device.kind};
    },{state:states[27],device});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(device.name+': '+e.message));
    try{
      await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.GuandanTable&&typeof renderGame==='function');
      for(const n of [27,8,7,6,2,1,0,27]){
        await page.evaluate(state=>{stopBots();dealMotion.cancel();feedback.clear();liveRound=new GuandanMatch.Match(state);paused=true;renderGame();},states[n]);
        const badge=page.locator('.player[data-seat="1"] .remaining');
        if(n>7){assert.equal(await badge.isVisible(),false,device.name+': '+n+' hidden');assert.equal(await badge.locator('b').textContent(),'');}
        else {assert.equal(await badge.isVisible(),true);assert.equal(await badge.locator('b').textContent(),String(n));}
        for(const seat of [2,3]){assert.equal(await page.locator('.player[data-seat="'+seat+'"] .remaining').isVisible(),false);assert.equal(await page.locator('.player[data-seat="'+seat+'"] .remaining b').textContent(),'');}
        assert.equal(await page.locator('#hand-count').textContent(),'27');
        if(n===7)await page.screenshot({path:path.join(output,device.name+'-seven.png')});
      }
      await page.screenshot({path:path.join(output,device.name+'-unreported.png')});
      await page.evaluate(state=>{liveRound=new GuandanMatch.Match(state);renderGame();openHistory(document.getElementById('open-history'));},states[8]);
      assert.match(await page.locator('#history-list').innerText(),/未报牌/);assert.doesNotMatch((await page.locator('#history-list p:not(.seat-0)').allInnerTexts()).join('\n'),/剩\s*(?:8|9|1\d|2\d)\s*张/);
      await page.evaluate(()=>closeDialog(document.getElementById('history-dialog')));
      await page.evaluate(()=>window.openCurrentReview(document.getElementById('open-review')));await page.locator('[data-review-tab="replay"]').click();
      assert.equal(await page.locator('#replay-felt .replay-seat:not(.seat-0)').count(),3);
      for(const seat of [1,2,3])assert.match(await page.locator('#replay-felt .seat-'+seat+' .replay-seat-meta').innerText(),/未报牌/);
      await page.evaluate(()=>GuandanI18n.setLocale('en'));
      for(const seat of [1,2,3])assert.match(await page.locator('#replay-felt .seat-'+seat+' .replay-seat-meta').innerText(),/Not reported/);
      await page.evaluate(()=>closeDialog(document.getElementById('review-dialog')));
      // Exercise real dealing DOM. Other counters stay blank even in the final reveal phase.
      await page.evaluate(()=>{
        prefs.dealAnimation=true;dealView.begin({id:liveRound.id,round:1,level:'2',mode:'经典掼蛋',players:[0,1,2,3].map(seat=>({...playerAt(seat),identity:liveRound.playerIds[seat]}))});
        dealView.update({phase:'reveal',counts:[27,27,27,27]});
      });
      for(const seat of [1,2,3]){assert.equal(await page.locator('.deal-seat-'+seat+' .deal-counter').isVisible(),false);assert.equal(await page.locator('.deal-seat-'+seat+' .deal-counter b').textContent(),'');}
      await page.evaluate(()=>dealView.clear());
      checks.push(device.name+': 8/7 boundary, all other seats, new deal, own count, history, active replay, English and dealing');
    }finally{await context.close();}
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({web,checks,errors},null,2));console.log(JSON.stringify({checks,errors,output},null,2));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
