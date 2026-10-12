'use strict';
// Read-only regression harness for the production LAN client. No GUI/network writes.
// Covers transport completion across room generations and disconnect recovery.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto, randomUUID} = require('node:crypto');
const project = path.resolve(__dirname,'..');
const clientPath = path.join(project, 'web/app/lan-client.js');
const source = fs.readFileSync(clientPath, 'utf8');
const GuandanMatch = require(path.join(project, 'web/app/match.js'));
const {Room, PROTOCOL} = require(path.join(project, 'lan-room.cjs'));
const KEY = 'guandan.lan.session.v1';
const flush = () => new Promise(setImmediate);
const session = (roomId = 'room', token = 'guest-token') => ({address:'127.0.0.1:18765', token, roomId, host:false, name:'Pad'});
const snapshot = (id = 'room', version = 1, fields = {}) => ({room:{id,version,code:'123456',host:false,started:false,paused:false,waiting:[],error:null,modelReady:false,members:[],...fields},round:null});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function makeNode() {
  return {value:'',hidden:false,disabled:false,textContent:'',open:false,children:[],handlers:new Map(),attrs:{},style:{setProperty(){}},classList:{toggle(){}},
    setAttribute(key,value) { this.attrs[key]=value; },
    addEventListener(type, fn) { this.handlers.set(type, fn); },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); }
  };
}
function harness({stored = session(), request, saved = new Map()} = {}) {
  const nodes = new Map(), timers = new Map(), calls = [], notices = [];
  let nextTimer = 0;
  if (stored) saved.set(KEY, JSON.stringify(stored));
  const node = id => { if (!nodes.has(id)) nodes.set(id, makeNode()); return nodes.get(id); };
  const localRound = GuandanMatch.create();
  const context = {
    console, crypto:webcrypto, GuandanMatch, GuandanI18n:require('../web/app/i18n.js'),
    window:{GuandanLanNative:{request(payload) { calls.push(payload); return request(payload); }}},
    document:{createElement:makeNode,createTextNode:text => ({textContent:text})},
    byId:node,root:makeNode(),prefs:{},savePrefs(){},scheduleBots(){},
    localStorage:{getItem:key => saved.get(key) || null,setItem:(key,value) => saved.set(key,value),removeItem:key => saved.delete(key)},
    liveRound:localRound,paused:false,dealMotion:{cancel(){}},stopBots(){},workEpoch:0,
    model:{cancel(){}},activeTask:null,selected:new Set(),hintSnapshot:null,playKey:null,
    cardNodes:new Map(),clearError(){},renderGame(){},updateSelection(){},beginDealAnimation(){},
    toast:message => notices.push(message),openDialog(dialog){dialog.open=true;},closeDialog(dialog){dialog.open=false;},checkModel(){},
    setTimeout(fn,ms) { const id = ++nextTimer; timers.set(id,{fn,ms}); return id; },
    clearTimeout:id => timers.delete(id)
  };
  vm.createContext(context);
  vm.runInContext(source, context, {filename:clientPath});
  return {context,node,timers,calls,saved,notices,api:context.window.GuandanLan,
    click(id) { const fn = node(id).handlers.get('click'); assert.ok(fn, `missing handler: ${id}`); return fn({currentTarget:node(id),preventDefault(){}}); },
    fireTimer() { const first = timers.entries().next().value; assert.ok(first,'expected heartbeat timer'); const [id,{fn}] = first; timers.delete(id); return fn(); }
  };
}

test('an old poll cannot suppress the new session poll or its heartbeat', async () => {
  const old = deferred(), fresh = deferred();
  let freshPolls = 0;
  const h = harness({stored:session('old-room','old-token'), request:payload => {
    if (payload.body?.op === 'join') return Promise.resolve({...session('new-room','new-token'),protocol:1});
    assert.equal(payload.body?.op,'poll');
    if (payload.token === 'old-token') return old.promise;
    freshPolls++;
    return freshPolls === 1 ? fresh.promise : Promise.resolve(snapshot('new-room',2));
  }});
  await flush();
  await h.click('lan-confirm-leave');
  assert.equal(h.api.active,false);
  h.node('lan-address').value = '127.0.0.1:18765';
  h.node('lan-code').value = '123456';
  const joining = h.click('lan-join');
  await flush();
  assert.equal(freshPolls,1,'new generation must start polling while the old poll is pending');
  old.resolve(snapshot('old-room',99));
  await flush();
  await h.api.reconnect();
  assert.equal(freshPolls,1,'old finally must not release the new poll guard');
  fresh.resolve(snapshot('new-room',1));
  await joining;
  await flush();
  assert.equal(h.api.ready,true);
  assert.equal(h.node('lan-room-title').textContent,'123456');
  assert.equal(h.timers.size,1);
  await h.fireTimer();
  assert.equal(freshPolls,2);
  assert.equal(h.timers.size,1);
});

