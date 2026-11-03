'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GuandanAssessmentRatingLegacy=factory();})(globalThis,function(){
  const VERSION='stats-rating-0.2.0';
  // A transparent pilot display rubric, not a calibrated estimate of tactical quality.
  // These contributions must never become move-selection rules or training rewards.
  function rate(round,report){
    const empty=reason=>({version:VERSION,score:null,reason,trial:true,startingHandAdjusted:false,tacticalGrade:null,components:[]});
    if(!round.completed)return empty('round_in_progress');
    const metric=id=>report.metrics.find(m=>m.id===id),quality=metric('Q01');
    if(quality?.status==='invalid'||!Array.isArray(round.remaining)||round.remaining.length!==4||round.remaining.some(n=>!Number.isInteger(n)||n<0||n>27)||
      !round.events.length||round.remaining.some((n,s)=>n!==round.events.at(-1).remaining[s])||![0,1].includes(round.winnerTeam))return empty('invalid_data');
    const seat=report.seat,won=seat%2===round.winnerTeam;
    const double=round.finishOrder?.length===4&&round.finishOrder[0]%2===round.finishOrder[1]%2;
    const takeover=metric('P01'),support=metric('T01'),cards=27-round.remaining[seat];
    const components=[{id:'base',value:6,formula:'6.0'},
      {id:'team-result',value:won?0.2:-0.2,formula:'本队本副获胜 +0.2，失利 −0.2'},
      {id:'double-finish',value:double?(won?0.1:-0.1):0,formula:'本队双上 +0.1，双下 −0.1，否则 0'},
      {id:'cards-played',value:0.8*(2*cards/27-1),formula:'0.8 × (2 × 本人实际打出张数 / 27 − 1)',numerator:cards,denominator:27},
      {id:'regained-lead',value:takeover.denominator?0.7*(2*takeover.rate-1)*Math.min(takeover.denominator/4,1):0,
        formula:'0.7 × (2 × 夺回领牌率 − 1) × min(已闭合跟压数 / 4, 1)；无机会贡献为 0',numerator:takeover.numerator,denominator:takeover.denominator},
      {id:'partner-continuation',value:0.5*Math.min(support.numerator,3)/3,formula:'0.5 × min(队友实际接续次数, 3) / 3；接续不代表已确认有效助攻',numerator:support.numerator,denominator:support.denominator}];
    const raw=components.reduce((sum,c)=>sum+c.value,0),score=Math.round(Math.max(1,Math.min(10,raw))*10)/10;
    return {version:VERSION,score,raw,reason:null,trial:true,startingHandAdjusted:false,tacticalGrade:null,components,
      note:'玩家试评版：降低胜负权重，手牌结构分独立显示；尚未做可靠起手校正或战术评审。统计次数不等于打法正确，不得直接作为训练奖励。'};
  }
  return Object.freeze({VERSION,rate});
});
