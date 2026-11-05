'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./assessment.js'),require('./hand-assessment.js'),require('./hand-strength.js'),require('./bomb-resources.js'));
  else root.GuandanRoundStatistics=factory(root.GuandanAssessment,root.GuandanHandAssessment,root.GuandanHandStrength,root.GuandanBombResources);
})(globalThis,function(assessment,hand,strength,bombs){
  const VERSION='round-facts-1',seat=n=>Number.isInteger(n)&&n>=0&&n<4;
  const bomb=e=>e.cards.length>0&&['bomb','straight-flush','joker-bomb'].includes(e.playType||e.kind);
  function controlWindows(round){
    const windows=[];let active=null;
    for(const e of round.events){
      if(!active){if(!e.cards.length||e.tableBefore)continue;active={start:e.index,leader:e.seat,events:[]};}
      active.events.push(e);const terminal=round.completed&&e.index===round.events.length-1;
      if(e.tableAfter&&!terminal)continue;
      const finalPlay=active.events.findLast(e=>e.cards.length),next=round.events[e.index+1];
      const nextLeader=terminal?null:seat(e.nextLeader)?e.nextLeader:next&&!next.tableBefore?next.seat:null;
      const resolved=!terminal&&seat(nextLeader),lost=resolved&&nextLeader%2!==active.leader%2;
      windows.push({start:active.start,end:e.index,leader:active.leader,controller:finalPlay?.seat??null,
        nextLeader,resolved,terminal,lost,
        opponentBomb:active.events.some(e=>e.seat%2!==active.leader%2&&bomb(e)),
        wind:resolved&&seat(finalPlay?.seat)&&nextLeader!==finalPlay.seat&&nextLeader%2===finalPlay.seat%2&&e.remaining?.[finalPlay.seat]===0});active=null;
    }
    return windows;
  }
  function summarize(round){
    const windows=controlWindows(round),players=[0,1,2,3].map(s=>{
      const lead=windows.filter(w=>w.resolved&&w.leader===s),lost=lead.filter(w=>w.lost),plays=round.events.filter(e=>e.seat===s&&e.cards.length);
      // Team resources are deliberately withheld until the round has ended.
      const cards=round.completed?assessment.visibleHand(round,0,s):null;
      const evaluation=round.completed?hand.evaluate(cards,round.level,round.ruleMode):null;
      const valid=round.ruleMode==='classic'&&evaluation?.score!==null&&evaluation?.score!==undefined;
      const resource=valid?bombs.maximum(cards,round.level):null;
      const high=valid?cards.filter(c=>c.suit==='joker'||c.rank===round.level||['10','J','Q','K','A'].includes(c.rank)).length:null;
      return {seat:s,place:round.completed?round.finishOrder.indexOf(s)+1:null,
        starting:valid?{structureScore:evaluation.score,strength:strength.compare(evaluation.score,round.level),cards:cards.length,highCards:high,
          peakBombs:resource?.count??null,bombGroups:resource?.groups??null}:null,
        freeLeads:lead.length,lostControl:lost.length,lostWithoutBomb:lost.filter(w=>!w.opponentBomb).length,lostToBomb:lost.filter(w=>w.opponentBomb).length,
        regainedControl:windows.filter(w=>w.resolved&&w.lost&&w.controller===s).length,
        windsReceived:windows.filter(w=>w.wind&&w.nextLeader===s).length,bombsPlayed:plays.filter(bomb).length};
    });
    const teams=[0,1].map(t=>{
      const members=players.filter(p=>p.seat%2===t),ready=members.every(p=>p.starting),leads=members.reduce((n,p)=>n+p.freeLeads,0),lost=members.reduce((n,p)=>n+p.lostControl,0);
      const score=ready?members.reduce((n,p)=>n+p.starting.structureScore,0):null;
      return {team:t,seats:members.map(p=>p.seat),won:round.completed?round.winnerTeam===t:null,
        starting:ready?{strength:strength.compare(score,round.level,{team:true}),cards:members.reduce((n,p)=>n+p.starting.cards,0),
          highCards:members.reduce((n,p)=>n+p.starting.highCards,0),peakBombs:members.reduce((n,p)=>n+p.starting.peakBombs,0)}:null,
        freeLeads:leads,retainedLeads:leads-lost,lostControl:lost,regainedControl:members.reduce((n,p)=>n+p.regainedControl,0)};
    });
    return {version:VERSION,completed:round.completed,teams,players,windows,trainingEligible:false,reward:null};
  }
  return Object.freeze({VERSION,controlWindows,summarize});
});
