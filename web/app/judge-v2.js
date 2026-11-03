'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./hand-assessment-legacy.js'),require('./assessment-legacy.js'));
  else root.GuandanJudgeV2=factory(root.GuandanHandAssessmentLegacy,root.GuandanAssessmentLegacy);
})(globalThis,function(legacyHand,legacyAssessment){
  const VERSION='research-judge-0.2.0',HAND_VERSION='hand-orbit-0.2.0',RATING_VERSION='research-rating-0.3.0';
  const suits=['clubs','diamonds','spades'],permutations=[['clubs','diamonds','spades'],['clubs','spades','diamonds'],
    ['diamonds','clubs','spades'],['diamonds','spades','clubs'],['spades','clubs','diamonds'],['spades','diamonds','clubs']];
  const cache=new Map(),clone=v=>structuredClone(v);
  function handScore(cards,level,mode='classic'){
    const initial=legacyHand.evaluate(cards,level,mode);
    if(initial.score===null)return {...initial,version:HAND_VERSION};
    const key=level+':'+cards.map(c=>c.id).sort().join('|');if(cache.has(key))return clone(cache.get(key));
    let best=null,totalExpanded=0;
    for(const order of permutations){
      const mapping=Object.fromEntries(suits.map((s,i)=>[s,order[i]])),inverse=Object.fromEntries(suits.map((s,i)=>[order[i],s]));
      const transformed=cards.map(c=>{const suit=mapping[c.suit]||c.suit;return {...c,suit,id:c.deck+'-'+suit+'-'+c.rank};});
      const result=legacyHand.evaluate(transformed,level,mode),signature=transformed.map(c=>c.id).sort().join('|');
      totalExpanded+=result.search?.expanded||0;
      if(!best||result.score>best.result.score||result.score===best.result.score&&signature<best.signature)best={result,inverse,signature};
    }
    const inverseId=id=>{const [deck,suit,rank]=id.split('-');return deck+'-'+(best.inverse[suit]||suit)+'-'+rank;};
    const result={...clone(best.result),version:HAND_VERSION,method:'finite-suit-orbit-maximum',
      groups:best.result.groups.map(g=>({...g,cardIds:g.cardIds.map(inverseId)})),
      symmetry:{group:'S3 on clubs/diamonds/spades; hearts fixed',elements:6,scoreInvariant:true,baselineVersion:legacyHand.VERSION},
      search:{...best.result.search,orbitExpanded:totalExpanded,orbitSize:6},optimal:false,
      note:'对固定红桃的六种等价花色逐一搜索，取最高合法拆分并映回原牌；分数不受非红桃花色命名影响。仍非全局最优、胜率或百分位。'};
    if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(key,result);return clone(result);
  }
  // The 4 pseudo-observations are fixed regularization. Contests in one deal
  // are dependent, so this is NOT a calibrated Bayesian probability/interval.
  function smoothControl(success,total,alpha=2){
    if(!Number.isInteger(total)||!Number.isInteger(success)||success<0||success>total||!(alpha>0))throw Error('Invalid control counts');
    return {priorAlpha:alpha,priorBeta:alpha,success,total,smoothedRate:(success+alpha)/(total+2*alpha),
      contribution:0.7*(2*(success+alpha)/(total+2*alpha)-1),calibrated:false,interval:null};
  }
  function assess(round,seat=0,existing){
    const old=existing||legacyAssessment.assess(round,seat),report=clone(old);
    const metric=id=>report.metrics.find(m=>m.id===id),control=metric('P01'),windows=[];
    for(const w of old.windows){
      if(!w.closed)continue;
      const attacks=w.eventIndices.filter(i=>{const e=round.events[i];return e.seat===seat&&e.cards.length&&e.tableBefore&&e.tableBefore.owner%2!==seat%2;});
      if(!attacks.length)continue;
      if(w.terminal){const owner=round.events[w.end].tableAfter?.owner;
        if(Number.isInteger(owner))windows.push({id:w.id,kind:'terminal-contest',success:null,attacks,owner,
          terminalActor:round.events[w.end].seat,winnerTeam:round.winnerTeam,scoringContribution:0});
      }else if(Number.isInteger(w.freeLeader))windows.push({id:w.id,kind:'next-free-lead',success:w.freeLeader%2===seat%2,attacks,owner:w.freeLeader});
    }
    const regular=windows.filter(w=>w.kind==='next-free-lead'),terminal=windows.filter(w=>w.kind==='terminal-contest');
    control.definitionVersion='unique-seat-contest-0.2.0';control.numerator=regular.filter(w=>w.success).length;control.denominator=regular.length;
    control.rate=regular.length?control.numerator/regular.length:null;
    control.value={legacyActionDenominator:old.metrics.find(m=>m.id==='P01').denominator,
      distinctClosedContests:regular.length,contests:regular,terminalContests:terminal,
      note:'非终局按玩家×争墩计一次；终局最后桌面控制另列，不称重新领牌。'};
    const input=round.events.length?legacyAssessment.visibleHand(round,0,seat):seat===0?round.initialOwnHand:null;
    report.handAssessment=handScore(input,round.level,round.ruleMode);
    report.implementationVersion=VERSION;report.keyNodeVersion='decision-nodes-0.2.0';
    report.cases=report.cases.map(c=>{const e=round.events[c.eventIndex],forced=e.engine==='规则自动不出',count=e.decision?.candidatesReported;
      const available=Number.isInteger(count)?count>1:null;
      return {...c,decisionEligible:forced?false:available,reportedCandidates:count??null,
        notDecisionReason:forced?'rule-forced-pass':available===false?'no-reported-alternative':available===null?'choice-availability-unverified':null,
        status:forced?'forced-observation':available===false?'single-candidate-observation':c.status};});
    const support=metric('T01');support.definitionVersion='observed-continuation-only-0.2.0';
    support.value={...support.value,partnerPlay:support.value.responses.filter(r=>r.response==='partner_play').length,
      partnerWind:support.value.responses.filter(r=>r.response==='partner_wind').length,confirmedHelpful:null,
      scoringContribution:0,note:'接着出牌可能是助攻也可能是有害压队友；未经替代动作验证不加分。'};
    const quality=metric('Q01'),empty=reason=>({version:RATING_VERSION,score:null,reason,trial:true,components:[],startingHandAdjusted:false,tacticalGrade:null});
    if(!round.completed)report.statisticsRating=empty('round_in_progress');
    else if(quality.status==='invalid'||!round.remaining||round.remaining.length!==4||!round.events.length||
      round.remaining.some((n,s)=>!Number.isInteger(n)||n<0||n>27||n!==round.events.at(-1).remaining[s])||
      !Array.isArray(round.finishOrder)||new Set(round.finishOrder).size!==4||![0,1].includes(round.winnerTeam))report.statisticsRating=empty('invalid_data');
    else{
      const won=round.winnerTeam===seat%2,double=round.finishOrder[0]%2===round.finishOrder[1]%2;
      const smoothing=smoothControl(regular.filter(w=>w.success).length,regular.length);
      const components=[{id:'base',value:6},{id:'team-result',value:won?.2:-.2},{id:'double-finish',value:double?(won?.1:-.1):0},
        {id:'cards-played',value:.8*(2*(27-round.remaining[seat])/27-1)},
        {id:'unique-control',value:smoothing.contribution,formula:'0.7 × (2 × (成功争墩 + 2) / (争墩数 + 4) − 1)',...smoothing},
        {id:'partner-continuation',value:0,reason:'helpfulness_not_validated'}];
      const raw=components.reduce((n,c)=>n+c.value,0);
      report.statisticsRating={version:RATING_VERSION,score:Math.round(Math.max(1,Math.min(10,raw))*10)/10,raw,trial:true,
        reason:null,components,startingHandAdjusted:false,tacticalGrade:null,confirmedAssist:null,
        control:{regular:regular.length,terminal:terminal.length,smoothing},
        note:'研究版统计分：争墩去重及固定先验平滑，未验证接续不加分；起手校正仅另列队伍参考，非个人因果评分。'};
    }
    report.trainingSignal={eligible:false,reward:null,stage:'research_validation'};
    return report;
  }
  return Object.freeze({VERSION,HAND_VERSION,RATING_VERSION,handScore,smoothControl,assess,permutations});
});
