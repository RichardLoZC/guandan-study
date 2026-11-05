'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const personas=require('../web/app/personas.js'),models=require('../web/app/model-profiles.js'),core=require('../web/app/core.js');
const {Match,archives,ARCHIVE_KEY}=require('../web/app/match.js'),{Room,PROTOCOL}=require('../web/app/lan-room.js'),{finished}=require('./helpers/series-fixtures.cjs');
test('all fifty Ming personas have distinct atlas cells and exactly twenty-five use each policy',()=>{
  assert.equal(personas.names.length,50);assert.equal(new Set(personas.names).size,50);const cells=new Set(),counts={};
  for(let id=0;id<50;id++){const p=personas.profile([id],0);cells.add(p.avatar+':'+p.portrait);assert.equal(p.portraitCols,5);assert.equal(p.portraitRows,5);assert.ok(p.portrait<25);counts[p.policyId]=(counts[p.policyId]||0)+1;}
  assert.equal(cells.size,50);assert.deepEqual(counts,{[models.EXPERT]:25,[models.OFFICIAL]:25});
  const seen=new Set();for(let i=0;i<500;i++){const ids=personas.assignment('ming-'+i);assert.ok(personas.valid(ids));ids.forEach(id=>seen.add(id));assert.equal(new Set(ids.slice(1).map(id=>personas.profile([id],0).policyId)).size,2);assert.deepEqual(personas.assignment('ming-'+i),ids);}
  assert.equal(seen.size,50);
});
test('the expanded random roster does not strongly favor a small subset of names',()=>{
  const counts=Array(50).fill(0);for(let i=0;i<5000;i++)for(const id of personas.assignment('sampling-check-'+i).slice(1))counts[id]++;
  assert.ok(Math.min(...counts)>180,JSON.stringify(counts));assert.ok(Math.max(...counts)<450,JSON.stringify(counts));
});
test('live legacy states migrate without mutating their input; historical records retain old names and portraits',()=>{
  const state=structuredClone(finished([0,1,2,3],{level:'K',levels:['K','2']}).state);state.personaIds=[0,1,2,3];delete state.personaSeries;
  const before=structuredClone(state),live=new Match(state);assert.deepEqual(state,before);assert.equal(live.state.personaSeries,personas.SERIES);
  const names=['你','白居易','荀彧','郭嘉'],record={id:state.id,state,names,playerIds:[0,1,2,3]};
  const original=JSON.stringify([record]),values=new Map([[ARCHIVE_KEY,original]]),storage={getItem:key=>values.get(key)||null};
  const [history]=archives(storage);assert.deepEqual(history.names,names);assert.equal(history.personaSeries,personas.LEGACY);
  assert.equal(personas.profile(history.personaIds,1,history.personaSeries).name,'白居易');assert.match(personas.profile(history.personaIds,1,history.personaSeries).avatar,/historical-figures/);
  assert.equal(storage.getItem(ARCHIVE_KEY),original);
});
test('declared persona assignments never silently change models when their IDs are damaged',()=>{
  const state=new Match().state;state.personaIds=[1,1,5,7];const before=structuredClone(state);
  assert.throws(()=>new Match(state),/模型分配记录损坏/);assert.deepEqual(state,before);
  state.personaIds=[1,3,5,50];assert.throws(()=>new Match(state),/模型分配记录损坏/);
  assert.throws(()=>new Match().policyFor(4),/座位无效/);
});
test('persona policies survive another deal and follow identity when seats rotate',()=>{
  const m=finished([0,1,2,3],{level:'K',levels:['K','2']}),next=m.next();
  assert.deepEqual(next.state.personaIds,m.state.personaIds);assert.equal(next.state.personaSeries,m.state.personaSeries);
  for(let s=0;s<4;s++)assert.equal(next.policyFor(s),m.policyFor(s));
  Object.defineProperty(next,'playerIds',{value:[0,3,1,2]});for(let s=0;s<4;s++)assert.equal(next.policyFor(s),personas.profile(next.state.personaIds,next.playerIds[s],next.state.personaSeries).policyId);
});
test('LAN authoritative AI model choice follows member identity rather than shuffled seat',async()=>{
  for(const identity of [2,3]){
    const requests=[],room=new Room({startThinking:()=>({promise:Promise.resolve(true),cancel(){}}),runModel:async payload=>{
      requests.push(payload);const o=payload.observation;assert.ok(o.state.players.filter(p=>p.seat!==o.seat).every(p=>p.hand.every(c=>c===null)));
      core.setLevel(o.level);return {result:{engine:'test',policyId:payload.policyId,checkpointSha256:models.resolve(payload.policyId).checkpointSha256,candidates:[{type:'play',play:core.recognize([o.state.players[o.seat].hand[0]])[0],score:1}]}};
    }}),host=room.host('甲');room.join({code:room.code,name:'乙',protocol:PROTOCOL});await room.request(host.token,{protocol:PROTOCOL,op:'start',version:room.version,requestId:'start'});
    room.match.state.personaIds=[0,1,2,3];room.seats=[room.members[0].id,'bot:3',room.members[1].id,'bot:2'];const seat=room.seats.indexOf('bot:'+identity);room.match.game.currentPlayer=seat;room.match.game.starter=seat;
    assert.equal(room.policyFor(seat),personas.profile(room.match.state.personaIds,identity).policyId);await room.tick();assert.equal(requests.length,1);assert.equal(requests[0].policyId,room.policyFor(seat));
    const restored=new Room({restored:room.serialize()});assert.equal(restored.policyFor(seat),room.policyFor(seat));
  }
});
test('both personas always use the original tribute head and unknown model IDs are rejected',()=>{
  for(const id of [models.EXPERT,models.OFFICIAL]){assert.equal(models.forPhase(id,'give').id,models.OFFICIAL);assert.equal(models.forPhase(id,'return').id,models.OFFICIAL);assert.equal(models.forPhase(id,'play').id,id);}
  for(const id of ['../custom.onnx','https://example.com/model',null,{}])assert.throws(()=>models.resolve(id));
});
test('model client refuses mismatched or missing model identity and can request the correct new policy',async()=>{
  let reply,sent;
  class Worker{postMessage(value){sent=value;this.onmessage({data:{id:value.id,...reply}});}terminate(){}}
  const context={Worker,setTimeout,clearTimeout,GuandanModelProfiles:models};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../web/app/model-client.js'),'utf8')+'\nglobalThis.client=new DanLMClient()',context);
  const official=models.resolve(),expert=models.resolve(models.EXPERT);
  reply={result:{policyId:official.id,checkpointSha256:official.checkpointSha256,candidates:[]}};
  await assert.rejects(context.client.request({observation:{},policyId:expert.id}),/身份不一致/);
  reply={result:{policyId:expert.id,checkpointSha256:expert.checkpointSha256,candidates:[]}};
  assert.equal((await context.client.request({observation:{},policyId:expert.id})).result.policyId,expert.id);assert.equal(sent.policyId,expert.id);
  reply={result:{candidates:[]}};await assert.rejects(context.client.request({observation:{}}),/身份不一致/);
  reply={policyId:official.id,checkpointSha256:official.checkpointSha256,cardId:'test',score:0};await context.client.request({tribute:{phase:'return'},policyId:expert.id});
});
