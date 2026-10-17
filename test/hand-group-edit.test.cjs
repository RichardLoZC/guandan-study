'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../web/app/core.js'),layout=require('../web/app/hand-layout.js');
const {seeded}=require('./helpers/strategy-fixtures.cjs');
function hand(ids,level='2'){core.setLevel(level);const deck=core.deck();return ids.map(id=>{const card=deck.find(c=>c.id===id);assert.ok(card,id);return card;});}
function saved(rows,groups=[]){return {version:1,key:'test',source:'manual',rows,groups};}
const ranks=(ids,cards)=>ids.map(id=>cards.find(c=>c.id===id).rank);
test('gathering scattered cards sorts the new straight, without changing the match or selecting a declaration',()=>{
  const ids=['1-clubs-6','1-spades-9','1-hearts-7','1-diamonds-5','1-clubs-8'],match=seeded(73,ids),cards=match.hand;
  const state=JSON.stringify(match.state),observation=JSON.stringify(match.observation(0));
  const original=saved([[],[...ids,...cards.filter(c=>!ids.includes(c.id)).map(c=>c.id)]]),before=structuredClone(original);
  const after=layout.move(original,ids,0,0,{hand:cards,level:match.level});
  assert.deepEqual(ranks(after.rows[0],cards),['9','8','7','6','5']);assert.equal(after.groups[0].label,'顺子 5-6-7-8-9');
  assert.deepEqual(original,before);assert.equal(JSON.stringify(match.state),state);assert.equal(JSON.stringify(match.observation(0)),observation);
  assert.deepEqual([...after.rows.flat()].sort(),cards.map(c=>c.id).sort());
});
test('full houses place the three-card body together before their pair even when the pair has a higher rank',()=>{
  const ids=['1-spades-A','1-clubs-J','2-clubs-J','1-hearts-A','1-spades-J'],cards=hand(ids);
  const after=layout.move(saved([[],ids]),ids,0,0,{hand:cards,level:'2'});
  assert.deepEqual(ranks(after.rows[0],cards),['J','J','J','A','A']);assert.match(after.groups[0].label,/三带二 J/);
});
test('sequence order treats the low ace as the low end and inserts a wildcard at its missing rank',()=>{
  const low=['1-spades-A','1-clubs-3','1-hearts-2','1-diamonds-5','1-clubs-4'];
  assert.deepEqual(ranks(layout.describeGroup(low,hand(low,'7'),'7').ids,hand(low,'7')),['5','4','3','2','A']);
  const wild=['1-clubs-5','1-spades-6','1-clubs-8','1-diamonds-9','1-hearts-2'],cards=hand(wild);
  const result=layout.describeGroup(wild,cards,'2');
  assert.equal(result.label,'顺子 5-6-7-8-9');assert.deepEqual(ranks(result.ids,cards),['9','8','2','6','5']);
  assert.equal(result.ids[2],'1-hearts-2','the same physical wildcard fills seven; its rank is never mutated');
});
test('dropping a single onto a triple creates and names the whole four-card bomb at either outer edge',()=>{
  const trio=['1-clubs-8','1-hearts-8','1-spades-8'],single='1-diamonds-8',cards=hand([...trio,single]);
  for(const edge of [trio[0],trio.at(-1)]){
    const original=saved([trio,[single]],[{ids:trio,label:'三张 8'}]),copy=structuredClone(original);
    const after=layout.move(original,[single],0,0,{hand:cards,level:'2',mergeId:edge});
    assert.equal(after.groups.length,1);assert.equal(after.groups[0].ids.length,4);assert.match(after.groups[0].label,/4 张炸 8/);
    assert.deepEqual(after.rows[1],[]);assert.deepEqual(original,copy);
    const store={value:null,getItem(){return this.value;},setItem(_key,value){this.value=value;}};
    layout.save(store,after);assert.deepEqual(layout.load(store,'test',cards),after);
  }
});
test('inserting the missing card into an unfinished pile recognizes a straight flush and keeps its exact physical cards',()=>{
  const pile=['1-clubs-9','1-clubs-5','1-clubs-8','1-clubs-6'],single='1-clubs-7',cards=hand([...pile,single]);
  const after=layout.move(saved([pile,[single]],[{ids:pile,label:''}]),[single],0,2,{hand:cards,level:'2',mergeId:pile[1]});
  assert.equal(after.groups[0].label,'同花顺 5-6-7-8-9');assert.deepEqual(ranks(after.groups[0].ids,cards),['9','8','7','6','5']);
  assert.deepEqual(core.recognize(after.groups[0].ids.map(id=>cards.find(c=>c.id===id))).map(p=>p.type),['straight-flush']);
});
test('dropping in a gap keeps a single independent; a multi-card drag stays a separate group',()=>{
  const pair=['1-clubs-8','1-hearts-8'],extra=['1-diamonds-8','1-spades-8'],cards=hand([...pair,...extra]);
  const before=saved([pair,extra],[{ids:pair,label:'对子 8'}]);
  const gap=layout.move(before,[extra[0]],0,2,{hand:cards,level:'2'});
  assert.deepEqual(gap.groups,before.groups);assert.deepEqual(gap.rows[0],[...pair,extra[0]]);
  const multi=layout.move(before,extra,0,2,{hand:cards,level:'2',mergeId:pair[0]});
  assert.equal(multi.groups.length,2);assert.ok(multi.groups.every(g=>g.ids.length===2));
});
test('an invalid merged pile retains all cards and clears the obsolete combination name',()=>{
  const trio=['1-clubs-8','1-hearts-8','1-spades-8'],single='1-diamonds-9',cards=hand([...trio,single]);
  const after=layout.move(saved([trio,[single]],[{ids:trio,label:'三张 8'}]),[single],0,2,{hand:cards,level:'2',mergeId:trio[0]});
  assert.equal(after.groups[0].label,'');assert.equal(after.groups[0].ids.length,4);assert.equal(core.recognize(cards).length,0);
  assert.deepEqual(ranks(after.groups[0].ids,cards),['9','8','8','8']);
});
test('moving between groups relabels both the source remainder and the destination without changing unrelated groups',()=>{
  const a=['1-clubs-8','1-hearts-8','1-spades-8'],b=['1-clubs-9','1-spades-9'],c=['1-clubs-3','1-hearts-3'];
  const cards=hand([...a,...b,...c]),before=saved([a,[...b,...c]],[{ids:a,label:'三张 8'},{ids:b,label:'对子 9'},{ids:c,label:'对子 3'}]);
  const after=layout.move(before,[a[0]],1,0,{hand:cards,level:'2',mergeId:b[0]});
  assert.equal(after.groups.find(g=>g.ids.includes(a[1])).label,'对子 8');
  assert.equal(after.groups.find(g=>g.ids.includes(b[0])).label,'');
  assert.deepEqual(after.groups.find(g=>g.ids.includes(c[0])),before.groups[2]);
  assert.deepEqual([...after.rows.flat()].sort(),cards.map(c=>c.id).sort());
});
test('foreign and wrong-shelf merge targets never absorb cards from another group',()=>{
  const pair=['1-clubs-8','1-hearts-8'],single='1-diamonds-8',cards=hand([...pair,single]);
  const before=saved([pair,[single]],[{ids:pair,label:'对子 8'}]);
  for(const mergeId of ['outside',pair[0]])assert.equal(layout.move(before,[single],1,0,{hand:cards,level:'2',mergeId}),before);
});
