'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../web/app/core.js'),{Match}=require('../web/app/match.js'),{perspective}=require('../lan-room.cjs');
const bombs=require('../web/app/bomb-resources.js'),facts=require('../web/app/round-statistics.js'),strength=require('../web/app/hand-strength.js'),reference=require('../web/app/hand-strength-reference.js');
function dealt(partials){
  const s=core.newMatch();core.setLevel('2');const deck=core.deck(),held=new Set(Object.values(partials).flat()),rest=deck.filter(c=>!held.has(c.id));
  for(let seat=0;seat<4;seat++){const hand=(partials[seat]||[]).map(id=>deck.find(c=>c.id===id));while(hand.length<27)hand.push(rest.shift());s.game.players[seat].hand=hand;}
  s.game.currentPlayer=0;s.game.starter=0;return new Match(s);
}
function complete(m){let guard=2000;while(!m.game.result&&guard--){const s=m.actingSeat,c=m.game.players[s].hand.find(c=>m.selection([c.id],s).play);m.commit(s,c?[c.id]:[]);}assert.ok(m.game.result);return m;}
test('same-level relative strength uses strictly lower scores, preserving ties without inventing win probability',()=>{
  for(const level of Object.keys(reference.levels))for(const team of [false,true]){
    const rows=reference.levels[level][team?'team':'individual'],total=rows.reduce((n,[v,c])=>n+c,0);let lower=0;
    for(const [score,count]of rows){const r=strength.compare(score,level,{team});assert.equal(r.lower,lower);assert.equal(r.total,total);assert.equal(r.equal,count);assert.equal(r.percentile,Math.round(100*lower/total));assert.equal(r.winProbability,null);lower+=count;}
    assert.equal(strength.compare(rows[0][0]-1,level,{team}).percentile,0);assert.equal(strength.compare(rows.at(-1)[0]+1,level,{team}).percentile,100);
  }
  assert.equal(strength.compare(null,'2'),null);assert.equal(strength.compare(60,'joker'),null);
});
test('bomb resources count split eights, duplicate straight flushes and four jokers without reusing cards',()=>{
  core.setLevel('2');const d=core.deck();
  const hands=[d.filter(c=>c.rank==='5'),d.filter(c=>c.suit==='spades'&&['5','6','7','8','9'].includes(c.rank)),d.filter(c=>c.suit==='joker')];
  for(const [i,h]of hands.entries()){
    const r=bombs.maximum(h,'2');assert.equal(r.count,i===2?1:2);const ids=r.groups.flatMap(g=>g.cardIds);assert.equal(new Set(ids).size,ids.length);
    for(const g of r.groups){const cards=g.cardIds.map(id=>h.find(c=>c.id===id));assert.ok(core.recognizeRecorded(cards).some(p=>p.type===g.type));}
  }
});
// Independent exhaustive oracle: enumerate actual physical subsets and let the
// game rules recognize bombs, then exhaustively pack those subsets.
function brute(hand){
  const groups=[];const full=(1<<hand.length)-1;
  for(let mask=1;mask<=full;mask++){const cards=hand.filter((c,i)=>mask&(1<<i));if(![4,5].includes(cards.length))continue;
    if(core.recognizeRecorded(cards).some(p=>core.isBomb(p)))groups.push(mask);}
  const memo=new Map();function solve(mask){if(memo.has(mask))return memo.get(mask);let best=0;for(const g of groups)if((g&mask)===g)best=Math.max(best,1+solve(mask^g));memo.set(mask,best);return best;}return solve(full);
}
test('maximum-bomb search agrees with physical-subset exhaustive packing on wild and overlapping resources',()=>{
  core.setLevel('2');const d=core.deck(),ids=['1-clubs-5','1-diamonds-5','1-hearts-5','1-spades-5','1-spades-6','1-spades-7','1-spades-8','1-spades-9','1-hearts-2','2-hearts-2','2-spades-5','2-spades-6'];
  const base=ids.map(id=>d.find(c=>c.id===id));
  for(let omitted=0;omitted<12;omitted++){
    const h=base.filter((c,i)=>i!==omitted);assert.equal(bombs.maximum(h,'2').count,brute(h));
    const r=bombs.maximum(h,'2'),used=r.groups.flatMap(g=>g.cardIds);assert.equal(new Set(used).size,used.length);assert.equal(r.groups.length,r.count);
    for(const g of r.groups)assert.ok(core.recognizeRecorded(g.cardIds.map(id=>h.find(c=>c.id===id))).some(p=>core.isBomb(p)));
  }
  assert.equal(bombs.maximum([base[0],base[0]],'2'),null);
});
test('ordinary loss, regaining and teammate handoff are attributed once per completed trick',()=>{
  const m=dealt({0:['1-clubs-3'],1:['1-clubs-A','1-clubs-4'],2:['1-clubs-K']});
  m.commit(0,['1-clubs-3']);m.commit(1,['1-clubs-A']);m.commit(2,[]);m.commit(3,[]);m.commit(0,[]);
  let r=facts.summarize(m.snapshot());assert.equal(r.players[0].lostWithoutBomb,1);assert.equal(r.players[0].lostToBomb,0);assert.equal(r.players[1].regainedControl,1);assert.equal(r.players[0].freeLeads,1);
  m.commit(1,['1-clubs-4']);m.commit(2,['1-clubs-K']);m.commit(3,[]);m.commit(0,[]);m.commit(1,[]);
  r=facts.summarize(m.snapshot());assert.equal(r.players[2].regainedControl,1);assert.equal(r.players[1].lostWithoutBomb,1);assert.equal(r.teams[0].lostControl,1);assert.equal(r.teams[1].lostControl,1);
});
test('an open contest is uncounted; an opponent bomb followed by a team counterbomb is no loss',()=>{
  const m=dealt({0:['1-clubs-3'],1:['1-clubs-5','1-diamonds-5','1-hearts-5','1-spades-5'],2:['1-clubs-6','1-diamonds-6','1-hearts-6','1-spades-6']});
  m.commit(0,['1-clubs-3']);m.commit(1,['1-clubs-5','1-diamonds-5','1-hearts-5','1-spades-5']);
  assert.equal(facts.summarize(m.snapshot()).players[0].lostControl,0);
  m.commit(2,['1-clubs-6','1-diamonds-6','1-hearts-6','1-spades-6']);m.commit(3,[]);m.commit(0,[]);m.commit(1,[]);
  const r=facts.summarize(m.snapshot());assert.equal(r.players[0].freeLeads,1);assert.equal(r.players[0].lostControl,0);assert.equal(r.players[2].regainedControl,0);assert.equal(r.teams[0].retainedLeads,1);
});
test('opponent-bomb loss counts the original leader while recapture credits the last controller',()=>{
  const m=dealt({0:['1-clubs-3'],1:['1-clubs-5','1-diamonds-5','1-hearts-5','1-spades-5']});
  m.commit(0,['1-clubs-3']);m.commit(1,['1-clubs-5','1-diamonds-5','1-hearts-5','1-spades-5']);m.commit(2,[]);m.commit(3,[]);m.commit(0,[]);
  const r=facts.summarize(m.snapshot());assert.equal(r.players[0].lostToBomb,1);assert.equal(r.players[0].lostWithoutBomb,0);assert.equal(r.players[1].regainedControl,1);assert.equal(r.players[1].bombsPlayed,1);
});
test('wind reception is separate from recapture and a round-ending trick never creates another free lead',()=>{
  const m=dealt({});let guard=200;while(!m.game.players[0].finished&&guard--)m.commit(m.actingSeat,m.actingSeat===0?[m.hand[0].id]:[]);
  while(m.game.tablePlay&&guard--)m.commit(m.actingSeat,[]);
  let r=facts.summarize(m.snapshot());assert.equal(r.players[2].windsReceived,1);assert.equal(r.players[2].regainedControl,0);
  complete(m);r=facts.summarize(m.snapshot());assert.equal(r.windows.at(-1).terminal,true);assert.equal(r.windows.at(-1).resolved,false);
  assert.equal(r.players.reduce((n,p)=>n+p.lostControl,0),r.players.reduce((n,p)=>n+p.regainedControl,0));
  assert.ok(r.teams.every(t=>t.starting&&t.starting.cards===54));assert.equal(r.reward,null);assert.equal(r.trainingEligible,false);
});
test('live statistics never use other private hands; all four perspective clients withhold team resources',()=>{
  const m=new Match();for(let viewer=0;viewer<4;viewer++){
    const view=perspective(m,viewer,['甲','乙','丙','丁']),remote=Object.create(Match.prototype);remote.state=view.state;Object.defineProperty(remote,'names',{value:['甲','乙','丙','丁']});
    const r=facts.summarize(remote.snapshot());assert.ok(r.players.every(p=>p.starting===null));assert.ok(r.teams.every(t=>t.starting===null));assert.ok(!JSON.stringify(r).includes('1-clubs-'));
  }
  const round=m.snapshot();Object.defineProperty(round,'revealedHands',{get(){throw Error('private cards accessed');}});assert.ok(facts.summarize(round).teams.every(t=>t.starting===null));
});
