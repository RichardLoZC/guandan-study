'use strict';
const core=require('../../web/app/core.js'),{Match}=require('../../web/app/match.js');
function finished(order=[0,1,3,2],{level='A',levels=['A','A'],attempts=[0,0]}={}){
  const state=core.newMatch();state.level=level;state.levels=[...levels];state.aceAttempts=[...attempts];
  core.setLevel(level);
  for(const player of state.game.players)for(const card of player.hand)card.isWild=card.suit==='hearts'&&card.rank===level;
  const count=order[0]%2===order[1]%2?2:3;
  for(const seat of order.slice(0,count)){
    const player=state.game.players[seat];
    for(const [index,card] of player.hand.entries())state.game.actionHistory.push({seat,play:core.recognize([card])[0],handCountAfter:26-index,tableOwnerAfter:null,tablePlayAfter:null});
    player.hand=[];player.finished=true;
  }
  const team=order[0]%2,partnerPlace=order.indexOf((order[0]+2)%4)+1;
  state.game.finishOrder=order;state.game.result={winnerTeam:team,levelDelta:5-partnerPlace,summary:'fixture'};
  state.game.currentPlayer=order.at(-1);return new Match(state);
}
module.exports={finished};
