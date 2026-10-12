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

function cards(ids){core.setLevel('2');return core.deck().filter(c=>ids.includes(c.id));}
function types(plan,hand){return plan.groups.filter(g=>g.ids.length>1).map(g=>core.recognize(g.ids.map(id=>hand.find(c=>c.id===id))).find(p=>p.label===g.label).type);}
test('explicit priorities keep the requested combination when its cards overlap another one',()=>{
 const hand=cards(['1-spades-3','1-spades-4','1-spades-5','1-spades-6','1-spades-7','1-hearts-5','1-clubs-5','1-diamonds-5']);
 assert.equal(types(arrange.plans(hand,'2',{priority:'flush'})[0],hand)[0],'straight-flush');
 assert.equal(types(arrange.plans(hand,'2',{priority:'bomb'})[0],hand)[0],'bomb');
 const run=cards(['1-clubs-3','1-spades-4','1-hearts-5','1-diamonds-6','1-clubs-7','2-clubs-3','2-spades-4']);
 assert.equal(types(arrange.plans(run,'2',{priority:'runs'})[0],run)[0],'straight');
 assert.equal(types(arrange.plans(run,'2',{priority:'pairs'})[0],run)[0],'pair');
});
test('every priority keeps every physical card exactly once and all suggested groups legal',()=>{
 for(let n=0;n<20;n++){
  const hand=core.newMatch().game.players[0].hand,before=JSON.stringify(hand);
  for(const priority of Object.keys(arrange.priorities))for(const plan of arrange.plans(hand,'2',{priority})){
   assert.deepEqual([...plan.ids].sort(),hand.map(c=>c.id).sort());assert.equal(new Set(plan.ids).size,hand.length);
   for(const group of plan.groups)assert.ok(core.recognize(group.ids.map(id=>hand.find(c=>c.id===id))).some(p=>group.ids.length===1||p.label===group.label));
  }
  assert.equal(JSON.stringify(hand),before);
 }
});
test('missing priorities report no match, while unknown preferences keep the default behavior',()=>{
 const hand=cards(['1-clubs-3','1-spades-3','1-spades-5','1-diamonds-K']);
 const normal=arrange.plans(hand,'2');
 for(const priority of ['flush','bomb','runs'])for(const plan of arrange.plans(hand,'2',{priority}))assert.equal(plan.matches,0);
 assert.deepEqual(arrange.plans(hand,'2',{priority:'invalid'}),normal);
 assert.deepEqual(arrange.plans(hand,'2',{priority:'balanced'}),normal);
});
test('two wild cards independently fill two straight flushes without reusing physical cards',()=>{
 const hand=cards(['1-clubs-3','1-clubs-4','1-clubs-5','1-clubs-6','1-spades-8','1-spades-9','1-spades-10','1-spades-J','1-hearts-2','2-hearts-2']);
 const plans=arrange.plans(hand,'2',{priority:'flush'});assert.ok(plans.some(p=>p.matches===2&&p.groups.length===2));
});

test('runs arrangement priority includes straight flushes without changing their play type',()=>{
 const hand=cards(['1-spades-3','1-spades-4','1-spades-5','1-spades-6','1-spades-7']);
 const plans=arrange.plans(hand,'2',{priority:'runs'});assert.ok(plans.every(p=>p.matches>0));
});
