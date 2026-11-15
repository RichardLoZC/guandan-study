'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./hand-assessment.js'),require('./hand-strength.js'));
  else root.GuandanPrivateHandScore=factory(root.GuandanHandAssessment,root.GuandanHandStrength);
})(globalThis,function(hand,strength){
  const VERSION='private-starting-hand-0.3.0';
  function readOwn(match){
    const empty=reason=>({version:VERSION,handVersion:hand.VERSION,score:null,structureScore:null,scale:null,reason,visibility:'self-only',eligibleForTraining:false,reward:null});
    if(!match)return empty('no_round');
    if(match.isTuo3)return empty('unsupported_rule_mode');
    const current=match.hand;if(!Array.isArray(current))return empty('hand_unavailable');
    const provisional=match.phase!=='playing';
    const cards=provisional?current:[...current,...match.game.actionHistory.filter(e=>e.seat===0).flatMap(e=>e.play?.cards||[])];
    if(cards.length!==27)return empty(provisional?'tribute_in_progress':'starting_hand_incomplete');
    const result=hand.evaluate(cards,match.level,'classic');if(result.score===null)return empty('invalid_hand');
    const scale=strength.points(result.score,match.level,{handVersion:result.version});if(scale.score===null)return empty(scale.reason);
    return {...empty(null),handVersion:result.version,score:scale.score,structureScore:result.score,scale,provisional,calibrated:false};
  }
  return Object.freeze({VERSION,readOwn});
});
