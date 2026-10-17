'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const stack=require('../web/app/hand-stack.js'),layout=require('../web/app/hand-layout.js'),core=require('../web/app/core.js');
core.setLevel('2');
const hand=core.sortCards(core.deck().filter(card=>['3','4','5'].includes(card.rank))).slice(0,22);
test('phone migration flattens legacy shelves without losing physical IDs, groups or their order',()=>{
 let saved=layout.create('round',hand);saved=layout.move(saved,hand.slice(0,4).map(c=>c.id),0,0,{hand,level:'2'});
 const before=JSON.stringify(saved),phone=stack.singleRow(saved);
 assert.deepEqual(phone.rows,[[],saved.rows.flat()]);assert.deepEqual(phone.groups,saved.groups);assert.equal(JSON.stringify(saved),before);
 assert.equal(new Set(phone.rows.flat()).size,hand.length);assert.equal(stack.singleRow(phone),phone);
 assert.deepEqual(layout.reconcile(phone,'round',hand),phone);
 const reset=layout.fromPlan('round',hand,null,phone);assert.deepEqual(reset.rows,[[],hand.map(c=>c.id)]);assert.equal(reset.groups.length,0);
});
test('rank stacks reveal every physical card, split long bombs and never cross saved group boundaries',()=>{
 const ids=hand.map(c=>c.id),columns=stack.columns(ids,hand);
 assert.deepEqual(columns.flat(),ids);assert.ok(columns.every(c=>c.length<=3));
 for(const column of columns)assert.equal(new Set(column.map(id=>hand.find(c=>c.id===id).rank)).size,1);
 const split=[{ids:ids.slice(0,4),groupIndex:0},{ids:ids.slice(4),groupIndex:1}];
 const m=stack.metrics(split,hand,{width:640,cardWidth:54});
 assert.deepEqual(m.columns[0].flat(),split[0].ids);assert.deepEqual(m.columns[1].flat(),split[1].ids);
});
test('normal 27-card hands fit phone widths, crowded combinations scroll instead of becoming tiny',()=>{
 const mixed=core.sortCards(core.deck().filter(c=>c.suit==='hearts'||c.suit==='spades').slice(0,27));
 for(const width of [600,688,828,899]){
  const m=stack.metrics([{ids:mixed.map(c=>c.id)}],mixed,{width,cardWidth:48});
  assert.ok(m.step>=34);assert.ok(m.width<=width);assert.equal(m.columns.flat(2).length,27);
 }
 const m=stack.metrics(mixed.map(c=>({ids:[c.id]})),mixed,{width:600,cardWidth:48});
 assert.ok(m.width>600);assert.ok(m.step>=34);
});
test('stack insertions use visible header boundaries and always remain in the single row',()=>{
 const columns=[{left:20,right:60,cards:[{index:0,top:40,bottom:106},{index:1,top:60,bottom:126},{index:2,top:80,bottom:146}]},{left:65,right:105,cards:[{index:3,top:80,bottom:146}]}];
 const bounds={left:0,right:150,top:10,bottom:150};
 for(const [x,y,index] of [[25,44,0],[25,65,1],[25,90,2],[25,140,3],[85,90,3],[85,140,4]]){
  const result=stack.dropTarget(columns,bounds,x,y);assert.equal(result.row,1);assert.equal(result.index,index);
 }
 assert.equal(stack.dropTarget(columns,bounds,20,0),null);assert.equal(stack.dropTarget([],bounds,20,90),null);
});
