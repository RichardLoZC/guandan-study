/* Card artwork is presentation-only. An explicit round level also keeps old
   replays correct after the live game has advanced to a different level. */
(function(scope){
  'use strict';
  function rank(face){
    const match=/^(?:heart|spade|club|diamond)(Ace|King|Queen|Jack|10|[2-9])$/.exec(face||'');
    return match?({Ace:'A',King:'K',Queen:'Q',Jack:'J'}[match[1]]||match[1]):null;
  }
  function isLevel(face,level){return Boolean(level&&rank(face)===level);}
  function path(skin,face,levelCard=false){return 'assets/'+skin+'/'+(levelCard?'level/':'')+face+'.svg';}
  const api={rank,isLevel,path};
  if(typeof module==='object'&&module.exports)module.exports=api;else scope.GuandanCardArt=Object.freeze(api);
})(globalThis);
