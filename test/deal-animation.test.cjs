const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {Player,progressAt,duration}=require('../web/app/deal-animation.js');

function harness(){
  let time=0,sequence=0;const frames=new Map(),calls={began:[],finished:[],cleared:0,revealed:0,updates:[]};
  const state={hidden:false,reduced:false};
  const view={begin(meta){calls.began.push(meta);},update(progress){calls.updates.push(progress);},reveal(){calls.revealed++;},clear(){calls.cleared++;},containsFocus(){return true;}};
  const player=new Player({view,onFinish:(meta,focus)=>calls.finished.push({meta,focus}),now:()=>time,
    frame(fn){frames.set(++sequence,fn);return sequence;},cancelFrame:id=>frames.delete(id),hidden:()=>state.hidden,reduced:()=>state.reduced});
  return {player,view,frames,calls,state,step(next){time=next;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());}};
}
test('all 108 card backs arrive evenly before the hand reveal, with monotonic counts',()=>{
  let previous=[0,0,0,0],sawReveal=false;
  for(let elapsed=0;elapsed<=duration+20;elapsed+=20){
    const progress=progressAt(elapsed);
    progress.counts.forEach((count,seat)=>{assert.ok(count>=previous[seat]&&count<=27);});
    assert.ok(Math.max(...progress.counts)-Math.min(...progress.counts)<=1);
    if(progress.phase==='reveal'){assert.deepEqual(progress.counts,[27,27,27,27]);sawReveal=true;}
    previous=progress.counts;
  }
  assert.equal(sawReveal,true);assert.equal(progressAt(duration).done,true);
});
test('natural completion reveals the hand once and releases the gameplay gate once',()=>{
  const h=harness(),meta={id:'one'};assert.equal(h.player.start(meta),true);assert.equal(h.player.active,true);
  h.step(1000);assert.equal(h.calls.finished.length,0);
  h.step(duration-100);h.step(duration);h.player.finish();h.step(duration+100);
  assert.equal(h.player.active,false);assert.equal(h.calls.revealed,1);assert.equal(h.calls.cleared,1);
  assert.deepEqual(h.calls.finished,[{meta,focus:true}]);assert.equal(h.frames.size,0);
});
test('skip is idempotent, cancels pending frames and returns control immediately',()=>{
  const h=harness();h.player.start({id:'skip'});h.step(600);h.player.finish();h.player.finish();h.step(duration);
  assert.equal(h.player.active,false);assert.equal(h.calls.finished.length,1);assert.equal(h.calls.revealed,0);assert.equal(h.frames.size,0);
});
test('replacing or unloading a deal cannot resume an obsolete game',()=>{
  const h=harness();h.player.start({id:'old'});const stale=[...h.frames.values()][0];h.player.start({id:'new'});
  stale();assert.equal(h.calls.finished.length,0);assert.equal(h.calls.updates.length,0);assert.equal(h.player.active,true);
  h.player.cancel();h.step(duration);assert.equal(h.calls.finished.length,0);assert.equal(h.player.active,false);
});
test('reduced motion and a hidden document skip startup without creating a visual gate',()=>{
  for(const setting of ['reduced','hidden']){
    const h=harness();h.state[setting]=true;
    assert.equal(h.player.start({id:setting}),false);assert.equal(h.player.active,false);assert.equal(h.calls.began.length,0);assert.equal(h.frames.size,0);
  }
});
test('backgrounding or enabling reduced motion during a deal releases it once',()=>{
  for(const setting of ['reduced','hidden']){
    const h=harness();h.player.start({id:setting});h.state[setting]=true;h.step(800);h.step(duration);
    assert.equal(h.player.active,false);assert.equal(h.calls.finished.length,1);assert.equal(h.calls.revealed,0);assert.equal(h.calls.cleared,1);
  }
});
test('a dropped frame or animation failure cannot leave play disabled',()=>{
  const late=harness();late.player.start({id:'late'});late.step(duration+5000);assert.equal(late.player.active,false);assert.equal(late.calls.finished.length,1);
  const failed=harness();failed.view.update=()=>{throw new Error('unavailable animation');};failed.player.start({id:'failed'});failed.step(100);
  assert.equal(failed.player.active,false);assert.equal(failed.calls.finished.length,1);assert.equal(failed.calls.cleared,1);
  const startup=harness();startup.view.begin=()=>{throw new Error('unsupported browser');};assert.equal(startup.player.start({id:'startup'}),false);
  assert.equal(startup.player.active,false);assert.equal(startup.calls.cleared,1);assert.equal(startup.calls.finished.length,0);
});
test('startup animates only a fresh saved game; reload and failed saves do not replay the deal',()=>{
  const source=fs.readFileSync(require('node:path').join(__dirname,'../web/app/table.js'),'utf8');
  const startup=source.slice(source.lastIndexOf("if(loadError)reportError(loadError,'load');else{"));
  for(const [initialDeal,fail,expected] of [[true,false,1],[false,false,0],[true,true,0]]){
    let saved=false,animated=0;
    const context={initialDeal,loadError:null,localStorage:{},liveRound:{persist(){if(fail)throw new Error('disk full');saved=true;}},
      beginDealAnimation(){assert.equal(saved,true);animated++;},reportError(){},checkModel(){}};
    vm.runInNewContext(startup,context);assert.equal(animated,expected);
  }
});
