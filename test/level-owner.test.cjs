'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../web/app/core.js'),series=require('../web/app/series.js');
const {Match,read,archive,archives,SAVE_KEY,ARCHIVE_KEY}=require('../web/app/match.js');
const {perspective,Room,PROTOCOL}=require('../web/app/lan-room.js');
const {finished}=require('./helpers/series-fixtures.cjs');
const permutations=list=>list.length?list.flatMap((x,i)=>permutations(list.filter((_,j)=>j!==i)).map(p=>[x,...p])):[[]];
const storage=entries=>{const values=new Map(entries);return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};};
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
function finishLegally(match){
  for(let guard=0;!match.game.result&&guard<1500;guard++){
    if(match.needsTributeConfirmation){match.acknowledgeTribute();continue;}
    if(match.phase!=='playing'){match.commit(match.actingSeat,[match.tributeChoices[0].id]);continue;}
    const seat=match.actingSeat,card=match.game.players[seat].hand.find(c=>match.selection([c.id],seat).play);
    match.commit(seat,card?[card.id]:[]);
  }
  assert.ok(match.game.result,'legal single-card play must terminate');return match;
}
test('all 144 A/A placements and counters commit owner-only wins and demotions exactly once',()=>{
  for(const order of permutations([0,1,2,3]))for(const owner of [0,1])for(const count of [0,1,2]){
    const counters=[0,0];counters[owner]=count;
    const m=finished(order,{levelTeam:owner,attempts:counters}),before=JSON.stringify(m.state);
    const winTeam=order[0]%2,place=order.indexOf((order[0]+2)%4)+1;
    const clears=winTeam===owner&&place!==4,attempt=winTeam===owner&&place===4?count+1:0;
    const expectedLevels=clears?['2','2']:['A','A'];if(attempt===3)expectedLevels[owner]='2';
    const expectedWins=[0,0];if(clears)expectedWins[winTeam]=1;
    const out=series.settlement(m.state),next=m.next(),direct=core.newMatch(m.state,rng(40));
    assert.equal(out.victory,clears);assert.equal(out.reclaimed,winTeam!==owner);
    assert.equal(out.attempt,attempt);assert.equal(out.demotion,attempt===3);
    for(const s of [next.state,direct]){
      assert.deepEqual(s.levels,expectedLevels);assert.deepEqual(s.wins,expectedWins);
      assert.equal(s.levelTeam,clears?null:winTeam);assert.equal(s.seriesRules,series.RULES);
      assert.equal(s.level,expectedLevels[winTeam]);assert.equal(s.round,m.state.round+1);
      const expectedCounters=[0,0];if(attempt&&attempt<3)expectedCounters[owner]=attempt;
      assert.deepEqual(s.aceAttempts,expectedCounters);
      const cards=s.game.players.flatMap(p=>p.hand);assert.equal(new Set(cards.map(c=>c.id)).size,108);
      assert.equal(cards.filter(c=>c.isWild).length,2);assert.ok(cards.every(c=>c.isWild===(c.suit==='hearts'&&c.rank===s.level)));
      assert.equal(Boolean(s.tribute||s.antiTribute),!clears);
    }
    for(let viewer=0;viewer<4;viewer++){
      const view=perspective(m,viewer,['甲','乙','丙','丁']).state,projected=series.settlement(view);
      assert.equal(view.levelTeam,(owner+viewer)%2);assert.equal(projected.victory,clears);
      assert.equal(projected.reclaimed,winTeam!==owner);assert.equal(projected.attempt,attempt);
      assert.equal(projected.nextLevelTeam,clears?null:(winTeam+viewer)%2);
    }
    assert.equal(JSON.stringify(m.state),before,'settlement, next, and perspective do not mutate the completed round');
  }
});
test('reclaiming A with first/fourth does not consume an attempt or demote the challenger',()=>{
  const challenger=finished([1,0,2,3],{levelTeam:0,attempts:[0,2]}),next=challenger.next();
  assert.equal(series.settlement(challenger.state).attempt,0);assert.deepEqual(next.state.aceAttempts,[0,0]);
  assert.deepEqual(next.state.levels,['A','A']);assert.deepEqual(next.state.wins,[0,0]);assert.equal(next.state.levelTeam,1);
});
test('winning the deal which reaches A never clears A, regardless of the other team level',()=>{
  for(const level of ['Q','K'])for(const other of ['K','A'])for(const owner of [0,1]){
    const levels=[other,other];levels[owner]=level;
    const m=finished(owner?[1,3,0,2]:[0,2,1,3],{level,levels,levelTeam:owner}),next=m.next();
    assert.equal(series.settlement(m.state).victory,false);assert.equal(next.level,'A');
    assert.equal(next.state.levelTeam,owner);assert.deepEqual(next.state.wins,[0,0]);
  }
});
test('ordinary tribute restores ownership at every stage, independently of the opening lead',()=>{
  const prior=finished([0,1,2,3],{levelTeam:1});let state;
  for(let seed=1;seed<=100;seed++){state=core.newMatch(prior.state,rng(seed));if(state.tribute)break;}
  assert.ok(state.tribute);const m=new Match(state),stages=[];
  while(m.phase!=='playing'){stages.push(structuredClone(m.state));m.commit(m.actingSeat,[m.tributeChoices[0].id]);}
  stages.push(structuredClone(m.state));assert.notEqual(m.game.starter%2,0,'tribute loser leads, while the prior winner owns the level');
  for(const stage of stages){
    delete stage.levelTeam;delete stage.seriesRules;const raw=JSON.stringify(stage),s=storage([[SAVE_KEY,raw]]),restored=read(s);
    assert.equal(restored.state.levelTeam,0);assert.equal(restored.state.seriesRules,series.RULES);
    assert.equal(s.getItem(SAVE_KEY),raw,'reading/migrating never overwrites the original save');
  }
});
test('anti-tribute restores the previous winner, including a same-team last player',()=>{
  for(const order of [[0,1,2,3],[0,1,3,2]]){
    const prior=finished(order,{levelTeam:1});let state;
    for(let seed=1;seed<=1500;seed++){state=core.newMatch(prior.state,rng(seed));if(state.antiTribute)break;}
    assert.ok(state.antiTribute);assert.equal(state.game.starter,0);
    if(order.at(-1)===2)assert.ok(state.antiTribute.every(record=>record.seat%2===0));
    delete state.levelTeam;delete state.seriesRules;
    assert.equal(new Match(state).state.levelTeam,0);
    for(let viewer=0;viewer<4;viewer++)assert.equal(perspective(new Match(state),viewer,['甲','乙','丙','丁']).state.levelTeam,viewer%2);
  }
});
test('ambiguous or contradictory ownership never silently awards a match or overwrites the original save',()=>{
  const state=finished().state;delete state.levelTeam;delete state.seriesRules;
  const raw=JSON.stringify(state),s=storage([[SAVE_KEY,raw]]);
  assert.throws(()=>read(s),/缺少本副打级方/);assert.equal(s.getItem(SAVE_KEY),raw);
  assert.throws(()=>core.newMatch(state),/缺少本副打级方/);
  for(const value of [-1,2,99,'0',false,{},[]])assert.throws(()=>new Match({...state,levelTeam:value}),/打级方/);
  assert.throws(()=>new Match({...state,levelTeam:0,seriesRules:'unknown-rules'}),/版本不兼容/);
  const original=finished([0,1,2,3],{levelTeam:1}).next();
  assert.throws(()=>new Match({...original.state,levelTeam:1}),/贡还记录不一致/);
});
test('historical archives retain old A/A results, while new archives retain owner-based outcomes',()=>{
  const old=finished([1,3,0,2],{levelTeam:0}).state;delete old.seriesRules;delete old.levelTeam;
  const s=storage([[ARCHIVE_KEY,JSON.stringify([{id:old.id,state:old}])]]),before=s.getItem(ARCHIVE_KEY);
  assert.equal(archives(s)[0].seriesOutcome.victory,true);assert.equal(archives(s)[0].seriesOutcome.seriesRules,'legacy-any-ace');
  assert.equal(s.getItem(ARCHIVE_KEY),before);
  const current=finished([1,3,0,2],{levelTeam:0});archive(s,current);
  const report=archives(s)[0];assert.equal(report.seriesOutcome.victory,false);assert.equal(report.seriesOutcome.reclaimed,true);
  assert.equal(report.levelTeam,0);assert.equal(report.seriesRules,series.RULES);
  for(const change of [{seriesRules:'unknown-rules'},{levelTeam:99}]){
    const corrupted=storage([[ARCHIVE_KEY,JSON.stringify([{id:old.id,state:{...old,...change}}])]]);
    assert.throws(()=>archives(corrupted),/版本不兼容|打级方无效/);
  }
});
test('a real legal A/A deal reclaims ownership and the next real deal obeys its new owner',()=>{
  let reclaims=0;
  for(let seed=1;seed<=12;seed++){
    core.setLevel('A');const state=core.newMatch(undefined,rng(seed));state.level='A';state.levels=['A','A'];state.levelTeam=seed%2;
    for(const player of state.game.players)for(const c of player.hand)c.isWild=c.suit==='hearts'&&c.rank==='A';
    const first=finishLegally(new Match(state)),out=series.settlement(first.state);
    if(!out.reclaimed)continue;reclaims++;
    const second=first.next();assert.equal(second.state.levelTeam,first.game.result.winnerTeam);assert.deepEqual(second.state.wins,[0,0]);
    const owner=second.state.levelTeam;finishLegally(second);const result=series.settlement(second.state);
    assert.equal(result.victory,second.game.result.winnerTeam===owner&&second.game.finishOrder.at(-1)%2!==owner);
    const restored=new Match(structuredClone(second.state));assert.deepEqual(restored.next().state.levels,second.next().state.levels);
  }
  assert.ok(reclaims>0,'at least one real legal continuation must exercise reclaiming');
});
test('room next/restore uses protocol 4 and does not reshuffle seats on an A/A reclaim',async()=>{
  const room=new Room(),host=room.host('房主');room.join({code:room.code,name:'朋友',protocol:PROTOCOL});
  await room.request(host.token,{protocol:PROTOCOL,op:'start',version:room.version,requestId:'start'});
  room.match=finished([1,3,0,2],{levelTeam:0});const seats=[...room.seats];
  await room.request(host.token,{protocol:PROTOCOL,op:'next',version:room.version,requestId:'next'});
  assert.deepEqual(room.seats,seats);assert.deepEqual(room.match.state.wins,[0,0]);assert.equal(room.match.state.levelTeam,1);
  const restored=new Room({restored:room.serialize()});assert.equal(restored.match.state.levelTeam,1);
  assert.equal(PROTOCOL,4);assert.equal(restored.serialize().protocol,4);
  assert.throws(()=>restored.join({code:room.code,name:'旧端',protocol:3}),/版本不同/);
});
