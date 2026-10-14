'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const geometry=require('../web/app/hand-marquee.js');
const box=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top});
const face=(id,bounds)=>({id,polygon:geometry.facePolygon(bounds,bounds.width,bounds.height)});
test('window and crossing selection use visible faces, excluding covered card portions',()=>{
  const cards=[face('a',box(50,40,130,140)),face('b',box(90,40,170,140))],visible=geometry.visibleFaces(cards,box(0,0,500,300));
  assert.deepEqual(geometry.hitIds(visible,box(20,20,100,145),false),['a']);
  assert.deepEqual(geometry.hitIds(visible,box(120,20,180,145),true),['b'],'the covered half of a must not be selectable');
  assert.deepEqual(geometry.hitIds(visible,box(80,20,100,145),true),['a','b']);
  assert.deepEqual(geometry.hitIds(visible,box(80,20,100,145),false),[]);
  assert.deepEqual(geometry.hitIds(visible,box(20,20,180,145),false),['a','b']);
});
test('rotated bounding-box corners are empty, including under uniform desktop scaling',()=>{
  for(const scale of [0.6,1,1.5]){
    const span=Math.sqrt(2)*100*scale,bounds=box(0,0,span,span);
    const visible=geometry.visibleFaces([{id:'rotated',polygon:geometry.facePolygon(bounds,100,100,45)}],bounds);
    assert.deepEqual(geometry.hitIds(visible,box(0,0,10*scale,10*scale),true),[]);
    assert.deepEqual(geometry.hitIds(visible,box(span/2-2,0,span/2+2,5*scale),true),['rotated']);
    assert.deepEqual(geometry.hitIds(visible,bounds,false),['rotated']);
  }
});
test('clipped, fully covered and edge-only cards cannot create invisible hits',()=>{
  const visible=geometry.visibleFaces([face('hidden',box(-80,0,-1,100)),face('under',box(20,20,60,80)),face('front',box(0,0,100,100)),face('clipped',box(250,20,350,100))],box(0,0,300,300));
  assert.deepEqual(visible.map(c=>c.id),['front','clipped']);
  assert.deepEqual(geometry.hitIds(visible,box(100,0,120,100),true),[]);
  assert.deepEqual(geometry.hitIds(visible,box(240,10,300,110),false),['clipped']);
  assert.deepEqual(geometry.hitIds(visible,box(300,20,350,100),true),[]);
});

