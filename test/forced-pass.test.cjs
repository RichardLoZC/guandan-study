const test=require('node:test'),assert=require('node:assert/strict');
const {smallHands,seeded}=require('./helpers/strategy-fixtures.cjs'),{Match}=require('../web/app/match.js');
const {Room,PROTOCOL,perspective}=require('../lan-room.cjs');
test('only public small-hand size impossibility forces a pass',()=>{
  for(const count of [1,2,3,4,5]){
    const m=smallHands([3,count,3,3]);assert.equal(m.mustPass,count<=3);
    if(count>3)assert.throws(()=>m.passForced(),/当前不能/);
  }
  const pair=smallHands([3,3,3,3],['1-clubs-5','2-clubs-5']);assert.equal(pair.mustPass,false);
  pair.game.players[1].hand[0].isWild=true;assert.equal(pair.mustPass,false,'no rank/suit inspection');
  assert.equal(seeded().mustPass,false,'no target when leading');
});
test('three forced passes clear the target once, retain PASS history and return the lead',()=>{
  const m=smallHands(),before=m.events.length;
  for(let i=0;i<3;i++){assert.equal(m.actingSeat,i+1);m.passForced();}
  assert.equal(m.mustPass,false);assert.equal(m.actingSeat,0);assert.equal(m.game.tablePlay,null);
  assert.equal(m.events.length,before+3);assert.ok(m.events.slice(-3).every(e=>!e.cards.length&&e.engine==='规则自动不出'&&e.automatic));
  const restored=new Match(m.state);assert.equal(restored.actingSeat,0);assert.equal(restored.mustPass,false);
  assert.throws(()=>m.passForced(),/当前不能/);
});
test('a stale forced pass cannot change the game',()=>{
  const m=smallHands(),before=JSON.stringify(m.state);assert.throws(()=>m.passForced(1),/牌局已变化/);assert.equal(JSON.stringify(m.state),before);
});
function room(){
  const r=new Room({runModel:()=>assert.fail('forced passes never use model'),startThinking:()=>assert.fail('forced passes never wait')});
  for(let i=1;i<4;i++)r.join({code:r.code,name:'Player '+i,protocol:PROTOCOL});
  r.seats=r.members.map(m=>m.id);r.match=smallHands();return r;
}
test('host skips impossible human turns in a four-human room without model or waiting',async()=>{
  const r=room(),start=r.version;assert.equal(r.projected(r.members[1]).round.canAct,false);
  await r.tick();assert.equal(r.version,start+1);assert.equal(r.match.actingSeat,0);assert.equal(r.match.game.tablePlay,null);
  await r.tick();assert.equal(r.version,start+1);assert.equal(r.projected(r.members[0]).round.canAct,true);
});
test('pause, disconnect and failure to persist preserve the unadvanced turn',async()=>{
  const r=room(),before=JSON.stringify(r.match.state);
  r.paused=true;await r.tick();assert.equal(JSON.stringify(r.match.state),before);
  r.paused=false;r.members[1].lastSeen=0;await r.tick();assert.equal(JSON.stringify(r.match.state),before);
  r.members[1].lastSeen=Date.now();r.save=()=>{throw Error('disk full');};await r.tick();
  assert.equal(JSON.stringify(r.match.state),before);assert.match(r.error,/自动不出未能保存/);
});
test('model decision trace is saved but never exposed through live events or LAN snapshots',()=>{
  const m=seeded(5),card=m.hand[0],result=m.selection([card.id],0);
  m.commitModel({result:{engine:'DanLM + 秘籍策略',candidates:[{type:'play',play:result.play}],
    book:{version:'public-routes-v3',original:'old',chosen:result.play.label,changed:true,rows:[{evidence:[{delta:-3,reason:'PRIVATE follow-up'}]}]}}},0,0);
  assert.equal(m.state.study.choices[0].strategy.historyLength,0);
  assert.equal(m.state.study.choices[0].strategy.reasons[0],'PRIVATE follow-up');
  assert.equal(m.events[0].strategy,null);
  assert.equal(JSON.stringify(perspective(m,1,m.names)).includes('PRIVATE'),false);
  assert.equal(new Match(m.state).state.study.choices[0].strategy.version,'public-routes-v3');
});
