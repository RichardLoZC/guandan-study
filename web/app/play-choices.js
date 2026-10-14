/* Human-facing interpretations. The recognizer and DanLM candidate order stay intact. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));
  else root.GuandanPlayChoices=factory(root.GuandanCore);
})(globalThis,function(core){
  'use strict';
  const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const rankName=value=>({1:'A',11:'J',12:'Q',13:'K',14:'A'}[value]||String(value));
  function strongestFirst(plays){
    const types=[...new Set(plays.map(play=>play.type))];
    return [...plays].sort((a,b)=>core.beats(a,b)?-1:core.beats(b,a)?1:types.indexOf(a.type)-types.indexOf(b.type));
  }
  const hasStrongest=plays=>plays.length>0&&plays.slice(1).every(play=>core.beats(plays[0],play));
  // A wildcard keeps its physical identity; this describes its declared role.
  // Full-house kickers do not affect strength and the engine stores no kicker rank.
  function describe(play){
    const wild=play.cards.filter(card=>card.isWild),natural=play.cards.filter(card=>!card.isWild);
    if(!wild.length)return '';
    const missing=[];
    if(play.sequence){
      const copies=play.type==='pair-run'?2:play.type==='triple-run'?3:1;
      for(const value of play.sequence){
        const rank=rankName(value),have=natural.filter(card=>card.rank===rank).length;
        for(let n=have;n<copies;n++)missing.push((play.type==='straight-flush'?{clubs:'♣',diamonds:'♦',hearts:'♥',spades:'♠'}[play.suit]:'')+rank);
      }
    }else{
      const rank=ranks.find(rank=>core.rankValue(rank)===play.primaryValue);
      if(play.type==='full-house'){
        const kicker=natural.find(card=>card.rank!==rank)?.rank;
        for(let n=natural.filter(card=>card.rank===rank).length;n<3;n++)missing.push(rank);
        while(missing.length<wild.length)missing.push(kicker||'附带对子');
      }else for(const card of wild)missing.push(rank||card.rank);
    }
    const source=core.cardLabel(wild[0]);
    return wild.map((card,index)=>source+' → '+missing[index]).join('；');
  }
  return Object.freeze({strongestFirst,hasStrongest,describe});
});
