/* Display identities plus an explicit, fixed play-model assignment per persona. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./model-profiles.js'));
  else root.GuandanPersonas=Object.freeze(factory(root.GuandanModelProfiles));
})(globalThis,function(models){
  'use strict';
  const SERIES='ming-50-v1',LEGACY='historical-12-v1';
  const names=['王阳明','唐寅','文徵明','祝允明','徐祯卿','沈周','董其昌','徐渭','汤显祖','冯梦龙','凌濛初','吴承恩','解缙','杨慎','于谦','张居正','海瑞','刘基','宋濂','高启','方孝孺','杨士奇','杨荣','杨溥','李东阳','谢迁','刘健','王鏊','商辂','陈献章','湛若水','罗钦顺','王廷相','何心隐','李贽','王艮','顾宪成','高攀龙','左光斗','杨涟','史可法','戚继光','俞大猷','郑和','李时珍','徐光启','宋应星','徐霞客','朱载堉','李梦阳'];
  const legacyNames=['苏轼','白居易','荀彧','郭嘉','诸葛亮','王阳明','李白','王安石','张良','司马懿','李清照','杜甫'];
  const atlases=['/assets/avatars/ming-scholars-a-v1.png','/assets/avatars/ming-scholars-b-v1.png'],avatar=atlases[0];
  function assignment(seed,series=SERIES){
    let value=2166136261;for(const ch of String(seed))value=Math.imul(value^ch.charCodeAt(0),16777619)>>>0;
    const step=n=>{
      if(series===LEGACY){value=(Math.imul(value,1664525)+1013904223)>>>0;return value%n;}
      // Mix all 32 bits before choosing a bucket; the old LCG's low bits make
      // a fifty-person Fisher-Yates draw strongly favor a few identities.
      let x;const limit=Math.floor(0x100000000/n)*n;
      do{value=(value+0x6D2B79F5)>>>0;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);x=(t^(t>>>14))>>>0;}while(x>=limit);
      return x%n;
    };
    const pool=(series===LEGACY?legacyNames:names).map((_,index)=>index);
    for(let i=pool.length-1;i>0;i--){const j=step(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
    if(series===LEGACY)return pool.slice(0,4);
    // Two of each policy across the four identities guarantees a mix among
    // the three solo opponents, while sampling all 50 names across matches.
    const result=[...pool.filter(i=>i%2===0).slice(0,2),...pool.filter(i=>i%2===1).slice(0,2)];
    for(let i=3;i>0;i--){const j=step(i+1);[result[i],result[j]]=[result[j],result[i]];}return result;
  }
  function valid(ids,series=SERIES){return [SERIES,LEGACY].includes(series)&&Array.isArray(ids)&&ids.length===4&&new Set(ids).size===4&&ids.every(id=>Number.isInteger(id)&&id>=0&&id<(series===LEGACY?legacyNames:names).length);}
  function profile(ids,identity,series=SERIES){
    const index=ids?.[identity],list=series===LEGACY?legacyNames:series===SERIES?names:[];
    if(!Number.isInteger(index)||!list[index])return null;
    const policy=models.resolve(series===LEGACY||index%2?models.OFFICIAL:models.EXPERT);
    return {name:list[index],avatar:series===LEGACY?'/assets/avatars/historical-figures-v1.png':atlases[Math.floor(index/25)],
      portrait:series===LEGACY?index:index%25,portraitCols:series===LEGACY?4:5,portraitRows:series===LEGACY?3:5,
      series,policyId:policy.id,styleName:policy.name,styleEnglish:policy.english};
  }
  function notice(value,playerIds,displayNames){
    const legacy=['你','青岚','知秋','墨白'];
    return String(value).replace(/你|青岚|知秋|墨白/g,name=>{const seat=playerIds.indexOf(legacy.indexOf(name));return seat<0?name:displayNames[seat];});
  }
  function paint(img,player){
    img.classList.toggle('historical-avatar',Number.isInteger(player?.portrait));
    if(Number.isInteger(player?.portrait)){
      const cols=player.portraitCols||4,rows=player.portraitRows||3;
      img.style.setProperty('--portrait-col',player.portrait%cols);img.style.setProperty('--portrait-row',Math.floor(player.portrait/cols));
      img.style.setProperty('--portrait-cols',cols);img.style.setProperty('--portrait-rows',rows);
    }else for(const name of ['--portrait-col','--portrait-row','--portrait-cols','--portrait-rows'])img.style.removeProperty(name);
    img.src=player?.avatar||'/assets/brand/app-icon.png';
  }
  return {SERIES,LEGACY,names:Object.freeze(names),avatar,atlases:Object.freeze(atlases),assignment,valid,profile,paint,notice};
});
