'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GuandanModelProfiles=factory();})(globalThis,function(){
  const OFFICIAL='danlm-v1',EXPERT='expert-style-v1';
  const context=Object.freeze({url:'/mobile/context.onnx',sha256:'a9f274f3c50382048f855547579d08d116c3c08cd52b841df6dca66711e4d8a4'});
  const profiles=Object.freeze({
    [OFFICIAL]:Object.freeze({id:OFFICIAL,name:'经典',english:'Classic',checkpointSha256:'5341d7316bac1ead4098c796ea03f7e38fb47f001cc647a52be3ed0d15cd7244',scores:'/mobile/scores.onnx',scoresSha256:'96cbf7b589b6a8b496d5d8993feefea5dd11665df1dac2da49d9d096ec438791'}),
    [EXPERT]:Object.freeze({id:EXPERT,name:'新风格',english:'New style',checkpointSha256:'4738435b59911b10327225d7ef48a5ec5ed9e4f8088215ad168375f6b59e11eb',scores:'/mobile/expert-scores-v1.onnx',scoresSha256:'f6f485f0a48a2316acfb63d94741b8e2d0d717d157e5f445ddf688c5e5b0137e'})
  });
  function resolve(id=OFFICIAL){if(typeof id!=='string'||!Object.hasOwn(profiles,id))throw Error('未知 AI 模型，请更新游戏');return profiles[id];}
  function forPhase(id,phase='play'){const model=resolve(id);return phase==='play'?model:phase==='give'||phase==='return'?profiles[OFFICIAL]:(()=>{throw Error('未知模型阶段');})();}
  return Object.freeze({OFFICIAL,EXPERT,context,profiles,resolve,forPhase});
});
