import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),{Match}=require('../web/app/match.js');
const root=path.resolve(import.meta.dirname,'..'),web=path.resolve(process.env.ANDROID_WEB_ROOT||path.join(root,'web'));
const output=process.env.OUTPUT_DIR||path.join(root,'test-results/assessment');fs.mkdirSync(output,{recursive:true});
function complete(){const m=new Match();let guard=2000;while(!m.game.result&&guard--){const s=m.actingSeat,c=m.game.players[s].hand.find(c=>m.selection([c.id],s).play);m.commit(s,c?[c.id]:[]);}assert.ok(m.game.result);return m;}
const completed=complete(),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(web,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(web+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[],checks=[];
try{
  for(const device of [{name:'desktop',width:1380,height:900},{name:'tablet',width:1280,height:800,kind:'tablet'},{name:'portrait-tablet',width:768,height:1024,kind:'tablet'},{name:'phone',width:844,height:390,kind:'phone'},{name:'short-phone',width:640,height:320,kind:'phone'}]){
    const context=await browser.newContext({viewport:{width:device.width,height:device.height},screen:{width:device.width,height:device.height},hasTouch:Boolean(device.kind),isMobile:device.kind==='phone',acceptDownloads:true});
    await context.addInitScript(({state,device})=>{
      localStorage.setItem('guandan-trainer-v2',JSON.stringify(state));
      localStorage.setItem('guandan.desktop.preferences.v1',JSON.stringify({paused:true,dealAnimation:false,eventAnimation:false,sound:false}));
      if(device.kind)window.GuandanPadNative={deviceKind:()=>device.kind};
    },{state:completed.state,device});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(device.name+': '+e.message));
    try{
      await page.goto('http://127.0.0.1:'+server.address().port);
      await page.waitForFunction(()=>document.querySelector('#review-dialog').open&&!document.querySelector('#review-performance').hidden,{timeout:30000});
      assert.equal(await page.locator('.assessment-player-card').count(),4);
      assert.equal(await page.locator('.assessment-hand-score').count(),4);
      const versions=await page.evaluate(()=>({rating:GuandanAssessmentRating.VERSION,hand:GuandanHandAssessment.VERSION,api:GuandanAssessment.VERSION}));
      assert.deepEqual(versions,{rating:'pilot-rating-0.3.0',hand:'hand-orbit-0.2.0',api:'1.2.0'});
      assert.match(await page.locator('#assessment-team-reference').textContent(),/DanLM/);
      await page.locator('#assessment-team-rules summary').click();
      await page.screenshot({path:path.join(output,device.name+'-team-reference.png')});
      await page.locator('#assessment-team-rules summary').click();
      assert.ok((await page.locator('.assessment-hand-score').allTextContents()).every(v=>/\d+ \/ 100/.test(v)));
      for(const score of await page.locator('.assessment-player-score').allTextContents())assert.match(score,/^[1-9]\.\d$/);
      assert.match(await page.locator('.assessment-rating-note').first().innerText(),/试评|训练奖惩关闭/);
      const overflow=await page.locator('#review-performance').evaluate(n=>n.scrollWidth>n.clientWidth+2);assert.equal(overflow,false,device.name+' report horizontal overflow');
      await page.locator('.assessment-player-card').nth(2).click();assert.equal(await page.locator('#assessment-seat').inputValue(),'2');
      await page.screenshot({path:path.join(output,device.name+'-report.png')});
      await page.selectOption('#assessment-seat','0');
      await page.selectOption('#assessment-pilot-hand','low');await page.selectOption('#assessment-pilot-performance','fair');
      await page.fill('#assessment-pilot-reason','试评测试：散牌处理和接应值得单独解释。');
      await page.locator('.assessment-player-card').nth(2).click();await page.locator('.assessment-player-card').first().click();
      assert.equal(await page.locator('#assessment-pilot-reason').inputValue(),'试评测试：散牌处理和接应值得单独解释。');
      assert.equal(await page.locator('#assessment-pilot-hand').inputValue(),'low');
      await page.locator('#assessment-pilot-form button[type=submit]').click();
      await page.waitForFunction(()=>document.querySelector('#assessment-pilot-status').textContent.includes('已保存'));
      const pilot=await page.evaluate(()=>GuandanAssessmentPilot.read(localStorage));assert.equal(pilot.length,1);assert.equal(pilot[0].eligibleForTraining,false);assert.equal(pilot[0].reward,null);assert.equal(pilot[0].ratingVersion,'pilot-rating-0.3.0');assert.equal(pilot[0].handVersion,'hand-orbit-0.2.0');assert.ok(pilot[0].displayed.teamReference);
      await page.locator('#assessment-pilot-form').screenshot({path:path.join(output,device.name+'-pilot-feedback.png')});
      const feedbackDownloadEvent=page.waitForEvent('download');await page.click('#assessment-pilot-export');const feedbackDownload=await feedbackDownloadEvent;
      const feedbackPath=path.join(output,device.name+'-pilot.json');await feedbackDownload.saveAs(feedbackPath);const pilotExport=JSON.parse(fs.readFileSync(feedbackPath,'utf8'));
      assert.equal(pilotExport.records.length,1);assert.equal(pilotExport.summary.groups[0].hand.low,1);assert.equal(pilotExport.includedRound.id,completed.id);
      const candidates=page.locator('.assessment-case');assert.ok(await candidates.count());
      await candidates.first().locator('button').nth(1).click();assert.equal(await page.locator('#assessment-case-dialog').evaluate(n=>n.open),true);
      await page.fill('#assessment-reviewer','试点评审');await page.selectOption('#assessment-rating','3');await page.fill('#assessment-reason','测试保存：只依据当时可知信息。');
      await page.locator('#assessment-feedback-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#assessment-feedback-status').textContent.includes('已保存'));
      const feedback=await page.evaluate(()=>JSON.parse(localStorage.getItem('guandan-performance-feedback-v1')));assert.equal(feedback.length,1);assert.match(feedback[0].observationSha256,/^[a-f0-9]{64}$/);assert.equal(feedback[0].observation,undefined);
      await page.locator('[data-close-dialog=assessment-case-dialog]').click();
      const downloadEvent=page.waitForEvent('download');await page.click('#assessment-export');const download=await downloadEvent;const file=path.join(output,device.name+'-round.json');await download.saveAs(file);
      const data=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(data.reports.length,4);assert.ok(data.reports.every(r=>r.statisticsRating.trial));assert.ok(fs.statSync(file).size<4000000);
      assert.equal(data.playerFeedback.length,1);assert.ok(data.reports.every(r=>r.handAssessment.score!==null));assert.ok(data.reports.every(r=>r.teamReference.available&&r.teamReference.reward===null&&!r.trainingSignal.eligible));
      await page.evaluate(()=>GuandanI18n.setLocale('en'));await page.screenshot({path:path.join(output,device.name+'-en.png')});
      await page.locator('#review-dialog [data-close-dialog=review-dialog]').first().click();await page.waitForTimeout(800);assert.equal(await page.locator('#review-dialog').evaluate(n=>n.open),false,'same round must not reopen');
      const current=new Match();await page.evaluate(state=>{stopBots();feedback.clear();liveRound=new GuandanMatch.Match(state);renderGame();},current.state);
      const badge=page.locator('#private-hand-score');assert.equal(await badge.isVisible(),true);
      const expected=await page.evaluate(()=>GuandanPrivateHandScore.readOwn(liveRound).score);assert.match(await badge.innerText(),new RegExp(String(expected)+'/100'));
      assert.equal(await page.locator('#private-hand-score').count(),1);assert.match(await badge.getAttribute('title'),/Only you/);
      assert.equal(await page.locator('.table-seats #private-hand-score').count(),0);
      await page.screenshot({path:path.join(output,device.name+'-private-hand-score.png')});
      const bounds=await badge.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=device.width,device.name+' own score must fit');
      await page.evaluate(()=>window.openCurrentReview(document.querySelector('#open-review')));await page.locator('[data-review-tab=performance]').click();
      assert.ok((await page.locator('.assessment-player-score').allTextContents()).every(v=>v==='—'));
      assert.equal(await page.locator('#assessment-pilot-fields').evaluate(n=>n.disabled),true);assert.doesNotMatch(await page.locator('#assessment-team-reference').textContent(),/结构总分/);
      assert.equal(await page.locator('#assessment-pilot-form button[type=submit]').isDisabled(),true);
      checks.push(device.name+': automatic report, hand/performance scores, local feedback and exports, selection, review, English, no repeat, active-round feedback withheld');
    }finally{await context.close();}
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors,output},null,2));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
