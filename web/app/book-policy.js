/* Public-history adjustments to the optional strategy-book layer.
 * No model weights, raw DanLM scores or hidden opponent hands are changed.
 * The worker supplies its legal-move enumerator and cached hand decomposition.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.GuandanBookPolicy=factory();
})(globalThis,function(){
  'use strict';
  const VERSION='public-routes-v4';
  const CALIBRATION={shapeLimit:6,partner:true};
  const sameTeam=(a,b)=>a%2===b%2;
  const routeKey=play=>play.type+':'+play.size;
  const clamp=(value,max)=>Math.max(0,Math.min(max,value));
  const actionId=candidate=>candidate.play?candidate.play.key+'|'+candidate.play.cards.map(c=>c.id).sort().join(','):'pass';
  const bombCount=stats=>stats.bombs+stats.straightFlushes+stats.jokerBombs;
  const keepsCards=(play,remaining)=>play.cards.every(card=>remaining.some(c=>c.id===card.id));

  // The model shortlist may omit a quiet move. Supplement it from the complete
  // legal table, not just the lowest rank of each type. Protect the actual
  // control cards: replacing a flush with another four-card bomb is not saving it.
  function reserveCandidates(plans,baseline,preferred,isBomb){
    const chosen=[],seen=new Set();
    for(const candidate of preferred){
      if(!candidate.play||!isBomb(candidate.play))continue;
      const targetIds=new Set(candidate.play.cards.map(c=>c.id));
      const safe=plans.filter(entry=>!isBomb(entry.c.play)&&bombCount(entry.p)>=bombCount(baseline)&&
        !entry.c.play.cards.some(c=>targetIds.has(c.id))).slice(0,3);
      for(const entry of safe){
        if(!seen.has(actionId(entry.c))){chosen.push(entry.c);seen.add(actionId(entry.c));}
        if(chosen.length>=8)return chosen;
      }
    }
    return chosen;
  }

  function assertPublic(observation){
    if(observation.state.players.some(p=>p.seat!==observation.seat&&p.hand.some(card=>card!==null)))
      throw new Error('秘籍策略拒绝隐藏手牌');
  }

  // A greedy partition is a feasible route, not the minimum number of turns.
  // In particular, removing one card can make its greedy choice jump by many
  // turns. Bound its relative influence instead of letting this discontinuity
  // replace the trained model's preferred action by itself.
  function calibrate(observation,candidates,rows,api){
    assertPublic(observation);
    const original=rows.find(row=>row.id===actionId(api.original));
    const anchor=original?.evidence.find(e=>e.rule==='shape')?.delta;
    const {state,seat}=observation,own=state.players[seat],partner=state.players[(seat+2)%4];
    const opponents=state.players.filter(p=>!sameTeam(p.seat,seat)&&!p.finished);
    const urgent=opponents.some(p=>p.hand.length<=5)||own.hand.length<=5;
    const protectsPartner=state.tablePlay&&sameTeam(state.tablePlay.owner,seat);
    rows.forEach((row,index)=>{
      if(CALIBRATION.openingOnly){
        for(const evidence of row.evidence)if(evidence.rule!=='finish')row.score-=evidence.delta;
        row.evidence=row.evidence.filter(e=>e.rule==='finish');return;
      }
      for(const evidence of row.evidence){
        let delta=evidence.delta;
        if(evidence.rule==='shape'&&Number.isFinite(anchor)&&Number.isFinite(CALIBRATION.shapeLimit)){
          delta=anchor+Math.max(-CALIBRATION.shapeLimit,Math.min(CALIBRATION.shapeLimit,delta-anchor));
        }
        if(evidence.rule==='partner'&&protectsPartner&&CALIBRATION.partner){
          const play=candidates[index].play;
          if(play){
            // Following a small partner lead with a natural loose card can
            // shed a tail or make the next opponent spend a higher card.
            const costly=api.isBomb(play)||play.wildCount>0||play.primaryValue>=13;
            delta=urgent?0:api.isBomb(play)?-9:costly?-4:0;
            if(!urgent&&!partner.finished&&partner.hand.length<=6)delta-=3;
            evidence.reason=urgent?'对手已少牌或自己接近走完，优先比较兑现与封堵，不因队友牌权固定扣分。':costly?
              '接管队友牌权会消耗控制牌或百搭，需比较走牌收益；对家临近走完时更倾向让牌。':
              '普通跟牌可能减少散牌并抬高对手接牌成本；结合对家余牌判断是否接应。';
          }else{
            delta=urgent?0:api.original.play&&api.isBomb(api.original.play)?4:1;
            if(!urgent&&!partner.finished&&partner.hand.length<=6)delta+=3;
            evidence.reason='选择不出可保留自己的接管牌；同时比较是否能用普通闲牌顺路跟出。';
          }
        }
        if(delta!==evidence.delta){
          evidence.uncalibratedDelta=evidence.delta;row.score+=delta-evidence.delta;evidence.delta=delta;
        }
      }
    });
  }

  // Rebuild from the saved action order: no cross-round cache or speculative
  // hidden-hand state survives a load, seat rotation, or new deal.
  function remember(observation,isBomb){
    assertPublic(observation);
    const {state}=observation,history=state.actionHistory,profiles=Array.from({length:4},()=>new Map());
    let table=null,trick=0;
    history.forEach((event,index)=>{
      const actor=state.players[event.seat];
      const after=event.handCountAfter;
      // Old evidence fades both with time and with cards spent since then.
      const spent=Number.isFinite(after)?Math.max(0,after-actor.hand.length):0;
      const weight=Math.pow(.94,history.length-1-index)*Math.pow(.84,spent);
      const play=event.play||table?.play;
      if(play&&!isBomb(play)&&!actor.finished){
        const key=routeKey(play),profile=profiles[event.seat].get(key)||{leads:0,raises:0,passes:0,passTricks:new Set(),events:[]};
        if(event.play){
          if(!table)profile.leads+=weight;
          else if(!sameTeam(table.owner,event.seat)&&event.play.type===table.play.type)profile.raises+=weight*.5;
          profile.events.push(index);
        }else if(table&&!sameTeam(table.owner,event.seat)&&actor.hand.length>=play.size&&play.primaryValue<=11&&weight>=.2){
          // Passing over a teammate is cooperation, not evidence of weakness.
          // Even repeated opponent passes remain a small, uncertain signal.
          if(!profile.passTricks.has(trick)){profile.passes+=weight;profile.passTricks.add(trick);profile.events.push(index);}
        }
        profiles[event.seat].set(key,profile);
      }
      table=event.tablePlayAfter?{owner:event.tableOwnerAfter,play:event.tablePlayAfter}:null;
      if(!table)trick++;
    });
    return {historyLength:history.length,profiles};
  }

  function refine(observation,candidates,rows,api){
    assertPublic(observation);
    const {state,seat}=observation,own=state.players[seat].hand,partner=state.players[(seat+2)%4];
    const opponents=state.players.filter(p=>!sameTeam(p.seat,seat)&&!p.finished);
    const memory=remember(observation,api.isBomb),used=new Set(state.actionHistory.flatMap(e=>e.play?.cards||[]).map(c=>c.id));
    const ownIds=new Set(own.map(c=>c.id));
    // Known partner transfers cannot be in an opponent's remaining pool.
    const partnerKnown=new Set((observation.known||[]).filter(e=>e.seat===partner.seat&&!used.has(e.card.id)).map(e=>e.card.id));
    const pool=api.deck().filter(c=>!used.has(c.id)&&!ownIds.has(c.id)&&!partnerKnown.has(c.id));
    // A union of all unseen opponent possibilities gives a conservative upper
    // bound, not an assignment of actual hands. Bombs are evaluated separately.
    const possible=api.enumerate(pool).filter(p=>!api.isBomb(p)&&opponents.some(o=>o.hand.length>=p.size));
    const ceilings=new Map();
    for(const play of possible){const key=routeKey(play),prior=ceilings.get(key);if(!prior||api.beats(play,prior))ceilings.set(key,play);}
    const controls=play=>!ceilings.has(routeKey(play))||!api.beats(ceilings.get(routeKey(play)),play);
    const recaptures=play=>!ceilings.has(routeKey(play))||api.beats(play,ceilings.get(routeKey(play)));
    const base=api.stats(own),bombs=bombCount;
    const memo=new Map(),plans=new Map();
    function plan(candidate){
      const ids=new Set(candidate.play?.cards.map(c=>c.id)||[]),remaining=own.filter(c=>!ids.has(c.id));
      const key=remaining.map(c=>c.id).sort().join(',');
      if(!memo.has(key))memo.set(key,{remaining,stats:api.stats(remaining),plays:api.enumerate(remaining)});
      return memo.get(key);
    }
    function add(row,rule,delta,reason){
      row.score+=delta;row.evidence.push({rule,delta,reason,source:'本局公开牌序与手牌结构',pages:'',
        title:'公开牌序与后手检查',limit:'公开牌序只是线索；同型控制仍可能被炸弹截断。'});
    }
    const minOpponent=Math.min(...opponents.map(p=>p.hand.length));
    for(let index=0;index<candidates.length;index++){
      const candidate=candidates[index],row=rows[index],play=candidate.play,p=plan(candidate);plans.set(actionId(candidate),p);
      if(CALIBRATION.openingOnly)continue;
      if(!play||!p.remaining.length||api.isBomb(play)||state.tablePlay||p.stats.turns<=1)continue;
      const key=routeKey(play),follow=p.plays.filter(next=>!api.isBomb(next)&&next.type===play.type&&api.beats(next,play));
      const selfControls=controls(play),certain=!selfControls&&follow.find(recaptures);
      const partnerRoute=memory.profiles[partner.seat].get(key);
      const enemyRoutes=opponents.map(o=>memory.profiles[o.seat].get(key)).filter(Boolean);
      const enemyPressure=Math.max(0,...enemyRoutes.map(r=>r.leads+r.raises));
      if(certain){
        add(row,'route-control',8,'领出后仍保留「'+certain.label+'」；按已出牌、本人手牌和公开贡还牌计算，外面无法组成更大的同型普通牌，仍须防炸弹。');
      }else if(!selfControls){
        if(!follow.length){
          const hasControl=p.plays.some(api.isBomb),cost=hasControl?3:6;
          add(row,'route-unbacked',-cost,'领出「'+play.label+'」后没有更大的同型后手'+(hasControl?'，若被接走，可能要花炸弹换回牌权。':'，也没有保留的炸弹接管路线；需比较换一种牌型。'));
        }else{
          add(row,'route-uncertain',-2,'虽有更大的同型后手，但未见牌仍可能压住它，不能把“有后手”当成必能收回牌权。');
        }
        if(enemyPressure>=.35)add(row,'opponent-route',-Math.min(10,4+enemyPressure*4),
          '对手最近在这一路主动领出或接管，而自己没有已确认的同型控制后手；继续原路可能帮其出牌。历史线索不证明其仍持有该牌型。');
      }
      if(!partner.finished&&partner.hand.length>=play.size&&partnerRoute){
        const interest=partnerRoute.leads+partnerRoute.raises;
        // Prefer a low entry point; never reward feeding a high block merely
        // because the partner has previously played the same type.
        if(interest>=.4&&play.primaryValue<=10&&minOpponent>play.size)
          add(row,'partner-route',Math.min(6,interest*5),
            '对家近期主动走过这一路，低点数领出可作为接应方案；对家剩牌是否仍能接住尚不确定。');
        if(partnerRoute.passTricks.size>=2&&partnerRoute.passes>=.8)
          add(row,'partner-pressure',-Math.min(5,partnerRoute.passes*2.5),
            '对家曾在不同轮次放过对手的较低同型牌，暂时降低这一路接应优先级；不据此认定对家缺牌。');
      }
      const weak=enemyRoutes.filter(r=>r.passTricks.size>=2&&r.passes>=.8);
      if(weak.length&&minOpponent>6)add(row,'opponent-pressure',Math.min(3,weak.reduce((sum,r)=>sum+r.passes,0)),
        '对手在不同轮次放过较低同型牌，可小幅提高试探优先级；仍保留其主动让牌或藏牌的可能。');
    }

    // Opening conservation is conditional: require an intact-control ordinary
    // alternative with comparable residual structure and no sampled immediate
    // opponent finish. Finishing now, a two-hand sprint and an urgent endgame
    // bypass it. This avoids simply breaking the flush into small cards.
    const opening=state.finishOrder.length===0&&state.players.every(p=>p.hand.length>=18);
    const cheapTarget=!state.tablePlay||(!api.isBomb(state.tablePlay.play)&&state.tablePlay.play.primaryValue<=11);
    if(opening&&cheapTarget){
      for(let index=0;index<candidates.length;index++){
        const candidate=candidates[index],row=rows[index],p=plans.get(actionId(candidate));
        if(!candidate.play||!api.isBomb(candidate.play)||p.stats.turns<=1)continue;
        const alternatives=candidates.map((c,i)=>({candidate:c,row:rows[i],plan:plans.get(actionId(c))})).filter(a=>
          a.candidate.play&&!api.isBomb(a.candidate.play)&&!a.row.outs&&
          keepsCards(candidate.play,a.plan.remaining)&&bombs(a.plan.stats)>=bombs(base)&&
          a.plan.stats.turns<=p.stats.turns+1&&a.plan.stats.singles<=p.stats.singles+1);
        alternatives.sort((a,b)=>b.row.score-a.row.score);
        if(alternatives.length){
          const alternative=alternatives[0];
          const delta=Math.min(0,alternative.row.score-6-row.score);
          if(delta)add(row,'opening-reserve',delta,
            '开局尚无少牌威胁；可改出「'+alternative.candidate.play.label+'」并保留控制组合，余牌拆分最多增加一手。本手提前消耗「'+candidate.play.label+'」暂不优先。');
        }
      }
    }
    return {version:VERSION,historyLength:memory.historyLength,observedRoutes:memory.profiles.map(routes=>
      [...routes].map(([type,p])=>({type,leads:Number(p.leads.toFixed(3)),raises:Number(p.raises.toFixed(3)),passes:Number(p.passes.toFixed(3)),events:p.events.slice(-8)})))};
  }
  return Object.freeze({VERSION,remember,refine,reserveCandidates,calibrate});
});
