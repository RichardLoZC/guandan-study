/* Interactive hand arrangement only. DanLM and the fast return-tribute
   estimator keep their existing candidate sets and scoring. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));
  else root.GuandanArrangeSearch=factory(root.GuandanCore);
})(globalThis,function(core){
  'use strict';
  const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const names={balanced:'综合找组合',flush:'同花顺优先',bomb:'炸弹优先',runs:'顺连优先',pairs:'对子优先'};
  const isRun=g=>['straight','straight-flush','pair-run','triple-run'].includes(g.type);
  const preferred={balanced:()=>false,flush:g=>g.type==='straight-flush',bomb:g=>g.bomb&&g.type!=='straight-flush',runs:isRun,pairs:g=>g.type==='pair'};
  const MAX_NODES=6000;
  let cachedKey='',cached=null;

  function combinations(pool,count,faces){
    const output=[],parts=[];
    function visit(at,left){
      if(!left){output.push(parts.map(part=>[...part]));return;}
      if(at===pool.length)return;
      const index=pool[at];
      for(let take=Math.min(left,faces[index].cards.length);take>=0;take--){
        if(take)parts.push([index,take]);visit(at+1,left-take);if(take)parts.pop();
      }
    }
    visit(0,count);return output;
  }

  function candidates(hand,level){
    core.setLevel(level);
    const sorted=core.sortCards(hand),faces=[],byFace=new Map();
    for(const card of sorted){
      const key=card.suit+':'+card.rank;
      if(!byFace.has(key)){byFace.set(key,faces.length);faces.push({cards:[],rank:card.rank,suit:card.suit,wild:card.isWild});}
      faces[byFace.get(key)].cards.push(card);
    }
    // Mixed-radix counts make physical duplicates interchangeable during
    // search, without dropping either copy or spending one wild card twice.
    let radix=1;
    for(const face of faces){face.factor=radix;face.base=face.cards.length+1;radix*=face.base;}
    const full=radix-1,wild=faces.findIndex(face=>face.wild),wildCount=faces[wild]?.cards.length||0;
    const groups=new Map(),buckets=new Map();
    faces.forEach((face,index)=>{if(!face.wild){if(!buckets.has(face.rank))buckets.set(face.rank,[]);buckets.get(face.rank).push(index);}});
    function add(parts){
      const counts=new Map();for(const [index,count]of parts)counts.set(index,(counts.get(index)||0)+count);
      let code=0,size=0;const cards=[];
      for(const [index,count]of counts){if(count>faces[index].cards.length)return;code+=count*faces[index].factor;size+=count;cards.push(...faces[index].cards.slice(0,count));}
      if(size<2||groups.has(code))return;
      const plays=core.recognize(cards),play=plays.find(core.isBomb)||plays[0];if(!play)return;
      groups.set(code,{code,size,parts:[...counts].sort((a,b)=>a[0]-b[0]),type:play.type,label:play.label,bomb:core.isBomb(play),wild:counts.get(wild)||0});
    }
    const withWild=(parts,count)=>count?[...parts,[wild,count]]:parts;
    // Enumerate every available suit mixture, not just the first/last copies.
    for(const pool of buckets.values()){
      const total=pool.reduce((sum,index)=>sum+faces[index].cards.length,0);
      for(let count=2;count<=Math.min(10,total+wildCount);count++)for(let used=0;used<=Math.min(wildCount,count-1);used++){
        if(count-used>total)continue;
        for(const parts of combinations(pool,count-used,faces))add(withWild(parts,used));
      }
    }
    if(wildCount===2)add([[wild,2]]);
    add(faces.flatMap((face,index)=>face.suit==='joker'?[[index,face.cards.length]]:[]));
    // A wild may replace an available rank too, freeing that physical card for
    // another straight flush, bomb or run in the same complete partition.
    for(const [length,multiple]of [[5,1],[3,2],[2,3]])for(let start=0;start<=ranks.length-length;start++){
      const sequence=ranks.slice(start,start+length);
      for(const suit of multiple===1?[null,'hearts','spades','clubs','diamonds']:[null]){
        const options=sequence.map(rank=>{
          const pool=(buckets.get(rank)||[]).filter(index=>!suit||faces[index].suit===suit),out=[];
          for(let used=0;used<=Math.min(wildCount,multiple);used++)for(const parts of combinations(pool,multiple-used,faces))out.push({parts,used});
          return out;
        });
        function visit(at,used,parts){
          if(at===length){add(withWild(parts,used));return;}
          for(const option of options[at])if(used+option.used<=wildCount)visit(at+1,used+option.used,[...parts,...option.parts]);
        }
        if(options.every(list=>list.length))visit(0,0,[]);
      }
    }
    const triples=[...groups.values()].filter(g=>g.type==='triple'),pairs=[...groups.values()].filter(g=>g.type==='pair');
    for(const triple of triples)for(const pair of pairs)add([...triple.parts,...pair.parts]);
    // Singles guarantee a complete legal partition even when the search budget
    // is exhausted. They are never promoted over a useful combination.
    faces.forEach((face,index)=>groups.set(face.factor,{code:face.factor,size:1,parts:[[index,1]],type:'single',label:'单张',bomb:false,wild:Number(face.wild)}));
    const all=[...groups.values()];all.forEach((g,index)=>g.index=index);
    const containing=faces.map((face,index)=>all.filter(g=>g.parts.some(part=>part[0]===index)));
    const pivotOrder=faces.map((face,index)=>index).sort((a,b)=>containing[a].length-containing[b].length||a-b);
    return {faces,full,all,containing,pivotOrder};
  }

  function fits(group,code,faces){
    return group.parts.every(([index,count])=>Math.floor(code/faces[index].factor)%faces[index].base>=count);
  }
  function value(group,policy){
    if(group.size===1)return 0;
    const control=group.type==='joker-bomb'?240:group.type==='straight-flush'?105:group.bomb?65+(group.size-4)*35:0;
    const bonus=policy==='control'?control*2.5:control;
    return (group.size-1)*100+bonus-group.wild*5+(policy==='runs'&&isRun(group)?150:0)+
      (policy==='pairs'&&group.type==='pair'?180:0)+(policy==='full'&&group.type==='full-house'?170:0);
  }

  function search(pool,policy,priority){
    const {faces,full,all,containing,pivotOrder}=pool,target=preferred[priority];
    const scores=all.map(g=>value(g,policy)+(target(g)?1200:0));
    const compare=(a,b)=>scores[b.index]-scores[a.index]||b.size-a.size||a.code-b.code;
    const order=[...all].sort(compare),choices=containing.map(list=>[...list].sort(compare));
    const perCard=containing.map(list=>Math.max(...list.map(g=>scores[g.index]/g.size)));
    const count=(code,index)=>Math.floor(code/faces[index].factor)%faces[index].base;
    const upper=code=>faces.reduce((sum,face,index)=>sum+count(code,index)*perCard[index],0);
    const answers=[],seen=new Set(),memo=new Map();let visited=0;
    function offer(path,score){
      const signature=path.map(g=>g.code).sort((a,b)=>a-b).join(',');if(seen.has(signature))return;
      seen.add(signature);answers.push({path:[...path],score});answers.sort((a,b)=>b.score-a.score);
      if(answers.length>3)answers.pop();
    }
    let remaining=full,initial=[],initialScore=0;
    for(const g of order)while(fits(g,remaining,faces)){initial.push(g);remaining-=g.code;initialScore+=scores[g.index];}
    offer(initial,initialScore);
    const path=[];
    function visit(code,score){
      if(!code){offer(path,score);return;}
      if(++visited>MAX_NODES)return;
      if(answers.length===3&&score+upper(code)<answers[2].score)return;
      if(memo.has(code)&&memo.get(code)>score)return;
      memo.set(code,score);
      const pivot=pivotOrder.find(index=>count(code,index));
      for(const group of choices[pivot]){
        if(visited>MAX_NODES)break;
        if(!fits(group,code,faces))continue;
        path.push(group);visit(code-group.code,score+scores[group.index]);path.pop();
      }
    }
    visit(full,0);return answers.map(answer=>({...answer,policy}));
  }

  function plans(hand,level,{priority='balanced'}={}){
    if(!Object.hasOwn(names,priority))priority='balanced';
    core.setLevel(level);
    const key=level+'|'+hand.map(c=>c.id).sort().join(',');
    if(key!==cachedKey){cached=candidates(hand,level);cachedKey=key;}
    const pool=cached,target=preferred[priority],policies=priority==='balanced'?['balanced','control','runs','full','pairs']:['balanced','control','runs'];
    const searches=policies.map(policy=>search(pool,policy,priority));
    const options=[...searches.map(list=>list[0]),...searches.flatMap(list=>list.slice(1))],output=[],seen=new Set();
    const hasTarget=priority!=='balanced'&&pool.all.some(target);
    for(const answer of options){
      const path=[...answer.path].sort((a,b)=>Number(target(b))-Number(target(a))||value(b,answer.policy)-value(a,answer.policy)||a.code-b.code);
      if(hasTarget&&!path.some(target))continue;
      const signature=path.map(g=>g.code).sort((a,b)=>a-b).join(',');if(seen.has(signature))continue;seen.add(signature);
      const available=pool.faces.map(face=>[...face.cards]);
      const groups=path.map(group=>({label:group.label,ids:core.sortCards(group.parts.flatMap(([index,count])=>available[index].splice(0,count))).map(card=>card.id)}));
      output.push({name:names[priority],priority,...(priority==='balanced'?{}:{matches:path.filter(target).length}),groups,ids:groups.flatMap(g=>g.ids),summary:groups.filter(g=>g.ids.length>1).map(g=>g.label).join(' · ')||'单张排列'});
      if(output.length===8)break;
    }
    return output;
  }
  return Object.freeze({plans});
});
