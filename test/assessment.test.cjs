'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../web/app/core.js'),{Match}=require('../web/app/match.js'),{perspective}=require('../lan-room.cjs');
const assessment=require('../web/app/assessment.js'),rating=require('../web/app/assessment-rating.js'),protocol=require('../web/app/evaluation-protocol.js');
function storage(){const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),values};}
function complete(m=new Match()){
  let guard=2000;
  while(!m.game.result&&guard--){
    if(m.needsTributeConfirmation){m.acknowledgeTribute();continue;}
    if(m.phase!=='playing'){m.commit(m.actingSeat,[m.tributeChoices[0].id]);continue;}
    const seat=m.actingSeat,c=m.game.players[seat].hand.find(c=>m.selection([c.id],seat).play);m.commit(seat,c?[c.id]:[]);
  }
  assert.ok(m.game.result);return m;
}
function dealt(partials){
  const s=core.newMatch();core.setLevel('2');const deck=core.deck(),held=new Set(Object.values(partials).flat());
  const rest=deck.filter(c=>!held.has(c.id));
  for(let seat=0;seat<4;seat++){const hand=(partials[seat]||[]).map(id=>deck.find(c=>c.id===id));while(hand.length<27)hand.push(rest.shift());s.game.players[seat].hand=hand;}
  s.game.currentPlayer=0;s.game.starter=0;return new Match(s);
}
const metric=(r,id)=>r.metrics.find(m=>m.id===id);
test('scoreless tactical dimensions remain unknown; open contests do not become failed recaptures',()=>{
  const m=new Match(),seat=m.actingSeat,play=core.recognize([m.game.players[seat].hand[0]])[0];m.commit(seat,play.cards.map(c=>c.id));
  const r=assessment.assess(m.snapshot(),seat);
  for(const id of ['P03','P04','F03','F04','T02','T03','H02','H03','I01','R01']){assert.equal(metric(r,id).numerator,null);assert.equal(metric(r,id).grade,null);}
  assert.equal(r.compositeScore,null);assert.equal(r.windows[0].closed,false);assert.equal(metric(r,'P01').denominator,0);
  assert.equal(rating.rate(m.snapshot(),r).score,null);
});
test('partner control handoff is counted once when the same partner leads again',()=>{
  const m=dealt({0:['1-clubs-3'],2:['1-clubs-A','1-diamonds-A']});
  m.commit(0,['1-clubs-3']);m.commit(1,[]);m.commit(2,['1-clubs-A']);m.commit(3,[]);m.commit(0,[]);m.commit(1,[]);
  assert.equal(m.game.currentPlayer,2);assert.equal(metric(assessment.assess(m.snapshot()),'P02').value.partnerHandoffs,1);
  m.commit(2,['1-diamonds-A']);m.commit(3,[]);m.commit(0,[]);m.commit(1,[]);
  assert.equal(metric(assessment.assess(m.snapshot()),'P02').value.partnerHandoffs,1);
});
test('partner passing before a finished-player wind does not hide the wind reception',()=>{
  const m=dealt({});let guard=200;
  while(!m.game.players[0].finished&&guard--){if(m.actingSeat===0)m.commit(0,[m.game.players[0].hand[0].id]);else m.commit(m.actingSeat,[]);}
  while(m.game.tablePlay&&guard--)m.commit(m.actingSeat,[]);
  assert.equal(m.actingSeat,2);
  const t=metric(assessment.assess(m.snapshot()),'T01');assert.equal(t.value.responses.at(-1).response,'partner_wind');assert.equal(t.numerator,1);
});
test('in-progress opponent statistics and model attribution cannot disclose private cards',()=>{
  const m=new Match(),seat=m.actingSeat,play=core.recognize([m.game.players[seat].hand[0]])[0];
  m.commitModel({elapsedMs:22,result:{engine:'DanLM',candidates:[{type:'play',play,score:99}]}},m.revision,seat);
  for(let viewer=0;viewer<4;viewer++){
    const data=perspective(m,viewer,['甲','乙','丙','丁']),remote=Object.create(Match.prototype);remote.state=data.state;Object.defineProperty(remote,'names',{value:['甲','乙','丙','丁']});
    const snapshot=remote.snapshot(),reports=[0,1,2,3].map(s=>assessment.assess(snapshot,s)),text=JSON.stringify({data,snapshot,reports});
    const secret=m.game.players.filter(p=>p.seat!==viewer).flatMap(p=>p.hand).filter(c=>!m.state.known.some(k=>k.card.id===c.id));
    for(const c of secret)assert.ok(!text.includes('"'+c.id+'"'),'hidden '+c.id);
    const relative=(seat-viewer+4)%4;
    if(relative!==0){assert.equal(snapshot.events[0].decision,null);assert.equal(metric(reports[relative],'F02').numerator,null);assert.equal(metric(reports[relative],'F02').missingReason,'private_hand_unavailable');}
  }
});
test('completed reports reconstruct actor-only hands; full replay rejects corrupted derived fields',async()=>{
  const m=complete(),r=m.snapshot(),{verifyReplay}=await import('../scripts/team-evaluation.mjs');
  assert.equal(verifyReplay(r).status,'passed');
  for(const mutate of [
    s=>{s.events[1].ownBefore[0]={...s.events[1].ownBefore[0],id:'not-a-card'};},
    s=>{s.events[0].playType='straight-flush';},
    s=>{const e=s.events.find(e=>e.nextLeader!==null);e.nextLeader=(e.nextLeader+1)%4;},
    s=>{s.events[0].tableAfter.play.cards[0].id='wrong';},
    s=>{s.events.find(e=>e.tableBefore).tableBefore.play.bombSize=6;},
    s=>{s.events.find(e=>e.tableBefore).tableBefore.play.primaryValue=999;},
    s=>{s.remaining[0]=-100;}
  ]){const changed=structuredClone(r);mutate(changed);assert.throws(()=>verifyReplay(changed));}
  for(let seat=0;seat<4;seat++){
    const e=r.events.find(e=>e.seat===seat),obs=assessment.observation(r,e.index,seat);
    assert.equal(obs.hand.length,e.remainingBefore[seat]);assert.equal(obs.history.length,e.index);
    assert.equal('winnerTeam' in obs,false);assert.equal('names' in obs,false);assert.equal('modelScores' in obs,false);
    assert.equal(metric(assessment.assess(r,seat),'Q01').value.errors.length,0);
  }
  const serialized=JSON.stringify({round:r,reports:[0,1,2,3].map(s=>assessment.assess(r,s))});
  assert.ok(serialized.length<3000000);assert.ok(assessment.assess(r).windows.every(w=>!('events' in w)));
});
test('trial post-match score is reproducible, explained, and separate from tactical grading',()=>{
  const round=complete().snapshot(),report=assessment.assess(round),a=rating.rate(round,report),b=rating.rate(round,report);
  assert.deepEqual(a,b);assert.ok(a.score>=1&&a.score<=10);assert.equal(a.trial,true);assert.equal(a.startingHandAdjusted,false);assert.equal(a.tacticalGrade,null);
  assert.equal(Math.round(a.components.reduce((n,c)=>n+c.value,0)*10)/10,a.score);
  const partner=rating.rate(round,{...report,seat:2});
  assert.equal(a.components.find(c=>c.id==='team-result').value,partner.components.find(c=>c.id==='team-result').value,'team result is symmetric');
  round.remaining[0]=-100;assert.equal(rating.rate(round,report).score,null);
});
test('expert opinions retain revisions with compact evidence hashes and bounded storage',async()=>{
  const round=complete().snapshot(),e=round.events.find(e=>e.seat===0),s=storage();
  const a=await assessment.saveFeedback(s,round,e.index,0,{reviewer:'甲',rating:3,reason:'当时信息下合理',alternative:''});
  const b=await assessment.saveFeedback(s,round,e.index,0,{reviewer:'甲',rating:4,reason:'另有接应证据',alternative:'另一手'});
  assert.equal(b.revisionOf,a.id);assert.equal(a.status,'unverified_expert_opinion');assert.equal(a.blinding,'ui-hidden-not-verified');assert.match(a.observationSha256,/^[a-f0-9]{64}$/);assert.equal(a.observation,undefined);
  const before=s.getItem(assessment.FEEDBACK_KEY);assert.ok(before.length<4000);
  await assert.rejects(assessment.saveFeedback(s,round,e.index,0,{reviewer:'甲',rating:0,reason:'x'}));assert.equal(s.getItem(assessment.FEEDBACK_KEY),before);
  await assert.rejects(assessment.startFeedbackBatch(s,{acknowledged:false,expectedIds:[a.id,b.id]}));
  await assert.rejects(assessment.startFeedbackBatch(s,{acknowledged:true,expectedIds:[a.id]}));
  assert.equal(await assessment.startFeedbackBatch(s,{acknowledged:true,expectedIds:[a.id,b.id]}),2);assert.deepEqual(assessment.readFeedback(s),[]);
});
test('paired statistics preserve pairs and reject incomplete, duplicate or invalid outcomes',()=>{
  const pairs=Array.from({length:80},(_,i)=>({id:String(i),startingSeat:i%4,wins:[1,0]}));
  const s=protocol.pairedSummary(pairs);assert.equal(s.rate,0.5);assert.deepEqual(s.interval,[0.5,0.5]);assert.equal(s.games,160);
  assert.throws(()=>protocol.pairedSummary([...pairs,pairs[0]]));assert.throws(()=>protocol.pairedSummary([{id:'x',startingSeat:0,wins:[1]}]));
  const evidence=Object.fromEntries(['rulesReplay','engineering','exportParity','opponentMatrix'].map(k=>[k,{status:'passed',artifactSha256:'a'.repeat(64)}]));
  assert.equal(protocol.releaseGate({status:'frozen',stage:'T6',targetPairs:80,minimumRate:0.51},s,evidence).eligible,false);
  assert.equal(protocol.releaseGate({status:'frozen',stage:'T6',targetPairs:81,minimumRate:0.51},{...s,rate:1,interval:[0.99,1]},evidence).eligible,false);
});
module.exports={complete};
