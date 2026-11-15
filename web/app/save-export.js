'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GuandanSaveExport=factory();})(globalThis,function(){
  const VERSION='viewer-safe-export-1';
  function prepare(match,storage,keys){
    if(!match)throw new Error('暂无可导出的牌局');
    const round=match.snapshot(),view=()=>({version:VERSION,kind:'guandan-view-export',schema:1,restorable:false,visibility:'viewer-only',round,
      note:'当前视角复盘，不能用于恢复存档。'});
    // Do not even read the full save or feedback while a round is in progress.
    if(!round.completed)return {mode:'view',data:view()};
    const feedback={expertFeedback:storage.getItem(keys.expert),playerFeedback:storage.getItem(keys.player)};
    if(match.remote)return {mode:'view',data:{...view(),...feedback}};
    const saved=storage.getItem(keys.game);let parsed;try{parsed=JSON.parse(saved);}catch{}
    // Another tab may already have started the next deal. Fail closed to a view.
    if(!parsed?.game?.result||parsed.id!==match.id)return {mode:'view',data:view()};
    return {mode:'backup',data:{version:VERSION,exportedAt:new Date().toISOString(),game:saved,reviews:storage.getItem(keys.archive),...feedback}};
  }
  return Object.freeze({VERSION,prepare});
});
