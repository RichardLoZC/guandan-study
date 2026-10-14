'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness(){
  const listeners=new Map(),commits=[];let selection=new Set(['b']),signature='round:1|abcd',allowed=true,dialog=false,gesture=false,now=1000,hit;
  const order=['a','b','c','d'];
  function node(name,blank=false){return {name,parentElement:null,offsetWidth:500,offsetHeight:300,clientWidth:500,clientHeight:300,clientLeft:0,clientTop:0,
    matches:()=>blank,closest:()=>null,getBoundingClientRect:()=>({left:0,top:0,right:500,bottom:300,width:500,height:300}),
    addEventListener(type,fn){const key=name+':'+type;listeners.set(key,[...(listeners.get(key)||[]),fn]);}};}
  const table=node('table',true),surface=node('surface',true),control=node('control'),outside=node('outside',true),win=node('window'),doc=node('document');
  surface.parentElement=control.parentElement=table;table.contains=target=>[table,surface,control].includes(target);
  hit=surface;doc.elementFromPoint=()=>hit;
  const c={window:win,document:doc,performance:{now:()=>now},getComputedStyle:()=>({overflowX:'auto',overflowY:'auto'})};
  vm.runInNewContext(fs.readFileSync(require.resolve('../web/app/hand-selection.js'),'utf8'),c);
  const api=c.GuandanHandSelection.create({table,getOrder:()=>order,getSelected:()=>selection,getSignature:()=>signature,
    canSelect:()=>allowed,hasDialog:()=>dialog,cancelGesture:()=>{const old=gesture;gesture=false;return old;},
    onSelect:ids=>{selection=new Set(ids);commits.push([...ids]);}});
  const fire=(scope,type,extra={})=>{
    const event={button:0,isPrimary:true,pointerType:'mouse',pointerId:1,clientX:20,clientY:20,target:hit,detail:1,defaultPrevented:false,
      preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};
    for(const fn of listeners.get(scope+':'+type)||[])fn(event);return event;
  };
  const tap=(extra={})=>{fire('window','pointerdown',extra);fire('window','pointerup',extra);fire('table','click',extra);};
  return {api,order,commits,fire,tap,table,surface,control,outside,get selected(){return [...selection];},
    setSelected:ids=>selection=new Set(ids),setHit:target=>hit=target,changeLayout:()=>signature+='x',allow:value=>allowed=value,
    openDialog:()=>dialog=true,startGesture:()=>gesture=true,advance:ms=>now+=ms,doc};
}
test('a stationary blank click or tap clears selection once, without a pointerdown mutation',()=>{
  for(const pointerType of ['mouse','touch','pen']){
    const h=harness();h.fire('window','pointerdown',{pointerType});assert.deepEqual(h.selected,['b']);
    h.fire('window','pointerup',{pointerType,clientX:22});assert.deepEqual(h.selected,['b']);
    h.fire('table','click',{pointerType,clientX:22});assert.deepEqual(h.selected,[]);assert.equal(h.commits.length,1);
    h.fire('table','click');assert.equal(h.commits.length,1);
  }
});
test('controls, played cards, information and outside surfaces cannot clear the hand',()=>{
  for(const type of ['control','outside']){const h=harness();h.setHit(h[type]);h.tap();assert.deepEqual(h.selected,['b']);}
  const h=harness();h.fire('window','pointerdown');h.setHit(h.control);h.fire('window','pointerup');h.fire('table','click');assert.deepEqual(h.selected,['b']);
});
test('drag/box releases and dragging back to the start never become blank clicks',()=>{
  for(const pointerType of ['mouse','touch','pen']){
    const h=harness();h.fire('window','pointerdown',{pointerType});h.fire('window','pointermove',{pointerType,clientX:40});
    h.fire('window','pointermove',{pointerType,clientX:20});h.fire('window','pointerup',{pointerType});h.fire('table','click',{pointerType});
    assert.deepEqual(h.selected,['b']);h.tap({pointerType});assert.deepEqual(h.selected,[],'the next deliberate tap still works');
  }
  const h=harness();h.fire('window','pointerdown');h.fire('window','pointerup',{clientX:60});h.fire('table','click');assert.deepEqual(h.selected,['b'],'release distance is rechecked');
});
test('scrolling, interruptions, changed layouts and changed selections invalidate a pending clear',()=>{
  for(const reason of ['scroll','wheel','resize','blur','pointercancel','multitouch','hidden','layout','selection','dialog','unavailable','expiry']){
    const h=harness();h.fire('window','pointerdown');
    if(reason==='multitouch')h.fire('window','pointerdown',{isPrimary:false,pointerId:2});
    else if(reason==='hidden'){h.doc.hidden=true;h.fire('document','visibilitychange');}
    else if(reason==='layout')h.changeLayout();
    else if(reason==='selection')h.setSelected(['a','b']);
    else if(reason==='dialog')h.openDialog();
    else if(reason==='unavailable')h.allow(false);
    else if(reason!=='expiry')h.fire('window',reason);
    h.fire('window','pointerup');if(reason==='expiry')h.advance(1001);h.fire('table','click');
    assert.equal(h.commits.length,0,reason);
  }
});
test('modifier, secondary, keyboard-generated, prevented clicks and scrollbar presses leave selection intact',()=>{
  for(const extra of [{shiftKey:true},{altKey:true},{ctrlKey:true},{metaKey:true},{button:2},{isPrimary:false},{detail:0},{defaultPrevented:true}]){
    const h=harness();h.tap(extra);assert.deepEqual(h.selected,['b'],JSON.stringify(extra));
  }
  for(const axis of ['x','y']){
    const h=harness();h.surface[axis==='x'?'clientWidth':'clientHeight']=250;
    h.tap(axis==='x'?{clientX:255}:{clientY:255});assert.deepEqual(h.selected,['b'],axis);
  }
});
test('Escape cancels a gesture first, clears selection next, and key repeat does not erase it',()=>{
  const h=harness();h.startGesture();const first=h.fire('document','keydown',{key:'Escape'});
  assert.equal(first.defaultPrevented,true);assert.equal(first.stopped,true);assert.deepEqual(h.selected,['b']);
  h.fire('document','keydown',{key:'Escape',repeat:true});assert.deepEqual(h.selected,['b']);
  h.fire('document','keydown',{key:'Escape'});assert.deepEqual(h.selected,[]);assert.equal(h.commits.length,1);
});
test('Escape belongs to dialogs, editable fields and IME composition',()=>{
  for(const reason of ['dialog','field','composition','prevented','modifier']){
    const h=harness();if(reason==='dialog')h.openDialog();
    const event=h.fire('document','keydown',{key:'Escape',...(reason==='field'?{target:{closest:()=>({})}}:{}),
      isComposing:reason==='composition',defaultPrevented:reason==='prevented',ctrlKey:reason==='modifier'});
    assert.deepEqual(h.selected,['b'],reason);assert.equal(event.stopped,undefined);
  }
});
test('explicit clear also cancels a held gesture so it cannot restore its old preview',()=>{
  const h=harness();h.startGesture();h.api.clear();h.api.choose('a');
  h.fire('document','keydown',{key:'Escape'});assert.deepEqual(h.selected,[],'no stale gesture consumes the next Escape');
});
test('Shift-click adds a range in displayed order without losing unrelated selections',()=>{
  const h=harness();h.setSelected(['d']);h.api.choose('a');h.api.choose('c',{shiftKey:true});
  assert.deepEqual(h.selected,['d','a','b','c']);h.api.choose('b',{shiftKey:true});assert.equal(h.selected.length,4);
  h.api.choose('b');assert.deepEqual(h.selected,['d','a','c'],'ordinary clicks toggle just one card');
});
test('a range anchor never crosses a reorder, round change, external selection, or explicit clear',()=>{
  for(const reason of ['layout','external','clear']){
    const h=harness();h.setSelected([]);h.api.choose('a');
    if(reason==='layout'){h.order.reverse();h.changeLayout();}
    if(reason==='external')h.setSelected(['a','d']);
    if(reason==='clear')h.api.clear();
    h.api.choose('c',{shiftKey:true});assert.equal(h.selected.includes('b'),false,reason);
  }
});
test('off-turn preparation is permitted by the supplied gate, while unavailable and foreign cards are ignored',()=>{
  const h=harness();h.api.choose('a');assert.deepEqual(h.selected,['b','a']);
  h.api.choose('foreign');h.allow(false);h.api.choose('c');assert.deepEqual(h.selected,['b','a']);
});