function harness(){
  const listeners=new Map(),made=[],commits=[],modes=[];
  function node(name){const classes=new Set();return {name,dataset:{},style:{},hidden:false,parentElement:null,
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},
    addEventListener(type,fn){const key=name+':'+type;listeners.set(key,[...(listeners.get(key)||[]),fn]);},
    closest:()=>null,append(){},setAttribute(){},querySelectorAll:()=>[],getBoundingClientRect:()=>box(0,0,500,300)};}
  const root=node('root'),scroll=node('scroll'),container=node('cards'),doc=node('document'),win=node('window');
  doc.body=node('body');doc.createElement=()=>{const el=node('made');made.push(el);return el;};
  Object.assign(scroll,{offsetWidth:500,offsetHeight:300,clientWidth:500,clientHeight:300,clientLeft:0,clientTop:0});
  let captured=null,signature='round:1|abcd',allowed=true,selection=new Set(['d']);
  scroll.setPointerCapture=id=>captured=id;scroll.hasPointerCapture=id=>captured===id;scroll.releasePointerCapture=()=>captured=null;
  const cards=['a','b','c','d'].map((id,i)=>{
    const el=node(id);el.dataset.id=id;const img=node('img'),x=50+(i%2)*40,y=i<2?40:180;
    img.getBoundingClientRect=()=>box(x,y,x+80,y+100);img.offsetWidth=80;img.offsetHeight=100;el.querySelector=()=>img;return el;
  });
  container.querySelectorAll=selector=>selector==='.marquee-hit'?cards.filter(el=>el.classList.contains('marquee-hit')):cards;
  const context={globalThis:{},document:doc,window:win,innerWidth:500,innerHeight:300,performance:{now:()=>1000},getComputedStyle:()=>({overflowX:'visible',overflowY:'visible',transform:'none'})};
  vm.runInNewContext(fs.readFileSync(require.resolve('../web/app/hand-marquee.js'),'utf8'),context);
  const api=context.globalThis.GuandanHandMarquee.create({root,scroll,container,canSelect:()=>allowed,getSignature:()=>signature,getSelected:()=>selection,
    onSelect:ids=>{commits.push([...ids]);selection=new Set(ids);},onModeChange:value=>modes.push(value)});
  const fire=(scope,type,extra={})=>{const event={button:0,isPrimary:true,pointerType:'mouse',pointerId:1,clientX:20,clientY:20,target:scroll,detail:1,preventDefault(){},stopImmediatePropagation(){},...extra};for(const fn of listeners.get(scope+':'+type)||[])fn(event);};
  return {api,root,scroll,doc,cards,made,commits,modes,fire,get selected(){return [...selection];},changeHand:()=>signature='round:2|abcd',disable:()=>allowed=false};
}
test('mouse boxes preview without changing selection, commit once, and Shift adds to the original selection',()=>{
  for(const shiftKey of [false,true]){
    const h=harness();h.fire('scroll','pointerdown',{shiftKey});h.fire('window','pointermove',{clientX:180,clientY:150});
    assert.equal(h.api.active,true);assert.deepEqual(h.selected,['d']);assert.equal(h.cards[0].classList.contains('marquee-hit'),true);
    h.fire('window','pointerup',{clientX:180,clientY:150});
    assert.deepEqual(h.selected,shiftKey?['d','a','b']:['a','b']);assert.equal(h.api.active,false);assert.equal(h.commits.length,1);
    h.fire('window','pointerup');assert.equal(h.commits.length,1);
  }
});
test('right-to-left crossing selects a partially touched card in either shelf',()=>{
  const h=harness();h.fire('scroll','pointerdown',{clientX:180,clientY:20});h.fire('window','pointermove',{clientX:120,clientY:285});h.fire('window','pointerup',{clientX:120,clientY:285});
  assert.deepEqual(h.selected,['b','d']);
});
test('stationary clicks, touch panning, card reordering, secondary buttons and scrollbars do not start a box',()=>{
  const cases=[{pointerType:'touch'},{pointerType:'pen'},{button:2},{isPrimary:false},{target:{closest:()=>({})}},{clientX:120,clientY:70},{clientX:499,clientY:295}];
  for(const start of cases){const h=harness();h.scroll.clientHeight=290;h.fire('scroll','pointerdown',start);h.fire('window','pointermove',{clientX:180,clientY:150});h.fire('window','pointerup',{clientX:180,clientY:150});assert.deepEqual(h.selected,['d']);assert.equal(h.commits.length,0);}
  const h=harness();h.fire('scroll','pointerdown');h.fire('window','pointermove',{clientX:22,clientY:23});h.fire('window','pointerup',{clientX:22,clientY:23});assert.equal(h.commits.length,0);
});
test('interruption discards preview and cannot resurrect selection after a new round or changed hand',()=>{
  for(const reason of ['pointercancel','blur','resize','scroll','Escape','hidden','hand','unavailable','lostcapture']){
    const h=harness();h.fire('scroll','pointerdown');h.fire('window','pointermove',{clientX:180,clientY:150});assert.equal(h.api.active,true);
    if(reason==='Escape')h.fire('document','keydown',{key:'Escape'});
    else if(reason==='hidden'){h.doc.hidden=true;h.fire('document','visibilitychange');}
    else if(reason==='hand'){h.changeHand();h.api.reconcile();}
    else if(reason==='unavailable'){h.disable();h.api.reconcile();}
    else if(reason==='lostcapture'){h.scroll.releasePointerCapture();h.fire('window','lostpointercapture');}
    else h.fire('window',reason);
    h.fire('window','pointerup',{clientX:180,clientY:150});assert.equal(h.api.active,false,reason);assert.deepEqual(h.selected,['d'],reason);assert.equal(h.commits.length,0,reason);assert.equal(h.made[0].hidden,true,reason);
  }
});
test('release revalidates the hand and the trailing click cannot toggle a card, but a fresh press can',()=>{
  const h=harness();h.fire('scroll','pointerdown');h.fire('window','pointermove',{clientX:180,clientY:150});h.fire('window','pointerup',{clientX:180,clientY:150});
  let blocked=0;h.fire('scroll','click',{preventDefault(){blocked++;}});assert.equal(blocked,1);
  h.fire('scroll','pointerdown',{target:{closest:()=>({})}});h.fire('scroll','click',{preventDefault(){blocked++;}});assert.equal(blocked,1);
  const changed=harness();changed.fire('scroll','pointerdown');changed.fire('window','pointermove',{clientX:180,clientY:150});changed.changeHand();changed.fire('window','pointerup',{clientX:180,clientY:150});assert.equal(changed.commits.length,0);
});
test('non-overlay scrollbars exclude invisible card pixels from full-window selection',()=>{
  for(const axis of ['x','y']){
    const h=harness();
    if(axis==='x'){
      h.scroll.clientWidth=480;h.cards[0].querySelector().getBoundingClientRect=()=>box(470,40,550,140);
      h.fire('scroll','pointerdown',{clientX:460,clientY:20});h.fire('window','pointermove',{clientX:480,clientY:150});h.fire('window','pointerup',{clientX:480,clientY:150});
    }else{
      h.scroll.clientHeight=280;h.cards[0].querySelector().getBoundingClientRect=()=>box(300,250,380,350);
      h.fire('scroll','pointerdown',{clientX:290,clientY:240});h.fire('window','pointermove',{clientX:390,clientY:280});h.fire('window','pointerup',{clientX:390,clientY:280});
    }
    assert.deepEqual(h.selected,['a'],axis);
  }
});
test('a fresh touch or pen press is not swallowed by the preceding mouse box click guard',()=>{
  for(const pointerType of ['mouse','touch','pen']){
    const h=harness();h.fire('scroll','pointerdown');h.fire('window','pointermove',{clientX:180,clientY:150});h.fire('window','pointerup',{clientX:180,clientY:150});
    h.fire('scroll','pointerdown',{pointerType,target:{closest:()=>({})}});let blocked=0;
    h.fire('scroll','click',{pointerType,preventDefault(){blocked++;}});assert.equal(blocked,0,pointerType);
  }
});
