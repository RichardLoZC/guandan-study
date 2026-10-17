const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const policy=require('../web/app/book-policy.js'),core=require('../web/app/core.js');
const worker=require('./helpers/strategy-worker.cjs'),{cards,seeded}=require('./helpers/strategy-fixtures.cjs');
const flushIds=['3','4','5','6','7'].map(rank=>'1-clubs-'+rank);
const ai=worker();
function play(ids){return core.recognize(cards(ids))[0];}
function observation(ids,counts=[12,20,20,20]){
  const o=seeded(4).observation();o.state.players[0].hand=cards(ids);
  for(let i=1;i<4;i++)o.state.players[i].hand=Array(counts[i]).fill(null);
  return o;
}
function assess(o,plays,scores=plays.map(()=>0)){
  ai.mt(o.level);const cache=ai.Hn(),candidates=plays.map(p=>({type:'play',play:p}));
  const rows=plays.map((p,i)=>({score:scores[i],outs:0,evidence:[]}));
  const memory=policy.refine(o,candidates,rows,{enumerate:ai.be,deck:ai.cr,isBomb:ai.q,beats:ai.Nt,stats:hand=>ai.it(hand,cache)});
  return {rows,memory};
}
function leadHistory(seat,p,count=20){return {seat,play:p,handCountAfter:count,tablePlayAfter:null,tableOwnerAfter:null};}
test('opening flush is below an ordinary intact-control route even when raw scoring favours it',()=>{
  const o=seeded(1,flushIds).observation(),flush=play(flushIds),single=core.recognize(o.state.players[0].hand.filter(c=>c.rank==='8').slice(0,1))[0];
  const {rows}=assess(o,[flush,single],[100,0]);
  assert.ok(rows[0].score<rows[1].score);assert.ok(rows[0].evidence.some(e=>e.rule==='opening-reserve'));
});
test('urgent endgames and direct finishes are exempt from opening conservation',()=>{
  const flush=play(flushIds);
  const urgent=seeded(1,flushIds).observation();urgent.state.players[1].hand=Array(5).fill(null);
  const low=core.recognize(urgent.state.players[0].hand.filter(c=>c.rank==='8').slice(0,1))[0];
  for(const [o,plays] of [[urgent,[flush,low]],[observation(flushIds),[flush]]]){
    const {rows}=assess(o,plays);assert.ok(rows.every(row=>!row.evidence.some(e=>e.rule==='opening-reserve')));
  }
});
test('do not break the straight flush merely to obey a conservation preference',()=>{
  const o=seeded(1,flushIds).observation();const {rows}=assess(o,[play(flushIds),play(['1-clubs-7'])],[100,0]);
  assert.ok(!rows[0].evidence.some(e=>e.rule==='opening-reserve'));
});
test('a same-type higher card is not automatically a controlling follow-up',()=>{
  const lower=play(['1-clubs-8']);
  const unsafe=assess(observation(['1-clubs-8','1-clubs-K','1-spades-3','1-hearts-5','1-diamonds-7']),[lower]);
  assert.ok(unsafe.rows[0].evidence.some(e=>e.rule==='route-uncertain'));
  assert.ok(!unsafe.rows[0].evidence.some(e=>e.rule==='route-control'));
  const safe=assess(observation(['1-clubs-8','1-joker-BJ','2-joker-BJ','1-spades-3','1-hearts-5','1-diamonds-7']),[lower]);
  assert.ok(safe.rows[0].evidence.some(e=>e.rule==='route-control'));
});
test('unbacked enemy routes get a penalty, while low partner routes get a limited preference',()=>{
  const ids=['1-clubs-8','1-spades-8','1-spades-3','1-hearts-5','1-diamonds-7','1-clubs-Q'];
  const candidate=play(ids.slice(0,2)),recent=play(['1-clubs-6','1-spades-6']);
  const enemy=observation(ids);enemy.state.actionHistory=[leadHistory(1,recent)];
  const hostile=assess(enemy,[candidate]).rows[0];
  assert.ok(hostile.evidence.some(e=>e.rule==='route-unbacked'));assert.ok(hostile.evidence.some(e=>e.rule==='opponent-route'));
  const friend=observation(ids);friend.state.actionHistory=[leadHistory(2,recent)];
  assert.ok(assess(friend,[candidate]).rows[0].evidence.some(e=>e.rule==='partner-route'));
  const high=observation(['1-clubs-K','1-spades-K',...ids.slice(2)]);high.state.actionHistory=friend.state.actionHistory;
  assert.ok(!assess(high,[play(['1-clubs-K','1-spades-K'])]).rows[0].evidence.some(e=>e.rule==='partner-route'));
});
test('partner protection passes and too-short hands never become weakness evidence',()=>{
  const p=play(['1-clubs-6','1-spades-6']),o=observation(['1-clubs-3']);
  const history=owner=>[{seat:owner,play:p,handCountAfter:20,tablePlayAfter:p,tableOwnerAfter:owner},
    {seat:2,play:null,handCountAfter:20,tablePlayAfter:null,tableOwnerAfter:null}];
  o.state.actionHistory=history(0);
  assert.equal(policy.remember(o,core.isBomb).profiles[2].get('pair:2').passes,0);
  o.state.actionHistory=history(1);o.state.players[2].hand=[null];
  assert.equal(policy.remember(o,core.isBomb).profiles[2].get('pair:2').passes,0);
});
test('one pass is not enough; independent low passes are soft evidence that decays as cards are spent',()=>{
  const p=play(['1-clubs-6','1-spades-6']),o=observation(['1-clubs-8','1-spades-8','1-spades-3','1-hearts-5','1-diamonds-7']);
  const cycle=[{seat:1,play:p,handCountAfter:20,tablePlayAfter:p,tableOwnerAfter:1},
    {seat:2,play:null,handCountAfter:20,tablePlayAfter:null,tableOwnerAfter:null}];
  o.state.actionHistory=cycle;
  assert.ok(!assess(o,[play(['1-clubs-8','1-spades-8'])]).rows[0].evidence.some(e=>e.rule==='partner-pressure'));
  o.state.actionHistory=[...cycle,...cycle];
  assert.ok(assess(o,[play(['1-clubs-8','1-spades-8'])]).rows[0].evidence.some(e=>e.rule==='partner-pressure'));
  o.state.players[2].hand=Array(4).fill(null);
  assert.equal(policy.remember(o,core.isBomb).profiles[2].get('pair:2').passes,0);
});
test('new deal resets route memory; hidden hands are rejected',()=>{
  const o=seeded(5).observation();assert.deepEqual(policy.remember(o,core.isBomb).profiles.map(p=>p.size),[0,0,0,0]);
  o.state.players[1].hand[0]=cards(['1-clubs-3'])[0];assert.throws(()=>policy.remember(o,core.isBomb),/隐藏手牌/);
});
test('worker integration remains legal, deterministic, and independent of hidden-hand permutations',()=>{
  const m=seeded(1,flushIds),o=m.observation();ai.mt('2');const actions=ai.sa(o,false,null).actions;
  const raw={candidates:actions.map((c,i)=>({...c,score:100-i})),engine:'fixture',elapsed:0};
  const first=ai.ca(o,raw,null,2),second=ai.ca(o,raw,null,2);
  assert.equal(first.book.version,policy.VERSION);
  assert.deepEqual(first.candidates,second.candidates);
  for(const c of first.candidates)assert.ok(c.type==='pass'||!m.selection(c.play.cards.map(c=>c.id),0,c.play.key).error);
  [m.game.players[1].hand,m.game.players[3].hand]=[m.game.players[3].hand,m.game.players[1].hand];
  assert.equal(JSON.stringify(m.observation()),JSON.stringify(o));
  assert.deepEqual(ai.ca(m.observation(),raw,null,2).candidates,first.candidates);
});
test('book OFF returns the unmodified model result without invoking the overlay',async()=>{
  const w=worker(),o=seeded(5).observation();w.mt('2');const actions=w.sa(o,false,null).actions;
  w.fixtureRaw={candidates:[actions[0]],engine:'raw DanLM',elapsed:12};let reply;
  w.self.postMessage=value=>reply=value;
  vm.runInContext('oa=async()=>fixtureRaw;ca=()=>{throw Error("overlay must not run")}',w);
  await w.self.onmessage({data:{id:1,observation:o,book:false}});
  assert.equal(reply.result,w.fixtureRaw);assert.equal(reply.error,undefined);
});
test('actual worker keeps immediate finishing moves ahead of conservation and history',()=>{
  const o=observation(flushIds,[5,7,8,9]);ai.mt('2');const actions=ai.sa(o,false,null).actions;
  const raw={candidates:actions.map((c,i)=>({...c,score:-i})),engine:'fixture',elapsed:0};
  const result=ai.ca(o,raw,null,0);assert.equal(result.candidates[0].play.type,'straight-flush');assert.equal(result.candidates[0].play.size,5);
});
test('ordinary intact-control alternatives outside the model shortlist are still compared',()=>{
  const m=seeded(51,flushIds),o=m.observation();ai.mt('2');
  const actions=ai.sa(o,false,null).actions.sort((a,b)=>Number(b.play?.type==='straight-flush')-Number(a.play?.type==='straight-flush')||
    (b.play?.size||0)-(a.play?.size||0)||(b.play?.primaryValue||0)-(a.play?.primaryValue||0));
  const raw={candidates:actions.map((c,i)=>({...c,score:1-i*.01})),engine:'fixture',elapsed:0};
  const result=ai.ca(o,raw,null,8);assert.equal(result.book.chosen,'单张 9');
  assert.ok(result.book.rows.find(r=>r.label==='同花顺 3-4-5-6-7').evidence.some(e=>e.rule==='opening-reserve'));
});
test('an equal external ceiling cannot be recaptured by our same-rank follow-up',()=>{
  const o=observation(['1-spades-2','1-clubs-2','1-joker-SJ','1-joker-BJ','1-clubs-3','1-spades-3','1-clubs-7','1-hearts-8','1-diamonds-9']);
  const {rows}=assess(o,[play(['1-clubs-3','1-spades-3'])]);
  assert.ok(!rows[0].evidence.some(e=>e.rule==='route-control'));
  assert.ok(rows[0].evidence.some(e=>e.rule==='route-uncertain'));
});
test('replacing a straight flush with a weaker extra bomb is not an intact-control alternative',()=>{
  const m=seeded(29,flushIds),o=m.observation();ai.mt('2');
  const actions=ai.sa(o,false,null).actions;
  const flush=actions.find(c=>c.play?.type==='straight-flush'&&c.play.primaryValue===9)?.play;
  const run=actions.find(c=>c.play?.type==='pair-run'&&c.play.primaryValue===6)?.play;
  assert.ok(flush&&run);const {rows}=assess(o,[flush,run],[100,0]);
  assert.ok(!rows[0].evidence.some(e=>e.rule==='opening-reserve'));
});
test('new strategy evidence and the automatic-pass label have English text',()=>{
  const english=require('../web/app/locales/en.js');
  const o=seeded(1,flushIds).observation(),single=core.recognize(o.state.players[0].hand.filter(c=>c.rank==='8').slice(0,1))[0];
  const {rows}=assess(o,[play(flushIds),single],[100,0]);
  for(const text of ['规则自动不出',...rows.flatMap(r=>r.evidence.map(e=>e.reason))])
    assert.ok(!/[\u3400-\u9fff]/u.test(english.translate(text)),text);
});
test('a greedy partition without bombs must not claim there is no legal bomb left',()=>{
  const ids=['1-joker-BJ','2-diamonds-5','2-spades-A','1-clubs-A','2-diamonds-A','2-spades-K','2-spades-Q','2-diamonds-J',
    '2-hearts-10','1-clubs-10','2-diamonds-10','1-spades-9','2-diamonds-9','2-spades-8','2-diamonds-7',
    '1-hearts-6','2-hearts-6','2-spades-6','2-diamonds-6','2-hearts-2','2-spades-2'];
  const o=observation(ids,[21,20,20,26]);o.level='5';o.state.players[0].hand=cards(ids,'5');ai.mt('5');
  const candidate=ai.be(o.state.players[0].hand).find(p=>p.type==='straight'&&p.primaryValue===13);
  assert.ok(candidate);const used=new Set(candidate.cards.map(c=>c.id)),remaining=o.state.players[0].hand.filter(c=>!used.has(c.id));
  assert.ok(ai.be(remaining).some(p=>p.type==='bomb'&&p.cards.every(c=>c.rank==='6')));
  const row=assess(o,[candidate]).rows[0];
  assert.ok(row.evidence.some(e=>e.rule==='route-unbacked'&&e.reason.includes('可能要花炸弹')));
  assert.ok(row.evidence.every(e=>!e.reason.includes('没有保留的炸弹')));
});
test('a discontinuous greedy estimate alone cannot replace a cheaper model-preferred single',()=>{
  const o=observation(['1-diamonds-Q','1-joker-SJ','1-clubs-3']);
  const candidates=[{play:play(['1-diamonds-Q'])},{play:play(['1-joker-SJ'])}];
  const id=c=>c.play.key+'|'+c.play.cards.map(c=>c.id).sort().join(',');
  const rows=candidates.map((c,i)=>({id:id(c),score:(i?-5:5)+(i?-40:-80),evidence:[{rule:'shape',delta:i?-40:-80}]}));
  policy.calibrate(o,candidates,rows,{original:candidates[0],isBomb:core.isBomb});
  assert.ok(rows[0].score>rows[1].score);
});
test('a natural low-cost response is not rejected solely because the table owner is our partner',()=>{
  const o=observation(['1-clubs-10','1-diamonds-3','1-spades-4','1-hearts-5','1-clubs-6','1-spades-7']);
  o.state.tablePlay={owner:2,play:play(['1-diamonds-8'])};
  const candidates=[{play:play(['1-clubs-10'])},{type:'pass',play:null}];
  const id=c=>c.play?c.play.key+'|'+c.play.cards.map(c=>c.id).sort().join(','):'pass';
  const rows=candidates.map((c,i)=>({id:id(c),score:i?-5-88+12:5-80-18,
    evidence:[{rule:'shape',delta:i?-88:-80},{rule:'partner',delta:i?12:-18}]}));
  policy.calibrate(o,candidates,rows,{original:candidates[0],isBomb:core.isBomb});
  assert.ok(rows[0].score>rows[1].score);
  const english=require('../web/app/locales/en.js');
  for(const row of rows)for(const e of row.evidence)if(e.reason)assert.ok(!/[\u3400-\u9fff]/u.test(english.translate(e.reason)));
});
