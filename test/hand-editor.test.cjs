'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const layout=require('../web/app/hand-layout.js');
function harness(){
 const listeners=new Map(),flags=new Set(['view-3d']),selected=new Set(),selections=[],commits=[];
 function node(name){const attrs={};return {name,hidden:false,disabled:false,style:{},classList:{add(){},remove(){}},setAttribute:(k,v)=>attrs[k]=v,
  addEventListener(type,fn){const key=name+':'+type;listeners.set(key,[...(listeners.get(key)||[]),fn]);},append(){},replaceChildren(){},querySelectorAll:()=>[],querySelector:()=>null,
  setPointerCapture(){},hasPointerCapture:()=>false,releasePointerCapture(){},attrs};}
 const root=node('root');root.classList={add:x=>flags.add(x),remove:x=>flags.delete(x),contains:x=>flags.has(x),toggle(x,value){value?flags.add(x):flags.delete(x);}};
 const doc=node('document');doc.body=node('body');doc.createElement=()=>node('made');doc.querySelector=()=>null;
 const win=node('window'),container=node('cards'),scroll=node('scroll'),toggle=node('toggle'),undoButton=node('undo');
 let hand=['a','b','c','d'].map(id=>({id,face:'face'})),current={version:1,key:'r',rows:[['a','b'],['c','d']],groups:[]},target={row:1,index:1,x:100,y:100,height:60};
 const context={window:win,document:doc,GuandanHandLayout:layout,performance:{now:()=>1},innerWidth:1280,innerHeight:720,CSS:{escape:s=>s},cancelAnimationFrame(){},requestAnimationFrame(){return 1;}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/app/hand-editor.js'),'utf8'),context);
 const editor=win.createHandEditor({root,container,scroll,toggle,undoButton,help:node('help'),getLayout:()=>current,getHand:()=>hand,getSelected:()=>selected,
  canEdit:()=>hand.length>0,commit:next=>{commits.push(next);current=next;},select:id=>selections.push(id),onModeChange(){},spatial:()=>({dropTarget:()=>target}),imageFor:()=>node('img')});
 editor.reconcile();editor.setEditing(true);
 const event=(extra={})=>({button:0,isPrimary:true,pointerId:1,clientX:50,clientY:50,currentTarget:node('canvas'),preventDefault(){},...extra});
 const fire=(type,extra={})=>{const e=event(extra);for(const fn of listeners.get('window:'+type)||[])fn(e);};
 return {editor,event,fire,selected,selections,commits,root,undo:()=>listeners.get('undo:click')[0](),setHand:value=>hand=value,setLayout:value=>current=value,setTarget:value=>target=value,get current(){return current;}};
}
test('a tap selects once, while a drag reorders the selected group without triggering a play selection',()=>{
 const h=harness();h.editor.start(h.event(),'a',true);h.fire('pointerup');assert.deepEqual(h.selections,['a']);assert.equal(h.commits.length,0);
 h.selected.add('a').add('b');h.editor.start(h.event(),'a',true);h.fire('pointermove',{clientX:100});h.fire('pointerup',{clientX:100});
 assert.deepEqual(h.current.rows,[[],['c','a','b','d']]);assert.deepEqual(h.selections,['a']);h.undo();assert.deepEqual(h.current.rows,[['a','b'],['c','d']]);
});
test('cancelled drags and drops outside the hand leave cards and selection unchanged',()=>{
 for(const end of ['pointercancel','blur','resize','lostpointercapture']){
  const h=harness();h.editor.start(h.event(),'a',true);h.fire('pointermove',{clientX:100});h.fire(end);h.fire('pointerup',{clientX:100});assert.equal(h.commits.length,0,end);assert.equal(h.selections.length,0,end);
 }
 const h=harness();h.setTarget(null);h.editor.start(h.event(),'a',true);h.fire('pointermove',{clientX:100});h.fire('pointerup',{clientX:100});assert.equal(h.commits.length,0);
});
test('a changed hand or new round cancels a drag rather than restoring departed cards',()=>{
 for(const change of [h=>h.setHand([{id:'b',face:'face'}]),h=>h.setLayout({...h.current,key:'new-round'})]){
  const h=harness();h.editor.start(h.event(),'a',true);h.fire('pointermove',{clientX:100});change(h);h.editor.reconcile();h.fire('pointerup',{clientX:100});assert.equal(h.commits.length,0);assert.equal(h.selections.length,0);
 }
});
test('non-primary pointers and cards outside the hand cannot start an edit',()=>{
 const h=harness();assert.equal(h.editor.start(h.event({isPrimary:false}),'a',true),false);assert.equal(h.editor.start(h.event(),'opponent-card',true),false);
 h.editor.setEditing(false);assert.equal(h.editor.start(h.event(),'a',true),false);
});
