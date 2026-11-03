'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.GuandanHandAssessmentLegacy=factory();
})(globalThis,function(){
  const VERSION='hand-structure-0.1.0';
  const RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const SUITS=['clubs','diamonds','hearts','spades'];
  const VALUES={J:11,Q:12,K:13,A:14,SJ:15,BJ:16};
  // A bounded, reproducible search for a legal disjoint partition, NOT an optimal
  // solver or a win predictor. These weights are exposed for human pilot review.
  const BEAM_WIDTH=24,CACHE_LIMIT=128,cache=new Map();
  const value=(rank,level)=>rank===level?14.5:VALUES[rank]||Number(rank);
  const sequenceRank=n=>n===1||n===14?'A':({11:'J',12:'Q',13:'K'}[n]||String(n));
  function validate(hand,level){
    if(!RANKS.includes(level)||!Array.isArray(hand)||hand.length!==27)return false;
    const ids=new Set();
    for(const c of hand){
      if(!c||![1,2].includes(c.deck)||ids.has(c.id))return false;
      if(c.suit==='joker'?!['SJ','BJ'].includes(c.rank):!SUITS.includes(c.suit)||!RANKS.includes(c.rank))return false;
      if(c.id!==`${c.deck}-${c.suit}-${c.rank}`||c.isWild!==(c.suit==='hearts'&&c.rank===level))return false;
      ids.add(c.id);
    }
    return true;
  }
  function candidates(cards,level){
    const out=new Map(),positions=new Map(cards.map((c,i)=>[c.id,i]));
    function add(type,chosen,primaryRank){
      let mask=0;for(const c of chosen)mask|=1<<positions.get(c.id);
      const key=type+':'+mask+':'+primaryRank;if(out.has(key))return;
      const size=chosen.length,bomb=type==='bomb',control=bomb?Math.min(24,5+Math.max(0,size-4)*3+(size>=6?1:0)):
        type==='straight-flush'?10:type==='joker-bomb'?24:
        primaryRank==='BJ'?4:primaryRank==='SJ'?3:primaryRank===level?2:primaryRank==='A'?1:0;
      const weak=type==='single'&&value(chosen[0].rank,level)<10?1:0;
      out.set(key,{type,cardIds:chosen.map(c=>c.id),primaryRank,size,mask,control,weak,
        utility:2*(size-1)+control-2*weak});
    }
    for(const c of cards)add('single',[c],c.rank);
    // Suit rotations and both copy orders retain two disjoint identical runs.
    // A natural card is preferred to a wild; the search is deliberately bounded.
    for(let offset=0;offset<8;offset++){
      const sorted=[...cards].sort((a,b)=>((SUITS.indexOf(a.suit)+offset)%4)-((SUITS.indexOf(b.suit)+offset)%4)||(offset<4?a.deck-b.deck:b.deck-a.deck)||a.rank.localeCompare(b.rank));
      const wild=sorted.filter(c=>c.isWild);
      function fill(requirements,suit){
        const used=new Set(),chosen=[];let wi=0;
        for(const [rank,count]of requirements){
          const natural=sorted.filter(c=>!c.isWild&&c.rank===rank&&(!suit||c.suit===suit));
          for(let i=0;i<count;i++){
            const c=natural[i]||(!['SJ','BJ'].includes(rank)?wild[wi++]:null);
            if(!c||used.has(c.id))return null;used.add(c.id);chosen.push(c);
          }
        }
        return chosen;
      }
      for(const rank of [...RANKS,'SJ','BJ']){
        for(let n=2;n<=(['SJ','BJ'].includes(rank)?2:10);n++){
          const chosen=fill([[rank,n]]);if(chosen&&(!chosen.every(c=>c.isWild)||rank===level))add(n===2?'pair':n===3?'triple':'bomb',chosen,rank);
        }
      }
      for(const rank of RANKS)for(const pair of [...RANKS,'SJ','BJ'])if(rank!==pair){
        const chosen=fill([[rank,3],[pair,2]]);if(chosen)add('full-house',chosen,rank);
      }
      for(const [type,length,count]of [['straight',5,1],['pair-run',3,2],['triple-run',2,3]]){
        for(let low=1;low<=15-length;low++){
          const requirements=Array.from({length},(_,i)=>[sequenceRank(low+i),count]);
          const chosen=fill(requirements);
          if(chosen){
            const natural=chosen.filter(c=>!c.isWild),flush=type==='straight'&&natural.every(c=>c.suit===natural[0].suit);
            add(flush?'straight-flush':type,chosen,null);
          }
          if(type==='straight')for(const suit of SUITS){const flush=fill(requirements,suit);if(flush)add('straight-flush',flush,null);}
        }
      }
      const jokers=sorted.filter(c=>c.suit==='joker');if(jokers.length===4)add('joker-bomb',jokers,null);
    }
    return [...out.values()];
  }
  function components(groups){
    const weak=groups.reduce((n,g)=>n+g.weak,0),rawControl=groups.reduce((n,g)=>n+g.control,0);
    return [
      {id:'structure',value:Math.min(48,2*(27-groups.length)),maximum:48,groupCount:groups.length,formula:'min(48, 2 × (27 − 示例拆分组数))'},
      {id:'control',value:Math.min(40,rawControl),maximum:40,raw:rawControl,formula:'min(40, 各不重叠牌组控制分之和)'},
      {id:'tail',value:Math.max(0,12-2*weak),maximum:12,weakSingles:weak,formula:'max(0, 12 − 2 × 小于 10 的非级牌单张数)'}
    ];
  }
  function evaluate(hand,level,ruleMode='classic'){
    const unavailable=reason=>({version:VERSION,score:null,reason,trial:true,calibrated:false,percentile:null,winProbability:null,groups:[],components:[]});
    if(ruleMode!=='classic')return unavailable('unsupported_rule_mode');
    if(!hand)return unavailable('private_hand_unavailable');
    if(!validate(hand,level))return unavailable('invalid_starting_hand');
    const rankOrder=[...RANKS,'SJ','BJ'];
    const cards=[...hand].sort((a,b)=>rankOrder.indexOf(a.rank)-rankOrder.indexOf(b.rank)||SUITS.indexOf(a.suit)-SUITS.indexOf(b.suit)||a.deck-b.deck),key=level+':'+cards.map(c=>c.id).join('|');
    if(cache.has(key))return structuredClone(cache.get(key));
    const plays=candidates(cards,level),byCard=cards.map((_,i)=>plays.filter(p=>p.mask&(1<<i))),full=(1<<27)-1;
    let frontier=[{mask:0,groups:[],utility:0}],best=null,expanded=0;
    for(let depth=0;depth<27&&frontier.length;depth++){
      const next=new Map();
      for(const state of frontier){
        let pivot=0;while(state.mask&(1<<pivot))pivot++;
        for(const play of byCard[pivot]){
          if(state.mask&play.mask)continue;
          expanded++;const s={mask:state.mask|play.mask,groups:[...state.groups,play],utility:state.utility+play.utility};
          if(s.mask===full){const score=components(s.groups).reduce((n,c)=>n+c.value,0);if(!best||score>best.score||score===best.score&&s.groups.length<best.groups.length)best={...s,score};continue;}
          const prior=next.get(s.mask);if(!prior||s.utility>prior.utility)next.set(s.mask,s);
        }
      }
      const priority=s=>s.utility+2*(27-s.groups.reduce((n,g)=>n+g.size,0));
      frontier=[...next.values()].sort((a,b)=>priority(b)-priority(a)||a.mask-b.mask).slice(0,BEAM_WIDTH);
    }
    if(!best)return unavailable('search_unavailable');
    const parts=components(best.groups),result={version:VERSION,score:parts.reduce((n,c)=>n+c.value,0),reason:null,
      trial:true,calibrated:false,percentile:null,winProbability:null,method:'bounded-disjoint-partition',optimal:false,
      groupCount:best.groups.length,components:parts,groups:best.groups.map(({mask,utility,weak,...g})=>g),
      search:{beamWidth:BEAM_WIDTH,candidates:plays.length,expanded},
      note:'0–100 手牌结构试行分；不是胜率或百分位。示例拆分保证每张牌只用一次，不保证最少手数，也未考虑对手、队友、先后手与贡还选择。'};
    if(cache.size>=CACHE_LIMIT)cache.delete(cache.keys().next().value);cache.set(key,result);return structuredClone(result);
  }
  return Object.freeze({VERSION,evaluate});
});
