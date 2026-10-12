const test=require('node:test'),assert=require('node:assert/strict');
const timing=require('../web/app/turn-timing.js');
test('thinking time varies within 1.6–2.6 seconds and settles only on expiry',async()=>{
 for(const [random,expected] of [[0,1600],[.37,1970],[1,2600]]){
  let fire,elapsed,settled=false;
  const wait=timing.begin({random:()=>random,setTimer:(fn,ms)=>{fire=fn;elapsed=ms;return 1;},clearTimer(){assert.fail('completed timer should not be cleared');}});
  wait.promise.then(()=>settled=true);await Promise.resolve();assert.equal(settled,false);assert.equal(elapsed,expected);
  fire();assert.equal(await wait.promise,true);wait.cancel();
 }
});
test('cancellation clears the timer and releases waiting work exactly once',async()=>{
 let clears=0;
 const wait=timing.begin({setTimer:()=>7,clearTimer:id=>{assert.equal(id,7);clears++;}});
 wait.cancel();wait.cancel();assert.equal(await wait.promise,false);assert.equal(clears,1);
});
