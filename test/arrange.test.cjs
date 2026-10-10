const test=require('node:test'),assert=require('node:assert/strict'),core=require('../web/app/core.js'),arrange=require('../web/app/arrange.js');
test('alternative layouts conserve physical cards, use legal groups and never mutate the hand',()=>{
  for(let run=0;run<50;run++){
    const state=core.newMatch(),hand=state.game.players[0].hand,before=JSON.stringify(hand),plans=arrange.plans(hand,'2');assert.ok(plans.length>0&&plans.length<=8);
    for(const p of plans){assert.deepEqual([...p.ids].sort(),hand.map(c=>c.id).sort());assert.equal(new Set(p.ids).size,27);for(const g of p.groups){const cards=g.ids.map(id=>hand.find(c=>c.id===id));assert.ok(core.recognize(cards).length,g.label);}}
    assert.equal(JSON.stringify(hand),before);
  }
});
test('the same overlapping run and rank cards can be laid out in different combinations',()=>{
  const cards=core.deck().filter(c=>['3','4','5','6','7'].includes(c.rank)&&c.deck===1&&['hearts','spades'].includes(c.suit));
  const plans=arrange.plans(cards,'2');assert.ok(plans.length>=2);assert.ok(plans.some(p=>p.groups.some(g=>g.ids.length===5)));assert.ok(plans.some(p=>p.groups.filter(g=>g.ids.length===2).length>=3));
});
test('small hands and wild cards retain every physical card',()=>{for(const hand of [[],core.deck().slice(0,1),core.deck().filter(c=>c.rank==='2'&&c.suit==='hearts').map(c=>({...c,isWild:true}))])for(const p of arrange.plans(hand,'2'))assert.deepEqual([...p.ids].sort(),hand.map(c=>c.id).sort());});

test('two wild cards can independently complete two different pairs',()=>{const hand=core.deck().filter(c=>['1-clubs-3','1-clubs-5','1-hearts-2','2-hearts-2'].includes(c.id)).map(c=>({...c,isWild:c.suit==='hearts'&&c.rank==='2'}));const plans=arrange.plans(hand,'2');assert.ok(plans.some(p=>p.groups.length===2&&p.groups.every(g=>g.ids.length===2)));});
