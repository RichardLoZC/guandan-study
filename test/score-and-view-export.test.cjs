'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {Match}=require('../web/app/match.js'),assessment=require('../web/app/assessment.js'),strength=require('../web/app/hand-strength.js'),rating=require('../web/app/assessment-rating.js'),facts=require('../web/app/round-statistics.js'),exportsFor=require('../web/app/save-export.js');
const fixture=require('./helpers/judge-development-fixtures.json'),keys={game:'game',archive:'archive',expert:'expert',player:'player'};
function complete(){const m=new Match(structuredClone(fixture.round.initialState));for(const a of fixture.round.actions){if(a.forced)m.passForced();else m.commit(a.seat,a.ids,{key:a.key,automatic:true,engine:'DanLM',decision:a.decision});}return m;}
function scale(ref){const c={module:{exports:{}},require:()=>ref};vm.runInNewContext(fs.readFileSync(require.resolve('../web/app/hand-strength.js'),'utf8'),c);return c.module.exports;}
test('personal points use a linear scale, not a percentile renamed as a score',()=>{
 const m=scale({version:'fixed',handVersion:'frozen',levels:{'2':{individual:[[40,1],[60,1]],team:[[999,1]]}}});
 assert.equal(m.points(40,'2').score,35);assert.equal(m.points(50,'2').score,50);assert.equal(m.points(60,'2').score,65);assert.equal(m.points(60,'2').referenceSD,10);assert.notEqual(m.points(60,'2').score,m.compare(60,'2').percentile);
 for(const raw of [0,20,40,50,60,80,100]){const r=m.points(raw,'2');assert.ok(r.score>=0&&r.score<=100);assert.equal(r.isPercentile,false);assert.equal(r.winProbability,null);assert.equal(r.reward,null);}
 assert.equal(m.points(60,'2',{handVersion:'wrong'}).score,null);assert.equal(m.points(60,'__proto__').score,null);assert.equal(scale({version:'bad',handVersion:'frozen',levels:{'2':{individual:[[50,3]]}}}).points(50,'2').score,null);
 for(const raw of [null,undefined,NaN,Infinity,-1,101])assert.equal(m.points(raw,'2').score,null);
});
test('fixed individual scales are monotone at every level',()=>{
 for(const level of ['2','3','4','5','6','7','8','9','10','J','Q','K','A']){let prior=-1;for(let raw=0;raw<=100;raw++){const r=strength.points(raw,level);assert.ok(r.score>=prior);prior=r.score;assert.equal(r.method,'fixed-same-level-individual-linear-standard-score');}}
});
test('new personal scores ignore attempts, passes, bomb statistics and initial hand estimates',()=>{
 const r=complete().snapshot(),a=assessment.assess(r,0),before=rating.rate(r,a),b=structuredClone(a);Object.assign(b.metrics.find(m=>m.id==='P01'),{numerator:1000000,denominator:1000000,definitionVersion:'anything'});b.handAssessment.score=0;b.teamReference={available:true,probabilities:[0,1]};
 assert.deepEqual(rating.rate(r,b),before);assert.equal(before.eligibleForTraining,false);assert.equal(before.reward,null);assert.equal(before.tacticalGrade,null);assert.ok(!before.components.some(c=>/control|hand|pass|bomb|wind/.test(c.id)));
});
test('supplemental places after a double-finish have no effect on any rating',()=>{
 const r=complete().snapshot();let counts=[27,27,27,27];const events=[];
 // Numeric endpoint fixture tests the rubric, not a claim of legal 27-card plays.
 for(const seat of [0,2]){const after=[...counts];after[seat]=0;events.push({seat,cards:Array(27).fill({}),remainingBefore:counts,remaining:after});counts=after;}
 Object.assign(r,{events,completed:true,remaining:counts,finishOrder:[0,2,1,3],actuallyFinished:[0,2],winnerTeam:0});
 for(let s=0;s<4;s++){const report={seat:s,metrics:[{id:'Q01',status:'observed'}]},a=rating.rate(r,report),b=rating.rate({...r,finishOrder:[0,2,3,1]},report);assert.notEqual(a.score,null);assert.deepEqual(a,b);assert.equal(a.actualFinish,s===0?1:s===2?2:null);}
 assert.equal(rating.rate({...r,actuallyFinished:[0,2,1]},{seat:0,metrics:[{id:'Q01',status:'observed'}]}).score,null);
});
test('ongoing exports never read full storage and reveal none of the other 81 private cards',()=>{
 const m=new Match(),ids=m.game.players.slice(1).flatMap(p=>p.hand.map(c=>c.id)),o=exportsFor.prepare(m,{getItem(){throw Error('private save read');}},keys),raw=JSON.stringify(o.data);
 assert.equal(o.mode,'view');assert.equal(o.data.restorable,false);assert.equal(o.data.kind,'guandan-view-export');assert.ok(ids.every(id=>!raw.includes('"'+id+'"')));assert.equal(o.data.round.initialOwnHand.length,27);assert.equal('game' in o.data,false);assert.equal('reviews' in o.data,false);
 const r=facts.summarize(m.snapshot());assert.ok(r.players.every(p=>p.starting===null&&p.rating===null));
});
test('finished backups preserve bytes; concurrent next-deal saves fail closed to a view',()=>{
 const m=complete(),saved=JSON.stringify(m.state),data={game:saved,archive:'old completed reviews',expert:'old expert feedback',player:'old player feedback'},storage={getItem:k=>data[k]||null};
 const full=exportsFor.prepare(m,storage,keys);assert.equal(full.mode,'backup');assert.equal(full.data.game,saved);assert.equal(full.data.reviews,data.archive);assert.equal(full.data.expertFeedback,data.expert);assert.equal(full.data.playerFeedback,data.player);
 data.game=JSON.stringify(new Match().state);const view=exportsFor.prepare(m,storage,keys);assert.equal(view.mode,'view');assert.equal('game' in view.data,false);
 data.game='{invalid';assert.equal(exportsFor.prepare(m,storage,keys).mode,'view');m.remote=true;data.game=saved;assert.equal(exportsFor.prepare(m,storage,keys).mode,'view');
});
test('finished reports contain separate individual points and outcome ratings',()=>{
 const r=complete().snapshot(),result=facts.summarize(r);assert.equal(result.version,'round-facts-2');assert.ok(result.players.every(p=>Number.isInteger(p.starting.score)&&p.rating.score>=1&&p.rating.score<=10));
 for(const t of result.teams)assert.equal(t.starting.score,t.seats.reduce((s,i)=>s+result.players[i].starting.score,0)/2);
});

test('unavailable individual point references do not turn into a zero team score',()=>{
 const r=complete().snapshot(),c={module:{exports:{}},structuredClone,require:n=>n==='./hand-strength.js'?{points:()=>({score:null,reason:'reference_unavailable'})}:require('../web/app/'+n.replace('./',''))};
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/app/round-statistics.js'),'utf8'),c);
 const f=c.module.exports.summarize(r);assert.ok(f.players.every(p=>p.starting.score===null));assert.ok(f.teams.every(t=>t.starting.score===null&&t.starting.cards===54));
});
