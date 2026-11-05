import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),{Match}=require('../web/app/match.js'),statistics=require('../web/app/round-statistics.js');
const root=path.resolve(import.meta.dirname,'..'),web=path.resolve(process.env.ANDROID_WEB_ROOT||path.join(root,'web'));
const output=process.env.OUTPUT_DIR||path.join(root,'test-results/assessment');fs.mkdirSync(output,{recursive:true});
function complete(){const m=new Match();let guard=2000;while(!m.game.result&&guard--){const s=m.actingSeat,c=m.game.players[s].hand.find(c=>m.selection([c.id],s).play);m.commit(s,c?[c.id]:[]);}assert.ok(m.game.result);return m;}
const completed=complete(),expected=statistics.summarize(completed.snapshot()),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
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
   localStorage.setItem('guandan-performance-feedback-v1',JSON.stringify([{id:'current',roundId:state.id,reviewer:'本副测试'}, {id:'old',roundId:'historical',reviewer:'旧测试'}]));
   localStorage.setItem('guandan-player-pilot-v1',JSON.stringify([{id:'pilot-old',roundId:'historical',reason:'原始记录'}]));
   if(device.kind)window.GuandanPadNative={deviceKind:()=>device.kind};
  },{state:completed.state,device});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(device.name+': '+e.message));
  try{
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.waitForFunction(()=>document.querySelector('#review-dialog').open&&!document.querySelector('#review-performance').hidden,null,{timeout:30000});
   assert.equal(await page.locator('.match-team-card').count(),2);assert.equal(await page.locator('.assessment-player-card').count(),4);
   assert.equal(await page.locator('#assessment-rating-rules,#assessment-hand-rules,#assessment-grid,#assessment-cases,#assessment-pilot-form,.assessment-player-score').count(),0);
   const text=await page.locator('#review-performance').innerText();assert.match(text,/团队统计/);assert.match(text,/普通丢权/);assert.match(text,/遇炸丢权/);assert.match(text,/夺回牌权/);
   assert.doesNotMatch(text,/公式|待评|训练|评分依据|分项|平滑|表现分/);
   const actual=await page.evaluate(()=>GuandanRoundStatistics.summarize(liveRound.snapshot()));assert.deepEqual(actual,expected);
   assert.equal(await page.locator('#review-performance').evaluate(n=>n.scrollWidth>n.clientWidth+2),false,device.name+' report must fit');
   await page.screenshot({path:path.join(output,device.name+'-report.png')});
   const downloadEvent=page.waitForEvent('download');await page.click('#assessment-export');const download=await downloadEvent,file=path.join(output,device.name+'-round.json');await download.saveAs(file);
   const data=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(data.kind,'guandan-match-statistics');assert.equal(data.reports.length,4);assert.deepEqual(data.statistics,expected);assert.equal(data.trainingEligible,false);assert.equal(data.feedback.length,1);assert.equal(data.feedback[0].id,'current');assert.equal(data.playerFeedback.length,0);
   execFileSync(process.execPath,[path.join(root,'scripts/team-evaluation.mjs'),'verify','--input',file,'--output',path.join(output,device.name+'-recomputed.json')],{stdio:'pipe'});
   await page.evaluate(()=>GuandanI18n.setLocale('en'));assert.match(await page.locator('#review-performance').innerText(),/Lead regained/);
   await page.screenshot({path:path.join(output,device.name+'-en.png')});
   await page.locator('#review-dialog [data-close-dialog=review-dialog]').first().click();await page.waitForTimeout(400);assert.equal(await page.locator('#review-dialog').evaluate(n=>n.open),false,'same round must not reopen');
   const backupEvent=page.waitForEvent('download');await page.evaluate(()=>exportSave());const backup=await backupEvent,backupPath=path.join(output,device.name+'-backup.json');await backup.saveAs(backupPath);
   const saved=JSON.parse(fs.readFileSync(backupPath,'utf8'));assert.equal(JSON.parse(saved.expertFeedback).length,2);assert.equal(JSON.parse(saved.playerFeedback).length,1);
   const current=new Match();await page.evaluate(state=>{stopBots();feedback.clear();liveRound=new GuandanMatch.Match(state);renderGame();},current.state);
   const badge=page.locator('#private-hand-score');assert.equal(await badge.isVisible(),true);assert.match(await badge.innerText(),/Above \d+%/);assert.doesNotMatch(await badge.innerText(),/\/100/);assert.match(await badge.getAttribute('title'),/Only you/);
   assert.equal(await page.locator('#private-hand-score').count(),1);assert.equal(await page.locator('.table-seats #private-hand-score').count(),0);
   const bounds=await badge.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=device.width,device.name+' own strength must fit');
   await page.screenshot({path:path.join(output,device.name+'-private-hand.png')});
   await page.evaluate(()=>window.openCurrentReview(document.querySelector('#open-review')));await page.locator('[data-review-tab=performance]').click();
   const live=await page.evaluate(()=>GuandanRoundStatistics.summarize(liveRound.snapshot()));assert.ok(live.teams.every(t=>t.starting===null));assert.ok(live.players.every(p=>p.starting===null));
   assert.ok((await page.locator('#assessment-teams .match-stat-row').allTextContents()).every(v=>!v.includes('Above')));
   assert.equal(await page.evaluate(()=>GuandanAssessment.readFeedback(localStorage).length),2);
   checks.push(device.name+': automatic compact report, exact facts, no formulas/composite scores, export/replay and historical feedback backup, English, private relative strength, no live team resources');
  }finally{await context.close();}
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors,output},null,2));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
