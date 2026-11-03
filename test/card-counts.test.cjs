'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const counts=require('../web/app/card-counts.js'),feedback=require('../web/app/game-feedback.js'),assessment=require('../web/app/assessment.js');
const {Match}=require('../web/app/match.js');
test('other players report at seven while own counts and complete reviews remain available',()=>{
  for(const seat of [1,2,3]){
    for(const n of [28,27,20,8])assert.equal(counts.visible(n,{seat}),null);
    for(const n of [7,6,3,2,1,0])assert.equal(counts.visible(n,{seat}),n);
    assert.equal(counts.visible(7,{seat,dealing:true}),null);
    assert.equal(counts.visible(27,{seat,completed:true}),27);
  }
  for(const n of [28,27,8,7,0])assert.equal(counts.visible(n,{seat:0,dealing:true}),n);
  for(const n of [null,undefined,NaN,-1,7.5,'7'])assert.equal(counts.visible(n,{seat:0}),null);
  assert.equal(counts.label(8), '未报牌');assert.equal(counts.label(8,{english:true}),'Not reported');
});
test('reporting re-evaluates every render and clears stale numbers on a new deal',()=>{
  const b={textContent:''},element={hidden:false,querySelector:()=>b,classList:{toggle(){}}};
  counts.render(element,7,{seat:2});assert.equal(element.hidden,false);assert.equal(b.textContent,'7');
  counts.render(element,27,{seat:2});assert.equal(element.hidden,true);assert.equal(b.textContent,'');
  counts.render(element,6,{seat:2});assert.equal(element.hidden,false);assert.equal(b.textContent,'6');
  counts.render(element,7,{seat:2,dealing:true});assert.equal(element.hidden,true);assert.equal(b.textContent,'');
});
test('a legal round reports entry once, preserves one/two alerts, and observes seven-card decisions',()=>{
  const m=new Match(),s=structuredClone(m.state);s.game.starter=s.game.currentPlayer=1;const r=new Match(s),tracker=new feedback.Tracker();tracker.prime(r);
  const alerts=[],snapshots={};let guard=400;
  while(r.game.players[1].hand.length&&guard--){
    const seat=r.actingSeat;r.commit(seat,seat===1?[r.game.players[1].hand[0].id]:[]);
    alerts.push(...tracker.collect(r).filter(e=>e.kind==='low'));
    if(r.actingSeat===1&&!r.game.tablePlay)snapshots[r.game.players[1].hand.length]=r.snapshot();
  }
  assert.ok(guard>0);assert.deepEqual(alerts.filter(e=>e.seat===1).map(e=>e.count),[7,2,1]);
  const latest=r=>assessment.assess(r,0).cases.find(c=>c.eventIndex===r.events.findLast(e=>e.seat===0)?.index);
  assert.ok(!latest(snapshots[8])?.indexIds.includes('R01'));
  assert.ok(latest(snapshots[7]).indexIds.includes('R01'));
  const report=assessment.assess(snapshots[7],0);assert.equal(report.endgameThreshold,7);assert.equal(report.keyNodeVersion,'decision-nodes-0.3.0');
  for(const c of report.cases){assert.equal(c.reward,null);assert.equal(c.eligibleForTraining,false);}
  assert.equal(feedback.words({kind:'low',count:7,seat:1},r).title,'报牌 · 剩 7 张');
  assert.equal(feedback.words({kind:'low',count:2,seat:1},r).title,'报双');
});
test('count display policy does not change the model observation or saved state',()=>{
  const m=new Match(),state=JSON.stringify(m.state),observation=JSON.stringify(m.observation(m.actingSeat));
  for(let seat=0;seat<4;seat++)counts.label(m.game.players[seat].hand.length,{seat});
  assert.equal(JSON.stringify(m.state),state);assert.equal(JSON.stringify(m.observation(m.actingSeat)),observation);
});
