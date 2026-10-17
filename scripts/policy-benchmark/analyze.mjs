import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{Match}=require('../../web/app/match.js');
const directory=path.resolve(process.argv[2]),read=name=>JSON.parse(fs.readFileSync(path.join(directory,name)));
const manifest=read('manifest.json'),results=read('results.json'),deals=read('deals.json');
assert.equal(results.length,manifest.games,'Incomplete tournament');
assert.equal(new Set(results.map(g=>g.id)).size,manifest.games);
assert.ok(!fs.existsSync(path.join(directory,'failure.json')),'A failure must be investigated, not excluded');
const games=results.map(g=>read(g.id+'.json')).sort((a,b)=>a.pair-b.pair||a.bookTeam-b.bookTeam);
const pairMap=new Map(),timings={raw:[],book:[]},opening={raw:{plays:0,bombs:0,flushes:0},book:{plays:0,bombs:0,flushes:0}},first={raw:{plays:0,bombs:0,flushes:0},book:{plays:0,bombs:0,flushes:0}};
let decisions=0,changes=0,forcedPasses=0,actions=0,avoidedOpeningFlushes=0;
const rules={},examples=[];
for(const game of games){
  const pair=pairMap.get(game.pair)||[];pair.push(game);pairMap.set(game.pair,pair);
  const initial=deals.find(d=>d.pair===game.pair).state,match=new Match(initial);
  assert.equal(game.level,initial.level);assert.equal(game.starter,initial.game.starter);
  for(const action of game.actions){
    assert.equal(match.actingSeat,action.seat);assert.deepEqual(action.counts,match.game.players.map(p=>p.hand.length));
    assert.equal(action.book,manifest.mode!=='raw-control'&&action.seat%2===game.bookTeam);
    if(action.forced){match.passForced();forcedPasses++;}
    else{match.commit(action.seat,action.play?.cards||[],{key:action.play?.key});timings[action.book?'book':'raw'].push(action.ms);}
    actions++;
    const policy=action.book?'book':'raw';
    for(const [condition,stats]of [[action.opening,opening],[action.index===0,first]])if(condition&&action.play){
      stats[policy].plays++;if(action.play.bomb)stats[policy].bombs++;if(action.play.type==='straight-flush')stats[policy].flushes++;
    }
    if(action.policy){
      decisions++;if(action.policy.changed)changes++;
      for(const item of action.policy.evidence)rules[item.rule]=(rules[item.rule]||0)+1;
      if(action.opening&&action.policy.original.startsWith('同花顺')&&action.play?.type!=='straight-flush'){
        avoidedOpeningFlushes++;
        if(examples.length<4)examples.push({game:game.id,turn:action.index+1,seat:action.seat,counts:action.counts,
          original:action.policy.original,chosen:action.policy.chosen,evidence:action.policy.evidence});
      }
    }
  }
  assert.deepEqual(match.game.result,game.result);assert.deepEqual(match.game.finishOrder,game.finishOrder);
  assert.deepEqual(match.game.players.map(p=>p.hand.length),game.remaining);
  const hash=createHash('sha256').update(JSON.stringify(game.actions.map(a=>[a.seat,a.play?.key||'pass',a.play?.cards||[]]))).digest('hex');
  assert.equal(hash,results.find(g=>g.id===game.id).actionHash);
}
for(const pair of pairMap.values()){assert.equal(pair.length,2);assert.deepEqual(pair.map(g=>g.bookTeam),[0,1]);}
const won=game=>game.result.winnerTeam===game.bookTeam;
const mean=values=>values.reduce((sum,n)=>sum+n,0)/values.length;
// The resampling unit is a complete duplicated deal (two games), not an
// individual game. Keep the four planned level strata equally represented.
function confidence(subset,measure){
  const strata=new Map();for(const pair of subset){const level=pair[0].level,list=strata.get(level)||[];list.push(pair);strata.set(level,list);}
  let state=20261015;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/2**32;};
  const samples=[];for(let run=0;run<20000;run++){
    const sample=[];for(const pairs of strata.values())for(let i=0;i<pairs.length;i++)sample.push(pairs[Math.floor(random()*pairs.length)]);
    samples.push(measure(sample));
  }
  samples.sort((a,b)=>a-b);return [samples[500],samples[19499]];
}
const pairs=[...pairMap.values()],winMean=sample=>mean(sample.map(pair=>mean(pair.map(g=>Number(won(g)))))),pointMean=sample=>mean(sample.map(pair=>mean(pair.map(g=>(won(g)?1:-1)*g.result.levelDelta))));
function metric(sample){const list=sample.flat(),wins=list.filter(won).length;return {games:list.length,bookWins:wins,rawWins:list.length-wins,
  bookWinRate:wins/list.length,bookWinRateCI95:confidence(sample,winMean),bookNetPoints:list.reduce((sum,g)=>sum+(won(g)?1:-1)*g.result.levelDelta,0),
  meanBookNetPoints:pointMean(sample),meanBookNetPointsCI95:confidence(sample,pointMean),
  bookDoubleUps:list.filter(g=>won(g)&&g.result.levelDelta===3).length,rawDoubleUps:list.filter(g=>!won(g)&&g.result.levelDelta===3).length};}
const percentiles=values=>{const a=[...values].sort((a,b)=>a-b);return {count:a.length,meanMs:mean(a),medianMs:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)]};};
const summary={...metric(pairs),pairs:pairs.length,byLevel:Object.fromEntries(manifest.levels.map(level=>[level,metric(pairs.filter(pair=>pair[0].level===level))])),
  pairedOutcomes:{bookWinsBoth:pairs.filter(p=>p.every(won)).length,split:pairs.filter(p=>p.filter(won).length===1).length,rawWinsBoth:pairs.filter(p=>p.every(g=>!won(g))).length},
  opening,first,decisions,changes,changeRate:changes/decisions,avoidedOpeningFlushes,rules,examples,
  timings:Object.fromEntries(Object.entries(timings).map(([policy,values])=>[policy,percentiles(values)])),actions,forcedPasses,
  replayVerified:true,errors:0,bootstrap:{samples:20000,seed:20261015,method:'Percentile bootstrap of deal pairs, stratified by level'},
  diagnosticCaveat:'The originalRow field in raw logs was matched by label and can be ambiguous between suits; it is excluded from all analysis.'};
fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(path.join(directory,'games.csv'),'id,pair,level,starter,book_team,winner_team,book_win,upgrade_delta,book_net_points,actions\n'+games.map(g=>[g.id,g.pair,g.level,g.starter,g.bookTeam,g.result.winnerTeam,Number(won(g)),g.result.levelDelta,(won(g)?1:-1)*g.result.levelDelta,g.actions.length].join(',')).join('\n')+'\n');
console.log(JSON.stringify(summary,null,2));
