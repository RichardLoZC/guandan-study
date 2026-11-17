'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GuandanPostMatchHand=factory();})(globalThis,function(){
  // Reconstruct all four seats the same way from public, completed-round facts.
  // Earlier private-view snapshots are cross-checks, never a second data source.
  function read(round,seat){
    const absent=reason=>({cards:null,reason});
    if(!round?.completed)return absent('round_in_progress');
    if(!Number.isInteger(seat)||seat<0||seat>3||!Array.isArray(round.events)||!Array.isArray(round.remaining))return absent('invalid_data');
    const remaining=round.remaining[seat],reveals=round.revealedHands;
    if(!Number.isInteger(remaining)||remaining<0||remaining>27||!Array.isArray(reveals))return absent('invalid_data');
    const endings=reveals.filter(r=>r?.seat===seat);
    if(endings.length>1||endings.length&&(!Array.isArray(endings[0].cards)||endings[0].cards.length!==remaining))return absent('invalid_data');
    if(remaining>0&&!endings.length)return absent('starting_hand_unavailable');
    const plays=round.events.filter(e=>e.seat===seat);
    if(plays.some(e=>!Array.isArray(e.cards)))return absent('invalid_data');
    const cards=[...(endings[0]?.cards||[]),...plays.flatMap(e=>e.cards)];
    if(cards.length!==27||cards.some(c=>!c||typeof c.id!=='string')||new Set(cards.map(c=>c.id)).size!==27)return absent('invalid_data');
    const key=list=>JSON.stringify(list.map(c=>[c?.id,c?.suit,c?.rank,c?.isWild]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
    if(seat===0)for(const observed of [round.initialOwnHand,round.events[0]?.ownBefore]){
      if(observed!=null&&(!Array.isArray(observed)||key(observed)!==key(cards)))return absent('invalid_data');
    }
    return {cards:structuredClone(cards),reason:null};
  }
  return Object.freeze({read});
});
