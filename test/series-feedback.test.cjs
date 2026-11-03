'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {finished}=require('./helpers/series-fixtures.cjs'),{Match,read,SAVE_KEY}=require('../web/app/match.js');
const series=require('../web/app/series.js'),feedback=require('../web/app/game-feedback.js');
const {perspective}=require('../web/app/lan-room.js');
test('third consecutive A first/last demotes only that team; the new physical deck uses heart 2 wilds',()=>{
  let attempts=[0,0];
  for(let i=1;i<=3;i++){
    const round=finished([0,1,3,2],{attempts}),before=JSON.stringify(round.state),out=series.settlement(round.state);
    assert.equal(out.attempt,i);assert.equal(out.demotion,i===3);assert.equal(out.victory,false);
    const next=round.next();assert.equal(JSON.stringify(round.state),before);
    assert.deepEqual(next.state.wins,[0,0]);assert.deepEqual(next.state.levels,[i===3?'2':'A','A']);
    assert.equal(next.level,i===3?'2':'A');assert.deepEqual(next.state.aceAttempts,i===3?[0,0]:[i,0]);
    assert.ok(next.game.players.flatMap(p=>p.hand).every(c=>c.isWild===(c.suit==='hearts'&&c.rank===next.level)));
    assert.equal(new Set(next.game.players.flatMap(p=>p.hand).map(c=>c.id)).size,108);
    assert.ok(next.state.tribute||next.state.antiTribute);attempts=next.state.aceAttempts;
  }
});
test('A vs A: either team wins with 1/2 or 1/3; first/last stays A until the third attempt',()=>{
  for(const order of [[0,2,1,3],[0,1,2,3],[1,3,0,2],[1,0,3,2]]){
    const round=finished(order,{attempts:[2,0]}),team=order[0]%2;
    assert.equal(series.settlement(round.state).victory,true);
    const next=round.next();assert.deepEqual(next.state.levels,['2','2']);assert.deepEqual(next.state.aceAttempts,[0,0]);
    assert.equal(next.state.wins[team],1);assert.equal(next.state.wins[1-team],0);
  }
  const opposite=finished([1,0,2,3],{attempts:[0,2]}).next();assert.deepEqual(opposite.state.levels,['A','2']);
});
test('other outcomes break the streak, and reaching A is not passing A',()=>{
  const interrupted=finished([1,0,2,3],{attempts:[2,0]});assert.deepEqual(interrupted.next().state.aceAttempts,[0,1]);
  for(const options of [{level:'K',levels:['K','A']},{level:'A',levels:['K','A']},{level:'K',levels:['A','K'],attempts:[2,0]}]){
    const round=finished([0,2,1,3],options),out=series.settlement(round.state);
    assert.equal(out.victory,false);assert.equal(out.attempt,0);assert.deepEqual(round.next().state.aceAttempts,[0,0]);
  }
  const state=finished().state;state.ruleMode='tuo3';assert.equal(series.settlement(state),null);
});
test('old saves start at zero; saved attempts survive restoration, with invalid counters rejected',()=>{
  const state=finished().state;delete state.aceAttempts;
  const values=new Map([[SAVE_KEY,JSON.stringify(state)]]),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  const restored=read(storage);assert.deepEqual(restored.state.aceAttempts,[0,0]);
  restored.state.aceAttempts=[2,0];restored.persist(storage);assert.deepEqual(read(storage).state.aceAttempts,[2,0]);
  for(const invalid of [[3,0],[-1,0],[1.5,0],[0],['2',0]])assert.throws(()=>new Match({...state,aceAttempts:invalid}),/冲 A 次数/);
});
test('LAN rotates A counters and winner identity together without changing host state',()=>{
  const match=finished([0,1,3,2],{attempts:[2,0]}),before=JSON.stringify(match.state);
  for(let seat=0;seat<4;seat++){
    const view=perspective(match,seat,['Mac','Pad','Phone','PC']).state,result=series.settlement(view);
    assert.deepEqual(view.aceAttempts,seat%2?[0,2]:[2,0]);assert.equal(result.team,seat%2);assert.equal(result.demotion,true);
    assert.equal(result.levels[seat%2],'2');assert.equal(result.levels[1-seat%2],'A');
  }
  assert.equal(JSON.stringify(match.state),before);
});
test('feedback tracks public actions, batches passes, and never replays a restored result',()=>{
  const round=finished([0,2,1,3]),tracker=new feedback.Tracker();tracker.prime(round);assert.deepEqual(tracker.collect(round),[]);
  const prior={...round, id:round.id, game:{...round.game,result:null,finishOrder:[0],actionHistory:round.game.actionHistory.slice(0,-1)},phase:round.phase};
  tracker.prime(prior);const events=tracker.collect(round),rank=events.find(e=>e.kind==='rank');
  assert.deepEqual(rank.places.map(p=>[p.place,p.finished]),[[2,true],[3,false],[4,false]]);
  assert.equal(events.filter(e=>e.kind==='victory').length,1);assert.deepEqual(tracker.collect(round),[]);
  round.revision++;assert.deepEqual(tracker.collect(round),[]);
  assert.match(feedback.words(rank,round).detail,/结算/);
});
test('partner lead uses counts at that event, rather than who finished later in the snapshot',()=>{
  const card={id:'x'},play={cards:[card],type:'single'};
  const history=[{seat:0,play,tablePlayAfter:play,tableOwnerAfter:0},{seat:1,play:null,tablePlayAfter:play,tableOwnerAfter:0},{seat:2,play:null,tablePlayAfter:play,tableOwnerAfter:0},{seat:3,play:null,tablePlayAfter:null,tableOwnerAfter:null},{seat:2,play,tablePlayAfter:play,tableOwnerAfter:2}];
  const round={id:'wind',phase:'playing',state:{exchanges:[]},game:{players:[{hand:[]},{hand:[card]},{hand:[]},{hand:[card]}],actionHistory:history,finishOrder:[0,2],result:null}};
  const tracker=new feedback.Tracker();tracker.prime({...round,game:{...round.game,actionHistory:history.slice(0,1),finishOrder:[0]}});
  assert.deepEqual(tracker.collect(round).filter(e=>e.kind==='wind').map(e=>e.seat),[2]);
  round.game.players[0].hand=[card];tracker.prime({...round,game:{...round.game,actionHistory:history.slice(0,1),finishOrder:[0]}});
  assert.equal(tracker.collect(round).filter(e=>e.kind==='wind').length,0);
});
test('a quick partner finish retains the queued first place in the final announcement',()=>{
  const player=new feedback.Player({element:{setAttribute(){}},preferences:()=>({}),round:()=>finished([0,2,1,3])});
  player.active={kind:'bomb'};player.queue=[{kind:'rank',places:[{seat:0,place:1,finished:true}]}];
  player.enqueue([{kind:'rank',places:[{seat:2,place:2,finished:true},{seat:1,place:3,finished:false},{seat:3,place:4,finished:false}]},
    {kind:'victory',id:'win',result:{victory:true}}]);
  assert.deepEqual(player.queue.filter(e=>e.kind==='rank').flatMap(e=>e.places.map(p=>p.place)),[1,2,3,4]);
  assert.equal(player.queue.at(-1).kind,'victory');
});
test('archived review exports report demotion and match victory instead of a nominal level increase',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),{archive,archives}=require('../web/app/match.js');
  const source=fs.readFileSync(require('node:path').join(__dirname,'../web/app/review.js'),'utf8');
  for(const [match,expected] of [[finished([0,1,3,2],{attempts:[2,0]}),/冲 A 受阻 3\/3，退回 2/],[finished([0,2,1,3]),/过 A，赢得整场/]]){
    const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
    archive(storage,match);const round=archives(storage)[0];assert.deepEqual(round.seriesOutcome,series.settlement(match.state));
    const context=vm.createContext({reviewRound:round,GuandanCardCounts:require('../web/app/card-counts.js')});vm.runInContext(source.match(/function reviewText\(\)\{[\s\S]*?\n\}/)[0],context);
    assert.match(context.reviewText(),expected);assert.doesNotMatch(context.reviewText(),/升[123]级；我方名次/);
  }
});
