'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./hand-strength-reference.js'));
  else root.GuandanHandStrength=factory(root.GuandanHandStrengthReference);
})(globalThis,function(reference){
  const VERSION='own-hand-points-1',CENTER=50,SPREAD=15,cache=new Map();
  // Fixed anonymous PERSONAL reference only. Never fit to this table or partner.
  function moments(level){
    if(cache.has(level))return cache.get(level);
    const rows=reference?.levels&&Object.hasOwn(reference.levels,level)?reference.levels[level]?.individual:null;
    if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Array.isArray(r)||r.length!==2||!Number.isFinite(r[0])||r[0]<0||r[0]>100||!Number.isSafeInteger(r[1])||r[1]<=0))return null;
    const n=rows.reduce((s,r)=>s+r[1],0),mean=rows.reduce((s,r)=>s+r[0]*r[1],0)/n;
    const sd=Math.sqrt(rows.reduce((s,r)=>s+(r[0]-mean)**2*r[1],0)/n);
    if(!Number.isSafeInteger(n)||n<2||!Number.isFinite(sd)||sd<=0)return null;
    const result=Object.freeze({n,mean,sd});cache.set(level,result);return result;
  }
  function points(raw,level,{handVersion=reference?.handVersion}={}){
    const empty=reason=>({version:VERSION,score:null,reason,rawStructureScore:raw,referenceVersion:reference?.version,handVersion,
      isPercentile:false,winProbability:null,calibrated:false,eligibleForTraining:false,reward:null});
    if(!reference||handVersion!==reference.handVersion)return empty('hand_version_mismatch');
    if(!Number.isFinite(raw)||raw<0||raw>100)return empty('invalid_structure_score');
    const ref=moments(level);if(!ref)return empty('reference_unavailable');
    const unclipped=CENTER+SPREAD*(raw-ref.mean)/ref.sd;
    return {...empty(null),score:Math.round(Math.max(0,Math.min(100,unclipped))),level,unclipped,
      referenceMean:ref.mean,referenceSD:ref.sd,referenceHands:ref.n,center:CENTER,spread:SPREAD,
      method:'fixed-same-level-individual-linear-standard-score'};
  }
  // Compatibility for older exported records; new UI never uses this percentile.
  function compare(score,level,{team=false}={}){
    const histogram=reference.levels[level]?.[team?'team':'individual'];
    if(!Number.isFinite(score)||!histogram?.length)return null;
    let lower=0,equal=0,total=0;
    for(const [value,count]of histogram){total+=count;if(value<score)lower+=count;else if(value===score)equal+=count;}
    return {version:VERSION,referenceVersion:reference?.version,lower,equal,total,percentile:Math.round(100*lower/total),winProbability:null};
  }
  return Object.freeze({VERSION,points,compare});
});
