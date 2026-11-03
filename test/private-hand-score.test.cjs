'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Match}=require('../web/app/match.js'),score=require('../web/app/private-hand-score.js'),hand=require('../web/app/hand-assessment.js'),core=require('../web/app/core.js');
test('own starting score is immediately available and stays fixed after own cards are played',()=>{
  const m=new Match(),initial=score.readOwn(m);assert.equal(initial.score,hand.evaluate(m.hand,m.level).score);
  const cards=m.hand,chosen=cards[0];
  const input={isTuo3:false,level:m.level,phase:'playing',hand:cards.filter(c=>c.id!==chosen.id),game:{actionHistory:[{seat:0,play:{cards:[chosen]}}]}};
  assert.equal(score.readOwn(input).score,initial.score);assert.equal(initial.provisional,false);assert.equal(initial.visibility,'self-only');assert.equal(initial.reward,null);assert.equal(initial.eligibleForTraining,false);
});
test('scoring never accesses another hand, other-seat identity or inference data',()=>{
  const m=new Match(),input={isTuo3:false,level:m.level,phase:'playing',hand:m.hand,game:{actionHistory:[{seat:1,get play(){throw Error('Other action inspected');}}],get players(){throw Error('Other hand inspected');}},get playerIds(){throw Error('Other identity inspected');}};
  assert.equal(score.readOwn(input).score,hand.evaluate(m.hand,m.level).score);
});
test('tribute shows a provisional complete-hand score, withholds partial hands and recalculates after exchange',()=>{
  const m=new Match(),cards=m.hand,input={isTuo3:false,phase:'give',level:m.level,hand:cards,game:{actionHistory:[]}};
  assert.equal(score.readOwn(input).provisional,true);assert.equal(score.readOwn(input).score,hand.evaluate(cards,m.level).score);
  assert.equal(score.readOwn({...input,hand:cards.slice(1)}).reason,'tribute_in_progress');
  core.setLevel(m.level);const other=core.deck().find(c=>!cards.some(d=>d.id===c.id)),changed=[...cards.slice(1),other];
  assert.equal(score.readOwn({...input,phase:'playing',hand:changed}).score,hand.evaluate(changed,m.level).score);
});
test('missing round, duplicate cards and unsupported Tuo 3 do not invent scores',()=>{
  assert.equal(score.readOwn(null).score,null);assert.equal(score.readOwn({isTuo3:true}).reason,'unsupported_rule_mode');
  const m=new Match(),cards=m.hand;cards[1]=cards[0];assert.equal(score.readOwn({isTuo3:false,phase:'playing',level:m.level,hand:cards,game:{actionHistory:[]}}).score,null);
});
