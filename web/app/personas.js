/* Presentation identities only; assignments never affect rules or model input. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.GuandanPersonas=Object.freeze(factory());
})(globalThis,function(){
  'use strict';
  const names=['苏轼','白居易','荀彧','郭嘉','诸葛亮','王阳明','李白','王安石','张良','司马懿','李清照','杜甫'];
  const avatar='/assets/avatars/historical-figures-v1.png';
  function assignment(seed){
    let value=2166136261;for(const ch of String(seed))value=Math.imul(value^ch.charCodeAt(0),16777619)>>>0;
    const pool=names.map((_,index)=>index);
    for(let i=pool.length-1;i>0;i--){value=(Math.imul(value,1664525)+1013904223)>>>0;const j=value%(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
    return pool.slice(0,4);
  }
  function valid(ids){return Array.isArray(ids)&&ids.length===4&&new Set(ids).size===4&&ids.every(id=>Number.isInteger(id)&&id>=0&&id<names.length);}
  function profile(ids,identity){const index=ids?.[identity];return Number.isInteger(index)&&names[index]?{name:names[index],avatar,portrait:index}:null;}
  function notice(value,playerIds,displayNames){
    const legacy=['你','青岚','知秋','墨白'];
    return String(value).replace(/你|青岚|知秋|墨白/g,name=>{
      const seat=playerIds.indexOf(legacy.indexOf(name));
      return seat<0?name:displayNames[seat];
    });
  }
  function paint(img,player){
    img.classList.toggle('historical-avatar',Number.isInteger(player?.portrait));
    if(Number.isInteger(player?.portrait)){img.style.setProperty('--portrait-col',player.portrait%4);img.style.setProperty('--portrait-row',Math.floor(player.portrait/4));}
    else {img.style.removeProperty('--portrait-col');img.style.removeProperty('--portrait-row');}
    img.src=player?.avatar||'/assets/brand/app-icon.png';
  }
  return {names:Object.freeze(names),avatar,assignment,valid,profile,paint,notice};
});
