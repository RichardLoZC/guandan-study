'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GuandanAssessmentRating=factory();})(globalThis,function(){
  const VERSION='pilot-rating-0.3.0';
  // A transparent pilot display rubric, not a calibrated estimate of tactical quality.
  // These contributions must never become move-selection rules or training rewards.
  function rate(round,report){
    const empty=reason=>({version:VERSION,score:null,reason,trial:true,startingHandAdjusted:false,tacticalGrade:null,components:[]});
    if(!round.completed)return empty('round_in_progress');
    const metric=id=>report.metrics.find(m=>m.id===id),quality=metric('Q01');
    if(quality?.status==='invalid'||!Array.isArray(round.remaining)||round.remaining.length!==4||round.remaining.some(n=>!Number.isInteger(n)||n<0||n>27)||
      !round.events.length||round.remaining.some((n,s)=>n!==round.events.at(-1).remaining[s])||![0,1].includes(round.winnerTeam))return empty('invalid_data');
    if(!Array.isArray(round.finishOrder)||round.finishOrder.length!==4||new Set(round.finishOrder).size!==4||round.finishOrder.some(s=>!Number.isInteger(s)||s<0||s>3)||!Number.isInteger(report.seat)||report.seat<0||report.seat>3)return empty('invalid_data');
    const takeover=metric('P01');
    if(takeover?.definitionVersion!=='unique-seat-contest-0.2.0')return empty('definition_mismatch');
    const successes=takeover.numerator,total=takeover.denominator;
    if(!Number.isInteger(successes)||!Number.isInteger(total)||successes<0||successes>total)return empty('invalid_data');
    const seat=report.seat,won=seat%2===round.winnerTeam;
    const double=round.finishOrder?.length===4&&round.finishOrder[0]%2===round.finishOrder[1]%2;
    const cards=27-round.remaining[seat],smoothed=(successes+2)/(total+4);
    const components=[{id:'base',value:6,formula:'6.0'},
      {id:'team-result',value:won?0.2:-0.2,formula:'本队本副获胜 +0.2，失利 −0.2'},
      {id:'double-finish',value:double?(won?0.1:-0.1):0,formula:'本队双上 +0.1，双下 −0.1，否则 0'},
      {id:'cards-played',value:0.8*(2*cards/27-1),formula:'0.8 × (2 × 本人实际打出张数 / 27 − 1)',numerator:cards,denominator:27},
      {id:'unique-control',value:0.7*(2*smoothed-1),
        formula:'0.7 × (2 × (成功争墩 + 2) / (争墩数 + 4) − 1)',numerator:successes,denominator:total,
        priorAlpha:2,priorBeta:2,smoothedRate:smoothed,calibrated:false},
      {id:'partner-continuation',value:0,formula:'队友接续只作事实统计，是否有益待评，暂不加分',reason:'helpfulness_not_validated'}];
    const raw=components.reduce((sum,c)=>sum+c.value,0),score=Math.round(Math.max(1,Math.min(10,raw))*10)/10;
    return {version:VERSION,score,raw,reason:null,trial:true,startingHandAdjusted:false,tacticalGrade:null,components,
      note:'优化试评版：非终局争墩去重并作固定先验平滑；终局与接续另列。队伍起手参考不加入个人分，训练奖惩关闭。'};
  }
  return Object.freeze({VERSION,rate});
});
