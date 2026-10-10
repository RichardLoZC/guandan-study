'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../web/app/core.js'),{Match}=require('../web/app/match.js');
const view=require('../web/app/presentation.js'),{perspective}=require('../lan-room.cjs');
function orderedMatch(){
 const match=new Match(),deck=match.game.players.flatMap(p=>p.hand);
 const chosen=[['3','7'],['4','8'],['5','9'],['6','10']].map(ranks=>ranks.map(rank=>deck.splice(deck.findIndex(c=>c.rank===rank),1)[0]));
 match.game.players.forEach((p,seat)=>p.hand=[...chosen[seat],...deck.splice(0,25)]);
 match.game.currentPlayer=match.game.starter=0;return match;
}
function play(m,rank){const seat=m.actingSeat;const card=m.game.players[seat].hand.find(c=>c.rank===rank);m.commit(seat,[card.id]);return card.id;}
function pass(m){m.commit(m.actingSeat,[]);}
test('each seat keeps its last play or PASS, and revisiting a seat changes only that seat',()=>{
 const m=orderedMatch();const a=play(m,'3'),b=play(m,'4');pass(m);const d=play(m,'6');
 assert.deepEqual(view.project(m).tableActions.map(a=>a.type),['play','play','pass','play']);
 assert.deepEqual(view.tableCards(view.project(m)).map(c=>c.id),[a,b,d]);
 const e=play(m,'7');assert.deepEqual(view.project(m).tableActions.map(a=>a.ids),[[e],[b],[],[d]]);
 pass(m);assert.equal(view.project(m).tableActions[1].label,'PASS');assert.deepEqual(view.project(m).tableActions[1].cards,[]);
});
test('the closing PASS remains visible, then a new lead clears the previous trick for every seat',()=>{
 const m=orderedMatch();play(m,'3');play(m,'4');pass(m);play(m,'6');play(m,'7');pass(m);pass(m);pass(m);
 assert.equal(m.game.tablePlay,null);assert.deepEqual(view.project(m).tableActions.map(a=>a.type),['play','pass','pass','pass']);
 const id=m.hand[0].id;m.commit(0,[id]);assert.deepEqual(view.project(m).tableActions.map(a=>a?.ids||null),[[id],null,null,null]);
});
test('saved games reconstruct the same table without adding private cards or changing state',()=>{
 const m=orderedMatch();play(m,'3');play(m,'4');pass(m);play(m,'6');
 const before=JSON.stringify(m.state),restored=new Match(JSON.parse(before));
 assert.deepEqual(view.project(restored).tableActions,view.project(m).tableActions);
 const actions=view.project(m).tableActions;actions[0].cards[0].rank='bad';actions[1].ids.length=0;
 assert.equal(JSON.stringify(m.state),before);
 const ids=new Set(view.tableCards(view.project(m)).map(c=>c.id));
 for(const p of m.game.players)for(const c of p.hand)assert.equal(ids.has(c.id),false);
});
test('LAN perspectives rotate all four actions including PASS and preserve trick boundaries',()=>{
 const m=orderedMatch();play(m,'3');play(m,'4');pass(m);play(m,'6');
 for(const viewer of [0,1,2,3]){
   const p=perspective(m,viewer,['Mac','Pad','知秋','墨白']);const remote=view.tableActions(p.state.game,p.state.level),local=view.project(m).tableActions;
   for(let seat=0;seat<4;seat++)assert.deepEqual(remote[(seat-viewer+4)%4],{...local[seat],owner:(seat-viewer+4)%4});
 }
 play(m,'7');pass(m);pass(m);pass(m);m.commit(0,[m.hand[0].id]);
 for(const viewer of [0,1,2,3]){const p=perspective(m,viewer,['Mac','Pad','知秋','墨白']);const actions=view.tableActions(p.state.game,p.state.level);assert.equal(actions.filter(Boolean).length,1);assert.ok(actions[(4-viewer)%4]);}
});
test('a finished leader passes the lead to the partner and clears old displays only on that next play',()=>{
 const m=orderedMatch();let g=structuredClone(m.game);g.players[0].hand=[g.players[0].hand[0]];
 core.setLevel('2');g=core.applyPlay(g,0,core.recognize(g.players[0].hand)[0]);
 for(let n=0;n<3;n++)g=core.applyPass(g,g.currentPlayer);
 assert.equal(g.currentPlayer,2);assert.equal(view.tableActions(g,'2').filter(Boolean).length,4);
 g=core.applyPlay(g,2,core.recognize([g.players[2].hand[0]])[0]);
 assert.deepEqual(view.tableActions(g,'2').map(a=>a?.owner??null),[null,null,2,null]);
});
