/* Local presentation only. Physical card IDs never change the game or AI input. */
(function(scope){
  'use strict';
  const STORAGE_KEY='guandan.hand-layout.v1';
  const idsOf=hand=>hand.map(card=>card.id);
  function create(key,hand){
    const high=[],low=[],ids=idsOf(hand);
    hand.forEach(card=>(card.suit==='joker'||card.joker||card.isWild||['10','J','Q','K','A'].includes(card.rank)?high:low).push(card.id));
    const rows=ids.length<=14?[[],ids]:high.length>=4&&low.length>=4&&high.length<=16&&low.length<=16?[high,low]:[ids.slice(0,Math.ceil(ids.length/2)),ids.slice(Math.ceil(ids.length/2))];
    return {version:1,key,rows,groups:[],source:'default'};
  }
  function reconcile(saved,key,hand){
    if(saved?.version!==1||saved.key!==key||!Array.isArray(saved.rows)||saved.rows.length!==2||saved.rows.some(row=>!Array.isArray(row)))return create(key,hand);
    const held=new Set(idsOf(hand)),seen=new Set();
    const rows=saved.rows.map(row=>row.filter(id=>{if(!held.has(id)||seen.has(id))return false;seen.add(id);return true;}));
    // Tribute may bring in a new card. Append it without re-sorting the stored groups.
    for(const id of held)if(!seen.has(id)){rows[rows[0].length<rows[1].length?0:1].push(id);seen.add(id);}
    const grouped=new Set(),groups=[];
    for(const group of Array.isArray(saved.groups)?saved.groups:[]){
      if(!Array.isArray(group?.ids))continue;
      const ids=[...new Set(group.ids)].filter(id=>held.has(id)&&!grouped.has(id));
      if(ids.length>1){ids.forEach(id=>grouped.add(id));groups.push({ids,label:typeof group.label==='string'?group.label.slice(0,60):''});}
    }
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
    if(rows.every((list,i)=>list.join('|')===layout.rows[i].join('|')))return layout;
    const groups=layout.groups.map(group=>({...group,ids:group.ids.filter(id=>!wanted.has(id))})).filter(group=>group.ids.length>1);
    if(ids.length>1)groups.push({ids,label:''});
    return {...layout,rows,groups,source:'manual'};
  }
  function ordered(layout,hand){const cards=new Map(hand.map(card=>[card.id,card]));return layout.rows.flat().map(id=>cards.get(id)).filter(Boolean);}
  function load(storage,key,hand){
    try{const records=JSON.parse(storage.getItem(STORAGE_KEY)||'[]');return reconcile(Array.isArray(records)?records.find(item=>item?.key===key):null,key,hand);}catch{return create(key,hand);}
  }
  function save(storage,layout){
    let records=[];try{const parsed=JSON.parse(storage.getItem(STORAGE_KEY)||'[]');if(Array.isArray(parsed))records=parsed;}catch{}
    storage.setItem(STORAGE_KEY,JSON.stringify([layout,...records.filter(item=>item?.key!==layout.key)].slice(0,8)));
  }
  const api={STORAGE_KEY,create,reconcile,fromPlan,move,ordered,load,save};
  if(typeof module==='object'&&module.exports)module.exports=api;else scope.GuandanHandLayout=Object.freeze(api);
})(globalThis);
