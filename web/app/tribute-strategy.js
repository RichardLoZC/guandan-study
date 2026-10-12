/* Deterministic return-tribute heuristics using only the returning player's cards. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('./arrange.js'));
  else root.GuandanTributeStrategy=factory(root.GuandanCore,root.GuandanArrange);
})(typeof globalThis==='object'?globalThis:this,function(core,arrange){
  'use strict';
  const rankOrder=['2','3','4','5','6','7','8','9','10','J','Q','K','A','SJ','BJ'];
  const rankValue=card=>rankOrder.indexOf(card.rank)+2;
  const compareId=(a,b)=>a<b?-1:a>b?1:0;
  function naturalBombs(hand){
    const counts=new Map();
    for(const card of hand)if(!card.isWild&&card.suit!=='joker')counts.set(card.rank,(counts.get(card.rank)||0)+1);
    return [...counts].filter(([,count])=>count>=4).sort((a,b)=>rankOrder.indexOf(a[0])-rankOrder.indexOf(b[0]));
  }
  function assess(hand,level){
    const cards=new Map(hand.map(card=>[card.id,card]));
    const plans=arrange.plans(hand,level);
    if(!plans.length)plans.push({groups:[]});
    const assessments=plans.map(plan=>{
      const value={turns:plan.groups.length,singles:0,pairs:0,triples:0,runs:0,bombs:0,straightFlushes:0,wildUsed:0,control:0,smallSingles:0};
      for(const group of plan.groups){
        const held=group.ids.map(id=>cards.get(id));
        if(held.length===1){value.singles++;if(rankValue(held[0])<=10&&!held[0].isWild)value.smallSingles++;continue;}
        const plays=core.recognize(held),play=plays.find(candidate=>core.isBomb(candidate))||plays[0];
        value.wildUsed+=held.filter(card=>card.isWild).length;
        if(core.isBomb(play)){
          value.bombs++;
          if(play.type==='straight-flush'){value.straightFlushes++;value.control+=4;}
          else value.control+=play.type==='joker-bomb'?9:Math.max(2,held.length-2);
        }else if(play.type==='pair')value.pairs++;
        else if(play.type==='triple')value.triples++;
        else if(['straight','pair-run','triple-run'].includes(play.type))value.runs++;
      }
      // These are bounded, feasible partitions, not a claim of minimum turns.
      value.score=value.turns*100+value.singles*15+value.smallSingles*5+value.wildUsed*6-value.control*28-value.runs*4;
      return value;
    });
    assessments.sort((a,b)=>a.score-b.score||a.turns-b.turns||a.singles-b.singles);
    return {...assessments[0],naturalBombs:naturalBombs(hand),plansExamined:plans.length};
  }
  function choose({hand,level,choices}){
    if(!Array.isArray(hand)||!hand.length||hand.length>28||!rankOrder.slice(0,13).includes(level)||
      !Array.isArray(choices)||!choices.length||choices.length>28)throw new Error('没有合法的还贡候选');
    const canonicalHand=[...hand].sort((a,b)=>compareId(a.id,b.id));
    const own=new Map(canonicalHand.map(card=>[card.id,card]));
    if(own.size!==hand.length||choices.some(card=>!own.has(card?.id)))throw new Error('还贡候选不在本人手牌中');
    core.setLevel(level);
    const beforeBombs=naturalBombs(canonicalHand),cache=new Map(),representatives=new Map();
    // Physical duplicates are interchangeable, but the bounded partitioner's
    // tie breaks use their ids. Always assess one fixed representative instead
    // of allowing the caller's candidate order to choose a different partition.
    for(const card of canonicalHand){const face=card.suit+':'+card.rank;if(!representatives.has(face))representatives.set(face,card.id);}
    const candidates=[...new Set(choices.map(card=>card.id))].sort(compareId).map(id=>{
      const card=own.get(id),equivalent=card.suit+':'+card.rank;
      let assessment=cache.get(equivalent);
      if(!assessment){
        const remaining=canonicalHand.filter(held=>held.id!==representatives.get(equivalent)),after=assess(remaining,level),counts=new Map();
        for(const held of remaining)if(!held.isWild&&held.suit!=='joker')counts.set(held.rank,(counts.get(held.rank)||0)+1);
        const brokenBombs=beforeBombs.filter(([rank])=>(counts.get(rank)||0)<4).length;
        const bombCardsLost=beforeBombs.reduce((sum,[rank,count])=>sum+count-(counts.get(rank)||0),0);
        assessment={...after,brokenBombs,bombCardsLost,score:after.score+brokenBombs*180+bombCardsLost*12};
        cache.set(equivalent,assessment);
      }
      return {card:{...card},assessment:{...assessment,naturalBombs:assessment.naturalBombs.map(entry=>[...entry])}};
    });
    candidates.sort((a,b)=>a.assessment.score-b.assessment.score||rankValue(a.card)-rankValue(b.card)||compareId(a.card.id,b.card.id));
    const best=candidates[0],a=best.assessment;
    const preserved=[a.bombs?(a.straightFlushes?'保留 '+a.bombs+' 组炸弹类组合（含同花顺）':'保留 '+a.bombs+' 组炸弹'):null,a.runs?'保留 '+a.runs+' 组顺连':null].filter(Boolean);
    const reason=choices.length===1?'仅有这张合法还贡牌。':
      '还 '+core.cardLabel(best.card)+'：'+(preserved.length?preserved.join('、')+'；':'')+'余牌可拆为约 '+a.turns+' 手、'+a.singles+' 张单牌。结构相近时优先还较小牌。';
    return {...best,reason,candidates,method:'own-hand-structure-v1',evaluatedHands:cache.size};
  }
  return Object.freeze({choose});
});
