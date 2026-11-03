'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./assessment.js'),require('./assessment-rating.js'));
  else root.GuandanAssessmentPilot=factory(root.GuandanAssessment,root.GuandanAssessmentRating);
})(globalThis,function(assessment,rating){
  const VERSION='player-pilot-0.2.0',KEY='guandan-player-pilot-v1',REVIEWER_KEY='guandan-player-pilot-reviewer-v1';
  const VERDICTS=['high','fair','low','unsure'],MAX_RECORDS=160,MAX_CHARS=384000;
  function read(storage){
    const list=JSON.parse(storage.getItem(KEY)||'[]');
    if(!Array.isArray(list))throw new Error('试评反馈数据损坏，请先导出备份');return list;
  }
  function reviewer(storage){
    let id=storage.getItem(REVIEWER_KEY);
    if(!id){id=crypto.randomUUID();storage.setItem(REVIEWER_KEY,id);}return id;
  }
  async function save(storage,round,seat,input){
    if(!round?.completed||!Number.isInteger(seat)||seat<0||seat>3)throw new Error('请在本副结束后选择玩家试评');
    const report=assessment.assess(round,seat),score=rating.rate(round,report),hand=report.handAssessment;
    if(score.score===null)throw new Error('本副记录不足，暂不能提交评分试评');
    const handVerdict=input.handVerdict,performanceVerdict=input.performanceVerdict;
    if(!VERDICTS.includes(handVerdict)||!VERDICTS.includes(performanceVerdict)||handVerdict==='unsure'&&performanceVerdict==='unsure')throw new Error('请至少评价一项评分');
    if(hand.score===null&&handVerdict!=='unsure')throw new Error('当前模式没有手牌分，请选择“暂不评价”');
    const reason=String(input.reason||'').trim().slice(0,1000);
    if([handVerdict,performanceVerdict].some(v=>v==='high'||v==='low')&&!reason)throw new Error('认为偏高或偏低时，请简要说明原因');
    const suggested=(v,max,min)=>{if(v===''||v===undefined||v===null)return null;const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw new Error('建议分数超出范围');return Math.round(n*10)/10;};
    const suggestedHand=suggested(input.suggestedHand,100,0),suggestedPerformance=suggested(input.suggestedPerformance,10,1);
    if(hand.score===null&&suggestedHand!==null)throw new Error('当前模式没有手牌分');
    const eventIndex=input.eventIndex===''||input.eventIndex===undefined||input.eventIndex===null?null:Number(input.eventIndex);
    if(eventIndex!==null&&(!Number.isInteger(eventIndex)||!round.events[eventIndex]||round.events[eventIndex].seat!==seat))throw new Error('请选择该玩家的一手牌');
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(round)));
    const roundSha256=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
    const write=async()=>{
      const list=read(storage);if(list.length>=MAX_RECORDS)throw new Error('本批已有 160 条试评，请导出并开始新批次');
      const reviewerId=reviewer(storage),subjectId=round.playerIds?.[seat]??roundSha256+':'+seat;
      const prior=list.findLast(r=>r.roundId===round.id&&r.subjectId===subjectId&&r.reviewerId===reviewerId&&r.ratingVersion===score.version&&r.handVersion===hand.version);
      const record={id:crypto.randomUUID(),schema:1,kind:'player-rating-feedback',version:VERSION,createdAt:new Date().toISOString(),
        roundId:round.id,roundSha256,seat,seatFrame:'viewer-relative',subjectId,reviewerId,reviewContext:seat===0?'self':'other-player',revisionOf:prior?.id||null,
        ratingVersion:score.version,handVersion:hand.version,ruleMode:round.ruleMode,level:round.level,
        displayed:{handScore:hand.score,performanceScore:score.score,handComponents:hand.components,performanceComponents:score.components,
          teamReference:report.teamReference?.available?{version:report.teamReference.version,probabilities:report.teamReference.probabilities,
            teamScores:report.teamReference.teamScores,outcomeResiduals:report.teamReference.outcomeResiduals}:null},
        implementationVersion:assessment.VERSION,keyNodeVersion:report.keyNodeVersion,
        handVerdict,performanceVerdict,suggestedHand,suggestedPerformance,reason,eventIndex,
        indexIds:eventIndex===null?[]:report.cases.find(c=>c.eventIndex===eventIndex)?.indexIds||[],
        decisionContext:eventIndex===null?null:{eligible:report.cases.find(c=>c.eventIndex===eventIndex)?.decisionEligible??null,
          reason:report.cases.find(c=>c.eventIndex===eventIndex)?.notDecisionReason??null},
        result:{winnerTeam:round.winnerTeam,placement:round.finishOrder.indexOf(seat)+1},
        provenance:globalThis.GuandanAssessmentProvenance||null,
        status:'subjective_player_pilot',outcomeVisible:true,eligibleForTraining:false,reward:null};
      // Keep only source hashes, not a repeated full provenance/round in every opinion.
      if(record.provenance)record.provenance={webVersion:record.provenance.webVersion,androidVersion:record.provenance.androidVersion,hashes:Object.fromEntries(Object.entries(record.provenance.hashes||{}).filter(([p])=>/assessment|starting-reference|judge-v2|play-rules|series\.js/.test(p)))};
      const raw=JSON.stringify([...list,record]);if(raw.length>MAX_CHARS)throw new Error('试评存储已满，请导出并开始新批次；原记录已保留');
      storage.setItem(KEY,raw);return record;
    };
    return globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('guandan-player-pilot',write):write();
  }
  async function startBatch(storage,{acknowledged,expectedIds}){
    if(acknowledged!==true)throw new Error('请先保存导出文件，再输入“已备份”');
    const write=async()=>{const list=read(storage);if(JSON.stringify(list.map(r=>r.id))!==JSON.stringify(expectedIds))throw new Error('反馈有新增，请重新导出后再开始新批次');storage.setItem(KEY,'[]');return list.length;};
    if(globalThis.navigator?.locks?.request)return globalThis.navigator.locks.request('guandan-player-pilot',write);
    if(globalThis.window)throw new Error('浏览器缺少安全批次锁，原反馈已保留');return write();
  }
  function summarize(records){
    const unique=new Map();
    for(const r of records){
      if(r?.kind!=='player-rating-feedback'||!r.id||!r.reviewerId||!r.roundId||!Number.isInteger(r.seat)||r.seat<0||r.seat>3||!r.ratingVersion||!r.handVersion||!VERDICTS.includes(r.handVerdict)||!VERDICTS.includes(r.performanceVerdict))throw new Error('试评记录格式不完整');
      if(unique.has(r.id)&&JSON.stringify(unique.get(r.id))!==JSON.stringify(r))throw new Error('同一反馈编号包含冲突内容');unique.set(r.id,r);
    }
    const bySubject=new Map(),latest=new Map();
    for(const r of unique.values()){
      const key=[r.reviewerId,r.roundId,r.subjectId??r.roundSha256+':'+r.seat,r.ratingVersion,r.handVersion].join('|');
      if(!bySubject.has(key))bySubject.set(key,[]);bySubject.get(key).push(r);
    }
    for(const [key,list]of bySubject){
      const superseded=new Set(list.map(r=>r.revisionOf).filter(Boolean));
      const terminals=list.filter(r=>!superseded.has(r.id)).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||a.id.localeCompare(b.id));
      if(!terminals.length)throw new Error('试评修订关系有循环');latest.set(key,terminals.at(-1));
    }
    const versions=new Map();
    for(const r of latest.values()){
      const key=r.ratingVersion+' / '+r.handVersion;let g=versions.get(key);
      if(!g){g={version:key,responses:0,localReviewerIds:new Set(),roundIds:new Set(),hand:{high:0,fair:0,low:0,unsure:0},performance:{high:0,fair:0,low:0,unsure:0},selfResponses:0,keyNodeResponses:0};versions.set(key,g);}
      g.responses++;g.localReviewerIds.add(r.reviewerId);g.roundIds.add(r.roundId);g.hand[r.handVerdict]++;g.performance[r.performanceVerdict]++;if(r.reviewContext==='self')g.selfResponses++;if(r.eventIndex!==null)g.keyNodeResponses++;
    }
    return {version:VERSION,records:unique.size,revisionsExcluded:unique.size-latest.size,groups:[...versions.values()].map(g=>({...g,localReviewerIds:g.localReviewerIds.size,rounds:g.roundIds.size,roundIds:undefined})),
      eligibleForTraining:false,note:'同一设备、牌局、玩家和公式版本只取最新意见；本机代号不等于独立人数。反馈已看过结果，只检验体感，不证明战术正确或牌力提升。'};
  }
  return Object.freeze({VERSION,KEY,read,save,startBatch,summarize});
});
