'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();else root.GuandanSeries=factory();
})(globalThis,function(){
  const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  // Stored counters describe completed deals BEFORE the current deal. A result
  // is projected here; it is committed once, when the next deal is created.
  function settlement(state){
    if(!state?.game.result||state.ruleMode==='tuo3')return null;
    const team=state.game.result.winnerTeam,order=state.game.finishOrder;
    const partnerPlace=order.indexOf((order[0]+2)%4)+1;
    const atAce=state.level==='A'&&state.levels[team]==='A';
    const victory=atAce&&partnerPlace<4;
    const attempt=atAce&&partnerPlace===4?(state.aceAttempts?.[team]||0)+1:0;
    const demotion=attempt===3,attempts=[0,0];
    if(attempt&&!demotion)attempts[team]=attempt;
    const levels=[...state.levels],wins=[...state.wins];
    if(victory){levels.fill('2');wins[team]++;}
    else levels[team]=demotion?'2':ranks[Math.min(12,ranks.indexOf(levels[team])+state.game.result.levelDelta)];
    return {team,partnerPlace,victory,demotion,attempt,attempts,levels,wins,
      from:state.levels[team],to:levels[team],delta:state.game.result.levelDelta};
  }
  return Object.freeze({settlement});
});
