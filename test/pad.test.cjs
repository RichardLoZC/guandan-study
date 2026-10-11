const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function harness(initial=[],key=null){
  const handlers=new Map(),nodes=new Map(),calls={scheduled:0,cancelled:0,health:0,exports:[]};
  function on(name,type,fn){const id=name+':'+type;if(!handlers.has(id))handlers.set(id,[]);handlers.get(id).push(fn);}
  function node(id){
    if(!nodes.has(id))nodes.set(id,{id,disabled:false,open:false,dataset:{},after(){},setAttribute(){},addEventListener(type,fn){on(id,type,fn);},contains(card){return cards.includes(card);},closest(){return this;}});
    return nodes.get(id);
  }
  const cards=Array.from({length:6},(_,i)=>{const card=node('card'+i);card.dataset.id=String(i);return card;});
  const context={handEditor:{editing:false,cancel(){},setEditing(value){this.editing=value;}},GuandanI18n:require('../web/app/i18n.js'),selected:new Set(initial),playKey:key,liveRound:{revision:1,phase:'playing'},activeTask:null,workEpoch:0,fault:null,
    canPlay:()=>true,byId:node,clearToast(){},updateSelection(){},toast(){},downloadText(){},
    scheduleBots(){calls.scheduled++;},stopBots(){},stopReplay(){},renderGame(){},checkModel(){calls.health++;},closeDialog(dialog){dialog.open=false;},
    model:{ready:true,cancel(){calls.cancelled++;}},performance:{now:()=>100},dealMotion:{active:false,finish(){this.active=false;}},
    document:{createElement:()=>({}),createTextNode:text=>text,querySelectorAll:()=>[],elementFromPoint:(x,y)=>y>=0&&y<114?cards[Math.floor(x/48)]||null:null},
    window:{GuandanPadNative:{exportText:(name,text)=>calls.exports.push({name,text})},addEventListener:(type,fn)=>on('window',type,fn)}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../android/web/pad.js'),'utf8'),context);
  const event=(type,x,y=50,extra={})=>{
    const value={pointerId:1,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,target:cards[Math.floor(x/48)]||cards[0],...extra};
    for(const fn of handlers.get((['pointerup','pointercancel','resize'].includes(type)?'window':'hand-cards')+':'+type)||[])fn(value);
    return value;
  };
  return {context,calls,event};
}
test('Pad swipe selects every traversed card and suppresses the synthetic click',()=>{
  const h=harness();h.event('pointerdown',10);h.event('pointermove',202);h.event('pointerup',202);
  assert.deepEqual([...h.context.selected],['0','1','2','3','4']);
  let prevented=false,stopped=false;
  h.event('click',202,50,{detail:1,preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
  assert.ok(prevented&&stopped);
});
test('Pad swipe can deselect a group without toggling cards twice',()=>{
  const h=harness(['0','1','2','3','4']);h.event('pointerdown',10);h.event('pointermove',150);h.event('pointermove',30);h.event('pointerup',30);
  assert.deepEqual([...h.context.selected],['4']);
});
test('cancelled Pad gestures restore both cards and the chosen straight-flush interpretation',()=>{
  for(const end of ['pointercancel','resize','suspend']){
    const h=harness(['0','1','2','3','4'],'straight-flush:spades');
    h.event('pointerdown',10);h.event('pointermove',100);
    if(end==='suspend')h.context.window.guandanPad.suspend();else h.event(end,100);
    assert.deepEqual([...h.context.selected],['0','1','2','3','4']);
    assert.equal(h.context.playKey,'straight-flush:spades');
  }
});
test('Pad vertical scrolling and mouse movement do not select cards',()=>{
  const vertical=harness();vertical.event('pointerdown',10);vertical.event('pointermove',13,85);vertical.event('pointerup',13,85);
  assert.equal(vertical.context.selected.size,0);
  const mouse=harness();mouse.event('pointerdown',10,50,{pointerType:'mouse'});mouse.event('pointermove',150,50,{pointerType:'mouse'});
  assert.equal(mouse.context.selected.size,0);
});
test('gesture cancellation cannot restore selections from an older game revision',()=>{
  const h=harness(['0']);h.event('pointerdown',10);h.event('pointermove',110);
  h.context.liveRound.revision++;h.context.selected.clear();h.event('pointercancel',110);
  assert.equal(h.context.selected.size,0);
});
test('backgrounding cancels teaching, blocks bot scheduling and resumes the model once',()=>{
  const h=harness();h.context.activeTask='teaching';h.context.model.ready=false;
  h.context.window.guandanPad.suspend();h.context.scheduleBots();
  assert.equal(h.context.activeTask,null);assert.equal(h.calls.cancelled,1);assert.equal(h.calls.scheduled,0);
  h.context.window.guandanPad.resume();h.context.window.guandanPad.resume();assert.equal(h.calls.health,1);
});
test('Pad text exports hand the exact content to the native document picker',()=>{
  const h=harness();h.context.downloadText('掼蛋-复盘.txt','中文\n♥2、♠A');
  assert.deepEqual(h.calls.exports,[{name:'掼蛋-复盘.txt',text:'中文\n♥2、♠A'}]);
  const source=fs.readFileSync(path.join(__dirname,'../web/app/review.js'),'utf8');
  vm.runInContext(source.match(/function exportReview\(\)\{[\s\S]*?\n\}/)[0],h.context);
  h.context.reviewRound={round:2};h.context.reviewText=()=>'终局明牌\n青岚 ♠3';h.context.exportReview();
  assert.deepEqual(h.calls.exports[1],{name:'掼蛋-第2副复盘.txt',text:'终局明牌\n青岚 ♠3'});
});
test('Pad background and back controls finish a dealing animation',()=>{
  const h=harness();h.context.dealMotion.active=true;
  assert.equal(h.context.window.guandanPad.back(),true);assert.equal(h.context.dealMotion.active,false);
  h.context.dealMotion.active=true;h.context.window.guandanPad.suspend();assert.equal(h.context.dealMotion.active,false);
});

test('free arranging owns touch drags and system Back exits arranging before clearing cards',()=>{
 const h=harness(['0']);h.context.handEditor.editing=true;
 h.event('pointerdown',10);h.event('pointermove',200);h.event('pointerup',200);
 assert.deepEqual([...h.context.selected],['0']);
 assert.equal(h.context.window.guandanPad.back(),true);assert.equal(h.context.handEditor.editing,false);assert.deepEqual([...h.context.selected],['0']);
});
