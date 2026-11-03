'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../web/app/core.js'),{Match}=require('../web/app/match.js');
const hand=require('../web/app/hand-assessment.js'),assessment=require('../web/app/assessment.js'),rating=require('../web/app/assessment-rating.js'),pilot=require('../web/app/assessment-pilot.js');
function complete(){const m=new Match();let guard=2000;while(!m.game.result&&guard--){const s=m.actingSeat,c=m.game.players[s].hand.find(c=>m.selection([c.id],s).play);m.commit(s,c?[c.id]:[]);}assert.ok(m.game.result);return m.snapshot();}
function storage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};}
let seed=82909;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
test('hand partition remains legal and disjoint at every level, with deterministic bounded work',()=>{
  const started=performance.now();
  for(const level of ['2','3','4','5','6','7','8','9','10','J','Q','K','A']){
    core.setLevel(level);const deck=core.deck();
    for(let k=0;k<4;k++){
      const shuffled=[...deck];for(let i=shuffled.length-1;i;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
      const cards=shuffled.slice(0,27),before=JSON.stringify(cards),a=hand.evaluate(cards,level),b=hand.evaluate([...cards].reverse(),level);
      const swapped=cards.map(c=>({...c,deck:3-c.deck,id:(3-c.deck)+c.id.slice(1)}));assert.equal(hand.evaluate(swapped,level).score,a.score);
      assert.deepEqual(a,b);assert.equal(JSON.stringify(cards),before);assert.ok(a.score>=0&&a.score<=100);assert.equal(a.calibrated,false);assert.equal(a.percentile,null);assert.equal(a.winProbability,null);
      const ids=a.groups.flatMap(g=>g.cardIds);assert.equal(ids.length,27);assert.equal(new Set(ids).size,27);assert.deepEqual([...ids].sort(),cards.map(c=>c.id).sort());
      for(const g of a.groups){const chosen=g.cardIds.map(id=>cards.find(c=>c.id===id));assert.ok(core.recognize(chosen).some(p=>p.type===g.type),'illegal '+level+' '+JSON.stringify(g));}
      assert.equal(a.components.reduce((n,c)=>n+c.value,0),a.score);assert.ok(a.search.expanded<200000);
    }
  }
  assert.ok(performance.now()-started<15000,'52 hand evaluations should finish promptly');
});
test('two physical copies can form two disjoint copies of the same sequences',()=>{
  core.setLevel('2');const deck=core.deck(),cards=[...deck.filter(c=>c.suit==='clubs'),deck.find(c=>c.id==='1-joker-BJ')],result=hand.evaluate(cards,'2');
  assert.equal(result.score,94);assert.equal(result.groupCount,6);assert.equal(result.groups.filter(g=>g.type==='straight-flush').length,4);
});
test('hand strength rejects incomplete/mislabelled cards and never changes the gameplay level',()=>{
  core.setLevel('A');const cards=core.deck().slice(0,27);assert.notEqual(hand.evaluate(cards,'A').score,null);assert.equal(core.rankValue('A'),14.5);
  assert.equal(hand.evaluate(null,'A').score,null);assert.equal(hand.evaluate(cards.slice(1),'A').score,null);
  const duplicate=structuredClone(cards);duplicate[1]=duplicate[0];assert.equal(hand.evaluate(duplicate,'A').score,null);
  const wrong=structuredClone(cards);wrong[0].isWild=!wrong[0].isWild;assert.equal(hand.evaluate(wrong,'A').score,null);
  assert.equal(hand.evaluate(cards,'A','tuo3').score,null);
  const cached=hand.evaluate(cards,'A');cached.groups[0].cardIds=[];assert.ok(hand.evaluate(cards,'A').groups[0].cardIds.length);
});
test('pilot can rate a losing player above a winning player, without awarding strong hands',()=>{
  const round=complete(),seat=round.winnerTeam===0?1:0,report=assessment.assess(round,seat);
  const lose=structuredClone(round);lose.remaining[seat]=0;lose.events.at(-1).remaining[seat]=0;
  const high=structuredClone(report);Object.assign(high.metrics.find(m=>m.id==='P01'),{denominator:4,numerator:4,rate:1});Object.assign(high.metrics.find(m=>m.id==='T01'),{numerator:3});
  const low=structuredClone(high);low.seat=(seat+1)%4;Object.assign(low.metrics.find(m=>m.id==='P01'),{denominator:4,numerator:0,rate:0});Object.assign(low.metrics.find(m=>m.id==='T01'),{numerator:0});
  const a=rating.rate(lose,high),b=rating.rate(lose,low);assert.ok(a.score>b.score);assert.equal(a.startingHandAdjusted,false);assert.ok(!a.components.some(c=>c.id.includes('hand')));
});
test('pilot opinions preserve versions, score snapshots, revisions and stable subjects',async()=>{
  const round=complete(),s=storage(),input={handVerdict:'low',performanceVerdict:'fair',reason:'散牌比展示的少',eventIndex:round.events.find(e=>e.seat===0).index,suggestedHand:60};
  round.playerIds=[0,1,2,3];
  const a=await pilot.save(s,round,0,input);round.names[0]='改了显示名';
  const b=await pilot.save(s,round,0,{...input,handVerdict:'fair'}),c=await pilot.save(s,round,0,{...input,handVerdict:'high'});
  assert.equal(a.subjectId,0);assert.equal(b.subjectId,0);
  assert.equal(b.revisionOf,a.id);assert.equal(c.revisionOf,b.id);assert.equal(a.eligibleForTraining,false);assert.equal(a.reward,null);assert.equal(a.seatFrame,'viewer-relative');assert.equal(a.displayed.handScore,assessment.assess(round).handAssessment.score);
  assert.match(a.roundSha256,/^[a-f0-9]{64}$/);assert.equal(a.ratingVersion,rating.VERSION);
  const sameTime=[a,b,c].map(r=>({...r,createdAt:'2026-10-29T00:00:00.000Z'}));
  const summary=pilot.summarize([sameTime[2],sameTime[0],sameTime[1],sameTime[1]]);assert.equal(summary.records,3);assert.equal(summary.revisionsExcluded,2);assert.equal(summary.groups[0].hand.high,1);
  const before=s.getItem(pilot.KEY);await assert.rejects(pilot.save(s,round,0,{...input,reason:''}));await assert.rejects(pilot.save(s,round,0,{...input,eventIndex:round.events.find(e=>e.seat===1).index}));await assert.rejects(pilot.save(s,round,0,{...input,suggestedHand:101}));assert.equal(s.getItem(pilot.KEY),before);
  await assert.rejects(pilot.startBatch(s,{acknowledged:false,expectedIds:[a.id,b.id,c.id]}));await assert.rejects(pilot.startBatch(s,{acknowledged:true,expectedIds:[a.id,b.id]}));
  assert.equal(await pilot.startBatch(s,{acknowledged:true,expectedIds:[a.id,b.id,c.id]}),3);
});
test('subjective node tags never silently become training reward labels',()=>{
  const round=complete(),report=assessment.assess(round);
  assert.ok(report.cases.length);assert.equal(report.trainingSignal.eligible,false);
  for(const node of report.cases){assert.ok(Array.isArray(node.indexIds));assert.equal(node.reward,null);assert.equal(node.eligibleForTraining,false);assert.equal(round.events[node.eventIndex].seat,node.seat);}
});
