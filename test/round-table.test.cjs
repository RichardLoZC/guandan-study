'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Match}=require('../web/app/match.js'),{perspective}=require('../lan-room.cjs');
const view=require('../web/app/presentation.js'),core=require('../web/app/core.js');
function doubleFinish(){
 const match=new Match();match.game.currentPlayer=match.game.starter=0;
 let guard=1000;
 while(!match.game.result&&guard--){const seat=match.actingSeat;match.commit(seat,match.game.tablePlay?[]:[match.game.players[seat].hand.at(-1).id]);}
 assert.ok(match.game.result);return match;
}
test('end table keeps the final physical cards and reveals every remaining hand in all four LAN perspectives',()=>{
 const match=doubleFinish(),before=JSON.stringify(match.state);
 for(let seat=0;seat<4;seat++){
  const projected=perspective(match,seat,['Mac','Pad','Phone','PC']);
  const shown=new Match(projected.state),game=shown.game,actions=view.tableActions(game,shown.level),final=game.actionHistory.at(-1);
  assert.deepEqual(actions[final.seat].ids,final.play.cards.map(c=>c.id));assert.equal(actions[final.seat].latest,true);
  const remainders=shown.revealedHands.flatMap(h=>h.cards.map(c=>c.id));
  assert.equal(remainders.length,54);assert.equal(new Set(remainders).size,54);
  for(const hand of shown.revealedHands)assert.deepEqual(hand.cards.map(c=>c.id).sort(),game.players[hand.seat].hand.map(c=>c.id).sort());
  assert.ok(actions.filter(Boolean).flatMap(a=>a.ids).every(id=>!remainders.includes(id)));
  assert.equal(game.actionHistory.flatMap(a=>a.play?.cards||[]).length+remainders.length,108);
 }
 assert.equal(JSON.stringify(match.state),before);
});
test('no remainder is exposed during play, and the next deal clears the ended view data',()=>{
 const match=doubleFinish().next();
 assert.equal(match.game.result,null);assert.deepEqual(match.revealedHands,[]);
 assert.deepEqual(view.tableActions(match.game,match.level),[null,null,null,null]);
 for(let seat=0;seat<4;seat++){
  const projected=perspective(match,seat,['Mac','Pad','Phone','PC']);
  assert.ok(projected.state.game.players.slice(1).every(p=>p.hand.every(c=>c===null)));
 }
});
test('combination colors follow recognized type and bomb size, independent of layout order and wild substitutions',()=>{
 const match=new Match(),deck=match.game.players.flatMap(p=>p.hand);core.setLevel('2');
 const pick=(suit,ranks)=>ranks.map(rank=>deck.find(c=>c.suit===suit&&c.rank===rank));
 const flush=core.recognize(pick('spades',['3','4','5','6','7']))[0];assert.equal(flush.type,'straight-flush');
 const pair=core.recognize(deck.filter(c=>c.rank==='5').slice(0,2))[0];
 const bomb=core.recognize(deck.filter(c=>c.rank==='5').slice(0,4))[0];
 const kings=core.recognize(deck.filter(c=>c.suit==='joker'))[0];
 const styles=[pair,bomb,flush,kings].map(view.combinationStyle);
 assert.deepEqual(styles.map(s=>s.rarity),['uncommon','epic','legendary','crown']);assert.equal(new Set(styles.map(s=>s.color)).size,4);
 assert.deepEqual([kings,flush,bomb,pair].map(view.combinationStyle).reverse(),styles);
 assert.deepEqual(view.combinationStyle({...flush,usesWild:true}),view.combinationStyle(flush));
 assert.equal(view.combinationStyle(null).rarity,'common');
});
