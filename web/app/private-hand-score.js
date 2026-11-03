'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./hand-assessment.js'));
  else root.GuandanPrivateHandScore=factory(root.GuandanHandAssessment);
})(globalThis,function(hand){
  const VERSION='private-starting-hand-0.1.0';
  // The input is the current viewer's Match. Only their hand and their own
  // publicly played cards are used. No seat selector, other hands or network I/O.
  function readOwn(match){
    const empty=reason=>({version:VERSION,handVersion:hand.VERSION,score:null,reason,visibility:'self-only',eligibleForTraining:false,reward:null});
    if(!match)return empty('no_round');
    if(match.isTuo3)return empty('unsupported_rule_mode');
    const current=match.hand;
    if(!Array.isArray(current))return empty('hand_unavailable');
    const provisional=match.phase!=='playing';
    const cards=provisional?current:[...current,...match.game.actionHistory.filter(e=>e.seat===0).flatMap(e=>e.play?.cards||[])];
    if(cards.length!==27)return empty(provisional?'tribute_in_progress':'starting_hand_incomplete');
    const result=hand.evaluate(cards,match.level,'classic');
    if(result.score===null)return empty('invalid_hand');
    return {version:VERSION,handVersion:result.version,score:result.score,provisional,reason:null,
      visibility:'self-only',calibrated:false,eligibleForTraining:false,reward:null};
  }
  return Object.freeze({VERSION,readOwn});
});
