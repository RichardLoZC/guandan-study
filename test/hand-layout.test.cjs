'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const layout=require('../web/app/hand-layout.js'),view=require('../web/app/presentation.js');
const {Match}=require('../web/app/match.js'),arrange=require('../web/app/arrange.js');
const cards=ids=>ids.map(id=>({id,rank:'4',suit:'clubs'}));
const sample=()=>({version:1,key:'round-a',rows:[['a','b','c'],['d','e','f']],groups:[],source:'default'});
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
test('move single cards in either direction and move a selection across tiers without losing cards',()=>{
 const before=sample(),copy=structuredClone(before);
 assert.deepEqual(layout.move(before,['b'],0,3).rows,[['a','c','b'],['d','e','f']]);
 assert.deepEqual(layout.move(before,['c'],0,0).rows,[['c','a','b'],['d','e','f']]);
 const after=layout.move(before,['e','b','a'],1,1);
 assert.deepEqual(after.rows,[['c'],['d','a','b','e','f']]);
 assert.deepEqual(after.groups,[{ids:['a','b','e'],label:''}]);
 assert.deepEqual(before,copy,'editing must not mutate its undo snapshot');
 for(const [ids,row,index]of [[['missing'],0,0],[['a'],2,0],[['a'],0,99],[['a'],1,-1]])assert.equal(layout.move(before,ids,row,index),before);
 assert.equal(layout.move(before,['b'],0,2),before,'dropping next to itself is a no-op');
});
test('plays remove only departed cards; tribute appends arrivals while keeping custom tiers and order',()=>{
 const saved=layout.move(sample(),['b','e'],0,0);
 const after=layout.reconcile(saved,'round-a',cards(['f','e','d','c','a','new']));
 assert.deepEqual(after.rows,[['e','a','c'],['d','f','new']]);
 assert.deepEqual(after.groups,[]);
 assert.deepEqual(layout.ordered(after,cards(['f','e','d','c','a','new'])).map(c=>c.id),after.rows.flat());
 assert.deepEqual(layout.reconcile(after,'round-b',cards(['a','c','d'])).rows,[[],['a','c','d']]);
});
test('reloading restores individual physical cards and keeps a deliberately empty tier',()=>{
 const store=storage(),before=sample(),after=layout.move(before,['a','b','c'],1,3);layout.save(store,after);
 assert.deepEqual(layout.load(store,'round-a',cards(['f','e','d','c','b','a'])),after);
 assert.deepEqual(after.rows,[[],['d','e','f','a','b','c']]);
 layout.save(store,{...sample(),key:'lan:other-player'});
 assert.deepEqual(layout.load(store,'round-a',cards(['f','e','d','c','b','a'])),after);
 assert.equal(layout.load(store,'new-game',cards(['a'])).source,'default');
});
test('malformed layouts and duplicate or foreign IDs cannot corrupt the owned hand',()=>{
 const hand=cards(['a','b','c']);
 for(const bad of [null,{},[],{version:1,key:'r',rows:[]},{version:1,key:'r',rows:[null,[]]},
  {version:1,key:'r',rows:[['a','a','hidden'],['a',null,'b']],groups:[null,{ids:['a','a','hidden']}]}
 ]){
  const fixed=layout.reconcile(bad,'r',hand);assert.deepEqual([...fixed.rows.flat()].sort(),['a','b','c']);assert.equal(new Set(fixed.rows.flat()).size,3);
 }
 const store=storage();store.setItem(layout.STORAGE_KEY,'not JSON');assert.deepEqual(layout.load(store,'r',hand),layout.create('r',hand));
});
test('automatic plans and hundreds of manual moves conserve the deal and never change model input',()=>{
 const match=new Match(),state=JSON.stringify(match.state),observation=JSON.stringify(match.observation(0)),hand=match.hand;
 let current=layout.create(match.id,hand);
 for(const plan of arrange.plans(hand,match.level)){
  current=layout.fromPlan(match.id,hand,plan);
  assert.deepEqual([...current.rows.flat()].sort(),hand.map(c=>c.id).sort());
  for(const group of current.groups)assert.ok(current.rows.some(row=>group.ids.every(id=>row.includes(id))),'keep automatic groups in one tier');
 }
 for(let i=0;i<300;i++){
  const row=i%2,all=current.rows.flat(),ids=[all[i%all.length],all[(i+5)%all.length]];
  current=layout.move(current,ids,row,i%(current.rows[row].length+1));
  assert.deepEqual([...current.rows.flat()].sort(),hand.map(c=>c.id).sort());
 }
 assert.equal(JSON.stringify(match.state),state);assert.equal(JSON.stringify(match.observation(0)),observation);
});
test('both renderers share explicit tiers; 3D drop targets include empty shelves and reject the action bar',()=>{
 const round=new Match(),rows=[round.hand.slice(0,3).map(c=>c.id),round.hand.slice(3).map(c=>c.id)],hand=layout.ordered({rows},round.hand);
 const snapshot=view.project(round,{hand,rows,arranging:true});
 assert.equal(snapshot.arranging,true);assert.deepEqual(snapshot.hand.map(c=>c.row),[0,0,0,...Array(24).fill(1)]);
 for(const [width,height]of [[1280,650],[390,740],[844,340]]){
  const fan=view.fanLayout(snapshot.hand,width,height);assert.deepEqual(fan.map(p=>p.tier),snapshot.hand.map(c=>c.row));
  assert.equal(view.fanDropTarget(snapshot.hand,width,height,0,0),null);
  assert.equal(view.fanDropTarget(snapshot.hand,width,height,width/2,height-10),null);
  const lowerOnly=snapshot.hand.map(c=>({...c,row:1})),scale=view.gripScale(width,height);
  const target=view.fanDropTarget(lowerOnly,width,height,width/2-35*scale,height-(80+(383-80)*scale)+25*scale);
  assert.equal(target.row,0);assert.equal(target.index,0);
 }
});
