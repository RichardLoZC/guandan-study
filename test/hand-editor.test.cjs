'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const layout=require('../web/app/hand-layout.js');
function harness(handStyle='fan'){
 const listeners=new Map(),flags=new Set(),selected=new Set(),selections=[],commits=[];
 function node(name){const attrs={};return {name,hidden:false,disabled:false,style:{},classList:{add(){},remove(){}},setAttribute:(k,v)=>attrs[k]=v,
  addEventListener(type,fn){const key=name+':'+type;listeners.set(key,[...(listeners.get(key)||[]),fn]);},append(){},replaceChildren(){},querySelectorAll:()=>[],querySelector:()=>null,
  setPointerCapture(){},hasPointerCapture:()=>false,releasePointerCapture(){},attrs};}
 const root=node('root');root.dataset={handStyle};root.classList={add:x=>flags.add(x),remove:x=>flags.delete(x),contains:x=>flags.has(x),toggle(x,value){value?flags.add(x):flags.delete(x);}};
 const doc=node('document');doc.body=node('body');doc.createElement=()=>node('made');doc.querySelector=()=>null;
 const win=node('window'),container=node('cards'),scroll=node('scroll'),undoButton=node('undo');
 let hand=['a','b','c','d'].map(id=>({id,face:'face'})),current={version:1,key:'r',rows:[['a','b'],['c','d']],groups:[]},target={row:1,index:1,x:100,y:100,height:60};
 scroll.scrollLeft=0;scroll.getBoundingClientRect=()=>({left:0,right:1280,top:0,bottom:240});
 container.querySelectorAll=selector=>selector==='.card-row'?current.rows.map((ids,row)=>({
  classList:{toggle(){}},getBoundingClientRect:()=>({left:0,right:1280,width:1280,top:row*82,height:row===0?82:126}),
  querySelectorAll:()=>ids.map((id,index)=>({getBoundingClientRect:()=>({left:50+index*40,right:50+index*40+(index===ids.length-1?84:40),top:row*82,width:index===ids.length-1?84:40})}))
 })):[];
 let now=1000;const modes=[];
 const context={window:win,document:doc,GuandanHandLayout:layout,GuandanHandStack:require('../web/app/hand-stack.js'),performance:{now:()=>now},innerWidth:1280,innerHeight:720,CSS:{escape:s=>s},getComputedStyle:()=>({getPropertyValue:()=> '40px'}),cancelAnimationFrame(){},requestAnimationFrame(){return 1;}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/app/hand-editor.js'),'utf8'),context);
 const editor=win.createHandEditor({root,container,scroll,undoButton,getLayout:()=>current,getHand:()=>hand,getSelected:()=>selected,
  getLevel:()=> '2',onArrange:ids=>ids.forEach(id=>selected.delete(id)),canEdit:()=>hand.length>0,commit:next=>{commits.push(next);current=next;},onModeChange:value=>modes.push(value),curvedTarget:()=>target,imageFor:()=>node('img')});
 editor.reconcile();
 const event=(extra={})=>({button:0,isPrimary:true,pointerId:1,clientX:50,clientY:50,currentTarget:node('canvas'),preventDefault(){},...extra});
 const fire=(type,extra={})=>{const e=event(extra);for(const fn of listeners.get('window:'+type)||[])fn(e);};
 function advance(ms){now+=ms;}
 const fireDocument=(type,extra={})=>{for(const fn of listeners.get('document:'+type)||[])fn(event(extra));};
 const fireCard=(type,extra={})=>{const e=event(extra);for(const fn of listeners.get('cards:'+type)||[])fn(e);};
 return {editor,event,fire,advance,fireDocument,fireCard,modes,selected,selections,commits,root,container,scroll,undoButton,doc,undo:()=>listeners.get('undo:click')[0](),setHand:value=>hand=value,setLayout:value=>current=value,setTarget:value=>target=value,get current(){return current;}};
}
test('taps remain native button clicks while a drag reorders the selected group without selecting',()=>{
 const h=harness();h.editor.start(h.event(),'a',true);h.fire('pointerup');assert.deepEqual(h.selections,[]);assert.equal(h.commits.length,0);
 h.selected.add('a').add('b');h.editor.start(h.event(),'a',true);h.fire('pointermove',{clientX:100});h.fire('pointerup',{clientX:100});
 assert.deepEqual(h.current.rows,[[],['c','a','b','d']]);assert.deepEqual(h.selections,[]);h.undo();assert.deepEqual(h.current.rows,[['a','b'],['c','d']]);
});
test('cancelled drags and drops outside the hand leave cards and selection unchanged',()=>{
 for(const end of ['pointercancel','blur','resize','lostpointercapture']){
  const h=harness();h.selected.add('a').add('b');h.editor.start(h.event(),'a',true);h.advance(450);h.fire('pointermove',{clientX:100});h.fire(end);assert.deepEqual([...h.selected],['a','b']);h.fire('pointerup',{clientX:100});assert.equal(h.commits.length,0,end);assert.equal(h.selections.length,0,end);
 }
 const h=harness();h.setTarget(null);h.editor.start(h.event(),'a',true);h.advance(450);h.fire('pointermove',{clientX:100});h.fire('pointerup',{clientX:100});assert.equal(h.commits.length,0);
});
test('a changed hand or new round cancels a drag rather than restoring departed cards',()=>{
 for(const change of [h=>h.setHand([{id:'b',face:'face'}]),h=>h.setLayout({...h.current,key:'new-round'})]){
  const h=harness();h.editor.start(h.event(),'a',true);h.advance(450);h.fire('pointermove',{clientX:100});change(h);h.editor.reconcile();h.fire('pointerup',{clientX:100});assert.equal(h.commits.length,0);assert.equal(h.selections.length,0);
 }
});
test('non-primary pointers and cards outside the hand cannot start an edit',()=>{
 const h=harness();assert.equal(h.editor.start(h.event({isPrimary:false}),'a',true),false);assert.equal(h.editor.start(h.event(),'opponent-card',true),false);
 assert.equal(h.editor.start(h.event(),'a',true),true);h.editor.cancel();
});
test('a short curved press leaves selection to the native button and clears the gesture',()=>{
 const h=harness();h.editor.start(h.event(),'a',true);h.advance(300);h.fire('pointerup');h.advance(1000);
 assert.deepEqual(h.selections,[]);assert.equal(h.editor.editing,false);assert.equal(h.editor.active,false);assert.equal(h.commits.length,0);
});
test('dragging immediately moves the selection, returns to normal selection and can be undone directly',()=>{
 const h=harness();h.selected.add('a').add('b');h.editor.start(h.event(),'a',true);
 assert.equal(h.editor.editing,false);
 h.fire('pointermove',{clientX:100});assert.equal(h.editor.editing,true);h.fire('pointerup',{clientX:100});
 assert.deepEqual(h.current.rows,[[],['c','a','b','d']]);assert.equal(h.editor.editing,false);assert.deepEqual(h.modes,[true,false]);
 assert.deepEqual([...h.selected],[]);assert.equal(h.selections.length,0);assert.equal(h.undoButton.hidden,false);
 h.undo();assert.deepEqual(h.current.rows,[['a','b'],['c','d']]);assert.equal(h.undoButton.hidden,false);assert.equal(h.undoButton.disabled,true);
 h.editor.start(h.event(),'c',true);h.fire('pointerup');assert.deepEqual(h.selections,[]);
});
test('stationary presses and tiny jitter remain clicks, regardless of press duration',()=>{
 for(const duration of [0,100,500,3000]){
  const h=harness();h.editor.start(h.event(),'a',true);h.advance(duration);h.fire('pointermove',{clientX:52,clientY:53});
  assert.equal(h.editor.editing,false);assert.equal(h.selections.length,0);h.fire('pointerup');
  assert.equal(h.commits.length,0);assert.deepEqual(h.selections,[]);assert.deepEqual(h.modes,[]);
 }
});
test('mouse, touch and pen drags start on the first deliberate movement without a time threshold',()=>{
 for(const pointerType of ['mouse','touch','pen'])for(const style of ['flat','fan']){
  const h=harness(style);h.editor.start(h.event({pointerType}),'a');
  h.fire('pointermove',{pointerType,clientX:55});assert.equal(h.editor.editing,false);
  h.fire('pointermove',{pointerType,clientX:56});assert.equal(h.editor.editing,true);
  h.fire('pointerup',{pointerType,clientX:75,clientY:110});assert.equal(h.editor.editing,false);
  assert.deepEqual(h.current.rows,[['b'],['c','a','d']]);assert.equal(h.selections.length,0);
 }
});
test('a pending press or active drag cancels on interruption and cannot commit later',()=>{
 for(const dragging of [false,true])for(const end of ['pointercancel','blur','resize','lostpointercapture','escape','hidden','second-touch']){
  const h=harness();h.editor.start(h.event(),'a',true);if(dragging)h.fire('pointermove',{clientX:100});
  if(end==='escape')h.fireDocument('keydown',{key:'Escape'});
  else if(end==='hidden'){h.doc.hidden=true;h.fireDocument('visibilitychange');}
  else if(end==='second-touch')h.fire('pointerdown',{pointerId:2,isPrimary:false});
  else h.fire(end);
  h.advance(1000);h.fire('pointermove',{clientX:100});h.fire('pointerup',{clientX:100});
  assert.equal(h.editor.editing,false,end);assert.equal(h.commits.length,0,end);assert.equal(h.selections.length,0,end);
 }
});
test('new cards or a new round invalidate presses both before and after a drag starts',()=>{
 for(const dragging of [false,true])for(const change of [h=>h.setHand([{id:'b',face:'face'}]),h=>h.setLayout({...h.current,key:'new-round'})]){
  const h=harness();h.editor.start(h.event(),'a',true);if(dragging)h.fire('pointermove',{clientX:100});change(h);h.editor.reconcile();h.advance(1000);h.fire('pointerup');
  assert.equal(h.editor.editing,false);assert.equal(h.commits.length,0);assert.equal(h.selections.length,0);
 }
});
test('flat short presses leave selection to the native click and do not capture the pointer',()=>{
 const h=harness();h.editor.start(h.event(),'a');h.fire('pointerup');h.advance(1000);
 assert.equal(h.editor.editing,false);assert.equal(h.selections.length,0);assert.equal(h.commits.length,0);
});
test('transferring implicit touch capture to the drag owner does not cancel the drag',()=>{
 const h=harness(),event=h.event();h.editor.start(event,'a',true);h.fire('pointermove',{clientX:100});
 h.scroll.hasPointerCapture=()=>true;h.fire('lostpointercapture');assert.equal(h.editor.editing,true);
 h.fire('pointermove',{clientX:100});h.fire('pointerup',{clientX:100});assert.equal(h.commits.length,1);assert.equal(h.editor.editing,false);
});
test('the trailing drag click is suppressed but an immediate fresh press can select normally',()=>{
 const h=harness();h.editor.start(h.event(),'a',true);h.advance(450);h.fire('pointermove',{clientX:100});h.fire('pointerup',{clientX:100});
 let blocked=0;const click={detail:1,preventDefault(){blocked++;},stopImmediatePropagation(){}};
 h.fireCard('click',click);assert.equal(blocked,1);
 h.editor.start(h.event(),'b');h.fire('pointerup');h.fireCard('click',click);assert.equal(blocked,1);
});
test('keyboard arrangement works directly without entering a mode',()=>{
 const h=harness(),card={dataset:{id:'a'}};
 h.fireCard('keydown',{target:{closest:()=>card},altKey:true,key:'ArrowDown'});
 assert.deepEqual(h.current.rows,[['b'],['a','c','d']]);assert.equal(h.editor.editing,false);
 h.undo();assert.deepEqual(h.current.rows,[['a','b'],['c','d']]);
});

test('flat dragging computes the actual lower row insertion and can populate an empty upper row',()=>{
 const h=harness('flat');h.editor.start(h.event(),'a');h.fire('pointermove',{clientX:170,clientY:115});h.fire('pointerup',{clientX:170,clientY:115});
 assert.deepEqual(h.current.rows,[['b'],['c','d','a']]);
 h.setLayout({...h.current,rows:[[],['c','d','a','b']]});
 h.editor.start(h.event({clientX:90,clientY:100}),'d');h.fire('pointermove',{clientX:400,clientY:30});h.fire('pointerup',{clientX:400,clientY:30});
 assert.deepEqual(h.current.rows,[['d'],['c','a','b']]);
});

test('automatic arrangement and rank reset share undo without changing the selection',()=>{
 const h=harness();h.selected.add('a');const before=structuredClone(h.current);
 const automatic={...before,source:'auto',rows:[['a','c'],['b','d']],groups:[{label:'pair',ids:['a','c']}]};
 assert.equal(h.editor.replace(automatic),true);assert.equal(h.undoButton.disabled,false);
 assert.equal(h.editor.replace(structuredClone(automatic)),false);h.undo();assert.deepEqual(h.current.rows,before.rows);assert.deepEqual([...h.selected],['a']);
 h.editor.replace(automatic);const ranked=layout.create('r',[{id:'a'},{id:'b'},{id:'c'},{id:'d'}]);h.editor.replace(ranked);
 h.undo();assert.deepEqual(h.current.rows,automatic.rows);assert.deepEqual(h.current.groups,automatic.groups);
});
test('lower-row arrangement and sorting undo without moving reserved upper cards',()=>{
 const h=harness(),hand=['a','b','c','d'].map(id=>({id}));
 h.setLayout({...h.current,source:'manual',rows:[['b','a'],['d','c']],groups:[{ids:['b','a'],label:'reserved'}]});
 const before=structuredClone(h.current);h.selected.add('b');
 const plan={groups:[{ids:['c','d'],label:'lower pair'}]};
 h.editor.replace(layout.fromPlan('r',hand,plan,h.current));
 assert.deepEqual(h.current.rows,[['b','a'],['c','d']]);assert.deepEqual(h.current.groups[0],before.groups[0]);
 const automatic=structuredClone(h.current);h.editor.replace(layout.fromPlan('r',hand,null,h.current));
 assert.deepEqual(h.current.groups,before.groups);h.undo();assert.deepEqual(h.current,automatic);
 assert.deepEqual([...h.selected],['b']);
});
test('a successful drop clears moved selection but not unrelated selected cards',()=>{
 const h=harness();h.selected.add('a').add('b');
 h.editor.start(h.event(),'c');h.fire('pointermove',{clientX:100});h.fire('pointerup',{clientX:100});
 assert.deepEqual([...h.selected],['a','b']);
 h.setTarget({row:0,index:0,x:100,y:50,height:60});h.editor.start(h.event(),'a');h.fire('pointermove',{clientX:100});h.fire('pointerup',{clientX:100});
 assert.deepEqual([...h.selected],[]);assert.deepEqual(h.current.groups,[{ids:['a','b'],label:''}]);
 h.undo();assert.deepEqual(h.current.groups,[]);assert.deepEqual([...h.selected],[]);
});
test('an automatic arrangement undo expires when cards depart or a new round starts',()=>{
 for(const change of [h=>h.setHand([{id:'b',face:'face'}]),h=>h.setLayout({...h.current,key:'new'})]){
  const h=harness();h.editor.replace({...h.current,rows:[[],['a','b','c','d']]});change(h);h.editor.reconcile();
  assert.equal(h.undoButton.disabled,true);h.undo();assert.equal(h.commits.length,1);
 }
});
test('Escape protects the eventual release click even after a long hold, until the next physical press',()=>{
 for(const pointerType of ['mouse','touch','pen']){
  const h=harness();h.selected.add('a').add('b');h.editor.start(h.event({pointerType}),'a');
  h.fire('pointermove',{clientX:100});h.fireDocument('keydown',{key:'Escape'});h.advance(5000);h.fire('pointerup');
  let blocked=0;h.fireCard('click',{detail:1,preventDefault(){blocked++;},stopImmediatePropagation(){}});
  assert.equal(blocked,1);assert.deepEqual([...h.selected],['a','b']);assert.equal(h.commits.length,0);
  h.fire('pointerdown',{pointerType});h.fireCard('click',{detail:1,preventDefault(){blocked++;},stopImmediatePropagation(){}});
  assert.equal(blocked,1,'a new press on either a card or blank hand space resets suppression');
 }
});
test('dropping on a visible group face merges and sorts it even when the curved insertion marker picked the other shelf',()=>{
 const h=harness(),ids=['a','b','c','d'];
 h.setHand(ids.map((id,i)=>({id,face:'face',rank:'8',suit:['clubs','hearts','spades','diamonds'][i],isWild:false})));
 const original={...h.current,rows:[['a','b','c'],['d']],groups:[{ids:['a','b','c'],label:'三张 8'}],source:'manual'};
 h.setLayout(original);h.setTarget({row:1,index:0,x:100,y:110,height:60});
 const card={dataset:{id:'c'}};h.doc.elementFromPoint=()=>({closest:selector=>selector==='.playing-card'?card:null});
 h.selected.add('d');h.editor.start(h.event(),'d');h.fire('pointermove',{clientX:100});h.fire('pointerup',{clientX:100});
 assert.equal(h.current.groups.length,1);assert.equal(h.current.groups[0].label,'4 张炸 8');
 assert.equal(h.current.rows[0].length,4);assert.deepEqual(h.current.rows[1],[]);assert.equal(h.selected.size,0);
 h.undo();assert.deepEqual(h.current,original);
});

test('phone stack dragging and undo never create an invisible upper row',()=>{
 const h=harness('stack');h.root.dataset.phone='true';h.setLayout({...h.current,rows:[[],['a','b','c','d']]});
 const oldQuery=h.container.querySelectorAll;
 h.container.querySelectorAll=selector=>selector==='.stack-column'?[
  {getBoundingClientRect:()=>({left:50,right:90}),querySelectorAll:()=>['a','b','c'].map((id,index)=>({dataset:{id},getBoundingClientRect:()=>({top:40+index*22,bottom:106+index*22})}))},
  {getBoundingClientRect:()=>({left:100,right:140}),querySelectorAll:()=>[{dataset:{id:'d'},getBoundingClientRect:()=>({top:84,bottom:150})}]}
 ]:oldQuery(selector);
 h.editor.reconcile();h.selected.add('a').add('b');h.editor.start(h.event({clientY:45}),'a');h.fire('pointermove',{clientX:120,clientY:140});h.fire('pointerup',{clientX:120,clientY:140});
 assert.deepEqual(h.current.rows,[[],['c','d','a','b']]);assert.equal(h.selected.size,0);h.undo();assert.deepEqual(h.current.rows,[[],['a','b','c','d']]);
 h.fireCard('keydown',{key:'ArrowUp',altKey:true,target:{closest:()=>({dataset:{id:'a'}})}});
 assert.deepEqual(h.current.rows,[[],['a','b','c','d']]);
});
