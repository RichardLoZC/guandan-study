const test=require('node:test'),assert=require('node:assert/strict');
const view=require('../web/app/presentation.js');
const {Match}=require('../web/app/match.js');
test('public table presentation contains committed faces only and cannot mutate a match',()=>{
 const match=new Match(),seat=match.actingSeat,id=match.game.players[seat].hand[0].id;
 match.commit(seat,[id]);const before=JSON.stringify(match.state),actions=view.tableActions(match.game,match.level);
 const cards=view.tableCards({tableActions:actions});assert.equal(cards.length,1);assert.equal(cards[0].id,id);assert.ok(cards[0].face);
 for(const player of match.game.players)for(const card of player.hand)assert.ok(!cards.some(publicCard=>publicCard.id===card.id));
 cards[0].face='mutated';actions[seat].ids.length=0;assert.equal(JSON.stringify(match.state),before);
});
test('a public wildcard, joker and duplicate physical cards retain their correct identity',()=>{
 const game={tablePlay:{owner:1,play:{label:'public',cards:[
  {id:'wild1',rank:'K',suit:'hearts'},{id:'wild2',rank:'K',suit:'hearts'},{id:'joker',rank:'BJ',suit:'joker'}
 ]}}};
 const action=view.tableActions(game,'K')[1];
 assert.deepEqual(action.ids,['wild1','wild2','joker']);assert.equal(action.cards[0].isWild,true);assert.equal(action.cards[1].isWild,true);
 assert.equal(action.cards[2].face,'redJoker');assert.equal(action.cards[2].label,'大王');assert.equal(action.latest,true);
});
