import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright';
const require=createRequire(import.meta.url),{seeded}=require('../test/helpers/strategy-fixtures.cjs'),{finished}=require('../test/helpers/series-fixtures.cjs');
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'guandan-feedback-smoke-'));
const env={...process.env,GUANDAN_DATA_DIR:path.join(scratch,'data')};delete env.ELECTRON_RUN_AS_NODE;delete env.GUANDAN_LEGACY_DATA_DIR;
const executablePath=process.env.GUANDAN_TEST_EXECUTABLE||path.join(project,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const app=await electron.launch({executablePath,args:process.env.GUANDAN_TEST_EXECUTABLE?[]:[project],env});
const errors=[],checks=[];let page;
const pass=text=>{checks.push(text);console.log('PASS '+text);};
async function installState(state){
  await page.evaluate(state=>{stopBots();dealMotion.cancel();feedback.clear();prefs.paused=true;prefs.dealAnimation=false;savePrefs();localStorage.setItem(GuandanMatch.SAVE_KEY,JSON.stringify(state));},state);
  await page.reload();await page.waitForFunction(()=>liveRound&&document.querySelector('#hand-cards'));
}
async function completeFinal(order,attempts=[0,0]){
  const state=finished(order,{attempts}).state,last=state.game.actionHistory.pop(),seat=last.seat;
  state.game.players[seat].hand=[...last.play.cards];state.game.players[seat].finished=false;
  state.game.finishOrder=state.game.finishOrder.filter(s=>state.game.players[s].finished);
  state.game.result=null;state.game.currentPlayer=seat;state.game.tablePlay=null;
  await installState(state);
  assert.equal(await page.evaluate(({seat,ids})=>saveAction(()=>liveRound.commit(seat,ids)),{seat,ids:last.play.cards.map(c=>c.id)}),true);
}
try{
  page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await page.locator('#hand-cards .playing-card').first().waitFor();
  const wanted=[1,2].flatMap(deck=>['clubs','spades','hearts','diamonds'].map(suit=>deck+'-'+suit+'-8'));
  await page.evaluate(()=>{prefs.handStyle='fan';prefs.paused=true;prefs.dealAnimation=false;savePrefs();});
  await installState(seeded(3,wanted).state);
  assert.equal(await page.locator('html').getAttribute('data-hand-style'),'stack');
  assert.equal(await page.locator('#hand-fan').innerText(),'叠牌');assert.equal(await page.locator('.hand-pan-note').count(),0);
  const physical=await page.locator('#hand-cards .playing-card').evaluateAll(cards=>cards.map(card=>card.dataset.id));
  assert.equal(physical.length,27);assert.equal(new Set(physical).size,27);
  for(const id of physical){
    const target=page.locator('#hand-cards .playing-card[data-id="'+id+'"]');
    await target.click({position:{x:9,y:10}});assert.equal(await target.getAttribute('aria-pressed'),'true',id);
    await target.click({position:{x:9,y:10}});assert.equal(await target.getAttribute('aria-pressed'),'false',id);
  }
  pass('all 27 physical card headers are individually clickable, including an eight-card rank stack');
  const first=page.locator('#hand-cards .playing-card').first();await first.click({position:{x:8,y:10}});
  const before=await page.evaluate(()=>({layout:currentLayout(),selected:[...selected]}));
  await page.locator('#hand-flat').click();await page.locator('#hand-fan').click();
  assert.deepEqual(await page.evaluate(()=>({layout:currentLayout(),selected:[...selected]})),before);
  await page.locator('#clear-selection').click();
  const original=await page.evaluate(()=>ownHand().map(card=>card.id));
  const from=await first.boundingBox(),to=await page.locator('#hand-cards .playing-card').last().boundingBox();
  await page.mouse.move(from.x+9,from.y+10);await page.mouse.down();await page.mouse.move(to.x+to.width-4,to.y+12,{steps:15});await page.mouse.up();
  assert.equal(await page.locator('#hand-cards .card-row').count(),1);
  assert.equal(await page.evaluate(()=>currentLayout().rows[0].length),0);
  assert.notDeepEqual(await page.evaluate(()=>ownHand().map(card=>card.id)),original);
  await page.locator('#undo-arrange').click();assert.deepEqual(await page.evaluate(()=>ownHand().map(card=>card.id)),original);
  await page.screenshot({path:path.join(scratch,'mac-stacks.png'),fullPage:true});pass('stack/flat toggle preserves selection; single-region drag and undo work');
  await page.reload();assert.equal(await page.locator('html').getAttribute('data-hand-style'),'stack');
  await completeFinal([0,2,1,3]);
  await page.waitForFunction(()=>document.querySelector('#game-event').dataset.kind==='victory');
  assert.match(await page.locator('#round-end-banner h2').innerText(),/整场胜利/);assert.match(await page.locator('#next-round').innerText(),/再开一场/);
  assert.equal(await page.locator('#series-standings span').count(),4);
  await page.screenshot({path:path.join(scratch,'match-victory.png'),fullPage:true});
  assert.deepEqual(await page.evaluate(()=>liveRound.state.wins),[0,0]);
  await page.locator('#next-round').click();assert.deepEqual(await page.evaluate(()=>liveRound.state.wins),[1,0]);assert.deepEqual(await page.evaluate(()=>liveRound.state.levels),['2','2']);
  pass('A victory has a persistent named result, four placements, and explicit new-match action');
  await completeFinal([0,1,3,2],[2,0]);await page.waitForFunction(()=>document.querySelector('#game-event').dataset.kind==='demotion');
  assert.match(await page.locator('#game-event').innerText(),/3\/3/);assert.match(await page.locator('#round-end-banner h2').innerText(),/退回 2/);
  await page.screenshot({path:path.join(scratch,'ace-demotion.png'),fullPage:true});
  await page.reload();assert.equal(await page.locator('#game-event').isHidden(),true);assert.match(await page.locator('#our-ace-progress').innerText(),/3\/3/);
  await page.locator('#next-round').click();assert.deepEqual(await page.evaluate(()=>liveRound.state.levels),['2','A']);
  pass('third attempt shows A to 2 animation, survives reload without replay, and demotes only one team');
  await page.locator('#open-settings').click();await page.locator('#sound-preview').click();
  assert.equal(await page.evaluate(()=>feedback.sound.context?.state),'running');
  await page.locator('#sound-enabled').uncheck();assert.equal(await page.evaluate(()=>feedback.sound.voices.size),0);
  await page.locator('#sound-volume').fill('20');await page.reload();assert.equal(await page.locator('#sound-enabled').isChecked(),false);assert.equal(await page.locator('#sound-volume').inputValue(),'20');
  pass('audio unlocks from a real gesture; mute and volume persist');
  let anti;for(let i=0;i<200&&!anti;i++){const next=finished([0,2,1,3],{level:'2',levels:['2','2']}).next();if(next.state.antiTribute)anti=next.state;}assert.ok(anti);
  await installState(anti);await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{prefs.dealAnimation=true;beginDealAnimation();});
  assert.equal(await page.locator('#game-event').getAttribute('data-kind'),'anti');assert.equal(await page.locator('#game-event').getAttribute('data-motion'),'false');
  pass('anti-tribute text still appears when reduced motion skips the deal animation');
  await page.locator('#language-toggle').click();assert.equal(await page.locator('#hand-fan').innerText(),'Stacks');
  await page.locator('#language-toggle').click();assert.equal(await page.locator('#hand-fan').innerText(),'叠牌');
  assert.deepEqual(errors,[]);pass('Chinese/English round-trip and zero renderer errors');
}finally{await app.close();await fs.writeFile(path.join(scratch,'result.json'),JSON.stringify({checks,errors},null,2));console.log('ARTIFACTS '+scratch);}
