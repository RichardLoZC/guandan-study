const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../web/app/core.js');
const strategy=require('../web/app/tribute-strategy.js');
const {Match}=require('../web/app/match.js');
function cards(ids,level='2'){
  core.setLevel(level);const deck=core.deck();
  return ids.map(id=>{const card=deck.find(card=>card.id===id);assert.ok(card,id);return card;});
}
function decide(ids,level='2'){
  const hand=cards(ids,level),choices=hand.filter(card=>Number(card.rank)<=10&&card.rank!==level);
  return strategy.choose({hand,level,choices});
}
test('return strategy keeps a pair of tens and a complete straight instead of always returning ten',()=>{
  const pair=decide(['1-hearts-10','1-spades-10','1-clubs-3']);
  assert.equal(pair.card.id,'1-clubs-3');assert.equal(pair.assessment.turns,1);
  const run=decide(['1-clubs-6','1-hearts-7','1-spades-8','1-diamonds-9','1-clubs-10','1-spades-3']);
  assert.equal(run.card.id,'1-spades-3');assert.equal(run.assessment.runs,1);
});
test('equally sized ordinary and suited runs are distinguished; natural bombs are protected',()=>{
  const flush=decide(['1-spades-6','1-spades-7','1-spades-8','1-spades-9','1-spades-10','1-hearts-10']);
  assert.equal(flush.card.id,'1-hearts-10');assert.equal(flush.assessment.straightFlushes,1);
  const bomb=decide(['1-hearts-7','1-spades-7','1-clubs-7','1-diamonds-7','1-clubs-3']);
  assert.equal(bomb.card.id,'1-clubs-3');assert.equal(bomb.assessment.brokenBombs,0);assert.equal(bomb.assessment.bombs,1);
});
test('wildcard-assisted structures remain available and the level card is not offered',()=>{
  const paired=decide(['1-hearts-2','1-clubs-A','1-clubs-3']);
  assert.equal(paired.card.id,'1-clubs-3');assert.equal(paired.assessment.turns,1);assert.equal(paired.assessment.wildUsed,1);
  const levelTen=decide(['1-clubs-10','1-hearts-10','1-clubs-9','1-hearts-9','1-spades-3'],'10');
  assert.equal(levelTen.card.id,'1-spades-3');assert.ok(levelTen.candidates.every(candidate=>candidate.card.rank!=='10'));
});
test('structure ties return the smaller point card and are independent of hand or candidate order',()=>{
  const hand=cards(['1-clubs-3','2-clubs-3','1-spades-8','1-diamonds-Q']);
  const choices=hand.filter(card=>Number(card.rank)<=10),before=JSON.stringify(hand);
  const first=strategy.choose({hand,level:'2',choices});
  const again=strategy.choose({hand:[...hand].reverse(),level:'2',choices:[...choices].reverse()});
  assert.equal(first.card.id,'1-spades-8','preserve the pair before considering low card rank');
  assert.deepEqual(again,first);assert.equal(JSON.stringify(hand),before);
  assert.equal(decide(['1-clubs-3','1-spades-8']).card.id,'1-clubs-3');
  assert.equal(first.evaluatedHands,2,'identical physical copies share one assessment');
  first.card.rank='changed';first.candidates[0].card.rank='changed';assert.equal(JSON.stringify(hand),before);
});
test('duplicate-card partition assessments do not depend on which physical copy appears first',()=>{
  // Regression: this 28-card hand previously returned either diamond two or
  // spade two solely because candidate order selected another cached copy.
  const hand=cards([
    '1-hearts-8','1-diamonds-8','2-diamonds-2','2-spades-A','1-joker-BJ','1-clubs-10','2-hearts-A',
    '1-diamonds-4','2-joker-SJ','1-clubs-6','2-diamonds-8','1-hearts-3','1-spades-2','1-hearts-9',
    '2-diamonds-9','2-clubs-4','2-spades-4','1-diamonds-5','1-clubs-K','1-diamonds-Q','1-diamonds-2',
    '1-hearts-K','2-clubs-3','1-hearts-7','2-clubs-9','1-diamonds-K','1-clubs-5','2-spades-8'
  ],'10');
  const choices=hand.filter(card=>Number(card.rank)<=10&&card.rank!=='10'),before=JSON.stringify({hand,choices});
  const expected=strategy.choose({hand,level:'10',choices});
  for(const [orderedHand,orderedChoices] of [
    [hand,[...choices].reverse()],[[...hand].reverse(),choices],[[...hand].reverse(),[...choices].reverse()],
    [[...hand.slice(9),...hand.slice(0,9)],[...choices.slice(5),...choices.slice(0,5)]]
  ])assert.deepEqual(strategy.choose({hand:orderedHand,level:'10',choices:orderedChoices}),expected);
  const diamonds=expected.candidates.filter(candidate=>candidate.card.suit==='diamonds'&&candidate.card.rank==='2');
  assert.equal(diamonds.length,2);assert.deepEqual(diamonds[0].assessment,diamonds[1].assessment);
  // Even a restricted candidate list uses the same face representative.
  for(const candidate of diamonds){
    const only=strategy.choose({hand,level:'10',choices:[candidate.card]});
    assert.deepEqual(only.assessment,candidate.assessment);
  }
  assert.equal(JSON.stringify({hand,choices}),before);
});
test('the rules fallback with one high legal card is honored without expanding the legal set',()=>{
  const hand=cards(['1-clubs-J','1-hearts-Q','1-spades-K','1-hearts-2']);
  const decision=strategy.choose({hand,level:'2',choices:[hand[0]]});
  assert.equal(decision.card.id,'1-clubs-J');assert.equal(decision.candidates.length,1);assert.match(decision.reason,/仅有/);
  assert.throws(()=>strategy.choose({hand,level:'2',choices:[]}));
  assert.throws(()=>strategy.choose({hand,level:'2',choices:[{id:'foreign'}]}));
  assert.throws(()=>strategy.choose({hand:Array(29).fill(hand[0]),level:'2',choices:[hand[0]]}));
});
test('Match uses the same return strategy without reading another player hand; give retains its rule',()=>{
  const state=core.newMatch();state.phase='give';state.tribute={donors:[1],winners:[0],offers:[]};
  const match=new Match(state),given=match.tributeChoices[0].id;
  assert.equal(match.chooseTribute().card.id,given);assert.equal(match.chooseTribute().method,'maximum-tribute');
  match.commit(match.actingSeat,[given]);
  const direct=strategy.choose({hand:match.game.players[match.actingSeat].hand,level:match.level,choices:match.tributeChoices});
  const ownSeat=match.actingSeat;
  for(const player of match.game.players)if(player.seat!==ownSeat)Object.defineProperty(player,'hand',{get(){throw new Error('hidden hand read');}});
  assert.deepEqual(match.chooseTribute(),direct);
  assert.throws(()=>new Match().chooseTribute(),/没有合法/);
});
test('random legal deals produce bounded, deterministic choices that can actually be returned',()=>{
  const original=crypto.getRandomValues;let value=186;
  crypto.getRandomValues=buffer=>{for(let i=0;i<buffer.length;i++)buffer[i]=value=(Math.imul(value,1664525)+1013904223)>>>0;return buffer;};
  try{
    for(let n=0;n<20;n++){
      const state=core.newMatch();state.phase='give';state.tribute={donors:[3,1],winners:[0,2],offers:[]};
      const match=new Match(state);
      while(match.phase!=='playing'){
        const before=JSON.stringify(match.state),decision=match.chooseTribute();
        assert.equal(JSON.stringify(match.state),before);
        assert.ok(match.tributeChoices.some(card=>card.id===decision.card.id));
        if(match.phase==='return'){
          assert.ok(decision.evaluatedHands<=28);
          assert.ok(decision.candidates.every(candidate=>candidate.assessment.plansExamined<=8));
          assert.equal(match.chooseTribute().card.id,decision.card.id);
        }
        match.commit(match.actingSeat,[decision.card.id]);
      }
      assert.deepEqual(match.game.players.map(player=>player.hand.length),[27,27,27,27]);
    }
  }finally{crypto.getRandomValues=original;}
});
