const test=require('node:test'),assert=require('node:assert/strict');
const view=require('../web/app/presentation.js');
const {Match}=require('../web/app/match.js');
test('turn status distinguishes solo AI, LAN humans and tribute phases',()=>{
 const round={game:{result:null},phase:'playing',actingSeat:1};
 assert.deepEqual(view.turnStatus(round),{seat:1,kind:'ai',label:'思考中'});
 round.remote=true;round.humanSeats=[0,1,3];assert.deepEqual(view.turnStatus(round),{seat:1,kind:'human',label:'正在出牌'});
 round.actingSeat=2;assert.equal(view.turnStatus(round).kind,'ai');
 round.actingSeat=3;round.phase='return';assert.equal(view.turnStatus(round).label,'正在还贡');
 round.phase='give';assert.equal(view.turnStatus(round).label,'正在进贡');
 round.humanSeats=[0,1,2,3];round.phase='playing';for(let seat=0;seat<4;seat++){round.actingSeat=seat;assert.equal(view.turnStatus(round).kind,'human');}
});
test('turn marker clears for blocked, finished and tribute-confirmation states',()=>{
 const round={game:{result:null},phase:'playing',actingSeat:1};
 assert.equal(view.turnStatus(round,{blocked:true}),null);
 for(const key of ['needsTributeConfirmation','confirmWaiting'])assert.equal(view.turnStatus({...round,[key]:true}),null);
 assert.equal(view.turnStatus({...round,game:{result:{}}}),null);
 assert.equal(view.turnStatus({...round,actingSeat:-1}),null);
 assert.equal(view.turnStatus(null),null);
});
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
