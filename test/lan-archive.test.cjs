'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Match,archive,archives,ARCHIVE_KEY}=require('../web/app/match.js');
const {perspective}=require('../lan-room.cjs');
class Storage{
  constructor(limit=Infinity){this.values=new Map();this.limit=limit;}
  getItem(key){return this.values.get(key)??null;}
  setItem(key,value){
    const next=new Map(this.values);next.set(key,String(value));
    if([...next].reduce((n,[k,v])=>n+2*(k.length+v.length),0)>this.limit)throw new Error('QuotaExceededError');
    this.values=next;
  }
}
function finishedRound(){
  const match=new Match();let guard=2000;
  while(!match.game.result&&guard--){
    const seat=match.actingSeat,card=match.game.players[seat].hand.find(card=>match.selection([card.id],seat).play);
    match.commit(seat,card?[card.id]:[]);
  }
  assert.ok(match.game.result);return match;
}
function lanRound(match,seat){
  const names=['Mac 房主','Pad 甲','Pad 乙','Windows 玩家'];
  const round=new Match(perspective(match,seat,names).state);
  Object.defineProperty(round,'names',{value:[0,1,2,3].map(i=>i===0?'你':names[(i+seat)%4])});
  Object.defineProperty(round,'playerIds',{value:[0,1,2,3].map(i=>(i+seat)%4)});
  return round;
}
test('compact LAN archives preserve relative seats, human names, source and full replay after reload',()=>{
  const original=finishedRound(),store=new Storage();
  for(let seat=0;seat<4;seat++){
    const round=lanRound(original,seat);round.state.id=randomUUID();
    archive(store,round,{source:'局域网实际对局'});
    const record=JSON.parse(store.getItem(ARCHIVE_KEY))[0],loaded=archives(store)[0];
    assert.ok(record.state&&!record.events,'archive stores each played card once');
    assert.equal(loaded.source,'局域网实际对局');
    const expected=JSON.parse(JSON.stringify(round.snapshot()));
    for(const key of ['names','playerIds','placement','winnerTeam','finishOrder','finalPlay','events'])
      assert.deepEqual(loaded[key],expected[key],key+' survives reload');
    assert.ok(JSON.stringify(record).length<JSON.stringify(round.snapshot()).length/2);
  }
});
test('saving a new LAN round evicts large legacy snapshots and continues within a small storage quota',()=>{
  const original=finishedRound(),round=lanRound(original,1),store=new Storage();
  const legacy=round.snapshot();legacy.id='legacy-expanded';
  store.setItem(ARCHIVE_KEY,JSON.stringify([legacy]));
  // Emulate an existing installation whose expanded LAN reviews filled its quota.
  store.limit=900000;
  for(let i=1;i<=9;i++){
    round.state.id=randomUUID();round.state.round=i;
    archive(store,round,{source:'局域网实际对局'});
    const loaded=archives(store);
    assert.equal(loaded[0].round,i);assert.equal(loaded[0].source,'局域网实际对局');
    assert.deepEqual(loaded[0].names,round.names);
  }
  const records=JSON.parse(store.getItem(ARCHIVE_KEY));
  assert.ok(records.length>=1&&records.length<8);assert.ok(records.every(record=>record.state&&!record.events));
});
test('a quota too small even for one LAN archive preserves the previous stored record',()=>{
  const round=lanRound(finishedRound(),1),store=new Storage();
  archive(store,round,{source:'局域网实际对局'});const before=store.getItem(ARCHIVE_KEY);
  store.limit=1;round.state.id=randomUUID();
  assert.throws(()=>archive(store,round,{source:'局域网实际对局'}),/Quota/);
  assert.equal(store.getItem(ARCHIVE_KEY),before);
});
