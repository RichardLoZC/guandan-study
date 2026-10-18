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
test('rank stacks keep all eight bomb cards in one column, with every physical card exactly once',()=>{
 const ids=hand.map(c=>c.id),columns=stack.columns(ids,hand);
 assert.deepEqual(columns.flat(),ids);assert.deepEqual(columns.map(c=>c.length),[8,8,6]);
 for(const column of columns)assert.equal(new Set(column.map(id=>hand.find(c=>c.id===id).rank)).size,1);
 const split=[{ids:ids.slice(0,4),groupIndex:0},{ids:ids.slice(4),groupIndex:1}];
 const m=stack.metrics(split,hand,{width:640,cardWidth:54});
 assert.deepEqual(m.columns[0].flat(),split[0].ids);assert.deepEqual(m.columns[1].flat(),split[1].ids);
});
test('rank columns combine nonadjacent duplicates while keeping jokers and wildcard rank separate',()=>{
 const cards=core.deck(),chosen=[cards.find(c=>c.rank==='3'),cards.find(c=>c.rank==='BJ'),cards.find(c=>c.rank==='2'&&c.suit==='hearts'),cards.find(c=>c.rank==='3'&&c.suit==='spades'),cards.find(c=>c.rank==='SJ')];
 const columns=stack.columns(chosen.map(c=>c.id),chosen);
 assert.deepEqual(columns.map(c=>c.length),[2,1,1,1]);assert.equal(new Set(columns.flat()).size,5);
});
test('long phone stacks preserve readable headers, expose eight layers and shrink before scrolling',()=>{
 const normal=stack.verticalMetrics(3,354),bomb=stack.verticalMetrics(8,354),short=stack.verticalMetrics(8,284);
 assert.equal(normal.cardWidth,54);assert.ok(bomb.cardWidth<normal.cardWidth);
 for(const [depth,height]of [[1,354],[3,354],[5,354],[8,354],[8,284]]){
  const m=stack.verticalMetrics(depth,height);
  assert.ok(m.rise>=20);assert.ok(m.cardWidth>=40);assert.equal(m.handHeight,m.cardHeight+(depth-1)*m.rise+8);
 }
 assert.ok(short.handHeight>284-40-(short.cardHeight+42),'short screens must scroll, never split or clip the stack');
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
