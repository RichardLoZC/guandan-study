const test=require('node:test'),assert=require('node:assert/strict');
const {create,KEY}=require('../web/app/android-host.js');
const {Room}=require('../web/app/lan-room.js');
class DeterministicRoom extends Room {
  constructor(options){super({...options,random:(...args)=>args.length===2?123456:0,startThinking:()=>({promise:Promise.resolve(true),cancel(){}})});}
  change(action){super.change(()=>{action();if(this.match&&!this.match.game.actionHistory.length){this.match.game.currentPlayer=0;this.match.game.starter=0;}});}
}
function harness(){
  const store=new Map(),replies=new Map(),calls={model:[],announcements:[],starts:0,stops:0,cancel:0};let tick,sequence=0,quota=false;
  const storage={getItem:key=>store.get(key)||null,setItem(key,value){if(quota)throw new Error('quota');store.set(key,value);}};
  const native={hostStart(){calls.starts++;return JSON.stringify({address:'127.0.0.1:18765',addresses:['192.168.31.42:18765']});},hostStop(){calls.stops++;},hostAnnounce(raw){calls.announcements.push(JSON.parse(raw));},hostReply(id,raw){replies.set(id,JSON.parse(raw));}};
  const controller=create({native,storage,Room:DeterministicRoom,setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>{tick=null;},makeModel:()=>({request:async value=>{calls.model.push(value);return {result:{engine:'fixture',candidates:[{type:'pass'}]}};},cancel(){calls.cancel++;}})});
  async function request(token,body){const id=++sequence;await controller.dispatch(id,JSON.stringify({token,body}));const reply=replies.get(id);if(reply.error)throw new Error(reply.error);return reply;}
  async function command(token,op,fields={}){const {room}=await request(token,{op:'poll'});return request(token,{op,version:room.version,requestId:String(++sequence),...fields});}
  const join=(name='朋友')=>request('',{op:'join',protocol:1,code:'123456',name,clientId:crypto.randomUUID()});
  return {controller,request,command,join,store,calls,storage,tick:()=>tick?.(),quota:value=>{quota=value;}};
}
test('Android hosts four humans with masked hands, host-only controls and no AI inference',async()=>{
  const h=harness(),host=await h.controller.host({fresh:true,name:'手机房主',aiBook:false});
  const guests=await Promise.all([h.join('手机甲'),h.join('手机乙'),h.join('Pad')]);
  await assert.rejects(h.join('第五位'),/已满/);
  await assert.rejects(h.command(guests[0].token,'start'),/房主/);
  await h.command(host.token,'start');await h.tick();assert.equal(h.calls.model.length,0);
  for(const member of [host,...guests]){
    const data=await h.request(member.token,{op:'poll'});
    assert.equal(data.room.members.length,4);assert.equal(data.room.aiBook,false);
    assert.equal(data.round.state.game.players[0].hand.length,27);
    assert.ok(data.round.state.game.players.slice(1).every(p=>p.hand.every(c=>c===null)));
    assert.deepEqual(data.round.humanSeats.sort(),[0,1,2,3]);
  }
  assert.deepEqual(Object.keys(h.calls.announcements.at(-1)).sort(),['connected','count','id','name','started']);
  assert.equal(h.calls.announcements.at(-1).name,'手机房主');
});
test('Android two-player room runs the same bot decision and pauses/restores the same sessions',async()=>{
  const h=harness(),host=await h.controller.host({fresh:true,aiBook:false}),guest=await h.join();
  await h.command(host.token,'start');
  let view=await h.request(guest.token,{op:'poll'});assert.equal(view.round.actingSeat,0);
  await h.command(guest.token,'play',{ids:[view.round.state.game.players[0].hand[0].id]});
  await h.tick();assert.equal(h.calls.model.length,1);assert.equal(h.calls.model[0].provider,'danlm');assert.equal(h.calls.model[0].book,false);
  const before=await h.request(host.token,{op:'poll'});h.controller.suspend();
  await assert.rejects(h.request(guest.token,{op:'poll'}),/返回游戏/);await h.tick();assert.equal(h.calls.model.length,1);
  h.controller.resume();view=await h.request(host.token,{op:'poll'});assert.equal(view.room.paused,true);
  assert.equal(view.round.state.id,before.round.state.id);
  h.controller.park();assert.equal(h.tick(),undefined);
  const restored=await h.controller.host({name:'手机房主'});assert.equal(restored.token,host.token);assert.equal(restored.roomId,host.roomId);
  view=await h.request(guest.token,{op:'poll'});assert.equal(view.room.paused,true);assert.equal(view.round.state.id,before.round.state.id);
  await h.request(host.token,{op:'poll'});await h.command(host.token,'pause');assert.equal((await h.request(guest.token,{op:'poll'})).room.paused,false);
});
test('Android failed storage rolls back a join; fresh room retains a recoverable snapshot',async()=>{
  const h=harness(),first=await h.controller.host({fresh:true});const before=h.store.get(KEY);
  h.quota(true);await assert.rejects(h.join(),/quota/);h.quota(false);
  assert.equal((await h.request(first.token,{op:'poll'})).room.members.length,1);assert.equal(h.store.get(KEY),before);
  const second=await h.controller.host({fresh:true});assert.notEqual(second.roomId,first.roomId);assert.equal(h.store.get(KEY+'.before-new'),before);
  await assert.rejects(h.request(first.token,{op:'poll'}),/身份失效/);
});
test('Android corrupt persisted room is kept instead of silently replacing it',async()=>{
  const h=harness();h.store.set(KEY,'corrupt');await assert.rejects(h.controller.host());assert.equal(h.store.get(KEY),'corrupt');
});
