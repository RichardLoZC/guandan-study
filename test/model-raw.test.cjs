'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const worker=require('./helpers/strategy-worker.cjs'),{Match}=require('../web/app/match.js'),core=require('../web/app/core.js');
test('legacy book flags cannot reorder the raw model result',async()=>{
  const context=worker(),match=new Match(),observation=match.observation(0),play=core.recognize([match.game.players[0].hand[0]])[0];
  const raw={engine:'DanLM',candidates:[{type:'play',play,score:12}]},sent=[];
  context.oa=async()=>raw;context.self.postMessage=value=>sent.push(value);
  for(const book of [true,false])await context.self.onmessage({data:{id:sent.length+1,observation,provider:'danlm',book}});
  assert.equal(sent.length,2);for(const response of sent){assert.equal(response.result,raw);assert.equal(response.result.candidates[0].play.key,play.key);assert.equal(response.result.book,undefined);}
});
test('model client strips obsolete flags before sending a worker request',async()=>{
  let sent;
  class Worker{postMessage(value){sent=value;this.onmessage({data:{id:value.id,ready:true,policyIds:['danlm-v1','expert-style-v1']}});}terminate(){}}
  const context={Worker,setTimeout,clearTimeout,GuandanModelProfiles:require('../web/app/model-profiles.js')};vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../web/app/model-client.js'),'utf8')+'\nglobalThis.client=new DanLMClient();',context);
  await context.client.request({health:true,book:true,aiBook:true});
  assert.equal(sent.health,true);assert.equal('book' in sent,false);assert.equal('aiBook' in sent,false);
});
test('a failed model initialization is reset before retry',async()=>{
  const workers=[];
  class Worker{
    constructor(){this.terminated=false;workers.push(this);}
    postMessage(value){this.onmessage({data:workers.length===1?{id:value.id,error:'backend aborted'}:{id:value.id,ready:true,policyIds:['danlm-v1','expert-style-v1']}});}
    terminate(){this.terminated=true;}
  }
  const context={Worker,setTimeout,clearTimeout,GuandanModelProfiles:require('../web/app/model-profiles.js')};vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../web/app/model-client.js'),'utf8')+'\nglobalThis.client=new DanLMClient();',context);
  await assert.rejects(context.client.request({health:true}),/backend aborted/);
  context.client.reset();assert.equal(workers[0].terminated,true);assert.equal(context.client.ready,false);
  await context.client.request({health:true});assert.equal(workers.length,2);assert.equal(context.client.ready,true);
});
