'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const layout=require('../web/app/hand-layout.js');
const source=fs.readFileSync(require.resolve('../web/app/table.js'),'utf8');
const hand=['a','b','c','d','e'].map(id=>({id}));
const saved={version:1,key:'solo:r|0',source:'manual',rows:[['c','a'],['d','b']],groups:[{ids:['c','a'],label:'手动组合'}]};
test('legacy manual shelves merge into one region without losing tribute arrivals or physical cards',()=>{
 const original=structuredClone(saved),next=layout.singleRow(saved,saved.key,hand);
 assert.deepEqual(next.rows,[[],['c','a','d','b','e']]);assert.deepEqual(next.groups,saved.groups);assert.deepEqual(saved,original);
 const afterPlay=layout.singleRow(next,saved.key,hand.filter(c=>c.id!=='a'));
 assert.deepEqual(afterPlay.rows,[[],['c','d','b','e']]);assert.equal(afterPlay.groups.length,0);
});
test('obsolete automatic plans become one rank-sorted hand and cannot return on reload',()=>{
 const next=layout.singleRow({...saved,source:'auto'},saved.key,hand),data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 assert.deepEqual(next.rows,[[],hand.map(c=>c.id)]);assert.deepEqual(next.groups,[]);
 layout.save(storage,next);assert.deepEqual(layout.singleRow(layout.load(storage,saved.key,hand),saved.key,hand),next);
});
test('single-row migration rejects stale IDs, duplicates and foreign round layouts',()=>{
 const dirty={...saved,rows:[['a','a','foreign'],['a','b','c']]};
 const fixed=layout.singleRow(dirty,saved.key,hand);assert.deepEqual(fixed.rows,[[],hand.map(c=>c.id)]);
 assert.deepEqual(layout.singleRow(saved,'new-round',hand).rows,[[],hand.map(c=>c.id)]);
});
function controller(){
 const nodes=new Map(),data=new Map();
 const c={liveRound:{id:'r',playerIds:[0,1,2,3],hand,game:{}},handLayout:structuredClone(saved),GuandanHandLayout:layout,
  localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},selected:new Set(['a']),window:{},dealMotion:{active:false},handMarquee:null,
  byId:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);},resizeHand(){},renderHand(){},toast(){}};
 c.handEditor={editing:false,replace(next){this.undo=c.currentLayout();c.commitLayout(next);}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function layoutKey('),source.indexOf('const canPlay='))+source.slice(source.indexOf('const canPrepare='),source.indexOf('const hasOpenDialog=')),c);
 return {c,nodes,data};
}
test('rank sort covers the whole migrated hand and undo restores its manual order',()=>{
 const {c}=controller(),before=JSON.stringify(c.liveRound),manual=c.currentLayout();
 c.sortHand();assert.deepEqual(c.currentLayout().rows,[[],hand.map(c=>c.id)]);assert.deepEqual([...c.selected],['a']);
 c.commitLayout(c.handEditor.undo);assert.deepEqual(c.currentLayout().rows,manual.rows);assert.equal(JSON.stringify(c.liveRound),before);
});
test('mobile rank stacks and finished deals cannot invoke manual sort',()=>{
 const {c,nodes}=controller();c.window.GuandanPhone={active:true};c.sortHand();c.renderArrangement();
 assert.deepEqual(c.currentLayout().rows,[[],hand.map(c=>c.id)]);assert.equal(c.handEditor.undo,undefined);assert.equal(nodes.get('sort-hand').disabled,true);
 c.window.GuandanPhone.active=false;c.liveRound.game.result={};c.sortHand();assert.equal(c.handEditor.undo,undefined);
});
