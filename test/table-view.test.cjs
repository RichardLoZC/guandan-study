'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const geometry=require('../web/app/hand-fan.js');
function harness(savedStyle='flat'){
 const elements=new Map(),writes=[],selected=new Set(['c3']);let cancelled=0,layouts=0,style=savedStyle;
 function node(id){
  const values=new Map();return {id,clientWidth:1200,offsetWidth:84,offsetHeight:126,dataset:{},attrs:{},listeners:{},
   style:{setProperty:(k,v)=>values.set(k,String(v)),removeProperty:k=>values.delete(k),getPropertyValue:k=>values.get(k)||''},
   setAttribute(k,v){this.attrs[k]=v;},addEventListener(type,fn){this.listeners[type]=fn;},
   getBoundingClientRect:()=>({left:0,top:0,right:1200,bottom:250,width:1200,height:250})};
 }
 const el=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id);};
 const cards=Array.from({length:27},(_,i)=>node('c'+i));
 const rows=[node('upper'),node('lower')];rows[0].querySelectorAll=()=>[];rows[1].querySelectorAll=selector=>!selector||selector==='.playing-card'?cards:[];
 el('hand-cards').querySelectorAll=()=>rows;
 const root=el('root'),win={GuandanTable:{handStyle:()=>style,setHandStyle(s){style=s;writes.push(s);},cancelDrag(){cancelled++;},layout(){layouts++;}},addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/app/table-view.js'),'utf8'),{
  window:win,document:{documentElement:root,getElementById:el},GuandanHandFan:geometry,
  getComputedStyle:node=>({getPropertyValue:key=>node.style.getPropertyValue(key)||({'--hand-card-width':'84px','--hand-card-height':'126px','--hand-step':'40px'}[key]||'')}),
  ResizeObserver:class{observe(){}disconnect(){}}
 });
 return {root,cards,rows,selected,writes,el,win,get cancelled(){return cancelled;},get layouts(){return layouts;},click:id=>el(id).listeners.click()};
}
test('old preferences default to flat without rewriting the save and a saved curved style restores',()=>{
 const a=harness(undefined);assert.equal(a.root.dataset.handStyle,'flat');assert.equal(a.el('hand-flat').attrs['aria-pressed'],'true');assert.equal(a.writes.length,0);
 const b=harness('fan');assert.equal(b.root.dataset.handStyle,'fan');assert.equal(b.el('hand-fan').attrs['aria-pressed'],'true');assert.ok(b.cards[0].style.getPropertyValue('--fan-angle'));assert.equal(b.rows[0].querySelectorAll().length,0);
});
test('twenty layout switches retain the same card buttons, lower row order and chosen cards',()=>{
 const h=harness(),original=[...h.cards];
 for(let i=0;i<20;i++){
  h.click('hand-fan');assert.equal(h.root.dataset.handStyle,'fan');assert.ok(h.cards[0].style.getPropertyValue('--fan-angle'));
  h.click('hand-flat');assert.equal(h.root.dataset.handStyle,'flat');assert.equal(h.cards[0].style.getPropertyValue('--fan-angle'),'');
 }
 assert.deepEqual(h.cards,original);assert.deepEqual([...h.selected],['c3']);assert.equal(h.rows[0].querySelectorAll().length,0);assert.equal(h.cancelled,41);assert.equal(h.layouts,41);assert.equal(h.writes.length,40);
});
test('flat view delegates to the ordinary editor and curved hits exclude controls outside the hand',()=>{
 const h=harness();assert.equal(h.win.tableView.dropTarget(500,200),null);
 h.click('hand-fan');assert.equal(h.win.tableView.dropTarget(500,300),null);
});
