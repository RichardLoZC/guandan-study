/* Shared by the table, LAN authority and DanLM worker. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.GuandanPlayRules=factory();
})(globalThis,function(){
  'use strict';
  // Callers have already checked the sequence. Wild cards can fill its suit,
  // so a straight with just one natural suit must be played as a straight flush.
  function isDowngradedStraight(play){
    if(play.type!=='straight'||play.cards.length!==5)return false;
    const natural=play.cards.filter(card=>!card.isWild);
    return natural.length>0&&natural[0].suit!=='joker'&&natural.every(card=>card.suit===natural[0].suit);
  }
  const isAllowedPlay=play=>!isDowngradedStraight(play);
  function ordinaryStraightVariants(hand,cards){
    if(!isDowngradedStraight({type:'straight',cards}))return [cards];
    // The worker initially picks one card per rank. If those happen to share
    // a suit, retain genuine mixed-suit alternatives available in the hand.
    const variants=[];
    for(const [index,card] of cards.entries()){
      if(card.isWild)continue;
      for(const replacement of hand){
        if(replacement.isWild||replacement.rank!==card.rank||replacement.suit===card.suit)continue;
        const alternative=[...cards];alternative[index]=replacement;variants.push(alternative);
      }
    }
    return variants;
  }
  return Object.freeze({isDowngradedStraight,isAllowedPlay,ordinaryStraightVariants});
});
