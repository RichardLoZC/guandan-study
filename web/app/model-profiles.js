'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GuandanModelProfiles=factory();})(globalThis,function(){
  const OFFICIAL='danlm-v1';
  // Accept the retired ID from older clients/saves, but always run and report
  // the official checkpoint. Retired models must never appear in profiles.
  const RETIRED='expert-style-v1';
  const context=Object.freeze({url:'/mobile/context.onnx',sha256:'a9f274f3c50382048f855547579d08d116c3c08cd52b841df6dca66711e4d8a4'});
  const profiles=Object.freeze({
    [OFFICIAL]:Object.freeze({id:OFFICIAL,name:'DanLM',english:'DanLM',checkpointSha256:'5341d7316bac1ead4098c796ea03f7e38fb47f001cc647a52be3ed0d15cd7244',scores:'/mobile/scores.onnx',scoresSha256:'96cbf7b589b6a8b496d5d8993feefea5dd11665df1dac2da49d9d096ec438791'})
  });
  function resolve(id=OFFICIAL){
    if(id===RETIRED)id=OFFICIAL;
    if(typeof id!=='string'||!Object.hasOwn(profiles,id))throw Error('未知 AI 模型，请更新游戏');
    return profiles[id];
  }
  function forPhase(id,phase='play'){
    const model=resolve(id);
    if(!['play','give','return'].includes(phase))throw Error('未知模型阶段');
    return model;
  }
  return Object.freeze({OFFICIAL,context,profiles,resolve,forPhase});
});
