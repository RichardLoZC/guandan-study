import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const [beforeDir,afterDir]=process.argv.slice(2).map(p=>path.resolve(p));
const read=(dir,file)=>JSON.parse(fs.readFileSync(path.join(dir,file)));
const before=read(beforeDir,'results.json'),after=read(afterDir,'results.json');
const bm=read(beforeDir,'manifest.json'),am=read(afterDir,'manifest.json');
assert.equal(bm.mode,'teammate');assert.equal(am.mode,'teammate');
assert.equal(bm.seed,am.seed);assert.equal(bm.pairs,am.pairs);assert.deepEqual(bm.levels,am.levels);
assert.equal(before.length,bm.games);assert.equal(after.length,am.games);
assert.ok(read(beforeDir,'summary.json').replayVerified&&read(afterDir,'summary.json').replayVerified);
const get=(list,pair,arm)=>list.find(g=>g.pair===pair&&g.arm===arm);
const won=g=>Number(g.result.winnerTeam===0),points=g=>(won(g)?1:-1)*g.result.levelDelta;
const pairs=[];
for(let pair=0;pair<bm.pairs;pair++){
  const b=get(before,pair,'book-partner'),a=get(after,pair,'book-partner');
  const br=get(before,pair,'raw-partner'),ar=get(after,pair,'raw-partner');
  assert.ok(b&&a&&br&&ar);assert.equal(b.level,a.level);assert.equal(b.starter,a.starter);
  assert.equal(br.actionHash,ar.actionHash,'Raw control changed on deal '+pair);
  pairs.push({pair,level:a.level,beforeWin:won(b),afterWin:won(a),winDifference:won(a)-won(b),pointDifference:points(a)-points(b)});
}
const mean=(p,key)=>p.reduce((sum,row)=>sum+row[key],0)/p.length;
function confidence(key){
  const strata=bm.levels.map(level=>pairs.filter(p=>p.level===level));let state=20261015;
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/2**32;};
  const samples=[];
  for(let run=0;run<20000;run++){
    let total=0;for(const rows of strata)for(let i=0;i<rows.length;i++)total+=rows[Math.floor(random()*rows.length)][key];
    samples.push(total/pairs.length);
  }
  samples.sort((a,b)=>a-b);return[samples[500],samples[19499]];
}
const summary={pairs:pairs.length,beforeWins:pairs.reduce((n,p)=>n+p.beforeWin,0),afterWins:pairs.reduce((n,p)=>n+p.afterWin,0),
  pairedWinRateDifference:mean(pairs,'winDifference'),pairedWinRateDifferenceCI95:confidence('winDifference'),
  pairedPointDifference:mean(pairs,'pointDifference'),pairedPointDifferenceCI95:confidence('pointDifference'),
  outcomes:{bothWin:pairs.filter(p=>p.beforeWin&&p.afterWin).length,bothLose:pairs.filter(p=>!p.beforeWin&&!p.afterWin).length,
    onlyAfterWins:pairs.filter(p=>p.winDifference===1).length,onlyBeforeWins:pairs.filter(p=>p.winDifference===-1).length},
  rawControlsIdentical:true,method:'After minus before; paired percentile bootstrap within level strata, 20000 samples, seed 20261015'};
fs.writeFileSync(path.join(afterDir,'versus-previous.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
