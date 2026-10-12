/* Public, read-only presentation data. Never hand the renderer a Match object. */
(function(scope){
  'use strict';
  function publicCard(card,level){
    const suit={hearts:'heart',spades:'spade',clubs:'club',diamonds:'diamond'},rank={A:'Ace',K:'King',Q:'Queen',J:'Jack'};
    return {id:card.id,face:card.face||(card.suit==='joker'?(card.rank==='BJ'?'redJoker':'blackJoker'):suit[card.suit]+(rank[card.rank]||card.rank)),
      rank:card.rank,label:card.label||(card.suit==='joker'?(card.rank==='BJ'?'大王':'小王'):({hearts:'♥',spades:'♠',clubs:'♣',diamonds:'♦'}[card.suit]||'')+card.rank),joker:card.suit==='joker',isWild:card.suit==='hearts'&&card.rank===level};
  }
  function tableActions(game,level){
    const actions=Array(4).fill(null);let closed=false,latestOwner=null;
    // Keep the completed trick visible until the next lead. roundTrace resets
    // on seat 0's turn, so reconstruct trick boundaries from public history.
    for(const event of game.actionHistory||[]){
      if(closed&&event.play)actions.fill(null);
      const cards=(event.play?.cards||[]).map(card=>publicCard(card,level));
      actions[event.seat]={owner:event.seat,type:event.play?'play':'pass',label:event.play?.label||'PASS',ids:cards.map(card=>card.id),cards};
      if(event.play)latestOwner=event.seat;
      closed=event.tablePlayAfter===null;
    }
    // Also support snapshots without history (e.g. a presentation preview).
    if(!game.actionHistory?.length&&game.tablePlay){
      const {owner,play}=game.tablePlay,cards=play.cards.map(card=>publicCard(card,level));
      actions[owner]={owner,type:'play',label:play.label,ids:cards.map(card=>card.id),cards};
      latestOwner=owner;
    }
    // PASS does not replace the latest actual play, including a closed trick.
    for(const action of actions)if(action)action.latest=action.type==='play'&&action.owner===latestOwner;
    return actions;
  }
  function tableCards(snapshot){
    return snapshot.tableActions?snapshot.tableActions.flatMap(action=>action?.cards||[]):snapshot.table?.cards||[];
  }
  function combinationStyle(play){
    let rarity='common',color='#e3e8df';
    if(play?.type==='pair'){rarity='uncommon';color='#9ddd98';}
    else if(play?.type==='triple'){rarity='uncommon';color='#68d5af';}
    else if(play?.type==='full-house'){rarity='rare';color='#70cde6';}
    else if(play?.type==='straight'){rarity='rare';color='#81bcff';}
    else if(play?.type==='pair-run'){rarity='rare';color='#739eff';}
    else if(play?.type==='triple-run'){rarity='rare';color='#a2a6ff';}
    else if(play?.type==='bomb'){
      const size=play.bombSize||play.cards?.length||0;
      rarity=size>=6?'legendary':'epic';
      color=size>=7?'#ffda75':size>=6?'#ffb66d':size===5?'#dfa0f5':'#be9aff';
    }else if(play?.type==='straight-flush'){rarity='legendary';color='#ffa766';}
    else if(play?.type==='joker-bomb'){rarity='crown';color='#ffe797';}
    return {rarity,color};
  }
  const api={tableActions,tableCards,combinationStyle};
  if(typeof module==='object'&&module.exports)module.exports=api;else scope.GuandanPresentation=Object.freeze(api);
})(globalThis);
