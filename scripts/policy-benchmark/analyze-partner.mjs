import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{Match}=require('../../web/app/match.js');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const directory=path.resolve(process.argv[2]);
const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name)));
const manifest=read('manifest.json'),results=read('results.json'),deals=read('deals.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.mode,'teammate');
assert.equal(results.length,manifest.games,'Incomplete tournament');
assert.equal(new Set(results.map(g=>g.id)).size,manifest.games);
assert.equal(deals.length,manifest.pairs);
assert.ok(!fs.existsSync(path.join(directory,'failure.json')),'Failed games cannot be excluded');
// Replay must use the same rules and policies as the frozen competition.
for(const [file,hash]of Object.entries(manifest.hashes))if(file.startsWith('web/')){
  const snapshot=file==='web/app/book-policy.js'?'book-policy.snapshot.js':file==='web/assets/fairWorker-CTCwrT35.js'?'worker.snapshot.js':null;
  const source=snapshot&&fs.existsSync(path.join(directory,snapshot))?path.join(directory,snapshot):path.join(root,file);
  assert.equal(sha(fs.readFileSync(source)),hash,'Runtime changed: '+file);
}
const arms=['book-partner','raw-partner'];
const games=results.map(g=>read(g.id+'.json')).sort((a,b)=>a.pair-b.pair||arms.indexOf(a.arm)-arms.indexOf(b.arm));
const pairMap=new Map();
const behavior=Object.fromEntries(arms.map(arm=>[arm,{partnerDecisions:0,changedDecisions:0,ownTeamLeadResponses:0,overcalls:0,forcedPasses:0,openingPlays:0,openingBombs:0,openingFlushes:0}]));
let actions=0;
for(const game of games){
  assert.ok(arms.includes(game.arm));
  assert.equal(game.bookTeam,0);
  const expected=game.arm==='book-partner'?[false,false,true,false]:[false,false,false,false];
  assert.deepEqual(game.policies,expected);
  const pair=pairMap.get(game.pair)||[];pair.push(game);pairMap.set(game.pair,pair);
  const initial=deals.find(d=>d.pair===game.pair)?.state;
  assert.ok(initial,'Missing original deal');
  assert.equal(game.level,initial.level);assert.equal(game.starter,initial.game.starter);
  const match=new Match(initial),stats=behavior[game.arm];
  for(const action of game.actions){
    assert.equal(match.actingSeat,action.seat);
    assert.deepEqual(action.counts,match.game.players.map(p=>p.hand.length));
    assert.equal(action.book,expected[action.seat]);
    assert.equal(action.table?.owner??null,match.game.tablePlay?.owner??null);
    if(action.forced){assert.ok(match.mustPass);match.passForced();if(action.seat===2)stats.forcedPasses++;}
    else{
      if(action.seat===2){
        stats.partnerDecisions++;if(action.policy?.changed)stats.changedDecisions++;
        if(action.table?.owner===0){stats.ownTeamLeadResponses++;if(action.play)stats.overcalls++;}
        if(action.opening&&action.play){stats.openingPlays++;if(action.play.bomb)stats.openingBombs++;if(action.play.type==='straight-flush')stats.openingFlushes++;}
      }
      match.commit(action.seat,action.play?.cards||[],{key:action.play?.key});
    }
    actions++;
  }
  assert.deepEqual(match.game.result,game.result);
  assert.deepEqual(match.game.finishOrder,game.finishOrder);
  assert.deepEqual(match.game.players.map(p=>p.hand.length),game.remaining);
  assert.equal(sha(JSON.stringify(game.actions.map(a=>[a.seat,a.play?.key||'pass',a.play?.cards||[]]))),results.find(g=>g.id===game.id).actionHash);
}
assert.equal(pairMap.size,manifest.pairs);
for(const pair of pairMap.values())assert.deepEqual(pair.map(g=>g.arm),arms);
const pairs=[...pairMap.values()],win=g=>Number(g.result.winnerTeam===0),points=g=>(win(g)?1:-1)*g.result.levelDelta;
const mean=values=>values.reduce((sum,n)=>sum+n,0)/values.length;
// The treatment effect is a difference within each deal. Resample entire
// pairs within level strata; do not pool the 512 games as independent trials.
function confidence(subset,value){
  const strata=new Map();for(const pair of subset){const list=strata.get(pair[0].level)||[];list.push(value(pair));strata.set(pair[0].level,list);}
  let state=20261015;
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/2**32;};
  const samples=[];
  for(let run=0;run<20000;run++){
    let total=0;for(const values of strata.values())for(let i=0;i<values.length;i++)total+=values[Math.floor(random()*values.length)];
    samples.push(total/subset.length);
  }
  samples.sort((a,b)=>a-b);return[samples[500],samples[19499]];
}
function metric(subset){
  const byArm=Object.fromEntries(arms.map((arm,i)=>{
    const list=subset.map(pair=>pair[i]);return[arm,{games:list.length,wins:list.reduce((n,g)=>n+win(g),0),
      winRate:mean(list.map(win)),netUpgradePoints:list.reduce((n,g)=>n+points(g),0),
      meanNetUpgradePoints:mean(list.map(points)),doubleUps:list.filter(g=>win(g)&&g.result.levelDelta===3).length}];
  }));
  return{pairs:subset.length,byArm,
    pairedWinRateDifference:mean(subset.map(p=>win(p[0])-win(p[1]))),
    pairedWinRateDifferenceCI95:confidence(subset,p=>win(p[0])-win(p[1])),
    pairedPointDifference:mean(subset.map(p=>points(p[0])-points(p[1]))),
    pairedPointDifferenceCI95:confidence(subset,p=>points(p[0])-points(p[1])),
    outcomes:{bothWin:subset.filter(p=>win(p[0])&&win(p[1])).length,bothLose:subset.filter(p=>!win(p[0])&&!win(p[1])).length,
      bookOnlyWins:subset.filter(p=>win(p[0])&&!win(p[1])).length,rawOnlyWins:subset.filter(p=>!win(p[0])&&win(p[1])).length}};
}
const summary={...metric(pairs),games:games.length,
  byLevel:Object.fromEntries(manifest.levels.map(level=>[level,metric(pairs.filter(pair=>pair[0].level===level))])),
  behavior,actions,replayVerified:true,errors:0,
  bootstrap:{samples:20000,seed:20261015,method:'Percentile bootstrap of within-deal treatment differences, stratified by level'},
  limitations:'Seat 0 is raw DanLM, not a human. Overcalls are descriptive, not automatically mistakes. Independent deals do not test tribute or multi-deal progression.'};
fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(path.join(directory,'pairs.csv'),'pair,level,starter,book_partner_win,raw_partner_win,win_difference,book_partner_points,raw_partner_points,point_difference\n'+
  pairs.map(p=>[p[0].pair,p[0].level,p[0].starter,win(p[0]),win(p[1]),win(p[0])-win(p[1]),points(p[0]),points(p[1]),points(p[0])-points(p[1])].join(',')).join('\n')+'\n');
console.log(JSON.stringify(summary,null,2));
