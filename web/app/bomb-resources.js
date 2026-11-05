'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();else root.GuandanBombResources=factory();
})(globalThis,function(){
  const VERSION='disjoint-bombs-1',RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'],SUITS=['clubs','diamonds','hearts','spades'];
  const cache=new Map(),bits=n=>{let total=0;for(;n;n&=n-1)total++;return total;};
  const rank=n=>n===1||n===14?'A':({11:'J',12:'Q',13:'K'}[n]||String(n));
  function maximum(hand,level){
    if(!Array.isArray(hand)||hand.length>27||!RANKS.includes(level)||new Set(hand.map(c=>c?.id)).size!==hand.length)return null;
    if(hand.some(c=>!c||![1,2].includes(c.deck)||c.id!==c.deck+'-'+c.suit+'-'+c.rank||
      (c.suit==='joker'?!['SJ','BJ'].includes(c.rank):!SUITS.includes(c.suit)||!RANKS.includes(c.rank))||
      c.isWild!==(c.suit==='hearts'&&c.rank===level)))return null;
    const cards=[...hand].sort((a,b)=>a.id.localeCompare(b.id)),key=level+':'+cards.map(c=>c.id).join('|');
    if(cache.has(key))return structuredClone(cache.get(key));
    const slots=new Map();
    for(let i=0;i<cards.length;i++){const c=cards[i],key=c.isWild?'wild':c.suit+':'+c.rank;if(!slots.has(key))slots.set(key,[]);slots.get(key).push(i);}
    const maskOf=(positions,n=positions.length)=>positions.slice(0,n).reduce((m,i)=>m|1<<i,0);
    const wild=slots.get('wild')||[],patterns=new Map();
    const add=(mask,type)=>{if(mask)patterns.set(mask,{mask,type});};
    // A maximal COUNT always has a witness with four-card rank bombs: shrinking
    // a longer rank bomb frees cards and never reduces the number of bombs.
    for(const r of RANKS){
      const buckets=SUITS.map(s=>slots.get(s+':'+r)||[]);
      for(let w=0;w<=wild.length;w++){
        function choose(s,left,mask){if(s===buckets.length){if(!left)add(mask|maskOf(wild,w),'bomb');return;}
          for(let n=0;n<=Math.min(left,buckets[s].length);n++)choose(s+1,left-n,mask|maskOf(buckets[s],n));}
        choose(0,4-w,0);
      }
    }
    for(const suit of SUITS)for(let low=1;low<=10;low++){
      function sequence(i,w,mask){if(i===5){add(mask|maskOf(wild,w),'straight-flush');return;}
        const natural=slots.get(suit+':'+rank(low+i))||[];
        if(natural.length)sequence(i+1,w,mask|1<<natural[0]);
        // Even when a natural card exists, using a wild may free another bomb.
        if(w<wild.length)sequence(i+1,w+1,mask);}
      sequence(0,0,0);
    }
    const jokers=cards.flatMap((c,i)=>c.suit==='joker'?[i]:[]);if(jokers.length===4)add(maskOf(jokers),'joker-bomb');
    const groups=[...patterns.values()],bucketMasks=[...slots.values()].map(p=>maskOf(p)),memo=new Map();
    function canonical(mask){let result=0;for(const positions of slots.values())result|=maskOf(positions,bits(mask&maskOf(positions)));return result;}
    function solve(input){
      let mask=canonical(input);if(memo.has(mask))return memo.get(mask);
      const possible=groups.filter(p=>(p.mask&mask)===p.mask);if(!possible.length){memo.set(mask,0);return 0;}
      // Remove cards that cannot participate in any remaining bomb.
      const used=possible.reduce((m,p)=>m|p.mask,0),useful=bucketMasks.reduce((m,b)=>m|((b&used)?b:0),0);
      mask=canonical(mask&useful);if(memo.has(mask))return memo.get(mask);
      const pivot=mask&-mask,upper=Math.floor(bits(mask)/4);let best=0;
      for(const p of possible)if(p.mask&pivot){best=Math.max(best,1+solve(mask^p.mask));if(best===upper)break;}
      if(best<upper)best=Math.max(best,solve(mask^pivot));memo.set(mask,best);return best;
    }
    let remaining=(1<<cards.length)-1;const count=solve(remaining),witness=[];
    // Rebind interchangeable copies to the actual remaining physical cards.
    while(solve(remaining)>0){
      const normalized=canonical(remaining),p=groups.find(p=>(p.mask&normalized)===p.mask&&1+solve(normalized^p.mask)===solve(remaining));
      if(!p)throw Error('Bomb resource witness unavailable');
      let physical=0;
      for(const bucket of bucketMasks){let needed=bits(p.mask&bucket),available=remaining&bucket;while(needed--){const bit=available&-available;physical|=bit;available^=bit;}}
      witness.push({type:p.type,cardIds:cards.filter((c,i)=>physical&(1<<i)).map(c=>c.id)});remaining^=physical;
    }
    const result={version:VERSION,count,groups:witness};if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(key,result);return structuredClone(result);
  }
  return Object.freeze({VERSION,maximum});
});
