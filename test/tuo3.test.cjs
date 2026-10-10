const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../web/app/core.js');
const rules=require('../web/app/tuo3.js');
const {Match,create,read,archive,archives,SAVE_KEY}=require('../web/app/match.js');

function fixture(hands,{order=[],first=false,secured=null,hard=null,actor=0}={}){
  const state=create('tuo3').state;core.setLevel('2');
  const deck=core.deck(),used=new Set(hands.flat());
  state.tuo3.playerIds=[0,1,2,3];state.tuo3.securedSeat=secured;state.tuo3.hardLead=hard;
  state.study.tributeAcknowledged=true;
  state.game.players=hands.map((ids,seat)=>({seat,team:seat%2,isHuman:seat===0,name:core.names[seat],finished:!ids.length,hand:ids.map(id=>{const c=deck.find(c=>c.id===id);assert.ok(c,id);return c;})}));
  const rest=deck.filter(card=>!used.has(card.id));
  if(first)state.game.players[3].hand.push(...rest);
  state.game.actionHistory=first?[]:[{turn:1,seat:3,play:{cards:rest,label:'此前已出的牌',type:'fixture'},tablePlayAfter:null,tableOwnerAfter:null}];
  state.game.finishOrder=order;state.game.currentPlayer=actor;state.game.starter=0;
  return new Match(state);
}
function seeded(seed,action){
  const random=crypto.getRandomValues;let value=seed;
  crypto.getRandomValues=buffer=>{for(let i=0;i<buffer.length;i++)buffer[i]=value=(Math.imul(value,1664525)+1013904223)>>>0;return buffer;};
  try{return action();}finally{crypto.getRandomValues=random;}
}
const id=(rank,suit='clubs',deck=1)=>`${deck}-${suit}-${rank}`;
const play=(match,ids)=>match.commit(match.actingSeat,ids);
function complete(match){
  if(match.needsTributeConfirmation)match.acknowledgeTribute();
  for(let step=0;!match.game.result&&step<2200;step++){
    const seat=match.actingSeat,hand=match.game.players[seat].hand;
    let ids;
    if(rules.canDrag(match.state,seat,hand))ids=hand.map(card=>card.id);
    else ids=hand.filter(card=>!match.selection([card.id],seat).error).slice(-1).map(card=>card.id);
    match.commit(seat,ids);
  }
  assert.ok(match.game.result);return match;
}
test('flip creates valid teams, preserves all physical cards, and reveals only the two matching cards',()=>{
  const partners=new Set();
  for(let n=0;n<30;n++){
    const m=seeded(n+1,()=>create('tuo3')),t=m.state.tuo3;partners.add(m.playerIds[2]);
    assert.deepEqual(m.game.players.map(p=>p.hand.length),[27,27,27,27]);
    assert.ok(m.needsTributeConfirmation);assert.throws(()=>m.commit(m.actingSeat,[m.game.players[m.actingSeat].hand[0].id]));
    assert.equal(m.names[2],core.names[t.playerIds[2]]);
    assert.equal(m.game.starter,t.holder);
    assert.ok(m.game.players[t.holder].hand.some(card=>card.id===t.flipped.id));
    assert.ok(m.game.players[t.other].hand.some(card=>card.id===t.twin.id));
    assert.equal(t.flipped.rank,t.twin.rank);assert.equal(t.flipped.suit,t.twin.suit);
    if(!t.sameHolder)assert.equal(t.holder%2,t.other%2);
    const o=m.observation();assert.equal(o.known.length,2);
    assert.ok(o.state.players.filter(p=>p.seat!==o.seat).every(p=>p.hand.every(card=>card===null)));
  }
  assert.ok(partners.size>=2);
});
test('first lead forbids natural and wildcard threes; later full houses cannot carry a pair of threes',()=>{
  const m=fixture([[id('3'),id('4','hearts'),id('5','hearts'),id('6','hearts'),id('7','hearts'),id('2','hearts')],[id('A')],[id('K')],[id('Q')]],{first:true});
  assert.match(m.selection([id('3')]).error,/第一手/);
  const ids=['2','4','5','6','7'].map(rank=>id(rank,'hearts'));
  const found=m.selection(ids);assert.ok(found.plays.length);
  assert.ok(found.plays.every(play=>!play.sequence.includes(3)));
  const later=fixture([[id('4'),id('4','hearts'),id('4','spades'),id('3'),id('3','spades')],[id('A')],[id('K')],[id('Q')]]);
  assert.match(later.selection(later.hand.map(c=>c.id)).error,/不能带对 3/);
});
test('head drag immediately grants hard wind; partner pure-three finish scores; all score components are zero-sum',()=>{
  const m=fixture([[id('A','spades'),id('3'),id('2','hearts')],[id('4','diamonds'),id('3','hearts',2)],
    [id('3','hearts'),id('3','spades')],[id('4'),id('3','clubs',2)]]);
  play(m,[id('A','spades')]);for(let n=0;n<3;n++)play(m,[]);
  assert.equal(m.actingSeat,0);assert.equal(m.state.tuo3.securedSeat,0);
  assert.equal(rules.canDrag(m.state,0,m.game.players[0].hand),true);
  play(m,[id('3'),id('2','hearts')]);
  assert.deepEqual(m.game.finishOrder,[0]);assert.equal(m.actingSeat,2);assert.equal(m.game.tablePlay,null);
  assert.equal(m.state.tuo3.hardLead,2);assert.equal(m.game.actionHistory.at(-1).hardWindTo,2);
  assert.throws(()=>m.commit(1,[]));assert.throws(()=>m.commit(2,[]));
  const restored=new Match(m.state);play(restored,[id('3','hearts'),id('3','spades')]);
  assert.equal(restored.game.result.levelDelta,0);assert.equal(restored.state.tuo3.drags.length,2);
  assert.deepEqual(restored.state.tuo3.totals,[12,-12,12,-12]);
  assert.deepEqual(restored.state.tuo3.settlement.rows[0],{seat:0,identity:0,name:'你',placement:3,drag:6,remainder:3,delta:12,before:0,total:12});
  assert.equal(restored.state.tuo3.totals.reduce((a,b)=>a+b,0),0);
  assert.equal(new Match(restored.state).state.tuo3.totals[0],12);
  assert.equal(restored.snapshot().finalPlay.label.startsWith('拖三'),true);
});
test('hard-wind ordinary straight must split, but an entire straight flush may finish',()=>{
  const ids=['A','2','3','4','5'].map(rank=>id(rank,rank==='4'?'clubs':'hearts'));
  const m=fixture([ids,[id('K')],[],[id('Q')]],{order:[2],hard:0});
  assert.match(m.selection(ids).error,/硬接风/);assert.ok(m.selection([id('4')]).play);
  const suited=['A','2','3','4','5'].map(rank=>id(rank,'hearts'));
  const flush=fixture([suited,[id('K')],[],[id('Q')]],{order:[2],hard:0});
  assert.equal(flush.selection(suited).plays.length,1);assert.equal(flush.selection(suited).play.type,'straight-flush');
  play(flush,suited);assert.equal(flush.state.tuo3.drags.length,0);
});
test('pure-three finish without a secured lead, by the opposing second finisher, or by third finisher has no drag bonus',()=>{
  for(const options of [{order:[],secured:null},{order:[1],secured:0},{order:[2,1],secured:0}]){
    const hands=[[id('3')],options.order.includes(1)?[]:[id('4')],options.order.includes(2)?[]:[id('5')],[id('6')]];
    const m=fixture(hands,options);assert.equal(rules.canDrag(m.state,0,m.hand),false);
    play(m,[id('3')]);assert.equal(m.state.tuo3.drags.length,0);
  }
});
test('twinned flip in one hand keeps the previous partner and the head is next flipper',()=>{
  const previous=complete(seeded(42,()=>create('tuo3')));let found;
  for(let n=0;n<80;n++){const next=seeded(n+1,()=>previous.next());if(next.state.tuo3.sameHolder){found=next;break;}}
  assert.ok(found);assert.deepEqual(found.playerIds,previous.playerIds);
  assert.equal(found.state.tuo3.flipper,previous.playerIds[previous.game.finishOrder[0]]);
});
test('multi-round saves and archives preserve scores by identity, stay at two and never duplicate settlement',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  let m=create('tuo3');
  for(let round=1;round<=8;round++){
    complete(m);m.persist(storage);archive(storage,m);
    const totals=[...m.state.tuo3.totals],restored=read(storage);
    assert.deepEqual(restored.state.tuo3.totals,totals);assert.equal(totals.reduce((a,b)=>a+b,0),0);
    assert.deepEqual(archives(storage)[0].playerIds,m.playerIds);
    assert.deepEqual(archives(storage)[0].settlement,m.state.tuo3.settlement);
    m=restored.next();assert.equal(m.level,'2');assert.deepEqual(m.state.levels,['2','2']);
    assert.equal(m.phase,'playing');assert.equal(m.state.exchanges.length,0);assert.deepEqual(m.state.tuo3.totals,totals);
    assert.equal(m.state.tuo3.settlement,null);assert.equal(m.state.tuo3.drags.length,0);assert.equal(m.needsTributeConfirmation,true);
  }
  assert.equal(create('classic').state.tuo3,undefined);assert.deepEqual(create('tuo3').state.tuo3.totals,[0,0,0,0]);
  assert.ok(values.get(SAVE_KEY));
});
test('illegal model candidates are replaced by legal candidates and hard-wind drag is recognized',()=>{
  const m=fixture([[id('3'),id('4')],[id('A')],[id('K')],[id('Q')]],{first:true});
  core.setLevel('2');const illegal=core.recognize([m.hand.find(c=>c.rank==='3')])[0],legal=core.recognize([m.hand.find(c=>c.rank==='4')])[0];
  const result=m.adaptModel({result:{candidates:[{type:'play',play:illegal}]},allPlays:[illegal,legal]},0);
  assert.equal(result.result.candidates[0].play.cards[0].rank,'4');m.commitModel(result,m.revision,0);
  const drag=fixture([[id('3'),id('2','hearts')],[id('A')],[],[id('K')]],{order:[2],hard:0});
  const response=drag.adaptModel({result:{candidates:[]}},0);
  assert.equal(response.result.candidates[0].play.cards.length,2);drag.commitModel(response,drag.revision,0);
  assert.equal(drag.state.tuo3.drags.length,1);
});

test('Tuo3 review export includes shared point breakdown and identity names, without an upgrade claim',()=>{
  const m=complete(seeded(74,()=>create('tuo3'))),round=m.snapshot(),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const context={reviewRound:round,GuandanCore:core,signed:value=>(value>0?'+':'')+value};vm.createContext(context);
  const source=fs.readFileSync(path.join(__dirname,'../web/app/review.js'),'utf8');
  vm.runInContext(source.match(/function reviewText\(\)\{[\s\S]*?\n\}/)[0],context);
  const text=context.reviewText();assert.match(text,/拖 3 · 固定打 2/);assert.match(text,/另一队反向记分/);assert.doesNotMatch(text,/升0级/);
  for(const row of round.settlement.rows)assert.ok(text.includes(row.name+'：名次 '+context.signed(row.placement)));
  assert.ok(text.includes('最后打出的牌'));assert.ok(text.includes('终局明牌'));
});