test('leaving during advice clears busy and restores a usable session', async () => {
  const oldAdvice = deferred();
  const h = harness({request:payload => payload.body?.op === 'advice' ? oldAdvice.promise : Promise.resolve(snapshot())});
  await flush();
  assert.equal(h.api.ready,true);
  const pendingAdvice = h.api.command('advice');
  assert.equal(h.api.ready,false);
  await h.click('lan-confirm-leave');
  assert.equal(h.api.active,false);
  assert.equal(JSON.parse(h.saved.get(KEY+'.parked')).token,'guest-token');
  oldAdvice.resolve({advice:{result:{}}});
  await pendingAdvice;
  h.click('lan-restore');
  await flush();
  assert.equal(h.api.active,true);
  assert.equal(h.api.ready,true);
  assert.equal(h.node('lan-retry').disabled,false);
});
test('turn indicators restore on reconnect without needing a new game revision',async()=>{
  const room=new Room(),host=room.host('Mac'),guest=room.join({code:room.code,name:'Pad',protocol:PROTOCOL});
  await room.request(host.token,{op:'start',version:room.version,requestId:'indicator-start'});
  let fail=false;
  const h=harness({stored:{...guest,address:'127.0.0.1:18765',host:false},request:payload=>fail?Promise.reject(new Error('offline')):room.request(payload.token,payload.body)});
  await flush();assert.equal(h.api.turnMessage,'');assert.equal([...h.timers.values()][0].ms,400);
  assert.deepEqual(Array.from(h.context.liveRound.humanSeats),room.projected(room.authenticate(guest.token)).round.humanSeats);
  let renders=0;h.context.renderGame=()=>renders++;
  fail=true;await h.fireTimer();assert.equal(h.api.turnMessage,'正在重连');assert.equal([...h.timers.values()][0].ms,1200);
  const before=renders;fail=false;await h.fireTimer();assert.equal(h.api.turnMessage,'');assert.equal(renders,before+1);
  room.paused=true;await h.fireTimer();assert.equal(h.api.turnMessage,'多人牌局已暂停');
});
test('human seat fallback understands a room hosted by the previous app version',async()=>{
  const room=new Room(),host=room.host('Mac'),guest=room.join({code:room.code,name:'Pad',protocol:PROTOCOL});
  await room.request(host.token,{op:'start',version:room.version,requestId:'old-host'});
  const h=harness({stored:{...guest,address:'127.0.0.1:18765',host:false},request:async payload=>{const data=await room.request(payload.token,payload.body);delete data.round.humanSeats;return data;}});
  await flush();const data=room.projected(room.authenticate(guest.token));assert.deepEqual(Array.from(h.context.liveRound.humanSeats),data.round.humanSeats);
});

test('completion from an old generation cannot unlock a newer command', async () => {
  const oldAdvice = deferred(), newPlay = deferred();
  const h = harness({request:payload => {
    if (payload.body?.op === 'advice') return oldAdvice.promise;
    if (payload.body?.op === 'play') return newPlay.promise;
    return Promise.resolve(snapshot());
  }});
  await flush();
  const pendingAdvice = h.api.command('advice');
  await h.click('lan-confirm-leave');
  h.click('lan-restore');
  await flush();
  const pendingPlay = h.api.command('play',{ids:[]});
  assert.equal(h.api.ready,false);
  oldAdvice.resolve({advice:{result:{}}});
  await pendingAdvice;
  assert.equal(h.api.ready,false,'old finally must not clear the new command busy flag');
  assert.equal(h.node('lan-retry').disabled,true);
  newPlay.resolve(snapshot('room',2));
  await pendingPlay;
  assert.equal(h.api.ready,true);
});

