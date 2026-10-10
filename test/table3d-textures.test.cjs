'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const presentation=require('../web/app/presentation.js');
function harness(){
 const source=fs.readFileSync(path.join(__dirname,'../web/app/table3d.js'),'utf8');
 const update=source.slice(source.indexOf('  async function updateTextures('),source.indexOf('  const bandGeometry='));
 const setState=source.slice(source.indexOf('  function setState('),source.indexOf('  function resize('));
 const waits=[],errors=[],disposed=[];
 const context=vm.createContext({GuandanPresentation:presentation,performance,Map,Set,
  loadFace:card=>new Promise(resolve=>waits.push(()=>resolve({face:card.face,dispose(){disposed.push(card.face);}}))),
  layout(){},request(){},finishOutgoing(){},fail:error=>errors.push(error),
  createCard:card=>({...card,material:{map:null,color:{set(){}},dispose(){}},group:{}}),
  room:{background:{set(){}},fog:{color:{copy(){}}}},cardLayer:{remove(){}},
 });
 vm.runInContext(`let disposed=false,skinToken=0,skin='',loadingTextures='',loadingFaces=new Set(),activeTextures=new Map(),cards=new Map(),publicCards=new Map(),state=null,expanded=true,buttons=new Map();
 function placeTable(next){publicCards.clear();for(const card of GuandanPresentation.tableCards(next))publicCards.set(card.id,{...card,target:true,material:{map:activeTextures.get(card.face)||null},group:{visible:true}});}
 ${update}\n${setState}
 globalThis.subject={setState,seedActive:faces=>faces.forEach(face=>activeTextures.set(face,{face,dispose(){}})),inspect:()=>[...cards.values(),...publicCards.values()].map(e=>({id:e.id,face:e.face,map:e.material.map?.face,visible:e.group.visible}))};`,context);
 return {waits,errors,disposed,subject:context.subject,inspect:()=>JSON.parse(JSON.stringify(context.subject.inspect()))};
}
const options={expanded:true,buttons:new Map()};
function snapshot(id,faces,tableFaces=[]){return {id,revision:0,classic:true,skin:'jumbo',level:'2',theme:'day',phase:'playing',ended:false,dealing:false,reduceMotion:true,hand:faces.map((face,i)=>({id:id+'-own-'+i,face,selected:false,selectable:true})),table:tableFaces.length?{owner:1,ids:tableFaces.map((_,i)=>id+'-public-'+i),cards:tableFaces.map((face,i)=>({id:id+'-public-'+i,face}))}:null};}
// Async texture transactions are tested without requiring a GPU.
test('new round during texture loading never leaves new card faces blank',async()=>{
 const h=harness();h.subject.setState(snapshot('a',['heartAce','club3']),options);h.subject.setState(snapshot('b',['spadeAce','diamond3']),options);
 assert.equal(h.waits.length,4,'new faces need their own loads even with the same skin and level');
 h.waits.forEach(f=>f());await new Promise(setImmediate);
 assert.deepEqual(h.inspect().map(({face,map})=>({face,map})),[{face:'spadeAce',map:'spadeAce'},{face:'diamond3',map:'diamond3'}]);
 assert.equal(h.errors.length,0);assert.deepEqual(h.disposed.sort(),['club3','heartAce']);
});
test('a new public face in the old cache must also be present in the pending texture batch',async()=>{
 const h=harness();h.subject.seedActive(['heartAce','clubQueen']);
 h.subject.setState(snapshot('a',['heartAce'],['diamondJack']),options);
 h.subject.setState(snapshot('a',['heartAce'],['clubQueen']),options);
 assert.equal(h.waits.length,4,'a cached face outside the in-flight batch still requires a replacement batch');
 h.waits.forEach(f=>f());await new Promise(setImmediate);
 assert.deepEqual(h.inspect().find(e=>e.id==='a-public-0'),{id:'a-public-0',face:'clubQueen',map:'clubQueen',visible:true});
 assert.equal(h.errors.length,0);
});

test('retained piles keep their textures across new plays and skin changes',async()=>{
 const h=harness(),first=snapshot('a',['heartAce'],['club3']);
 h.subject.setState(first,options);h.waits.splice(0).forEach(f=>f());await new Promise(setImmediate);
 const second=snapshot('a',['heartAce'],['diamond4']);second.revision=1;
 second.tableActions=[{...first.table,ids:['old'],cards:[{id:'old',face:'club3'}]},second.table,null,null];
 h.subject.setState(second,options);h.waits.splice(0).forEach(f=>f());await new Promise(setImmediate);
 assert.equal(h.inspect().find(e=>e.id==='old').map,'club3');
 h.subject.setState({...second,skin:'classic'},options);h.waits.splice(0).forEach(f=>f());await new Promise(setImmediate);
 assert.deepEqual(h.inspect().map(e=>e.map).sort(),['club3','diamond4','heartAce']);assert.equal(h.errors.length,0);
});
