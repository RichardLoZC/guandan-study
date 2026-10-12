const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Room,perspective,PROTOCOL}=require('../lan-room.cjs'),net=require('../lan-server.cjs'),{Match}=require('../web/app/match.js');
let sequence=0;
const command=(r,t,op,fields={})=>r.request(t,{op,version:r.version,requestId:String(++sequence),...fields});
async function setup(options={}){const r=new Room({random:(...args)=>args.length===2?123456:0,runModel:async()=>{throw new Error('fixture model');},...options}),host=r.host('Mac'),pad=r.join({code:r.code,name:'Pad',protocol:PROTOCOL});await command(r,host.token,'start');r.match.game.currentPlayer=0;r.match.game.starter=0;r.save();return {r,host,pad};}
function complete(m){let guard=2000;while(!m.game.result&&guard--){if(m.needsTributeConfirmation){m.acknowledgeTribute();continue;}if(m.phase!=='playing'){m.commit(m.actingSeat,[m.tributeChoices[0].id]);continue;}const seat=m.actingSeat,card=m.game.players[seat].hand.find(c=>m.selection([c.id],seat).play);m.commit(seat,card?[card.id]:[]);}assert.ok(m.game.result);}
test('four perspectives expose only own cards and public history, including replay data',async()=>{
  const {r}=await setup();for(let seat=0;seat<4;seat++){
    const view=perspective(r.match,seat,r.names());assert.deepEqual(view.state.game.players[0].hand,r.match.game.players[seat].hand);
    assert.ok(view.state.game.players.slice(1).every(p=>p.hand.every(c=>c===null)));
    const hidden=new Set(r.match.game.players.filter(p=>p.seat!==seat).flatMap(p=>p.hand.map(c=>c.id))),json=JSON.stringify(view);
    for(const id of hidden)assert.equal(json.includes('"'+id+'"'),false,'hidden physical ID '+id);
    assert.equal(view.actingSeat,(r.match.actingSeat-seat+4)%4);
  }
});
test('all seats see their own final places, winner and settlement text after rotation',()=>{
  const match=new Match();complete(match);const before=JSON.stringify(match.state);
  for(let seat=0;seat<4;seat++){
    const view=perspective(match,seat,['Mac','Pad 甲','Pad 乙','Windows']),game=view.state.game;
    const places=[0,2].map(own=>game.finishOrder.indexOf(own)+1).sort((a,b)=>a-b).join('');
    const winner=game.finishOrder[0]%2,team=winner===0?'我方':'对方';
    assert.equal(game.result.winnerTeam,winner);
    assert.equal(game.result.placementKey,places);
    assert.equal(game.result.badge,team+'升 '+game.result.levelDelta+' 级');
    assert.equal(game.result.summary,'你和队友分列 '+places+'，'+team+'升 '+game.result.levelDelta+' 级。');
    assert.equal(new Match(view.state).snapshot().placement,places);
  }
  assert.equal(JSON.stringify(match.state),before,'projection never modifies the authoritative result');
});
test('a human can only act at their seat; stale and duplicate submissions conserve cards',async()=>{
  const {r,host,pad}=await setup(),id=r.match.game.players[0].hand[0].id;
  await assert.rejects(command(r,host.token,'play',{ids:[id]}),/此玩家/);
  const body={op:'play',version:r.version,requestId:'same-request',ids:[id]};await r.request(pad.token,body);const version=r.version;
  await r.request(pad.token,body);assert.equal(r.version,version);assert.equal(r.match.game.players[0].hand.length,26);
  await assert.rejects(r.request(pad.token,{...body,requestId:'another'}),/牌局已变化/);
  assert.equal(r.match.game.actionHistory.length,1);
});
test('only host resets game, and fresh games shuffle while a normal next deal retains seats',async()=>{
  const {r,host,pad}=await setup();await assert.rejects(command(r,pad.token,'new'),/房主/);
  const initial=[...r.seats];complete(r.match);await command(r,host.token,'next');assert.deepEqual(r.seats,initial);
  const id=r.match.id;await command(r,host.token,'new');assert.notEqual(r.match.id,id);assert.equal(r.match.state.round,1);assert.deepEqual(r.match.state.levels,['2','2']);
});
test('clearing Ace resets levels and triggers a fresh seat shuffle',async()=>{
  const {r,host}=await setup();complete(r.match);
  const state=r.match.state;state.level='A';state.levels=['A','A'];state.game.result.winnerTeam=0;state.game.finishOrder=[0,2,1,3];
  function mark(value){if(!value||typeof value!=='object')return;if(value.suit&&value.rank)value.isWild=value.suit==='hearts'&&value.rank==='A';for(const child of Object.values(value))if(child&&typeof child==='object')mark(child);}mark(state);
  const initial=[...r.seats];r.random=n=>n-1;await command(r,host.token,'next');
  assert.deepEqual(r.match.state.levels,['2','2']);assert.equal(r.match.state.wins[0],1);assert.notDeepEqual(r.seats,initial);
});
test('disconnected humans pause play, reconnect keeps the same hand and seat',async()=>{
  let now=100000;const {r,host,pad}=await setup({now:()=>now});const seat=r.seats.indexOf(r.members.find(m=>m.token===pad.token).id),ids=r.match.game.players[seat].hand.map(c=>c.id);
  now+=13000;await r.request(host.token,{op:'poll'});assert.deepEqual(r.waiting,['Pad']);
  await assert.rejects(command(r,host.token,'play',{ids:[]}),/暂停/);
  await r.request(pad.token,{op:'poll'});assert.deepEqual(r.waiting,[]);assert.deepEqual(r.match.game.players[seat].hand.map(c=>c.id),ids);
});
test('model response after host pauses is discarded',async()=>{
  let resolve;const {r,host,pad}=await setup({runModel:()=>new Promise(done=>resolve=done)});
  await command(r,pad.token,'play',{ids:[r.match.game.players[0].hand[0].id]});const actions=r.match.game.actionHistory.length;
  const work=r.tick();await command(r,host.token,'pause');resolve({result:{candidates:[{type:'pass'}],engine:'fixture'}});await work;
  assert.equal(r.match.game.actionHistory.length,actions);
});
test('tribute choices are private, and every connected player acknowledges the public receipt',async()=>{
  const {r,host,pad}=await setup();r.match.state.phase='give';r.match.state.tribute={donors:[3,1],winners:[0,2],offers:[]};
  for(let seat=0;seat<4;seat++){const v=perspective(r.match,seat,r.names());if(seat!==r.match.actingSeat)assert.deepEqual(v.tributeChoices,[]);}
  while(r.match.phase!=='playing')r.match.commit(r.match.actingSeat,[r.match.tributeChoices[0].id]);
  assert.ok(r.match.needsTributeConfirmation);await command(r,host.token,'ack');assert.ok(r.match.needsTributeConfirmation);await command(r,pad.token,'ack');assert.equal(r.match.needsTributeConfirmation,false);
});
test('a LAN bot returns tribute through the same hand-structure decision as a local Match',async()=>{
  let modelCalls=0;const {r}=await setup({runModel:async()=>{modelCalls++;throw new Error('tribute must not invoke play inference');}});
  r.match.state.phase='give';r.match.state.tribute={donors:[3],winners:[2],offers:[]};
  r.match.commit(3,[r.match.tributeChoices[0].id]);
  assert.equal(r.match.phase,'return');assert.equal(r.match.actingSeat,2);
  assert.ok(!r.members.some(member=>member.id===r.seats[2]),'recipient is a bot');
  const local=new Match(r.match.state),expected=local.chooseTribute();local.commit(2,[expected.card.id],{automatic:true});
  const choose=r.match.chooseTribute.bind(r.match);let strategyCalls=0;
  r.match.chooseTribute=()=>{strategyCalls++;return choose();};
  await r.tick();
  assert.equal(strategyCalls,1);assert.equal(modelCalls,0);assert.equal(r.error,null);
  assert.equal(r.match.state.exchanges[0].returned.id,expected.card.id);
  assert.deepEqual(r.match.state,local.state,'LAN and local commits have identical game state');
});
test('durable room restore preserves sessions; failed persistence rolls back the deal',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guandan-lan-test-')),file=path.join(dir,'room.json');
  try{const {r,host}=await setup({savePath:file});const state=JSON.stringify(r.match.state),id=r.id;
    const restored=Room.load({savePath:file});assert.equal(restored.id,id);assert.equal(restored.authenticate(host.token).host,true);assert.equal(JSON.stringify(restored.match.state),state);
    r.savePath=path.join(dir,'missing','room.json');await assert.rejects(command(r,host.token,'new'));assert.equal(JSON.stringify(r.match.state),state);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('HTTP endpoint authenticates, rejects cross-origin access and refuses public targets',async()=>{
  const service=await net.start({port:0});try{
    const host=service.room.host('Mac'),joined=await net.request(service.address,{op:'join',name:'Pad',code:service.room.code,protocol:PROTOCOL});
    assert.equal((await net.request(service.address,{op:'poll'},joined.token)).room.members.length,2);
    await assert.rejects(net.request(service.address,{op:'poll'},'bad'),/身份/);
    const response=await fetch('http://'+service.address+'/api',{method:'POST',headers:{origin:'https://example.com','content-type':'application/json'},body:JSON.stringify({op:'poll'})});assert.equal(response.status,403);
    for(const address of ['8.8.8.8:18765','127.0.0.1:22','example.com:18765','192.168.1.1:65536'])assert.throws(()=>net.addressURL(address));
  }finally{service.close();}
});
test('native LAN transport preserves Chinese text split across HTTP response chunks',async()=>{
  const http=require('node:http'),payload={name:'墨白',label:'进贡 大王'},bytes=Buffer.from(JSON.stringify(payload));
  const split=bytes.indexOf(Buffer.from('墨'))+1;
  const server=http.createServer((_req,res)=>{
    res.writeHead(200,{'content-type':'application/json; charset=utf-8'});res.write(bytes.subarray(0,split));
    setImmediate(()=>res.end(bytes.subarray(split)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{assert.deepEqual(await net.request('127.0.0.1:'+server.address().port,{op:'poll'}),payload);}
  finally{await new Promise(resolve=>server.close(resolve));}
});
test('LAN server preserves a Chinese player name split inside an incoming UTF-8 character',async()=>{
  const http=require('node:http'),service=await net.start({port:0});
  try{
    const bytes=Buffer.from(JSON.stringify({op:'join',name:'墨白',code:service.room.code,protocol:PROTOCOL}));
    const split=bytes.indexOf(Buffer.from('墨'))+1;
    const joined=await new Promise((resolve,reject)=>{
      const req=http.request('http://'+service.address+'/api',{method:'POST',headers:{'content-type':'application/json'}},res=>{
        const chunks=[];res.on('data',part=>chunks.push(part));res.on('end',()=>resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));res.on('error',reject);
      });req.on('error',reject);req.write(bytes.subarray(0,split));setImmediate(()=>req.end(bytes.subarray(split)));
    });
    assert.ok(joined.token);assert.equal(service.room.members.at(-1).name,'墨白');
  }finally{await service.close();}
});

test('four humans complete a deal over HTTP, keep private hands, and never trigger an AI turn',async()=>{
  let modelCalls=0;
  const service=await net.start({port:0,runModel:async()=>{modelCalls++;throw new Error('all seats are human');}}),r=service.room;
  const host=r.host('Mac 房主'),players=[host],clients=[];
  const send=(p,op,extra={})=>net.request(service.address,{op,version:r.version,requestId:'four-'+(++sequence),...extra},p.token);
  try{
    for(const name of ['Pad 甲','Pad 乙','Mac 乙']){
      const clientId=require('node:crypto').randomUUID();clients.push(clientId);
      players.push(await net.request(service.address,{op:'join',code:r.code,name,clientId,protocol:PROTOCOL}));
    }
    await assert.rejects(net.request(service.address,{op:'join',code:r.code,name:'第五位',protocol:PROTOCOL}),/已满/);
    await send(host,'start');assert.equal(new Set(r.seats).size,4);assert.ok(r.seats.every(id=>r.members.some(m=>m.id===id)));
    for(const player of players){
      const view=await send(player,'poll');assert.equal(view.room.members.length,4);assert.equal(view.room.members.filter(m=>m.self).length,1);
      assert.equal(view.round.state.game.players[0].hand.length,27);
      assert.ok(view.round.state.game.players.slice(1).every(p=>p.hand.every(c=>c===null)));
    }
    const guestSeat=r.seats.indexOf(r.members.find(m=>m.token===players[1].token).id);
    const rejoined=await net.request(service.address,{op:'join',code:r.code,name:'回来',clientId:clients[0],protocol:PROTOCOL});
    assert.equal(rejoined.token,players[1].token);assert.equal(r.members.length,4);assert.equal(r.seats.indexOf(r.members.find(m=>m.token===rejoined.token).id),guestSeat);
    let guard=2000;const acted=new Set();
    while(!r.match.game.result&&guard--){
      const seat=r.match.actingSeat,member=r.members.find(m=>m.id===r.seats[seat]);acted.add(member.id);
      const card=r.match.game.players[seat].hand.find(c=>r.match.selection([c.id],seat).play);
      const before=r.match.game.players[seat].hand.length;
      await send(member,'play',{ids:card?[card.id]:[]});await r.tick();
      assert.equal(r.match.game.players[seat].hand.length,before-(card?1:0));
    }
    assert.ok(r.match.game.result);assert.equal(acted.size,4);assert.equal(modelCalls,0);
    const seats=[...r.seats];await send(host,'next');assert.deepEqual(r.seats,seats);
    while(r.match.phase!=='playing'){
      const member=r.members.find(m=>m.id===r.seats[r.match.actingSeat]);
      await send(member,'play',{ids:[r.match.tributeChoices[0].id]});await r.tick();
    }
    if(r.match.needsTributeConfirmation){for(const member of r.members)await send(member,'ack');}
    assert.equal(r.match.needsTributeConfirmation,false);assert.equal(modelCalls,0);
  }finally{await service.close();}
});

test('opening a fresh table and restoring a saved table have distinct identities',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guandan-room-fresh-')),savePath=path.join(dir,'room.json');let service;
  try{
    service=await net.start({port:0,savePath});const first=service.room.host('Mac');await service.close();
    service=await net.start({port:0,savePath});assert.equal(service.room.id,first.roomId);await service.close();
    service=await net.start({port:0,savePath,fresh:true});const second=service.room.host('新的牌桌');assert.notEqual(second.roomId,first.roomId);
    assert.equal(service.room.members.length,1);assert.throws(()=>service.room.authenticate(first.token),/身份失效/);
  }finally{await service?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
