/* Shared reporting threshold. Presentation does not alter rules, saves or model observations. */
'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.GuandanCardCounts=api;
})(globalThis,function(){
  const THRESHOLD=7,VERSION='reported-counts-0.1.0';
  const valid=count=>Number.isInteger(count)&&count>=0;
  const reported=count=>valid(count)&&count<=THRESHOLD;
  // Every client projects its own player to seat 0, including rotated LAN seats.
  function visible(count,{seat=1,completed=false,dealing=false}={}){
    if(!valid(count))return null;
    return seat===0||completed||!dealing&&reported(count)?count:null;
  }
  function label(count,options={}){
    const value=visible(count,options);
    return value===null?(options.english?'Not reported':'未报牌'):
      options.english?value+' cards left':'剩 '+value+' 张';
  }
  function render(element,count,options={}){
    const value=visible(count,options);
    element.hidden=value===null;
    element.querySelector('b').textContent=value===null?'':String(value);
    element.classList.toggle('is-reported',value!==null&&options.seat!==0&&!options.completed&&!options.dealing&&count>0);
  }
  return Object.freeze({THRESHOLD,VERSION,reported,visible,label,render});
});
