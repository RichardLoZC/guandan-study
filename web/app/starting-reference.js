'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GuandanStartingReference=factory();})(globalThis,function(){
  const VERSION='team-starting-reference-0.1.0',COEFFICIENTS=[1.163022417316173,0.32593426457132385];
  const TRAINING_MANIFEST='1ff8ded47bbfee8740df430032c8bfcb3939cd05d9e2eb5fd83bf43da07454ad';
  function evaluate(round,scores){
    const empty=reason=>({version:VERSION,available:false,reason,visibility:'postround-only',eligibleForTraining:false,reward:null});
    if(!round?.completed)return empty('round_in_progress');
    if(round.ruleMode!=='classic')return empty('unsupported_rule_mode');
    if(!Array.isArray(scores)||scores.length!==4||Array.from(scores).some(n=>!Number.isFinite(n)||n<0||n>100)||
      !Number.isInteger(round.starter)||round.starter<0||round.starter>3||![0,1].includes(round.winnerTeam))return empty('starting_information_unavailable');
    const teamSums=[scores[0]+scores[2],scores[1]+scores[3]],x=[(teamSums[0]-teamSums[1])/20,round.starter%2===0?1:-1],
      z=COEFFICIENTS[0]*x[0]+COEFFICIENTS[1]*x[1],p=z>=0?1/(1+Math.exp(-z)):Math.exp(z)/(1+Math.exp(z)),actual=Number(round.winnerTeam===0);
    return {version:VERSION,available:true,trial:true,calibrated:false,visibility:'postround-only',handVersion:'hand-orbit-0.2.0',
      teamScores:teamSums,probabilities:[p,1-p],outcomeResiduals:[actual-p,p-actual],coefficients:[...COEFFICIENTS],intercept:0,
      trainingDeals:1000,heldoutDeals:1000,trainingManifestSha256:TRAINING_MANIFEST,
      interpretation:'旧版移植DanLM自博弈的队伍起手参考；赛后使用四家起手结构分，不是个人贡献或真人胜率，不加入个人表现分。',
      eligibleForTraining:false,reward:null};
  }
  return Object.freeze({VERSION,evaluate});
});
