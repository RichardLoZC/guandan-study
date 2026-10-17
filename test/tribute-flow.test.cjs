const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../web/app/table.js'),'utf8');
function scheduling(begin=()=>({promise:Promise.resolve(true),cancel(){}})){
  const timers=[],calls={commits:0,requests:0};
  const context={botTimer:null,botWait:null,GuandanTurnTiming:{begin},paused:false,fault:null,activeTask:null,workEpoch:0,dealMotion:{active:false},
    liveRound:{state:{},adaptModel:response=>response,id:'test',revision:0,actingSeat:1,game:{result:null},phase:'playing',needsTributeConfirmation:true,
      observation:()=>({}),commitModel(){calls.commits++;}},
    window:{},document:{hidden:false},hasOpenDialog:()=>false,
    clearTimeout(){},setTimeout(fn){timers.push(fn);return timers.length;},
    prefs:{book:true,aiBook:true},renderGame(){},reportError(error){throw error;},saveAction:fn=>fn(),
    model:{cancel(){},async request(){calls.requests++;return {};}}
  };
  vm.createContext(context);for(const name of ['scheduleBots','stopBots'])vm.runInContext(source.match(new RegExp('function '+name+'\\(\\)\\{[\\s\\S]*?\\n\\}'))[0],context);
  return {context,timers,calls};
}
test('bot startup and lifecycle rescheduling cannot bypass the tribute confirmation',()=>{
  const h=scheduling();for(let i=0;i<3;i++)h.context.scheduleBots();
  assert.equal(h.timers.length,0);assert.equal(h.calls.requests,0);
  h.context.liveRound.needsTributeConfirmation=false;h.context.scheduleBots();assert.equal(h.timers.length,1);
});
test('solo inference starts immediately but a fast result waits for the thinking period',async()=>{
  let release;
  const h=scheduling(()=>({promise:new Promise(done=>release=done),cancel(){}}));
  h.context.liveRound.needsTributeConfirmation=false;h.context.scheduleBots();const work=h.timers[0]();
  assert.equal(h.calls.requests,1);await Promise.resolve();assert.equal(h.calls.commits,0);
  release(true);await work;assert.equal(h.calls.commits,1);
});
test('solo bots use their own strategy setting independently of the hint setting',async()=>{
  for(const enabled of [false,true]){
    const h=scheduling();h.context.prefs.aiBook=enabled;h.context.prefs.book=!enabled;
    let book;h.context.model.request=async payload=>{book=payload.book;return {};};
    h.context.liveRound.needsTributeConfirmation=false;h.context.scheduleBots();await h.timers[0]();
    assert.equal(book,enabled);assert.equal(h.calls.commits,1);
  }
});
test('stopping a solo turn cancels its delay and discards late inference',async()=>{
  let release,modelReply,cancelled=0;
  const h=scheduling(()=>({promise:new Promise(done=>release=done),cancel(){cancelled++;release(false);}}));
  h.context.model.request=()=>new Promise(done=>modelReply=done);
  h.context.liveRound.needsTributeConfirmation=false;h.context.scheduleBots();const work=h.timers[0]();
  h.context.stopBots();assert.equal(cancelled,1);modelReply({});await work;
  assert.equal(h.calls.commits,0);assert.equal(h.context.activeTask,null);assert.equal(h.context.botWait,null);
});
test('a delayed solo tribute uses the strategy once and cannot commit after a round switch',async()=>{
  let release,choices=0;
  const h=scheduling(()=>({promise:new Promise(done=>release=done),cancel(){}}));
  Object.assign(h.context.liveRound,{phase:'return',needsTributeConfirmation:false,chooseTribute(){choices++;return {card:{id:'return'}};},commit(){h.calls.commits++;}});
  h.context.scheduleBots();const work=h.timers[0]();assert.equal(choices,1);assert.equal(h.calls.requests,0);assert.equal(h.calls.commits,0);
  h.context.liveRound.id='next';release(true);await work;assert.equal(h.calls.commits,0);
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
test('an impossible human response is skipped without model or thinking and stale timers do nothing',async()=>{
  const h=scheduling(()=>assert.fail('forced pass must not wait'));
  Object.assign(h.context.liveRound,{needsTributeConfirmation:false,actingSeat:0,mustPass:true,passForced(){h.calls.commits++;this.mustPass=false;}});
  h.context.scheduleBots();await h.timers[0]();assert.equal(h.calls.commits,1);assert.equal(h.calls.requests,0);
  h.context.liveRound.mustPass=true;h.context.scheduleBots();h.context.liveRound.revision++;
  await h.timers[1]();assert.equal(h.calls.commits,1);
});

 test('portrait guard prevents new and queued solo moves, including a late inference reply',async()=>{
   const h=scheduling();let blocked=true;h.context.window.GuandanPhone={blocked:()=>blocked};h.context.liveRound.needsTributeConfirmation=false;
   h.context.scheduleBots();assert.equal(h.timers.length,0);
   blocked=false;h.context.scheduleBots();blocked=true;await h.timers[0]();assert.equal(h.calls.requests,0);
   blocked=false;let reply;h.context.model.request=()=>new Promise(done=>reply=done);
   h.context.scheduleBots();const pending=h.timers[1]();blocked=true;reply({});await pending;assert.equal(h.calls.commits,0);
 });
