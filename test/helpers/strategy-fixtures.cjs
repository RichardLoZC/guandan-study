const core=require('../../web/app/core.js'),{Match}=require('../../web/app/match.js');
function cards(ids,level='2'){core.setLevel(level);const deck=core.deck();return ids.map(id=>{const c=deck.find(c=>c.id===id);if(!c)throw Error(id);return c;});}
function seeded(seed=1,wanted=[]){
  core.setLevel('2');let random=seed;
  const chosen=new Set(wanted),rest=core.deck().filter(c=>!chosen.has(c.id));
  for(let i=rest.length-1;i>0;i--){random=(Math.imul(random,1664525)+1013904223)>>>0;const j=random%(i+1);[rest[i],rest[j]]=[rest[j],rest[i]];}
  const deck=[...cards(wanted),...rest],state=core.newMatch();
  state.game.players.forEach((p,i)=>p.hand=core.sortCards(deck.slice(i*27,i*27+27)));
  state.game.currentPlayer=state.game.starter=0;return new Match(state);
}
function smallHands(counts=[3,3,3,3],tableIds=['1-clubs-5','1-clubs-6','1-clubs-7','1-clubs-8','1-clubs-9']){
  const match=seeded(7,tableIds),state=match.state;
  // Fixture history accounts for all 108 physical cards while leaving exactly
  // the requested hand counts; table owner 0 has just played the target.
  for(const p of state.game.players){
    const kept=p.hand.filter(c=>!tableIds.includes(c.id)).slice(0,counts[p.seat]),keep=new Set(kept.map(c=>c.id));
    const used=p.hand.filter(c=>!keep.has(c.id));p.hand=kept;
    for(const card of used.filter(c=>!tableIds.includes(c.id))){const play=core.recognize([card])[0];
      state.game.actionHistory.push({turn:state.game.actionHistory.length,seat:p.seat,play,handCountAfter:counts[p.seat],tablePlayAfter:null,tableOwnerAfter:null});}
  }
  const play=core.recognize(cards(tableIds))[0];
  state.game.actionHistory.push({turn:state.game.actionHistory.length,seat:0,play,handCountAfter:counts[0],tablePlayAfter:play,tableOwnerAfter:0});
  state.game.tablePlay={owner:0,play};state.game.currentPlayer=1;state.game.roundTrace={0:{play}};
  return new Match(state);
}
module.exports={cards,seeded,smallHands};
