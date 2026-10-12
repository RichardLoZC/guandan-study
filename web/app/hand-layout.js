/* Local presentation only. Physical card IDs never change the game or AI input. */
(function(scope){
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
    // Leave the upper shelf empty until the player chooses an arrangement.
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
    for(const id of held)if(!seen.has(id)){rows[rows[0].length<rows[1].length?0:1].push(id);seen.add(id);}
    const groups=cleanGroups(rows,saved.groups);
    return {version:1,key,rows,groups,source:['manual','auto'].includes(saved.source)?saved.source:'default'};
  }
  function fromPlan(key,hand,plan){
    if(!plan)return create(key,hand);
    const groups=plan.groups.map(group=>({ids:[...group.ids],label:group.label})),rows=[[],[]];
    let row=0;
    for(const group of groups){
      if(row===0&&rows[0].length&&rows[0].length+group.ids.length>Math.ceil(hand.length/2))row=1;
      rows[row].push(...group.ids);
    }
    return reconcile({version:1,key,rows,groups,source:'auto'},key,hand);
  }
  function move(layout,requested,row,index){
    if(![0,1].includes(row)||!Number.isInteger(index)||index<0||index>layout.rows[row].length)return layout;
    const wanted=new Set(requested),ids=layout.rows.flat().filter(id=>wanted.has(id));
    if(!ids.length||ids.length!==wanted.size)return layout;
    const before=layout.rows[row].slice(0,index).filter(id=>!wanted.has(id)).length;
    const rows=layout.rows.map(list=>list.filter(id=>!wanted.has(id)));
    rows[row].splice(before,0,...ids);
    const unchanged=rows.every((list,i)=>list.join('|')===layout.rows[i].join('|'));
    if(unchanged&&(ids.length===1||layout.groups.some(group=>group.ids.length===ids.length&&group.ids.every(id=>wanted.has(id)))))return layout;
    const groups=layout.groups.map(group=>({...group,ids:group.ids.filter(id=>!wanted.has(id)),label:group.ids.some(id=>wanted.has(id))?'':group.label})).filter(group=>group.ids.length>1);
    if(ids.length>1)groups.push({ids,label:''});
    return {...layout,rows,groups:cleanGroups(rows,groups),source:'manual'};
  }
  function ordered(layout,hand){const cards=new Map(hand.map(card=>[card.id,card]));return layout.rows.flat().map(id=>cards.get(id)).filter(Boolean);}
  function load(storage,key,hand){
    try{const records=JSON.parse(storage.getItem(STORAGE_KEY)||'[]');return reconcile(Array.isArray(records)?records.find(item=>item?.key===key):null,key,hand);}catch{return create(key,hand);}
  }
  function save(storage,layout){
    let records=[];try{const parsed=JSON.parse(storage.getItem(STORAGE_KEY)||'[]');if(Array.isArray(parsed))records=parsed;}catch{}
    storage.setItem(STORAGE_KEY,JSON.stringify([layout,...records.filter(item=>item?.key!==layout.key)].slice(0,8)));
  }
  const api={STORAGE_KEY,create,reconcile,fromPlan,move,segments,ordered,load,save};
  if(typeof module==='object'&&module.exports)module.exports=api;else scope.GuandanHandLayout=Object.freeze(api);
})(globalThis);
