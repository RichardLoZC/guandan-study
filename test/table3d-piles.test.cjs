'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const presentation=require('../web/app/presentation.js');
async function harness(){
 const THREE=await import('../web/vendor/three/build/three.module.js');
 const source=fs.readFileSync(path.join(__dirname,'../web/app/table3d.js'),'utf8');
 const place=source.slice(source.indexOf('  function finishOutgoing('),source.indexOf('  async function loadFace('));
 const context=vm.createContext({THREE,GuandanPresentation:presentation});
 vm.runInContext(`let outgoing=null,tableKey='',state=null,width=1280,height=720;const hands=[],cards=new Map(),publicCards=new Map(),activeTextures=new Map();
 const tableLayer=new THREE.Group(),camera=new THREE.PerspectiveCamera(42,1,.1,60),faceGeometry=new THREE.PlaneGeometry(1,1),edgeGeometry=faceGeometry,ringGeometry=faceGeometry,paper=new THREE.MeshBasicMaterial();
 ${place}
 globalThis.subject={set(next,animate){placeTable(next,animate);state=next;},entry:id=>publicCards.get(id),entries:()=>[...publicCards.values()],animation:()=>outgoing,texture(face){activeTextures.set(face,{face});},finishOutgoing};`,context);
 return context.subject;
}
function action(owner,...ids){return {owner,type:ids.length?'play':'pass',ids,cards:ids.map(id=>({id,face:id}))};}
function snapshot(actions,id='r'){return {id,tableActions:actions,table:actions.filter(a=>a?.cards.length).at(-1)};}
test('3D retains other piles without replaying them, replaces only the acting seat and clears at next lead',async()=>{
 const h=await harness(),a=action(0,'a','a2'),b=action(1,'b'),c=action(2),d=action(3,'d');
 h.set(snapshot([a,b,c,d]),false);const originalA=h.entry('a'),originalD=h.entry('d');
 const nextA=action(0,'e');h.set({...snapshot([nextA,b,c,d]),table:nextA},true);
 assert.equal(h.entry('d'),originalD);assert.equal(h.entry('a'),undefined);assert.equal(h.entries().length,3);
 assert.deepEqual(Array.from(h.animation().entries,e=>e.id),['e']);assert.equal(h.animation().own,true);
 h.set({...snapshot([nextA,action(1),c,d]),table:nextA},false);
 assert.equal(h.entry('b'),undefined);assert.equal(h.entry('d'),originalD);assert.equal(h.animation(),null);
 const lead=action(0,'f');h.set(snapshot([lead,null,null,null]),true);
 assert.deepEqual(Array.from(h.entries(),e=>e.id),['f']);assert.notEqual(h.entry('f'),originalA);
});
test('3D view restoration does not animate, and a new deal cannot reuse a stale pile',async()=>{
 const h=await harness(),a=action(1,'one');h.set(snapshot([null,a,null,null]),false);
 assert.equal(h.animation(),null);const first=h.entry('one');
 h.set(snapshot([null,a,null,null],'new'),false);assert.notEqual(h.entry('one'),first);
 h.set({...snapshot([null,a,null,null],'new'),ended:true},false);assert.equal(h.entries().length,0);
});
