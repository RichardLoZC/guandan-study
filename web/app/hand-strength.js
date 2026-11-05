'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./hand-strength-reference.js'));
  else root.GuandanHandStrength=factory(root.GuandanHandStrengthReference);
})(globalThis,function(reference){
  const VERSION='relative-starting-hand-1';
  // This changes the display scale only. Equal structure scores remain tied.
  // The reference contains anonymous score histograms, never players or hands.
  function compare(score,level,{team=false}={}){
    const histogram=reference.levels[level]?.[team?'team':'individual'];
    if(!Number.isFinite(score)||!histogram?.length)return null;
    let lower=0,equal=0,total=0;
    for(const [value,count]of histogram){total+=count;if(value<score)lower+=count;else if(value===score)equal+=count;}
    return {version:VERSION,referenceVersion:reference.version,lower, equal,total,
      percentile:Math.round(100*lower/total),winProbability:null};
  }
  return Object.freeze({VERSION,compare});
});
