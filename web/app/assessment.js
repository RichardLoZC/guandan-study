'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('./hand-assessment.js'),require('./starting-reference.js'),require('./card-counts.js'));
  else root.GuandanAssessment=factory(root.GuandanCore,root.GuandanHandAssessment,root.GuandanStartingReference,root.GuandanCardCounts);
})(globalThis,function(core,handAssessment,startingReference,cardCounts){
  const VERSION='1.2.0',STANDARD='0.1.0',FEEDBACK_KEY='guandan-performance-feedback-v1';
  const clone=value=>structuredClone(value);
  const same=(a,b)=>Number.isInteger(a)&&Number.isInteger(b)&&a%2===b%2;
  const seatOK=n=>Number.isInteger(n)&&n>=0&&n<4;
  const bomb=play=>Boolean(play&&['bomb','straight-flush','joker-bomb'].includes(play.type));
  const type=e=>e.playType||(e.kind==='bomb'&&e.label?.startsWith('同花顺')?'straight-flush':e.kind);
  function metric(id,numerator,denominator,{reason=null,value=null,pending=0,reviewed=null}={}){
    return {id,status:reason==='invalid_data'?'invalid':numerator===null?'uncertain':'observed',numerator,denominator,
      rate:numerator!==null&&denominator>0?numerator/denominator:null,value,pending,
      missingReason:reason||(denominator===0?'no_opportunity':null),reviewed,
      interval:null,grade:null,referenceVersion:null};
  }
  function visibleHand(round,eventIndex,seat){
    const event=round.events[eventIndex];
    if(seat===0)return Array.isArray(event?.ownBefore)?clone(event.ownBefore):null;
    if(!round.completed)return null;
    const ending=round.revealedHands?.find(item=>item.seat===seat)?.cards;
    if(!ending&&!round.actuallyFinished?.includes(seat))return null;
    return clone([...(ending||[]),...round.events.slice(eventIndex).filter(e=>e.seat===seat).flatMap(e=>e.cards)]);
  }
  function initialHand(round,seat){
    if(round.phase&&round.phase!=='playing')return null;
    if(round.events.length)return visibleHand(round,0,seat);
    return seat===0?clone(round.initialOwnHand||[]):null;
  }
  function resourceProfile(hand,level){
    if(!hand)return null;
    const ranks={},suits={};
    for(const c of hand){if(c.suit!=='joker'&&!c.isWild)ranks[c.rank]=(ranks[c.rank]||0)+1;suits[c.suit]=(suits[c.suit]||0)+1;}
    return {cards:hand.length,wilds:hand.filter(c=>c.isWild).length,jokers:hand.filter(c=>c.suit==='joker').length,
      naturalBombRanks:Object.keys(ranks).filter(r=>ranks[r]>=4),naturalPairRanks:Object.keys(ranks).filter(r=>ranks[r]>=2),
      naturalTripleRanks:Object.keys(ranks).filter(r=>ranks[r]>=3),rankCounts:ranks,suitCounts:suits,
      straightFlushPatterns:straightFlushes(hand,level).length,structuralLowerBound:null,
      note:'组合可能重叠，不能相加为总牌力；尚未进行起手校正。'};
  }
  // Covers all suit/sequence possibilities, not all interchangeable physical copies.
  function straightFlushes(hand,level){
    const rank=v=>v===1||v===14?'A':({11:'J',12:'Q',13:'K'}[v]||String(v));
    const wilds=hand.filter(c=>c.isWild),out=[];
    for(const suit of ['clubs','diamonds','hearts','spades'])for(let low=1;low<=10;low++){
      const sequence=Array.from({length:5},(_,i)=>low+i),cards=[];let missing=0;
      for(const v of sequence){const c=hand.find(c=>!c.isWild&&c.suit===suit&&c.rank===rank(v));if(c)cards.push(c);else missing++;}
      if(missing<=wilds.length)out.push({type:'straight-flush',primaryValue:low+4,size:5,suit,sequence,cards:[...cards,...wilds.slice(0,missing)]});
    }
    return out;
  }
  function integrity(round){
    const errors=[],seen=new Set();let checked=0;
    if(round.completed){
      const order=round.finishOrder,last=round.events.at(-1),issues=[];
      if(!Array.isArray(order)||order.length!==4||order.some(s=>!seatOK(s))||new Set(order).size!==4||round.winnerTeam!==order[0]%2)issues.push('final_result_conflict');
      if(!last||!Array.isArray(round.remaining)||round.remaining.length!==4||round.remaining.some((n,s)=>n!==last.remaining?.[s]))issues.push('final_counts_conflict');
      if(issues.length)errors.push({eventIndex:null,reasons:issues});
    }
    for(let i=0;i<round.events.length;i++){
      const e=round.events[i],issues=[];
      if(e.index!==i||!seatOK(e.seat))issues.push('event_identity');
      if(!Array.isArray(e.remainingBefore)||!Array.isArray(e.remaining)||e.remaining.length!==4||e.remainingBefore.length!==4)issues.push('card_counts_missing');
      else{
        if(e.remaining.some(n=>!Number.isInteger(n)||n<0||n>27))issues.push('invalid_count');
        for(let s=0;s<4;s++)if(e.remaining[s]!==e.remainingBefore[s]-(s===e.seat?e.cards.length:0))issues.push('count_transition');
        if(i&&round.events[i-1].remaining.some((n,s)=>n!==e.remainingBefore[s]))issues.push('count_continuity');
      }
      for(const c of e.cards){if(!c?.id||seen.has(c.id))issues.push('duplicate_or_missing_card');seen.add(c?.id);}
      if(issues.length)errors.push({eventIndex:i,reasons:[...new Set(issues)]});else checked++;
    }
    return {checked,total:round.events.length,errors,replayVerified:null,
      replayReason:'record_checks_only; independent rule replay is performed by the offline verifier'};
  }
  function contests(round){
    const windows=[];let current=null;
    for(const e of round.events){
      if(!current)current={id:round.id+':trick:'+windows.length,start:e.index,events:[],closed:false,freeLeader:null,terminal:false};
      current.events.push(e);current.end=e.index;
      const terminal=Boolean(round.completed&&e.index===round.events.length-1);
      if(!e.tableAfter||terminal){
        current.closed=true;current.terminal=terminal;
        if(!terminal){
          const owner=e.tableBefore?.owner??e.seat;
          const next=round.events[e.index+1];
          current.freeLeader=seatOK(e.nextLeader)?e.nextLeader:next&&!next.tableBefore?next.seat:
            e.remaining[owner]>0?owner:e.remaining[(owner+2)%4]>0?(owner+2)%4:null;
        }
        windows.push(current);current=null;
      }
    }
    if(current)windows.push(current);
    return windows;
  }
  function controlSegments(round,windows){
    const segments=[],first=round.events[0];if(!first)return segments;
    let active={id:round.id+':control:0',seat:first.seat,leader:first.seat,team:first.seat%2,start:0,cards:[0,0,0,0],bombs:[0,0,0,0],partnerHandoffs:0,recaptured:false,closed:false};
    for(const w of windows){
      for(const e of w.events){active.cards[e.seat]+=e.cards.length;if(e.cards.length&&['bomb','straight-flush','joker-bomb'].includes(type(e)))active.bombs[e.seat]++;}
      active.end=w.end;
      if(!w.closed)continue;
      if(w.terminal){active.closed=true;active.endReason='round_end';segments.push(active);active=null;break;}
      if(!seatOK(w.freeLeader)){active.endReason='unknown_next_leader';continue;}
      if(w.freeLeader%2!==active.team){
        active.closed=true;active.endReason='opponent_lead';active.nextLeader=w.freeLeader;segments.push(active);
        active={id:round.id+':control:'+segments.length,seat:w.freeLeader,leader:w.freeLeader,team:w.freeLeader%2,start:w.end+1,cards:[0,0,0,0],bombs:[0,0,0,0],partnerHandoffs:0,recaptured:true,closed:false};
      }else{if(w.freeLeader!==active.leader)active.partnerHandoffs++;active.leader=w.freeLeader;}
    }
    if(active)segments.push(active);return segments;
  }
  function receptions(round,seat){
    const result=[];
    for(const e of round.events){
      const partner=(seat+2)%4;
      if(e.seat!==seat||!e.cards.length||e.remainingBefore[partner]===0)continue;
      let response='open',end=null,partnerPassed=false;
      for(const later of round.events.slice(e.index+1)){
        if(later.cards.length){response=later.seat===partner?'partner_play':'intercepted';end=later.index;break;}
        if(later.seat===partner)partnerPassed=true;
        if(!later.tableAfter){response=later.nextLeader===partner?'partner_wind':partnerPassed?'partner_pass':'other_lead';end=later.index;break;}
      }
      if(response==='open'&&round.completed)response='terminal_before_response';
      result.push({eventIndex:e.index,response,end,closed:response!=='open'&&response!=='terminal_before_response'});
    }
    return result;
  }
  function assess(round,seat=0){
    if(!round||!Array.isArray(round.events)||!seatOK(seat))throw new Error('无法评审：缺少有效牌局或座位');
    const events=round.events,my=events.filter(e=>e.seat===seat),windows=contests(round),segments=controlSegments(round,windows),checks=integrity(round);
    const attacks=windows.flatMap(w=>w.events.filter(e=>e.seat===seat&&e.cards.length&&e.tableBefore&&!same(e.tableBefore.owner,seat)).map(e=>({eventIndex:e.index,window:w})));
    const resolvedActions=attacks.filter(a=>a.window.closed&&seatOK(a.window.freeLeader));
    const resolved=[...new Map(resolvedActions.map(a=>[a.window.id,a])).values()];
    const controlContests=resolved.map(a=>({id:a.window.id,kind:'next-free-lead',success:same(a.window.freeLeader,seat),
      owner:a.window.freeLeader,attacks:resolvedActions.filter(other=>other.window.id===a.window.id).map(other=>other.eventIndex)}));
    const terminalContests=windows.filter(w=>w.terminal).flatMap(w=>{
      const ownAttacks=attacks.filter(a=>a.window.id===w.id);if(!ownAttacks.length)return [];
      return [{id:w.id,kind:'terminal-contest',success:null,attacks:ownAttacks.map(a=>a.eventIndex),
        owner:events[w.end].tableAfter?.owner??null,terminalActor:events[w.end].seat,winnerTeam:round.winnerTeam,scoringContribution:0}];
    });
    const ownedSegments=segments.filter(s=>s.team===seat%2),closedSegments=ownedSegments.filter(s=>s.closed);
    const recaptured=segments.filter(s=>s.seat===seat&&s.recaptured&&s.closed);
    const flushes=my.filter(e=>type(e)==='straight-flush');
    const distribution={lead:0,overOrdinary:0,overBomb:0,overPartner:0};
    for(const e of flushes){if(!e.tableBefore)distribution.lead++;else{if(bomb(e.tableBefore.play))distribution.overBomb++;else distribution.overOrdinary++;if(same(e.tableBefore.owner,seat))distribution.overPartner++;}}
    let flushOpportunities=0,flushSelected=0,flushUnknown=0;
    if(round.ruleMode==='classic')for(const e of my){
      const hand=visibleHand(round,e.index,seat);
      if(!hand){flushUnknown++;continue;}
      if(straightFlushes(hand,round.level).some(p=>!e.tableBefore||core.beats(p,e.tableBefore.play))){flushOpportunities++;if(type(e)==='straight-flush')flushSelected++;}
    }
    const responses=receptions(round,seat),closedResponses=responses.filter(r=>r.closed);
    const startingHand=initialHand(round,seat),profile=resourceProfile(startingHand,round.level);
    const handScore=handAssessment.evaluate(startingHand,round.level,round.ruleMode);
    const unreviewed=(id,opportunities=null,reason='no_validated_judge')=>metric(id,null,0,{reason,value:{candidateOpportunities:opportunities},reviewed:0});
    const metrics=[
      metric('P01',resolved.filter(a=>same(a.window.freeLeader,seat)).length,resolved.length,{pending:attacks.filter(a=>!a.window.closed||!a.window.terminal&&!seatOK(a.window.freeLeader)).length,value:{distinctClosedContests:resolved.length,legacyActionDenominator:resolvedActions.length,terminalExcluded:attacks.filter(a=>a.window.terminal).length,contests:controlContests,terminalContests}}),
      metric('P02',closedSegments.filter(s=>s.endReason==='opponent_lead').length,closedSegments.length,{pending:ownedSegments.length-closedSegments.length,value:{partnerHandoffs:ownedSegments.reduce((n,s)=>n+s.partnerHandoffs,0),partnerSegments:closedSegments.filter(s=>s.partnerHandoffs>0).length,roundEnd:closedSegments.filter(s=>s.endReason==='round_end').length}}),
      unreviewed('P03',closedSegments.filter(s=>s.endReason==='opponent_lead').length),unreviewed('P04',my.filter(e=>!e.cards.length&&e.tableBefore&&!same(e.tableBefore.owner,seat)).length),
      metric('P05',recaptured.length,recaptured.length,{reason:recaptured.length?null:'no_opportunity',value:{cardsShed:recaptured.reduce((n,s)=>n+s.cards[seat],0),partnerCardsShed:recaptured.reduce((n,s)=>n+s.cards[(seat+2)%4],0),controlPlays:recaptured.reduce((n,s)=>n+s.bombs[seat],0),segments:recaptured},pending:segments.filter(s=>s.seat===seat&&s.recaptured&&!s.closed).length}),
      metric('F01',flushes.length,flushes.length,{value:distribution}),
      metric('F02',round.ruleMode==='classic'&&!(flushUnknown&&flushUnknown===my.length)?flushSelected:null,flushOpportunities,{reason:round.ruleMode!=='classic'?'unsupported_rule_mode':flushUnknown?'private_hand_unavailable':null,pending:flushUnknown,value:{evaluatedDecisions:my.length-flushUnknown,enumeration:'all suit/sequence feasibility; physical variants not enumerated'}}),
      unreviewed('F03',my.filter(e=>e.cards.length&&['bomb','straight-flush','joker-bomb'].includes(type(e))).length),unreviewed('F04'),
      metric('T01',closedResponses.filter(r=>r.response==='partner_play'||r.response==='partner_wind').length,closedResponses.length,{pending:responses.length-closedResponses.length,value:{responses,effectiveness:null,confirmedHelpful:null,partnerPlay:responses.filter(r=>r.response==='partner_play').length,partnerWind:responses.filter(r=>r.response==='partner_wind').length,scoringContribution:0}}),
      unreviewed('T02',responses.length),unreviewed('T03'),
      metric('H01',profile?1:null,profile?1:0,{reason:profile?null:round.phase&&round.phase!=='playing'?'tribute_not_completed':'private_hand_unavailable',value:profile}),
      unreviewed('H02',null,'no_calibrated_reference'),unreviewed('H03'),unreviewed('I01',null,'no_predecision_prediction'),unreviewed('R01'),
      metric('Q01',checks.checked,checks.total,{reason:checks.errors.length?'invalid_data':null,value:{...checks,provenanceCovered:my.filter(e=>e.decision).length,decisions:my.length}})
    ];
    metrics.find(m=>m.id==='P01').definitionVersion='unique-seat-contest-0.2.0';
    metrics.find(m=>m.id==='T01').definitionVersion='observed-continuation-only-0.2.0';
    const cases=my.flatMap(e=>{ 
      const tags=[],indexIds=[];
      if(e.cards.length&&['bomb','straight-flush','joker-bomb'].includes(type(e))){tags.push('使用控制牌');indexIds.push('F03');}
      if(type(e)==='straight-flush'){tags.push(e.tableBefore?bomb(e.tableBefore.play)?'同花顺压控制牌':'同花顺压普通牌':'同花顺领出');indexIds.push('F01');}
      if(e.tableBefore&&e.cards.length&&same(e.tableBefore.owner,seat)){tags.push('压队友');indexIds.push('T03');}
      if(!e.cards.length&&e.tableBefore){tags.push('过牌待评');if(!same(e.tableBefore.owner,seat))indexIds.push('P04');}
      if(e.cards.some(c=>c.isWild)){tags.push('使用逢人配');indexIds.push('H03');}
      if(responses.some(r=>r.eventIndex===e.index&&['partner_play','partner_wind'].includes(r.response))){tags.push('队友接续');indexIds.push('T02');}
      if(e.remainingBefore.some((n,s)=>s%2!==seat%2&&n>0&&cardCounts.reported(n))){tags.push('对手临近走完');indexIds.push('R01');}
      if(!tags.length)return [];
      const forced=e.engine==='规则自动不出',count=e.decision?.candidatesReported,available=Number.isInteger(count)?count>1:null;
      return [{id:round.id+':'+e.index+':'+seat,eventIndex:e.index,seat,
        status:forced?'forced-observation':available===false?'single-candidate-observation':'candidate',grade:null,indexIds:[...new Set(indexIds)],
        decisionEligible:forced?false:available,reportedCandidates:count??null,
        notDecisionReason:forced?'rule-forced-pass':available===false?'no-reported-alternative':available===null?'choice-availability-unverified':null,
        tags,reward:null,eligibleForTraining:false,
        note:'关键节点候选；玩家试评和事后结果不直接成为奖惩，替代动作合法性与收益仍需验证。',observationAvailable:Boolean(visibleHand(round,e.index,seat))}];
    });
    return {schema:1,implementationVersion:VERSION,standardVersion:STANDARD,roundId:round.id,seat,scope:'one-round',
      provenance:clone(globalThis.GuandanAssessmentProvenance||null),compositeScore:null,scoringState:'awaiting_calibration',metrics,cases,
      handAssessment:handScore,keyNodeVersion:'decision-nodes-0.3.0',endgameThreshold:cardCounts.THRESHOLD,teamReference:startingReference.evaluate(round,round.completed&&round.ruleMode==='classic'&&!checks.errors.length?[0,1,2,3].map(s=>handAssessment.evaluate(initialHand(round,s),round.level,round.ruleMode).score):null),trainingSignal:{eligible:false,reward:null,stage:'human_feedback_first'},
      windows:windows.map(({events,...window})=>({...window,eventIndices:events.map(e=>e.index)})),segments,
      result:{completed:round.completed,winnerTeam:round.winnerTeam,placement:round.placement,seriesOutcome:round.seriesOutcome||null},
      boundary:'技术统计描述发生的事实；候选不等于失误，模型分数不等于胜率。'};
  }
  function observation(round,eventIndex,seat){
    const event=round.events[eventIndex],hand=visibleHand(round,eventIndex,seat);
    if(!event||event.seat!==seat||!hand)throw new Error('缺少该行动者当时的合法手牌，无法生成评审题');
    return {schema:1,visibility:'acting-player-only',seat,level:round.level,ruleMode:round.ruleMode,
      teamLevels:clone(round.levels||null),aceAttempts:clone(round.aceAttempts||null),known:clone(round.known||[]),tributeRecords:clone(round.tributeRecords||[]),
      hand,remaining:[...event.remainingBefore],table:clone(event.tableBefore),
      history:round.events.slice(0,eventIndex).map(e=>({seat:e.seat,cards:clone(e.cards),playType:type(e),playKey:e.playKey||null})),
      actual:{type:event.cards.length?'play':'pass',cards:clone(event.cards),playKey:event.playKey||null,playType:type(event)},
      excludes:['other-private-hands','future-actions','final-result','model-scores','suspicion-labels']};
  }
  function readFeedback(storage){
    const raw=storage.getItem(FEEDBACK_KEY);if(!raw)return [];
    const list=JSON.parse(raw);if(!Array.isArray(list))throw new Error('评审意见数据损坏，请先导出备份');return list;
  }
  async function saveFeedback(storage,round,eventIndex,seat,{reviewer,rating,reason,alternative}){
    const input=observation(round,eventIndex,seat);
    if(!Number.isInteger(rating)||rating<1||rating>5)throw new Error('请选择 1–5 档评价');
    reviewer=String(reviewer||'').trim().slice(0,48);reason=String(reason||'').trim().slice(0,2000);alternative=String(alternative||'').trim().slice(0,1000);
    if(!reviewer||!reason)throw new Error('请填写评审代号和评价依据');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(input)));
    const observationSha256=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    const write=()=>{
    const list=readFeedback(storage);
    if(list.length>=240)throw new Error('本批已保留 240 条意见，请导出并在存储管理中开始新批次');
    const eventId=round.id+':'+eventIndex+':'+seat;
    const prior=list.findLast(r=>r.eventId===eventId&&r.reviewer===reviewer);
    const record={id:crypto.randomUUID(),eventId,roundId:round.id,eventIndex,seat,reviewer,rating,reason,alternative,
      standardVersion:STANDARD,implementationVersion:VERSION,createdAt:new Date().toISOString(),revisionOf:prior?.id||null,
      status:'unverified_expert_opinion',blinding:'ui-hidden-not-verified',observationSha256};
    const raw=JSON.stringify([...list,record]);
    if(raw.length>256000)throw new Error('本批意见已达存储上限，请导出并开始新批次；为牌局存档保留空间');
    storage.setItem(FEEDBACK_KEY,raw);return record;
    };
    return globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('guandan-performance-feedback',async()=>write()):write();
  }
  async function startFeedbackBatch(storage,{acknowledged,expectedIds}){
    if(acknowledged!==true)throw new Error('请先保存导出文件，并明确确认已备份');
    const write=()=>{
    const list=readFeedback(storage);
    if(JSON.stringify(list.map(r=>r.id))!==JSON.stringify(expectedIds))throw new Error('意见已发生变化，请重新导出后再开始新批次');
    storage.setItem(FEEDBACK_KEY,'[]');return list.length;
    };
    if(globalThis.navigator?.locks?.request)return globalThis.navigator.locks.request('guandan-performance-feedback',async()=>write());
    if(globalThis.window)throw new Error('当前浏览器缺少安全批次锁，保留原意见；请更新浏览器后再试');
    return write();
  }
  return Object.freeze({VERSION,STANDARD,FEEDBACK_KEY,assess,observation,visibleHand,resourceProfile,straightFlushes,readFeedback,saveFeedback,startFeedbackBatch});
});
