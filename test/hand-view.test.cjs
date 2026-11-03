'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness(savedStyle='flat'){
 const elements=new Map(),writes=[];let style=savedStyle,cancelled=0,layouts=0;
 function node(id){const values=new Map();return {id,dataset:{},attrs:{},listeners:{},textContent:'',style:{setProperty:(k,v)=>values.set(k,String(v)),removeProperty:k=>values.delete(k)},setAttribute(k,v){this.attrs[k]=v;},addEventListener(type,fn){this.listeners[type]=fn;},querySelector(){return null;},querySelectorAll(){return [];}};}
 const el=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id);};
 const root=el('root'),win={GuandanTable:{handStyle:()=>style,setHandStyle(s){style=s;writes.push(s);},cancelDrag(){cancelled++;},layout(){layouts++;}},addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/app/table-view.js'),'utf8'),{window:win,document:{documentElement:root,getElementById:el},ResizeObserver:class{observe(){}disconnect(){}}});
 return {root,el,win,writes,get cancelled(){return cancelled;},get layouts(){return layouts;},click:id=>el(id).listeners.click()};
}
test('old curved preferences migrate to the shared stack view on every platform',()=>{
 const h=harness('fan');assert.equal(h.root.dataset.handStyle,'stack');assert.equal(h.el('hand-fan').textContent,'叠牌');assert.equal(h.el('hand-fan').attrs['aria-pressed'],'true');assert.equal(h.writes.length,0);
});
test('switching flat and stacks retains the selected style and never exposes curved targets',()=>{
 const h=harness();for(let i=0;i<10;i++){h.click('hand-fan');assert.equal(h.root.dataset.handStyle,'stack');h.click('hand-flat');assert.equal(h.root.dataset.handStyle,'flat');}
 assert.equal(h.win.tableView.dropTarget(1,1),null);assert.equal(h.cancelled,21);assert.equal(h.layouts,21);assert.equal(h.writes.length,20);
});
