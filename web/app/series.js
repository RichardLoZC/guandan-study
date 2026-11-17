'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();else root.GuandanSeries=factory();
})(globalThis,function(){
  const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const RULES='level-owner-v1';
  const team=value=>value===0||value===1;
  // Opening lead is NOT level ownership. Ordinary tribute may let a loser
  // lead; only resisted tribute preserves the previous first finisher's lead.
  function levelTeam(state){
    if(!state||state.ruleMode==='tuo3')return null;
    if(state.levelTeam!=null&&!team(state.levelTeam))throw new Error('本副打级方无效，已保留原始数据。');
    let inferred=null;
    const winner=state.tribute?.winners?.[0];
    if(Number.isInteger(winner)&&winner>=0&&winner<4)inferred=winner%2;
    else if(state.antiTribute?.length&&Number.isInteger(state.game?.starter))inferred=state.game.starter%2;
    if(team(state.levelTeam)){
      if(inferred!==null&&inferred!==state.levelTeam)throw new Error('本副打级方与贡还记录不一致，已保留原始数据。');
      inferred=state.levelTeam;
    }
    if(inferred===null){
      const matching=(state.levels||[]).map((rank,index)=>rank===state.level?index:null).filter(team);
      if(matching.length===1)inferred=matching[0];
    }
    if(inferred!==null&&state.levels?.[inferred]!==state.level)throw new Error('本副打级方与级牌不一致，已保留原始数据。');
    return inferred;
  }
  function validate(state){
    if(state.ruleMode==='tuo3')return;
    if(state.seriesRules!=null&&state.seriesRules!==RULES)throw new Error('打级规则版本不兼容，请更新游戏。');
    const owner=levelTeam(state);
    // Both teams start a new match at 2 without an exclusive level owner.
    if(owner===null&&!(state.level==='2'&&state.levels.every(rank=>rank==='2')))
      throw new Error('旧存档缺少本副打级方，无法安全结算；原始数据已保留，请导出后重开。');
  }
  // Stored counters describe completed deals BEFORE the current deal. A result
  // is projected here; it is committed once, when the next deal is created.
  function settlement(state,{legacy=false}={}){
    if(!state?.game.result||state.ruleMode==='tuo3')return null;
    if(!legacy)validate(state);
    const team=state.game.result.winnerTeam,order=state.game.finishOrder;
    const partnerPlace=order.indexOf((order[0]+2)%4)+1;
    const owner=legacy?null:levelTeam(state);
    const atAce=state.level==='A'&&state.levels[team]==='A'&&(legacy||owner===team);
    const victory=atAce&&partnerPlace<4;
    const attempt=atAce&&partnerPlace===4?(state.aceAttempts?.[team]||0)+1:0;
    const demotion=attempt===3,attempts=[0,0];
    if(attempt&&!demotion)attempts[team]=attempt;
    const levels=[...state.levels],wins=[...state.wins];
    if(victory){levels.fill('2');wins[team]++;}
    else levels[team]=demotion?'2':ranks[Math.min(12,ranks.indexOf(levels[team])+state.game.result.levelDelta)];
    return {team,partnerPlace,victory,demotion,attempt,attempts,levels,wins,
      seriesRules:legacy?'legacy-any-ace':RULES,levelTeam:owner,nextLevelTeam:victory?null:team,
      reclaimed:!legacy&&owner!==null&&owner!==team&&state.level==='A'&&state.levels[team]==='A',
      from:state.levels[team],to:levels[team],delta:state.game.result.levelDelta};
  }
  return Object.freeze({RULES,levelTeam,validate,settlement});
});
