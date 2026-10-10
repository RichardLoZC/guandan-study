/* Bounded alternative partitions of physical cards; never changes a game hand. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));
  else root.GuandanArrange=factory(root.GuandanCore);
})(globalThis,function(core){
  'use strict';
  const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  function plans(hand,level){
    core.setLevel(level);
    const sorted=core.sortCards(hand),wild=sorted.filter(c=>c.isWild),natural=sorted.filter(c=>!c.isWild),candidates=new Map();
    const indexes=new Map(sorted.map((c,i)=>[c.id,i]));
    function add(cards){
      if(cards.length<2||new Set(cards.map(c=>c.id)).size!==cards.length)return;
      const key=cards.map(c=>c.id).sort().join('|');if(candidates.has(key))return;
      const plays=core.recognize(cards);if(!plays.length)return;
      const play=plays.find(p=>core.isBomb(p))||plays[0];
      candidates.set(key,{cards:core.sortCards(cards),label:play.label,type:play.type,bomb:core.isBomb(play),key,
        mask:cards.reduce((m,c)=>m|(1n<<BigInt(indexes.get(c.id))),0n),wild:cards.filter(c=>c.isWild).length});
    }
    function addWild(base,count){if(count===1){for(const card of wild)add([...base,card]);}else add([...base,...wild.slice(0,count)]);}
    const buckets=new Map();for(const c of natural){if(!buckets.has(c.rank))buckets.set(c.rank,[]);buckets.get(c.rank).push(c);}
    for(const bucket of buckets.values())for(let n=2;n<=Math.min(10,bucket.length+wild.length);n++){
      for(let w=0;w<=Math.min(wild.length,n-1);w++){
        const take=n-w;if(bucket.length<take)continue;
        addWild(bucket.slice(0,take),w);
        if(bucket.length>take)addWild(bucket.slice(-take),w);
      }
    }
    add(wild);add(natural.filter(c=>c.suit==='joker'));
    // Two physical copies and wild substitutions give different usable runs.
    for(const [length,multiple] of [[5,1],[3,2],[2,3]])for(let start=0;start<=ranks.length-length;start++){
      const sequence=ranks.slice(start,start+length);
      for(const suit of multiple===1?[null,'hearts','spades','clubs','diamonds']:[null])for(let offset=0;offset<2;offset++){
        let cards=[],missing=0;
        for(const rank of sequence){const pool=(buckets.get(rank)||[]).filter(c=>!suit||c.suit===suit),ordered=offset?[...pool].reverse():pool;
          cards.push(...ordered.slice(0,multiple));missing+=Math.max(0,multiple-pool.length);}
        if(missing<=wild.length)addWild(cards,missing);
      }
    }
    const groups=[...candidates.values()],triples=groups.filter(g=>g.cards.length===3),pairs=groups.filter(g=>g.cards.length===2);
    for(const a of triples)for(const b of pairs)if(!(a.mask&b.mask))add([...a.cards,...b.cards]);
    const all=[...candidates.values()],output=[],seen=new Set(),full=(1n<<BigInt(sorted.length))-1n;
    const policies=[['组合均衡',1.2,1,1],['顺连优先',.65,2.1,.7],['三张带牌',.8,.7,1.8],['对子优先',1,.7,.6],['保留炸弹',2.8,.8,.7]];
    for(const [name,bombWeight,runWeight,fullWeight] of policies){
      function score(g){const n=g.cards.length,run=/straight|consecutive|serial|pair_run|triple_run/.test(g.type)||(!g.bomb&&n>=5&&g.type!=='full-house');
        return (n-1)*10*(g.bomb?bombWeight:run?runWeight:n===5?fullWeight:1)+(name==='对子优先'&&n===2?75:0)-g.wild*2;}
      const order=[...all].sort((a,b)=>score(b)-score(a)||a.key.localeCompare(b.key));
      for(let seed=-1;seed<Math.min(4,order.length);seed++){
        let remaining=full,chosen=[];
        if(seed>=0){chosen.push(order[seed]);remaining^=order[seed].mask;}
        for(const g of order)if((remaining&g.mask)===g.mask){chosen.push(g);remaining^=g.mask;}
        for(let i=0;i<sorted.length;i++)if(remaining&(1n<<BigInt(i)))chosen.push({cards:[sorted[i]],label:'单张',key:sorted[i].id});
        const signature=chosen.map(g=>g.cards.map(c=>c.suit+':'+c.rank).sort().join('|')).sort().join(';');if(seen.has(signature))continue;seen.add(signature);
        const summary=chosen.filter(g=>g.cards.length>1).map(g=>g.label);
        if(!summary.length&&output.length)continue;
        output.push({name,groups:chosen.map(g=>({label:g.label,ids:g.cards.map(c=>c.id)})),ids:chosen.flatMap(g=>g.cards.map(c=>c.id)),summary:summary.join(' · ')||'单张排列'});
        if(output.length>=8)return output;
        // One primary partition per policy first; collect variants afterwards.
        if(seed<0)break;
      }
    }
    if(output.length<3)for(const first of all.slice(0,40)){
      const remaining=sorted.filter(c=>!first.cards.some(p=>p.id===c.id));
      const chosen=[{label:first.label,ids:first.cards.map(c=>c.id)},...remaining.map(c=>({label:'单张',ids:[c.id]}))];
      const signature=chosen.map(g=>g.ids.map(id=>{const c=sorted[indexes.get(id)];return c.suit+':'+c.rank;}).sort().join('|')).sort().join(';');if(seen.has(signature))continue;seen.add(signature);
      output.push({name:'另一种组合',groups:chosen,ids:chosen.flatMap(g=>g.ids),summary:first.label+' · 其余单张'});if(output.length>=4)break;
    }
    return output;
  }
  return Object.freeze({plans});
});