test('a failed leave retains the identity and can restore it', async () => {
  const h = harness({request:payload => payload.body?.op === 'leave' ? Promise.reject(new Error('version changed')) : Promise.resolve(snapshot())});
  await flush();
  await h.click('lan-confirm-leave');
  assert.equal(h.api.active,false);
  assert.equal(h.saved.has(KEY),false);
  assert.equal(JSON.parse(h.saved.get(KEY+'.parked')).token,'guest-token');
  h.click('lan-restore');
  await flush();
  assert.equal(h.api.ready,true);
  const polls = h.calls.filter(call => call.body?.op === 'poll');
  assert.ok(polls.length >= 3);
  assert.ok(polls.every(call => call.token === 'guest-token'));
});

test('host can remove an expired guest from the lobby and start again', async () => {
  let now = 1000;
  const room = new Room({now:() => now});
  const host = room.host('Mac');
  const guest = room.join({code:room.code,name:'Lost Pad',protocol:PROTOCOL,clientId:randomUUID()});
  const lost = room.members.find(member => member.token === guest.token);
  now += 13000;
  room.join({code:room.code,name:'Active Pad',protocol:PROTOCOL,clientId:randomUUID()});
  const h = harness({stored:{...host,address:'127.0.0.1:18765',host:true,name:'Mac'},request:payload => {
    if (payload.action === 'host') return Promise.resolve({...room.host(payload.name),address:'127.0.0.1:18765'});
    return room.request(payload.token,payload.body);
  }});
  await flush();
  assert.equal(h.node('lan-start').disabled,true);
  const row = h.node('lan-manage-members').children.find(child => child.textContent.startsWith('Lost Pad'));
  const remove = row.children.find(child => child.textContent === '移除');
  assert.ok(remove,'host lobby must expose remove control');
  await remove.handlers.get('click')();
  await flush();
  assert.equal(room.members.some(member => member.id === lost.id),false);
  assert.equal(room.waiting.length,0);
  assert.equal(h.node('lan-start').disabled,false);
  await h.click('lan-start');
  assert.ok(room.match);
});

test('same client identity rejoins an active match without creating a ghost member', async () => {
  let now = 1000;
  const room = new Room({now:() => now});
  const host = room.host('Mac'),clientId = randomUUID();
  const guest = room.join({code:room.code,name:'Pad',protocol:PROTOCOL,clientId});
  await room.request(host.token,{op:'start',version:room.version,requestId:'start'});
  now += 13000;
  room.authenticate(host.token);
  const recovered = room.join({code:room.code,name:'Pad',protocol:PROTOCOL,clientId});
  assert.equal(recovered.token,guest.token);
  assert.equal(room.members.length,2);
  assert.equal(room.waiting.length,0);
});

test('a rejected AI request from the previous match cannot fault a new match', async () => {
  const pending = deferred();
  const room = new Room({runModel:() => pending.promise});
  const host = room.host('Mac');
  room.join({code:room.code,name:'Pad',protocol:PROTOCOL,clientId:randomUUID()});
  await room.request(host.token,{op:'start',version:room.version,requestId:'start'});
  room.match.state.game.currentPlayer = room.seats.findIndex(id=>String(id).startsWith('bot:'));
  const oldId = room.match.id;
  const ticking = room.tick();
  assert.equal(room.busy,true);
  await room.request(host.token,{op:'new',version:room.version,requestId:'new'});
  pending.reject(new Error('stale inference failure'));
  await ticking;
  assert.notEqual(room.match.id,oldId);
  assert.equal(room.error,null);
  assert.equal(room.busy,false);
});

test('one mode entry discovers a table, shows four seats and returns to the exact solo deal',async()=>{
  const room=new Room(),host=room.host('朋友'),second=room.join({code:room.code,name:'另一位',protocol:PROTOCOL});
  const h=harness({stored:null,request:payload=>{
    if(payload.action==='discover')return Promise.resolve({rooms:[{id:room.id,address:'192.168.1.2:18765',name:'朋友',count:2,started:false}]});
    if(payload.body.op==='join')return Promise.resolve(room.join(payload.body));
    return room.request(payload.token,payload.body);
  }});
  const solo=h.context.liveRound;h.click('open-lan');assert.equal(h.node('solo-panel').hidden,false);
  h.click('mode-multi');await flush();assert.equal(h.node('lan-address').value,'192.168.1.2:18765');assert.equal(h.node('lan-nearby').children.length,1);
  h.node('lan-code').value=room.code;await h.click('lan-join');
  assert.equal(h.api.active,true);assert.equal(h.node('lan-members').children.length,4);assert.equal(h.node('lan-count').textContent,'3 / 4 人');
  room.join({code:room.code,name:'第四位',protocol:PROTOCOL});await h.api.reconnect();assert.equal(h.node('lan-count').textContent,'4 / 4 人');
  await room.request(host.token,{op:'start',version:room.version,requestId:'start-four'});await h.api.reconnect();
  assert.equal(h.node('lan-dialog').open,false,'guests automatically enter the game when the host starts');
  h.click('open-lan');h.click('mode-solo');assert.equal(h.node('lan-leave-confirm').hidden,false);
  await h.click('lan-confirm-leave');assert.equal(h.api.active,false);assert.equal(h.context.liveRound,solo);assert.equal(h.context.paused,false);
});

