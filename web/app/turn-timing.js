/* One cancellable presentation delay shared by solo and hosted AI turns. */
(function(scope){
  'use strict';
  const MIN_MS=1600,MAX_MS=2600;
  function begin({random=Math.random,setTimer=setTimeout,clearTimer=clearTimeout}={}){
    const ms=MIN_MS+Math.floor(Math.max(0,Math.min(1,random()))*(MAX_MS-MIN_MS));
    let timer=null,settle;
    const promise=new Promise(resolve=>{settle=resolve;timer=setTimer(()=>{timer=null;resolve(true);},ms);});
    return {ms,promise,cancel(){if(timer!==null){clearTimer(timer);timer=null;settle(false);}}};
  }
  const api=Object.freeze({MIN_MS,MAX_MS,begin});
  if(typeof module==='object'&&module.exports)module.exports=api;else scope.GuandanTurnTiming=api;
})(globalThis);
