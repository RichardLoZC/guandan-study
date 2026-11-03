'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./judge-v2.js'));
  else root.GuandanHandAssessment=factory(root.GuandanJudgeV2);
})(globalThis,function(judge){
  // Share the exact verified orbit search with the research implementation.
  return Object.freeze({VERSION:judge.HAND_VERSION,evaluate:judge.handScore});
});
