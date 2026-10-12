const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const core=require('../web/app/core.js');
const {Match,read,validate,archive,archives,SAVE_KEY,ARCHIVE_KEY}=require('../web/app/match.js');
class MemoryStorage{
  constructor(limit=Infinity){this.values=new Map();this.limit=limit;}
  getItem(key){return this.values.get(key)??null;}
  setItem(key,value){const data=new Map(this.values);data.set(key,String(value));if([...data].reduce((n,[k,v])=>n+2*(k.length+v.length),0)>this.limit)throw new Error('QuotaExceededError');this.values=data;}
}
function act(match){
  if(match.needsTributeConfirmation)match.acknowledgeTribute();
  const seat=match.actingSeat;
  if(match.phase!=='playing'){match.commit(seat,[match.tributeChoices[0].id]);return;}
  const hand=match.game.players[seat].hand;
  for(const card of hand){const found=match.selection([card.id],seat);if(found.play){match.commit(seat,[card.id]);return;}}
  match.commit(seat,[]);
}
function complete(match){let remaining=2500;while(!match.game.result&&remaining-->0)act(match);assert.ok(match.game.result,'round terminates');return match;}
function seededMatch(seed){
  core.setLevel('2');
  // The production shuffle uses crypto.getRandomValues, not Math.random.
  const random=globalThis.crypto.getRandomValues;let value=seed;
  globalThis.crypto.getRandomValues=buffer=>{
    for(let i=0;i<buffer.length;i++)buffer[i]=value=(Math.imul(value,1664525)+1013904223)>>>0;
    return buffer;
  };
  try{return new Match();}finally{globalThis.crypto.getRandomValues=random;}
}
test('new match has a shuffled unique 108-card deck and the existing v2 save contract',()=>{
  const m=new Match();assert.equal(m.state.version,2);assert.deepEqual(m.game.players.map(p=>p.hand.length),[27,27,27,27]);assert.equal(new Set(m.game.players.flatMap(p=>p.hand.map(c=>c.id))).size,108);assert.equal(m.events.length,0);
});
test('played entity is removed atomically; duplicate or stale submissions do not mutate state',()=>{
  const m=new Match(),seat=m.actingSeat,id=m.game.players[seat].hand[0].id;
  const before=JSON.stringify(m.state);assert.throws(()=>m.commit(seat,[id,id]));assert.equal(JSON.stringify(m.state),before);
  m.commit(seat,[id]);assert.equal(m.game.players[seat].hand.length,26);assert.ok(!m.game.players[seat].hand.some(c=>c.id===id));
  const after=JSON.stringify(m.state);assert.throws(()=>m.commit(seat,[id],{expectedRevision:0}));assert.equal(JSON.stringify(m.state),after);
});
test('illegal pass, foreign card and malformed worker recommendation cannot change the round',()=>{
  const m=new Match(),seat=m.actingSeat,before=JSON.stringify(m.state);
  assert.throws(()=>m.commit(seat,[]));assert.throws(()=>m.commit(seat,[m.game.players[(seat+1)%4].hand[0].id]));
  assert.throws(()=>m.commitModel({result:{candidates:[{type:'play',play:{key:'bad',cards:[m.game.players[seat].hand[0]]}}]}},0,seat));
  assert.equal(JSON.stringify(m.state),before);
});
test('observation exposes only the acting seat hand and keeps source state isolated',()=>{
  const m=new Match(),seat=m.actingSeat,o=m.observation();
  assert.equal(o.seat,seat);assert.ok(o.state.players.filter(p=>p.seat!==seat).every(p=>p.hand.length===27&&p.hand.every(c=>c===null)));
  o.state.players[seat].hand.length=0;assert.equal(m.game.players[seat].hand.length,27);
});
test('a legacy v2 save imports without dealing again and retains a backup',()=>{
  const original=core.newMatch();const store=new MemoryStorage();store.setItem(SAVE_KEY,JSON.stringify(original));
  const m=read(store);assert.equal(m.id,original.id);assert.deepEqual(m.game,original.game);assert.equal(store.getItem(SAVE_KEY+'-before-1.1'),JSON.stringify(original));
  act(m);m.persist(store);assert.equal(read(store).game.actionHistory.length,1);assert.equal(store.getItem(SAVE_KEY+'-before-1.1'),JSON.stringify(original));
});
test('corrupted save is reported and never replaced',()=>{
  const store=new MemoryStorage();store.setItem(SAVE_KEY,'{broken');assert.throws(()=>read(store));assert.equal(store.getItem(SAVE_KEY),'{broken');
  const m=new Match();m.state.game.players[1].hand[0]=m.state.game.players[0].hand[0];assert.throws(()=>validate(m.state));
});
test('restore rejects contradictory finish flags, premature results and missing pass state without overwriting the save',()=>{
  const corruptions=[
    state=>{state.game.finishOrder=[0,2];},
    state=>{state.game.players[1].finished=true;},
    state=>{state.game.finishOrder=[0,0];},
    state=>{delete state.game.passedPlayers;},
    state=>{state.game.passedPlayers=[1];},
    state=>{state.game.starter=8;},
    state=>{state.game.result={winnerTeam:0,levelDelta:3};},
  ];
  for(const corrupt of corruptions){
    const state=core.newMatch();corrupt(state);const store=new MemoryStorage(),raw=JSON.stringify(state);store.setItem(SAVE_KEY,raw);
    assert.throws(()=>read(store),/无法恢复牌局/);assert.equal(store.getItem(SAVE_KEY),raw);
    assert.equal(store.getItem(SAVE_KEY+'-before-1.1'),null);
  }
  const m=new Match();act(m);delete m.state.game.passedPlayers;
  assert.throws(()=>new Match(m.state),/不出记录/);
});
test('physical card ids and referenced table metadata must agree with actual cards',()=>{
  for(const corrupt of [card=>{card.id='not-a-real-card';},card=>{card.rank=card.rank==='3'?'4':'3';},card=>{card.deck=9;},card=>{card.isWild=!card.isWild;}]){
    const state=core.newMatch();corrupt(state.game.players[0].hand[0]);assert.throws(()=>validate(state),/实体牌/);
  }
  const nullCard=core.newMatch();nullCard.game.players[0].hand[0]=null;assert.throws(()=>validate(nullCard),/实体牌/);
  const m=new Match();act(m);m.state.game.tablePlay.play.primaryValue=100;
  assert.throws(()=>new Match(m.state),/桌面牌型/);
});
test('tribute progress, physical references and public anti-tribute cards are checked on restore',()=>{
  const giving=tributeMatch();giving.state.phase='playing';assert.throws(()=>new Match(giving.state),/贡牌尚未收齐/);
  const returning=tributeMatch();while(returning.phase==='give')returning.commit(returning.actingSeat,[returning.tributeChoices[0].id]);
  for(const corrupt of [
    state=>{state.returnIndex=99;},
    state=>{state.exchanges[0].to=state.exchanges[0].from;},
    state=>{state.exchanges[0].given.id='missing';},
    state=>{state.tribute.offers.pop();},
    state=>{state.phase='playing';},
  ]){const state=structuredClone(returning.state);corrupt(state);assert.throws(()=>new Match(state));}
  const anti=core.newMatch();anti.antiTribute=[{seat:0,cardId:'missing'},{seat:1,cardId:'1-joker-BJ'}];
  assert.throws(()=>new Match(anti),/抗贡明牌/);
  const known=core.newMatch();known.known=[{seat:0,card:{...known.game.players[0].hand[0],id:'missing'}}];
  assert.throws(()=>new Match(known),/公开贡还牌/);
});
test('strict restore retains legacy cards, legal double-up results and all rotated tribute stages',()=>{
  const legacy=core.newMatch();delete legacy.study;
  legacy.game.players.forEach(player=>player.hand.forEach(card=>delete card.deck));
  assert.doesNotThrow(()=>new Match(legacy));
  const {perspective}=require('../lan-room.cjs'),names=['甲','乙','丙','丁'],m=tributeMatch();
  for(;;){
    for(let seat=0;seat<4;seat++)assert.doesNotThrow(()=>perspective(m,seat,names));
    if(m.phase==='playing')break;
    m.commit(m.actingSeat,[m.tributeChoices[0].id]);
  }
  for(const seed of [1,4]){
    const end=complete(seededMatch(seed));assert.doesNotThrow(()=>new Match(end.state));
    for(let seat=0;seat<4;seat++)assert.doesNotThrow(()=>perspective(end,seat,names));
  }
});
test('migration backup quota failure does not prevent reading a valid old save',()=>{
  const store=new MemoryStorage(),state=core.newMatch();store.setItem(SAVE_KEY,JSON.stringify(state));store.limit=0;
  const restored=read(store);assert.equal(restored.id,state.id);assert.ok(restored.loadWarning);assert.deepEqual(JSON.parse(store.getItem(SAVE_KEY)),state);
});
test('J is a valid team level in existing saves',()=>{const state=core.newMatch();state.levels=['J','Q'];assert.doesNotThrow(()=>new Match(state));});
test('replay reconstructs before/after counts and hand exactly from actual events',()=>{
  const m=new Match();for(let i=0;i<15;i++)act(m);const events=m.events;
  for(let i=0;i<events.length;i++){const e=events[i];assert.equal(e.remainingBefore[e.seat]-e.remaining[e.seat],e.cards.length);assert.equal(e.ownBefore.length-e.ownAfter.length,e.seat===0?e.cards.length:0);if(i){assert.deepEqual(e.remainingBefore,events[i-1].remaining);assert.deepEqual(e.ownBefore,events[i-1].ownAfter);}}
  assert.deepEqual(events.at(-1).remaining,m.game.players.map(p=>p.hand.length));
  assert.deepEqual(events.at(-1).ownAfter.map(c=>c.id).sort(),m.hand.map(c=>c.id).sort());
});
test('teaching is recorded at the action and never inferred retrospectively',()=>{
  const m=new Match();while(m.actingSeat!==0)act(m);
  const hand=m.game.players[0].hand,candidate=hand.find(c=>m.selection([c.id],0).play),teaching={label:'测试的当时建议',reason:'仅公开信息'};
  m.commit(0,candidate?[candidate.id]:[],{teaching});teaching.reason='mutated';
  assert.equal(m.events.at(-1).teaching.reason,'仅公开信息');assert.ok(m.snapshot().keyDecisions.some(key=>key.alternative==='测试的当时建议'));
});
test('complete round conserves cards and produces a real result with immutable review',()=>{
  const m=complete(new Match()),all=[...m.game.players.flatMap(p=>p.hand),...m.game.actionHistory.flatMap(e=>e.play?.cards||[])];
  assert.equal(all.length,108);assert.equal(new Set(all.map(c=>c.id)).size,108);
  const snapshot=m.snapshot();assert.equal(snapshot.completed,true);assert.equal(snapshot.stats.actions,m.game.actionHistory.length);snapshot.events[0].cards.length=0;assert.ok(m.events[0].cards.length>0);assert.throws(()=>act(m));
});
test('next deal performs genuine level advance and tribute transactions with conserved cards',()=>{
  let m=complete(new Match());const winner=m.game.result.winnerTeam,delta=m.game.result.levelDelta;m=m.next();
  assert.equal(m.state.round,2);assert.equal(m.state.levels[winner],String(2+delta));
  let remaining=5;while(m.phase!=='playing'&&remaining-->0){const seat=m.actingSeat,id=m.tributeChoices[0].id;assert.ok(id);m.commit(seat,[id]);}
  assert.equal(m.phase,'playing');assert.deepEqual(m.game.players.map(p=>p.hand.length),[27,27,27,27]);assert.equal(new Set(m.game.players.flatMap(p=>p.hand.map(c=>c.id))).size,108);
});
function tributeMatch(donors=[3,1],winners=[0,2]){
  const state=core.newMatch();state.phase='give';state.tribute={donors,winners,offers:[]};
  return new Match(state);
}
test('table tribute display exposes only confirmed offers and does not guess double-tribute recipients',()=>{
  const m=tributeMatch();
  assert.ok(m.tributeDisplay.rows.every(row=>row.card===null&&row.to===null));
  const seat=m.actingSeat,id=m.tributeChoices[0].id;m.commit(seat,[id]);
  const view=m.tributeDisplay;
  assert.deepEqual(view.rows.filter(row=>row.card).map(row=>row.card.id),[id]);
  assert.ok(view.rows.every(row=>row.to===null));
  assert.equal(view.rows.filter(row=>row.active).length,1);
  view.rows[0].card.rank='changed';assert.notEqual(m.state.tribute.offers[0].card.rank,'changed');
});
test('tribute display identifies both directions and survives restoring a partially returned exchange',()=>{
  const m=tributeMatch();while(m.phase==='give')m.commit(m.actingSeat,[m.tributeChoices[0].id]);
  const given=m.state.exchanges.map(exchange=>({from:exchange.from,to:exchange.to,id:exchange.given.id}));
  assert.deepEqual(m.tributeDisplay.rows.filter(row=>row.kind==='进贡').map(row=>({from:row.from,to:row.to,id:row.card.id})),given);
  const back=m.tributeChoices[0].id;m.commit(m.actingSeat,[back]);
  const restored=new Match(JSON.parse(JSON.stringify(m.state))),returns=restored.tributeDisplay.rows.filter(row=>row.kind==='还贡');
  assert.equal(returns[0].card.id,back);assert.equal(returns[0].from,given[0].to);assert.equal(returns[0].to,given[0].from);
  assert.equal(returns[1].card,null);assert.equal(returns[1].active,true);
  restored.commit(restored.actingSeat,[restored.tributeChoices[0].id]);
  assert.equal(restored.tributeDisplay.title,'贡还完成');assert.ok(restored.tributeDisplay.rows.every(row=>row.card));
  act(restored);assert.equal(restored.tributeDisplay.rows.length,4);assert.equal(restored.tributeDisplay.awaitingConfirmation,false);
});
test('single tribute shows the known recipient and anti-tribute shows only its two public jokers',()=>{
  const m=tributeMatch([3],[0]);assert.equal(m.tributeDisplay.rows[0].to,0);
  const state=core.newMatch();state.antiTribute=state.game.players.flatMap(player=>player.hand.filter(card=>card.rank==='BJ').map(card=>({seat:player.seat,cardId:card.id})));
  const anti=new Match(state),view=anti.tributeDisplay;
  assert.equal(view.rows.length,2);assert.ok(view.rows.every(row=>row.kind==='抗贡'&&row.card.rank==='BJ'));
  assert.equal(new Match().tributeDisplay,null);
});
test('completed tribute blocks both human and model actions until acknowledgement and survives reload',()=>{
  const m=tributeMatch();while(m.phase!=='playing')m.commit(m.actingSeat,[m.tributeChoices[0].id]);
  assert.ok(m.needsTributeConfirmation);assert.equal(m.canAct,false);
  const before=JSON.stringify(m.state),seat=m.actingSeat,card=m.game.players[seat].hand[0];
  assert.throws(()=>m.commit(seat,[card.id]),/开始出牌/);
  assert.throws(()=>m.commitModel({result:{candidates:[{type:'play',play:{cards:[card]}}]}},m.revision,seat),/开始出牌/);
  assert.equal(JSON.stringify(m.state),before);
  const storage=new MemoryStorage();m.persist(storage);const restored=read(storage);
  assert.ok(restored.needsTributeConfirmation);assert.equal(restored.game.actionHistory.length,0);
  assert.throws(()=>restored.acknowledgeTribute(12),/牌局已变化/);
  restored.acknowledgeTribute();restored.persist(storage);
  assert.equal(read(storage).needsTributeConfirmation,false);
  assert.equal(JSON.stringify(m.state),before,'acknowledgement uses a separate state so save failure can roll back');
  act(restored);assert.ok(restored.tributeDisplay.rows.every(row=>row.card));
  assert.throws(()=>restored.acknowledgeTribute(),/无需确认/);
});
test('unfinished exchanges cannot be acknowledged and completed old rounds do not get blocked',()=>{
  const m=tributeMatch();assert.throws(()=>m.acknowledgeTribute(),/无需确认/);
  while(m.phase!=='playing')m.commit(m.actingSeat,[m.tributeChoices[0].id]);
  act(m);delete m.state.study.tributeAcknowledged;
  const restored=new Match(m.state);assert.equal(restored.needsTributeConfirmation,false);
  assert.equal(restored.tributeDisplay.rows.length,4);act(restored);
});
test('anti-tribute keeps exactly the public jokers visible after they are played and after reload',()=>{
  const state=core.newMatch();
  state.antiTribute=state.game.players.flatMap(player=>player.hand.filter(card=>card.rank==='BJ').map(card=>({seat:player.seat,cardId:card.id})));
  const first=state.antiTribute[0];state.game.currentPlayer=first.seat;state.game.starter=first.seat;
  const m=new Match(state);assert.ok(m.needsTributeConfirmation);
  assert.match(m.tributeDisplay.reason,/两张大王/);m.acknowledgeTribute();m.commit(first.seat,[first.cardId]);
  const restored=new Match(m.state),view=restored.tributeDisplay;
  assert.equal(view.mode,'抗贡');assert.deepEqual(view.rows.map(row=>row.card.id),state.antiTribute.map(record=>record.cardId));
  assert.ok(view.rows.every(row=>row.card.rank==='BJ'));assert.equal(restored.needsTributeConfirmation,false);
});
test('unfinished rounds never reveal opponents, including after a completed previous round',()=>{
  const m=seededMatch(1);act(m);
  assert.deepEqual(m.revealedHands,[]);assert.deepEqual(m.snapshot().revealedHands,[]);
  const next=complete(m).next();
  assert.deepEqual(next.revealedHands,[]);assert.deepEqual(next.snapshot().revealedHands,[]);
  while(next.phase!=='playing')next.commit(next.actingSeat,[next.tributeChoices[0].id]);
  assert.deepEqual(next.revealedHands,[]);
  assert.ok(next.observation().state.players.filter(p=>p.seat!==next.actingSeat).every(p=>p.hand.every(c=>c===null)));
});
test('settlement reveals all actual remainder cards for both last-player and double-up finishes',()=>{
  for(const [seed,expectedPlayers] of [[4,2],[1,1]]){
    const m=complete(seededMatch(seed)),revealed=m.revealedHands;
    assert.equal(revealed.length,expectedPlayers);
    assert.deepEqual(revealed.map(p=>p.seat),m.game.finishOrder.filter(seat=>m.game.players[seat].hand.length));
    for(const {seat,cards} of revealed){
      assert.deepEqual(cards.map(c=>c.id).sort(),m.game.players[seat].hand.map(c=>c.id).sort());
      assert.ok(cards.every(c=>c.face&&c.label));
    }
    const original=JSON.stringify(m.state),snapshot=m.snapshot();
    snapshot.revealedHands[0].cards[0].rank='changed';snapshot.revealedHands[0].cards.pop();
    assert.equal(JSON.stringify(m.state),original);
  }
});
test('terminal hand reveal survives compact archives without changing past replay knowledge',()=>{
  const m=complete(seededMatch(2)),store=new MemoryStorage(),before=m.events;
  archive(store,m);const restored=archives(store)[0];
  assert.deepEqual(restored.revealedHands,m.revealedHands);
  assert.ok(JSON.stringify(restored.events)===JSON.stringify(before),'archiving preserves action-time information');
  assert.ok(restored.events.every(e=>!Object.hasOwn(e,'revealedHands')));
  const legacy=structuredClone(m.state);delete legacy.study;
  assert.deepEqual(new Match(legacy).snapshot().revealedHands,m.revealedHands);
});
test('settlement retains the exact final played cards and actor for both single and double finishes',()=>{
  for(const seed of [1,4]){
    const m=seededMatch(seed);act(m);assert.equal(m.finalPlay,null);assert.equal(m.snapshot().finalPlay,null);
    complete(m);const entry=m.game.actionHistory.at(-1),last=m.finalPlay;
    assert.equal(last.seat,entry.seat);assert.equal(last.label,entry.play.label);
    assert.equal(last.place,m.game.finishOrder.indexOf(entry.seat)+1);
    assert.deepEqual(last.cards.map(card=>card.id),entry.play.cards.map(card=>card.id));
    assert.ok(last.cards.every(card=>card.face&&card.label));
    const held=new Set(m.game.players.flatMap(p=>p.hand.map(card=>card.id)));
    assert.ok(last.cards.every(card=>!held.has(card.id)),'played cards remain separate from unplayed hands');
    assert.deepEqual(m.snapshot().finalPlay,last);
    const before=JSON.stringify(m.state);last.cards[0].rank='changed';assert.equal(JSON.stringify(m.state),before);
    assert.equal(m.next().finalPlay,null,'a new deal does not show the previous final hand');
  }
});
test('final play survives reload and both state archives and older snapshot archives',()=>{
  const m=complete(seededMatch(4)),store=new MemoryStorage(),expected=m.finalPlay;
  m.persist(store);assert.deepEqual(read(store).finalPlay,expected);
  archive(store,m);assert.deepEqual(archives(store)[0].finalPlay,expected);
  const legacy=m.snapshot();delete legacy.finalPlay;store.setItem(ARCHIVE_KEY,JSON.stringify([legacy]));
  assert.deepEqual(archives(store)[0].finalPlay,expected);
  const stale=structuredClone(m.state);stale.game.tablePlay=null;
  assert.deepEqual(new Match(stale).finalPlay,expected,'final display uses actual action history rather than a transient table anchor');
});
test('review export includes final played cards before the unplayed hands',()=>{
  const m=complete(seededMatch(1)),round=m.snapshot(),vm=require('node:vm');
  const context={reviewRound:round};vm.createContext(context);
  const reviewSource=fs.readFileSync(path.join(__dirname,'../web/app/review.js'),'utf8');
  vm.runInContext(reviewSource.match(/function reviewText\(\)\{[\s\S]*?\n\}/)[0],context);
  const text=context.reviewText(),last=round.finalPlay;
  assert.ok(text.includes(round.names[last.seat]+'：'+last.label));
  assert.ok(text.includes('牌面：'+last.cards.map(card=>card.label).join('、')));
  assert.ok(text.indexOf('最后打出的牌')<text.indexOf('终局明牌'));
});
test('completed history stores compact states and survives an old-round eviction',()=>{
  const store=new MemoryStorage(1500000);let m=new Match();
  for(let i=0;i<9;i++){complete(m);archive(store,m);m=m.next();}
  const raw=JSON.parse(store.getItem(ARCHIVE_KEY));assert.ok(raw.length<=8&&raw.length>=2);assert.ok(raw.every(record=>record.state&&!record.events));
  const reviews=archives(store);assert.equal(reviews[0].round,9);assert.ok(reviews.every(r=>r.completed&&r.events.length>0));
});
test('save quota failure preserves the previous storage record',()=>{
  const store=new MemoryStorage();const m=new Match();m.persist(store);const before=store.getItem(SAVE_KEY);store.limit=before.length*2+SAVE_KEY.length*2;
  act(m);assert.throws(()=>m.persist(store));assert.equal(store.getItem(SAVE_KEY),before);
});
test('extracted rules match the reviewed original bundle byte for byte',()=>{
  const base=path.join(__dirname,'../web'),metadata=JSON.parse(fs.readFileSync(path.join(base,'app/core-source.json'))),bundle=fs.readFileSync(path.join(base,'assets/index-CJeykJr1.js'));
  assert.equal(crypto.createHash('sha256').update(bundle).digest('hex'),metadata.sha256);
  const text=bundle.toString(),body=text.slice(text.indexOf('const Zr='),text.indexOf('/*!\n * ONNX Runtime Web'));
  assert.equal(crypto.createHash('sha256').update(body).digest('hex'),metadata.bodySha256);assert.ok(fs.readFileSync(path.join(base,'app/core.js'),'utf8').includes(body));
});
