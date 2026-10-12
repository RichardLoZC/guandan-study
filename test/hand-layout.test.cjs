'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const layout=require('../web/app/hand-layout.js');
const {Match}=require('../web/app/match.js'),arrange=require('../web/app/arrange.js');
const cards=ids=>ids.map(id=>({id,rank:'4',suit:'clubs'}));
const sample=()=>({version:1,key:'round-a',rows:[['a','b','c'],['d','e','f']],groups:[],source:'default'});
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
test('an untouched hand starts entirely on the lower shelf in the match rank order',()=>{
 const match=new Match(),hand=match.hand,before=JSON.stringify(match.state),expected=hand.map(c=>c.id);
 const fresh=layout.create(match.id,hand);assert.deepEqual(fresh.rows,[[],expected]);
 const legacy={...fresh,rows:[expected.slice(0,14),expected.slice(14)]};
 assert.deepEqual(layout.reconcile(legacy,match.id,hand).rows,[[],expected]);
 const manual=layout.move(fresh,[expected[3]],0,0);
 assert.deepEqual(layout.reconcile(manual,match.id,hand).rows,manual.rows);
 const plan=arrange.plans(hand,match.level)[0],automatic=layout.fromPlan(match.id,hand,plan);
 assert.deepEqual(layout.reconcile(automatic,match.id,hand).rows,automatic.rows);
 assert.deepEqual(layout.fromPlan(match.id,hand,null).rows,[[],expected]);
 assert.equal(JSON.stringify(match.state),before);
});
test('default tribute arrivals follow sorted hand order while the upper shelf stays empty',()=>{
 const before=layout.create('r',cards(['K','7','3']));
 assert.deepEqual(layout.reconcile(before,'r',cards(['A','K','3'])).rows,[[],['A','K','3']]);
});
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
test('groups remain separate, contiguous and local to a shelf after splitting and partial play',()=>{
 let saved={version:1,key:'r',source:'manual',rows:[['a','b','c','d','e','f'],['g','h']],groups:[{ids:['a','b','c','d'],label:'old'},{ids:['e','f'],label:'pair'}]};
 saved=layout.move(saved,['g','h'],0,2);
 assert.deepEqual(layout.segments(saved,0).map(segment=>segment.ids),[['a','b'],['g','h'],['c','d'],['e','f']]);
 assert.deepEqual(saved.groups.map(group=>group.label),['','','pair','']);
 const after=layout.reconcile(saved,'r',cards(['a','b','c','e','f','g','h']));
 assert.deepEqual(layout.segments(after,0).map(segment=>segment.ids),[['a','b'],['g','h'],['c'],['e','f']]);
 assert.equal(after.groups.some(group=>group.ids.includes('c')),false);
 assert.deepEqual(layout.load({getItem:()=>JSON.stringify([after])},'r',cards(['a','b','c','e','f','g','h'])),after);
});
test('an in-place multi-card drop creates a group while existing groups keep their identity',()=>{
 const before={...sample(),source:'manual'},after=layout.move(before,['a','b'],0,0);
 assert.deepEqual(after.rows,before.rows);assert.deepEqual(after.groups,[{ids:['a','b'],label:''}]);
 assert.equal(layout.move(after,['a','b'],0,2),after);
 assert.deepEqual(layout.segments(after,0),[{ids:['a','b'],groupIndex:0},{ids:['c'],groupIndex:-1}]);
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
