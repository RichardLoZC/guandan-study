'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const core=require('../web/app/core.js'),choices=require('../web/app/play-choices.js');
const {Match,read,SAVE_KEY}=require('../web/app/match.js');
const {Room,PROTOCOL}=require('../lan-room.cjs');
const ids=['1-clubs-5','1-spades-6','1-clubs-7','1-clubs-8','1-hearts-2'];
function fixture(wanted=ids,level='2'){
  const match=new Match(),deck=match.game.players.flatMap(p=>p.hand);
  const cards=wanted.map(id=>deck.splice(deck.findIndex(c=>c.id===id),1)[0]);
  match.game.players[0].hand=[...cards,...deck.splice(0,27-cards.length)];
  for(let seat=1;seat<4;seat++)match.game.players[seat].hand=deck.splice(0,27);
  match.game.currentPlayer=match.game.starter=0;
  if(level!=='2'){
    match.state.level=level;
    for(const player of match.game.players)for(const card of player.hand)card.isWild=card.suit==='hearts'&&card.rank===level;
  }
  return match;
}
function harness(match=fixture()){
  let enabled=true;const commands=[];
  const c={liveRound:match,canPlay:()=>enabled&&c.liveRound.canAct,hasOpenDialog:()=>nodes.get('declare-dialog')?.open||false,
    saveAction:action=>{action();return true;},window:{GuandanLan:{command:async(...args)=>{commands.push(args);return {};}}}};
  vm.createContext(c);const nodes=require('./helpers/play-ui.cjs').install(c);
  return {c,match,nodes,commands,allow:value=>enabled=value,open:()=>c.requestPlay(ids,{}),confirm:()=>c.confirmDeclaration(),
    close:()=>c.closeDialog(c.byId('declare-dialog'))};
}
test('human defaults use the strongest interpretation without reordering the core recognizer',()=>{
  const m=fixture(),cards=ids.map(id=>m.hand.find(c=>c.id===id));
  assert.deepEqual(core.recognize(cards).map(p=>p.primaryValue),[8,9]);
  assert.deepEqual(m.selection(ids,0).plays.map(p=>p.primaryValue),[9,8]);
  assert.equal(m.selection(ids,0).play.label,'顺子 5-6-7-8-9');
  const weak=m.selection(ids,0).plays[1];assert.equal(m.selection(ids,0,weak.key).play.key,weak.key);
  assert.deepEqual(core.recognize(cards).map(p=>p.primaryValue),[8,9]);
});
test('defaults honor full-house primary rank, the level rank, bombs and straight-flush ends',()=>{
  const full=['1-clubs-7','1-spades-7','1-clubs-K','1-spades-K','1-hearts-2'];
  assert.equal(fixture(full).selection(full,0).play.label,'三带二 K');
  const seven=[...full.slice(0,4),'1-hearts-7'];
  assert.equal(fixture(seven,'7').selection(seven,0).play.primaryValue,14.5);
  const bomb=['1-clubs-7','1-spades-7','1-diamonds-7','1-hearts-2','2-hearts-2'];
  assert.equal(fixture(bomb).selection(bomb,0).play.type,'bomb');
  const flush=['1-clubs-5','1-clubs-6','1-clubs-7','1-hearts-2','2-hearts-2'];
  const plays=fixture(flush).selection(flush,0).plays;
  assert.deepEqual(plays.map(p=>p.primaryValue),[9,8,7]);assert.ok(plays.every(p=>p.type==='straight-flush'));
  assert.match(choices.describe(plays[0]),/♣8.*♣9/);
});
test('wildcard descriptions cover A-low/A-high runs, repeated ranks and full houses without changing cards',()=>{
  core.setLevel('2');const deck=core.deck();
  const cases=[['1-clubs-A','1-spades-2','1-clubs-3','1-spades-4','1-hearts-2'],
    ['1-clubs-J','1-spades-Q','1-clubs-K','1-hearts-2','2-hearts-2'],
    ['1-clubs-7','1-spades-7','1-clubs-8','1-spades-8','1-clubs-9','1-hearts-2'],
    ['1-clubs-7','1-spades-7','1-clubs-8','1-spades-8','1-hearts-2','2-hearts-2'],
    ['1-clubs-7','1-spades-7','1-diamonds-7','1-hearts-2','2-hearts-2']];
  for(const ids of cases){const cards=ids.map(id=>deck.find(c=>c.id===id)),before=JSON.stringify(cards),plays=core.recognize(cards);assert.ok(plays.length);
    for(const play of plays){const detail=choices.describe(play);assert.ok(detail.includes('→'));assert.ok(!detail.includes('undefined'),detail);}
    assert.equal(JSON.stringify(cards),before);
  }
});
test('ambiguous commits need an explicit valid key, and a chosen weaker declaration survives save/restore',()=>{
  const m=fixture(),before=JSON.stringify(m.state),weak=m.selection(ids,0).plays[1];
  for(const key of [undefined,'','invented'])assert.throws(()=>m.commit(0,ids,{key}),/声明牌型|牌型已失效/);
  assert.equal(JSON.stringify(m.state),before);assert.equal(m.revision,0);
  m.commit(0,ids,{key:weak.key});assert.equal(m.game.tablePlay.play.key,weak.key);
  const raw=JSON.stringify(m.state),restored=read({getItem:k=>k===SAVE_KEY?raw:null,setItem(){}});
  assert.equal(restored.game.tablePlay.play.key,weak.key);assert.equal(restored.events[0].label,weak.label);
});
test('DanLM explicit candidates keep their chosen interpretation',()=>{
  const m=fixture(),weak=m.selection(ids,0).plays[1];
  m.commitModel({result:{engine:'fixture',candidates:[{type:'play',play:weak}]}},0,0);
  assert.equal(m.game.tablePlay.play.key,weak.key);
});
test('only legal beating interpretations are offered; a single interpretation remains one-click',()=>{
  const h=harness(),weak=h.match.selection(ids,0).plays[1];h.match.game.tablePlay={owner:1,play:weak};
  assert.equal(h.match.selection(ids,0).plays.length,1);h.open();
  assert.equal(h.c.byId('declare-dialog').open,false);assert.equal(h.match.hand.length,22);
  assert.equal(h.match.game.tablePlay.play.primaryValue,9);
});
test('pair runs and triple runs are separate choices, never falsely labeled mutually stronger',()=>{
  const six=['1-clubs-7','1-spades-7','1-clubs-8','1-spades-8','1-hearts-2','2-hearts-2'];
  const h=harness(fixture(six)),plays=h.match.selection(six,0).plays;
  assert.equal(choices.hasStrongest(plays),false);assert.ok(plays.some(p=>p.type==='triple-run'));
  h.c.requestPlay(six,{});assert.match(h.nodes.get('declare-note').textContent,/不同牌型不能互相比较/);
  const badges=h.nodes.get('declare-options').children.slice(1).flatMap(label=>label.children[1].children).filter(e=>e.textContent==='牌力较大');
  assert.equal(badges.length,0);
});
test('the chooser defaults stronger, makes no play on open/cancel, and commits a weaker radio choice once',async()=>{
  const h=harness(),before=JSON.stringify(h.match.state);h.open();
  assert.equal(JSON.stringify(h.match.state),before);assert.equal(h.c.pendingDeclaration.key,'straight:9:0:none');
  h.close();assert.equal(JSON.stringify(h.match.state),before);h.open();
  const radios=h.nodes.get('declare-options').children.slice(1).map(label=>label.children[0]);
  assert.equal(radios[0].checked,true);radios[1].listeners.change();
  await Promise.all([h.confirm(),h.confirm()]);
  assert.equal(h.match.game.actionHistory.length,1);assert.equal(h.match.game.tablePlay.play.primaryValue,8);
});
test('stale rounds, turn changes, lost cards and disabled connections cannot confirm an old declaration',async()=>{
  for(const change of [h=>h.match.revision++,h=>h.match.game.currentPlayer=1,h=>h.match.game.players[0].hand.shift(),h=>h.allow(false),h=>h.c.liveRound=fixture()]){
    const h=harness();h.open();change(h);const before=JSON.stringify(h.c.liveRound.state);await h.confirm();
    assert.equal(JSON.stringify(h.c.liveRound.state),before);assert.equal(h.nodes.get('confirm-declaration').disabled,true);assert.equal(h.commands.length,0);
  }
});
test('LAN sends the declared key once, and failed transmission allows a deliberate retry',async()=>{
  const h=harness();h.match.remote=true;let resolve,calls=0;
  h.c.window.GuandanLan.command=()=>{calls++;return new Promise(r=>resolve=r);};
  h.open();const first=h.confirm();await h.confirm();assert.equal(calls,1);assert.equal(h.nodes.get('confirm-declaration').disabled,true);
  resolve(undefined);await first;assert.equal(h.nodes.get('confirm-declaration').disabled,false);assert.equal(h.match.hand.length,27);
  h.c.window.GuandanLan.command=async(op,data)=>{h.commands.push([op,data]);return {};};await h.confirm();
  assert.equal(h.commands[0][0],'play');assert.equal(h.commands[0][1].key,'straight:9:0:none');assert.deepEqual([...h.commands[0][1].ids],ids);
});
test('LAN authority rejects implicit ambiguity and broadcasts the explicit declaration',async()=>{
  const room=new Room(),host=room.host('Mac');room.join({code:room.code,name:'Pad',protocol:PROTOCOL});
  room.match=fixture();room.seats=[room.members[0].id,room.members[1].id,'bot:2','bot:3'];
  const version=room.version,before=JSON.stringify(room.match.state);
  await assert.rejects(room.request(host.token,{op:'play',version,requestId:'implicit',ids}),/声明牌型/);
  assert.equal(room.version,version);assert.equal(JSON.stringify(room.match.state),before);
  const result=await room.request(host.token,{op:'play',version,requestId:'explicit',ids,key:'straight:8:0:none'});
  assert.equal(result.round.state.game.tablePlay.play.primaryValue,8);
});
test('late LAN responses cannot close or report failure in a newer solo declaration',async()=>{
  for(const failure of [false,true]){
    const h=harness();h.match.remote=true;let settle;
    h.c.window.GuandanLan.command=()=>new Promise((resolve,reject)=>{settle=()=>failure?reject(new Error('old room disconnected')):resolve({});});
    h.open();const old=h.confirm();h.close();h.c.liveRound=fixture();h.open();
    const current=h.c.pendingDeclaration;settle();await old;
    assert.equal(h.c.pendingDeclaration,current);assert.equal(h.nodes.get('declare-dialog').open,true);assert.equal(h.nodes.get('declare-error').hidden,true);
    assert.equal(h.c.liveRound.revision,0);
  }
});
test('declaration labels and substitution descriptions translate fully',()=>{
  const {t}=require('../web/app/i18n.js');
  for(const text of ['这组牌按什么出？','声明出牌','声明牌型','牌力较大','本次选择的实体牌','取消声明','返回选牌','确认出牌','正在出牌…','♥2 → 附带对子','默认选中牌力较大的解释，确认后才出牌。','牌局或连接已变化，请返回牌桌重新声明。','这组牌有多种解释，请先声明牌型'])assert.ok(!/[\u3400-\u9fff]/u.test(t(text,'en')),text);
});