test('host uses a fresh table for opening, but preserves a parked table for continuing',async()=>{
  let room=new Room();
  const h=harness({stored:null,request:payload=>{
    if(payload.action==='host'){if(payload.fresh)room=new Room();return Promise.resolve({...room.host(payload.name),address:'127.0.0.1:18765'});}
    return room.request(payload.token,payload.body);
  }});
  await h.click('lan-host');const id=room.id;assert.equal(h.calls.find(p=>p.action==='host').fresh,true);
  assert.equal(h.node('lan-start').disabled,true);assert.equal(h.node('lan-members').children.length,4);
  await h.click('lan-confirm-leave');assert.equal(h.api.active,false);assert.ok(h.saved.get(KEY+'.parked'));
  h.click('lan-restore');await flush();assert.equal(room.id,id);assert.equal(h.api.active,true);
  assert.equal(h.calls.filter(p=>p.action==='host').at(-1).fresh,undefined);
});

test('a delayed discovery cannot overwrite a manually entered address',async()=>{
  const scan=deferred(),h=harness({stored:null,request:()=>scan.promise});
  h.click('mode-multi');h.node('lan-address').value='192.168.1.9:18765';
  scan.resolve({rooms:[{id:'room',address:'192.168.1.2:18765',name:'别人',count:1}]});await flush();
  assert.equal(h.node('lan-address').value,'192.168.1.9:18765');
});
test('a failed completed-round archive retries at the same room version and survives reconnect',async()=>{
  const room=new Room(),host=room.host('Mac 房主'),guest=room.join({code:room.code,name:'Pad 玩家',protocol:PROTOCOL});
  await room.request(host.token,{op:'start',version:room.version,requestId:'archive-start'});
  let guard=2000;
  while(!room.match.game.result&&guard--){
    const seat=room.match.actingSeat,card=room.match.game.players[seat].hand.find(card=>room.match.selection([card.id],seat).play);
    room.match.commit(seat,card?[card.id]:[]);
  }
  assert.ok(room.match.game.result);
  class FailingStorage extends Map{
    blocked=true;attempts=0;
    set(key,value){
      if(key===GuandanMatch.ARCHIVE_KEY){this.attempts++;if(this.blocked)throw new Error('QuotaExceededError');}
      return super.set(key,value);
    }
  }
  const saved=new FailingStorage(),stored={...guest,address:'127.0.0.1:18765',host:false,name:'Pad 玩家'};
  const request=payload=>room.request(payload.token,payload.body),h=harness({stored,request,saved});
  await flush();assert.equal(saved.attempts,1);assert.equal(h.notices.length,1);
  await h.api.reconnect();assert.equal(saved.attempts,2);assert.equal(h.notices.length,1,'unchanged save failures do not flood toasts');
  saved.blocked=false;await h.api.reconnect();assert.equal(saved.attempts,3);
  const record=JSON.parse(saved.get(GuandanMatch.ARCHIVE_KEY))[0];assert.ok(record.state&&!record.events);
  assert.equal(GuandanMatch.archives(h.context.localStorage)[0].source,'局域网实际对局');
  await h.api.reconnect();assert.equal(saved.attempts,3,'a successful archive is not rewritten on every poll');
  const reloaded=harness({stored,request,saved});await flush();
  const reviews=GuandanMatch.archives(reloaded.context.localStorage);
  assert.equal(reviews.length,1);assert.equal(reviews[0].id,room.match.id);
  assert.deepEqual(reviews[0].names,JSON.parse(JSON.stringify(reloaded.context.liveRound.names)));
});
