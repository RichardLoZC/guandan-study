const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../web/app/table.js'),'utf8');
function scheduling(){
  const timers=[],calls={commits:0,requests:0};
  const context={botTimer:null,paused:false,fault:null,activeTask:null,workEpoch:0,dealMotion:{active:false},
    liveRound:{state:{},adaptModel:response=>response,id:'test',revision:0,actingSeat:1,game:{result:null},phase:'playing',needsTributeConfirmation:true,
      observation:()=>({}),commitModel(){calls.commits++;}},
    document:{hidden:false},hasOpenDialog:()=>false,
    clearTimeout(){},setTimeout(fn){timers.push(fn);return timers.length;},
    prefs:{book:true},renderGame(){},reportError(error){throw error;},saveAction:fn=>fn(),
    model:{async request(){calls.requests++;return {};}}
  };
  vm.createContext(context);vm.runInContext(source.match(/function scheduleBots\(\)\{[\s\S]*?\n\}/)[0],context);
  return {context,timers,calls};
}
test('bot startup and lifecycle rescheduling cannot bypass the tribute confirmation',()=>{
  const h=scheduling();for(let i=0;i<3;i++)h.context.scheduleBots();
  assert.equal(h.timers.length,0);assert.equal(h.calls.requests,0);
  h.context.liveRound.needsTributeConfirmation=false;h.context.scheduleBots();assert.equal(h.timers.length,1);
});
test('an already queued bot timer rechecks confirmation before requesting the model',async()=>{
  const h=scheduling();h.context.liveRound.needsTributeConfirmation=false;h.context.scheduleBots();
  h.context.liveRound.needsTributeConfirmation=true;await h.timers[0]();
  assert.equal(h.calls.requests,0);assert.equal(h.calls.commits,0);
});
test('bot play resumes once the tribute has been acknowledged',async()=>{
  const h=scheduling();h.context.liveRound.needsTributeConfirmation=false;h.context.scheduleBots();await h.timers[0]();
  assert.equal(h.calls.requests,1);assert.equal(h.calls.commits,1);
});
test('dealing blocks bot startup and rechecks an already queued timer',async()=>{
  const h=scheduling();h.context.liveRound.needsTributeConfirmation=false;
  h.context.dealMotion.active=true;h.context.scheduleBots();assert.equal(h.timers.length,0);
  h.context.dealMotion.active=false;h.context.scheduleBots();assert.equal(h.timers.length,1);
  h.context.dealMotion.active=true;await h.timers[0]();assert.equal(h.calls.requests,0);assert.equal(h.calls.commits,0);
  h.context.dealMotion.active=false;h.context.scheduleBots();await h.timers[1]();assert.equal(h.calls.commits,1);
});
test('a model reply arriving during dealing cannot commit a play',async()=>{
  const h=scheduling();h.context.liveRound.needsTributeConfirmation=false;
  let resolve;h.context.model.request=()=>new Promise(done=>resolve=done);
  h.context.scheduleBots();const pending=h.timers[0]();h.context.dealMotion.active=true;resolve({});await pending;
  assert.equal(h.calls.commits,0);
});
