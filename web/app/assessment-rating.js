'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GuandanAssessmentRating=factory();})(globalThis,function(){
  const VERSION='post-match-outcome-0.4.0';
  // Outcome display rubric only. A lost lead or bomb is not a proven mistake.
  // No action-count, Q-value, hidden-hand, initial-strength or training reward term.
  function rate(round,report){
    const empty=reason=>({version:VERSION,score:null,reason,trial:true,outcomeBased:true,startingHandAdjusted:false,tacticalGrade:null,components:[],eligibleForTraining:false,reward:null});
    if(!round.completed)return empty('round_in_progress');
    const quality=report.metrics?.find(m=>m.id==='Q01'),s=report.seat,order=round.finishOrder,remaining=round.remaining;
    if(!quality||quality.status!=='observed'||!Number.isInteger(s)||s<0||s>3||
      !Array.isArray(remaining)||remaining.length!==4||remaining.some(n=>!Number.isInteger(n)||n<0||n>27)||
      !Array.isArray(order)||order.length!==4||new Set(order).size!==4||order.some(n=>!Number.isInteger(n)||n<0||n>3)||
      ![0,1].includes(round.winnerTeam)||round.winnerTeam!==order[0]%2||!round.events?.length||
      remaining.some((n,i)=>n!==round.events.at(-1).remaining?.[i]))return empty('invalid_data');
    const finished=round.events.filter(e=>e.cards.length&&e.remainingBefore?.[e.seat]>0&&e.remaining?.[e.seat]===0).map(e=>e.seat);
    if(finished.length<2||new Set(finished).size!==finished.length||finished.some((n,i)=>n!==order[i])||
      remaining.some((n,i)=>(n===0)!==finished.includes(i))||
      round.actuallyFinished&&JSON.stringify(round.actuallyFinished)!==JSON.stringify(finished))return empty('invalid_data');
    const won=s%2===round.winnerTeam,sweep=finished[0]%2===finished[1]%2,played=27-remaining[s],finish=finished.indexOf(s);
    const bonus=finish===0?.8:finish===1?.4:0;
    const components=[{id:'base',value:5.5,formula:'5.5'},
      {id:'team-result',value:won?1:-1,formula:'本队获胜 +1，失利 −1'},
      {id:'double-finish',value:sweep?(won?.2:-.2):0,formula:'双上 +0.2，双下 −0.2，否则 0'},
      {id:'cards-played',value:1.5*(2*played/27-1),numerator:played,denominator:27,formula:'1.5 × (2 × 本人实际出牌张数 / 27 − 1)'},
      {id:'actual-finish',value:bonus,actualFinish:finish<0?null:finish+1,formula:'真实头游 +0.8，真实二游 +0.4，其他及补排名 0'}];
    const raw=components.reduce((sum,c)=>sum+c.value,0);
    return {...empty(null),score:Math.round(Math.max(1,Math.min(10,raw))*10)/10,raw,components,
      actualFinish:finish<0?null:finish+1,cardsPlayed:played,scope:'one-round-outcome',
      note:'终局表现试评；丢权、遇炸、用炸和让牌只作事实统计，不直接判为失误。未校准个人战术能力。'};
  }
  return Object.freeze({VERSION,rate});
});
