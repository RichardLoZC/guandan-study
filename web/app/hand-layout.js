/* Local presentation only. Physical card IDs never change the game or AI input. */
(function(scope,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('./play-choices.js'));
  else scope.GuandanHandLayout=Object.freeze(factory(scope.GuandanCore,scope.GuandanPlayChoices));
})(globalThis,function(core,playChoices){
  'use strict';
  const STORAGE_KEY='guandan.hand-layout.v1';
  const idsOf=hand=>hand.map(card=>card.id);
  function cleanGroups(rows,saved){
    const available=new Set(rows.flat()),claimed=new Set(),groups=[];
    for(const group of Array.isArray(saved)?saved:[]){
      if(!Array.isArray(group?.ids))continue;
      const ids=[...new Set(group.ids)].filter(id=>available.has(id)&&!claimed.has(id)),members=new Set(ids);
      // A group occupies one uninterrupted run on one shelf. Splitting or
      // playing part of it must not leave a label for the old combination.
      for(const row of rows){
        let run=[];
        const finish=()=>{
          if(run.length>1){run.forEach(id=>claimed.add(id));groups.push({ids:run,label:run.length===group.ids.length&&typeof group.label==='string'?group.label.slice(0,60):''});}
          run=[];
        };
        for(const id of row){if(members.has(id))run.push(id);else finish();}
        finish();
      }
    }
    return groups;
  }
  function segments(layout,row){
    const result=[];
    for(const id of layout.rows[row]){
      const groupIndex=layout.groups.findIndex(group=>group.ids.includes(id)),last=result.at(-1);
      if(last?.groupIndex===groupIndex)last.ids.push(id);
      else result.push({ids:[id],groupIndex});
    }
    return result;
  }
  function create(key,hand){
    // Match.hand already carries the level-aware descending rank order.
    // The player reserves combinations on the upper shelf by moving them there.
    return {version:1,key,rows:[[],idsOf(hand)],groups:[],source:'default'};
  }
  function reconcile(saved,key,hand){
    if(saved?.version!==1||saved.key!==key||!Array.isArray(saved.rows)||saved.rows.length!==2||saved.rows.some(row=>!Array.isArray(row)))return create(key,hand);
    // Upgrade untouched older two-tier defaults, and re-sort tribute arrivals.
    // Explicit manual/automatic arrangements retain their stored positions.
    if(saved.source==='default')return create(key,hand);
    const held=new Set(idsOf(hand)),seen=new Set();
    const rows=saved.rows.map(row=>row.filter(id=>{if(!held.has(id)||seen.has(id))return false;seen.add(id);return true;}));
    // Tribute may bring in a new card. Append it without re-sorting the stored groups.
    for(const id of held)if(!seen.has(id)){rows[1].push(id);seen.add(id);}
    const groups=cleanGroups(rows,saved.groups);
    return {version:1,key,rows,groups,source:['manual','auto'].includes(saved.source)?saved.source:'default'};
  }
  function fromPlan(key,hand,plan,saved){
    const before=reconcile(saved,key,hand),upper=new Set(before.rows[0]);
    const lower=hand.filter(card=>!upper.has(card.id)).map(card=>card.id);
    if(!lower.length)return before;
    const groups=before.groups.filter(group=>group.ids.every(id=>upper.has(id))).map(group=>({...group,ids:[...group.ids]}));
    let ids=lower;
    if(plan){
      if(!Array.isArray(plan.groups)||plan.groups.some(group=>!Array.isArray(group?.ids)))return before;
      ids=plan.groups.flatMap(group=>group.ids);
      // A cached plan must describe exactly the current lower shelf. Reject
      // stale plans rather than pulling reserved or already-played cards back.
      const available=new Set(lower);
      if(ids.length!==lower.length||new Set(ids).size!==lower.length||ids.some(id=>!available.has(id)))return before;
      groups.push(...plan.groups.map(group=>({ids:[...group.ids],label:group.label})));
    }
    const rows=[[...before.rows[0]],[...ids]],cleaned=cleanGroups(rows,groups);
    if(JSON.stringify(rows)===JSON.stringify(before.rows)&&JSON.stringify(cleaned)===JSON.stringify(before.groups))return before;
    return {version:1,key,rows,groups:cleaned,source:'auto'};
  }
  function describeGroup(ids,hand,level){
    if(!hand||!level)return {ids:[...ids],label:''};
    const byId=new Map(hand.map(card=>[card.id,card])),cards=ids.map(id=>byId.get(id));
    if(cards.some(card=>!card?.rank||!card?.suit))return {ids:[...ids],label:''};
    core.setLevel(level);
    const play=playChoices.strongestFirst(core.recognize(cards))[0];
    let ordered=core.sortCards(cards);
    if(play?.sequence||play?.type==='full-house'){
      const natural=ordered.filter(card=>!card.isWild),wild=ordered.filter(card=>card.isWild),result=[];
      const take=(rank,count)=>{
        for(let n=0;n<count;n++){
          const index=natural.findIndex(card=>card.rank===rank);
          const card=index>=0?natural.splice(index,1)[0]:wild.shift();
          if(card)result.push(card);
        }
      };
      if(play.sequence){
        const copies=play.type==='pair-run'?2:play.type==='triple-run'?3:1;
        for(const rank of [...play.sequence].reverse())take(({1:'A',11:'J',12:'Q',13:'K',14:'A'}[rank]||String(rank)),copies);
      }else{
        const main=['2','3','4','5','6','7','8','9','10','J','Q','K','A'].find(rank=>core.rankValue(rank)===play.primaryValue);
        const kicker=natural.find(card=>card.rank!==main)?.rank;
        take(main,3);take(kicker,2);
      }
      ordered=[...result,...natural,...wild];
    }
    return {ids:ordered.map(card=>card.id),label:play?.label||''};
  }
  function move(layout,requested,row,index,{hand,level,mergeId}={}){
    if(![0,1].includes(row)||!Number.isInteger(index)||index<0||index>layout.rows[row].length)return layout;
    let wanted=new Set(requested),ids=layout.rows.flat().filter(id=>wanted.has(id));
    if(!ids.length||ids.length!==wanted.size)return layout;
    // Only a single card dropped onto an existing group's visible card face
    // joins it. A drop in the gap still inserts an independent card/group.
    const target=ids.length===1&&layout.groups.find(group=>group.ids.includes(mergeId)&&group.ids.every(id=>layout.rows[row].includes(id)));
    if(target){
      index=Math.min(...target.ids.map(id=>layout.rows[row].indexOf(id)));
      wanted=new Set([...target.ids,...ids]);ids=layout.rows.flat().filter(id=>wanted.has(id));
    }
    const before=layout.rows[row].slice(0,index).filter(id=>!wanted.has(id)).length;
    const rows=layout.rows.map(list=>list.filter(id=>!wanted.has(id)));
    rows[row].splice(before,0,...ids);
    const groups=layout.groups.map(group=>({...group,ids:group.ids.filter(id=>!wanted.has(id)),label:group.ids.some(id=>wanted.has(id))?'':group.label})).filter(group=>group.ids.length>1);
    if(ids.length>1)groups.push({ids,label:''});
    const cleaned=cleanGroups(rows,groups);
    if(hand&&level){
      for(let i=0;i<cleaned.length;i++){
        const group=cleaned[i],members=new Set(group.ids);
        const unchanged=layout.groups.some(before=>before.ids.length===members.size&&before.ids.every(id=>members.has(id)));
        if(unchanged&&!group.ids.some(id=>wanted.has(id)))continue;
        const organized=describeGroup(group.ids,hand,level),shelf=rows.find(list=>list.includes(group.ids[0])),start=shelf.indexOf(group.ids[0]);
        shelf.splice(start,group.ids.length,...organized.ids);cleaned[i]=organized;
      }
    }else{
      // Callers without card metadata retain the original presentation-only API.
      for(const group of cleaned){const prior=layout.groups.find(before=>before.ids.length===group.ids.length&&before.ids.every(id=>group.ids.includes(id)));if(prior)group.label=prior.label;}
    }
    const sameGroups=cleaned.length===layout.groups.length&&cleaned.every(group=>layout.groups.some(before=>before.label===group.label&&before.ids.join('|')===group.ids.join('|')));
    if(sameGroups&&rows.every((list,i)=>list.join('|')===layout.rows[i].join('|')))return layout;
    return {...layout,rows,groups:cleaned,source:'manual'};
  }
  function ordered(layout,hand){const cards=new Map(hand.map(card=>[card.id,card]));return layout.rows.flat().map(id=>cards.get(id)).filter(Boolean);}
  function load(storage,key,hand){
    try{const records=JSON.parse(storage.getItem(STORAGE_KEY)||'[]');return reconcile(Array.isArray(records)?records.find(item=>item?.key===key):null,key,hand);}catch{return create(key,hand);}
  }
  function save(storage,layout){
    let records=[];try{const parsed=JSON.parse(storage.getItem(STORAGE_KEY)||'[]');if(Array.isArray(parsed))records=parsed;}catch{}
    storage.setItem(STORAGE_KEY,JSON.stringify([layout,...records.filter(item=>item?.key!==layout.key)].slice(0,8)));
  }
  return {STORAGE_KEY,create,reconcile,fromPlan,move,describeGroup,segments,ordered,load,save};
});
