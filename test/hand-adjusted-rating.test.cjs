'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {Match}=require('../web/app/match.js'),assessment=require('../web/app/assessment.js'),statistics=require('../web/app/round-statistics.js'),rating=require('../web/app/assessment-rating.js'),hand=require('../web/app/hand-assessment.js'),strength=require('../web/app/hand-strength.js');
const fixture=require('./helpers/judge-development-fixtures.json');
function complete(){const m=new Match(structuredClone(fixture.round.initialState));for(const a of fixture.round.actions){if(a.forced)m.passForced();else m.commit(a.seat,a.ids,{key:a.key,automatic:true,engine:'DanLM',decision:a.decision});}return m.snapshot();}
function withPoints(score){const c={module:{exports:{}},require:n=>n==='./hand-strength.js'?{points:()=>({score})}:require('../web/app/'+n.replace('./',''))};vm.runInNewContext(fs.readFileSync(require.resolve('../web/app/assessment-rating.js'),'utf8'),c);return c.module.exports;}
test('weaker starting hands earn higher ratings for the same completed performance at all 101 point values',()=>{
 const round=complete();for(let s=0;s<4;s++){const report=assessment.assess(round,s);let prev=Infinity;for(let score=0;score<=100;score++){const a=withPoints(score).rate(round,report);assert.ok(a.score<=prev);assert.ok(a.score>=1&&a.score<=10);assert.equal(a.startingHandScore,score);assert.equal(a.eligibleForTraining,false);assert.equal(a.reward,null);assert.equal(a.tacticalGrade,null);prev=a.score;}}
});
test('hand adjustment is bounded and unfinished winners cannot get the full finish bonus',()=>{
 const round=complete();for(let s=0;s<4;s++){const report=assessment.assess(round,s),a=withPoints(0).rate(round,report),component=a.components.find(c=>c.id==='starting-hand-adjustment');assert.ok(Math.abs(component.value)<=1.2);if(s%2===round.winnerTeam&&a.actualFinish===null)assert.equal(component.value,1.2*a.cardsPlayed/27);if(s%2!==round.winnerTeam)assert.equal(component.value,.6);}
});
test('the actual individual 27 cards determine hand adjustment and personal starting bomb counts',()=>{
 const round=complete(),facts=statistics.summarize(round);for(let s=0;s<4;s++){const cards=assessment.visibleHand(round,0,s),score=strength.points(hand.evaluate(cards,round.level).score,round.level).score;assert.equal(facts.players[s].rating.startingHandScore,score);assert.equal(facts.players[s].starting.score,score);const groups=facts.players[s].starting.bombGroups;assert.equal(groups.length,facts.players[s].starting.peakBombs);assert.equal(new Set(groups.flatMap(g=>g.cardIds)).size,groups.flatMap(g=>g.cardIds).length);}
});
test('no hand-adjusted ratings or other starting resources are exposed in progress',()=>{
 const r=new Match().snapshot();for(let s=0;s<4;s++){const a=rating.rate(r,{seat:s});assert.equal(a.score,null);assert.equal(a.startingHandAdjusted,false);assert.equal(a.components.length,0);}assert.ok(statistics.summarize(r).players.every(p=>p.starting===null&&p.rating===null));
});
test('missing hand reference falls back explicitly without NaN or synthetic difficulty',()=>{
 const round=complete(),report=assessment.assess(round);for(const score of [null,undefined,NaN,Infinity]){const a=withPoints(score).rate(round,report);assert.equal(a.startingHandAdjusted,false);assert.equal(a.startingHandScore,null);assert.ok(Number.isFinite(a.score));assert.ok(!a.components.some(c=>c.id==='starting-hand-adjustment'));}
});

test('completed own-hand cross-checks reject substituted hands and rebuild missing private views',()=>{
 const r=complete(),original=rating.rate(r,assessment.assess(r)),changed=structuredClone(r);
 changed.events[0].ownBefore=assessment.visibleHand(r,0,1);
 assert.equal(rating.rate(changed,assessment.assess(changed)).score,null);assert.equal(statistics.summarize(changed).players[0].starting,null);
 const missing=structuredClone(r);delete missing.events[0].ownBefore;delete missing.initialOwnHand;
 // Rating data comes from completed public facts even if a legacy private snapshot is absent.
 assert.deepEqual(rating.rate(missing,{seat:0,metrics:[{id:'Q01',status:'observed'}]}),original);
});
