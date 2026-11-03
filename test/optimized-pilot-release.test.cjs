'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Match}=require('../web/app/match.js'),assessment=require('../web/app/assessment.js'),rating=require('../web/app/assessment-rating.js'),
  legacy=require('../web/app/assessment-legacy.js'),judge=require('../web/app/judge-v2.js'),pilot=require('../web/app/assessment-pilot.js'),reference=require('../web/app/starting-reference.js');
const fixture=require('./helpers/judge-development-fixtures.json');
function round(){const m=new Match(fixture.round.initialState);for(const a of fixture.round.actions){
  if(a.forced)m.passForced();else m.commit(a.seat,a.ids,{key:a.key,automatic:true,engine:'DanLM',decision:a.decision});}return m.snapshot();}
function storage(){const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};}
test('production pilot uses verified research counts and weights without training signals',()=>{
  const r=round();for(let seat=0;seat<4;seat++){
    const current=assessment.assess(r,seat),expected=judge.assess(r,seat,legacy.assess(r,seat)),score=rating.rate(r,current),p=current.metrics.find(m=>m.id==='P01'),old=expected.metrics.find(m=>m.id==='P01');
    assert.equal(current.handAssessment.score,expected.handAssessment.score);assert.equal(p.numerator,old.numerator);assert.equal(p.denominator,old.denominator);
    assert.deepEqual(p.value.contests,old.value.contests);assert.deepEqual(p.value.terminalContests,old.value.terminalContests);
    assert.equal(score.score,expected.statisticsRating.score);assert.ok(Math.abs(score.raw-expected.statisticsRating.raw)<1e-12);
    assert.equal(score.components.find(c=>c.id==='partner-continuation').value,0);assert.equal(score.startingHandAdjusted,false);
    assert.equal(current.trainingSignal.eligible,false);for(const c of current.cases){assert.equal(c.reward,null);assert.equal(c.eligibleForTraining,false);}
  }
});
test('starting reference is withheld until completion and remains separate from personal points',()=>{
  const r=round(),scores=[60,55,70,45];assert.equal(reference.evaluate({...r,completed:false},scores).available,false);
  assert.equal(reference.evaluate({...r,ruleMode:'tuo3'},scores).available,false);assert.equal(reference.evaluate(r,Array(4)).available,false);
  const a=reference.evaluate(r,scores),b=reference.evaluate({...r,starter:(r.starter+1)%4,winnerTeam:1-r.winnerTeam},[55,60,45,70]);
  assert.equal(a.available,true);assert.ok(Math.abs(a.probabilities[0]+b.probabilities[0]-1)<1e-12);assert.equal(a.reward,null);assert.equal(a.eligibleForTraining,false);
  const report=assessment.assess(r,0),initial=rating.rate(r,report);report.teamReference={...a,probabilities:[.999,.001]};assert.deepEqual(rating.rate(r,report),initial);
  assert.equal(assessment.assess({...r,completed:false},0).teamReference.available,false);
});
test('old opinions survive upgrade and are not superseded by a different formula version',async()=>{
  const s=storage(),r=round();r.playerIds=[0,1,2,3];const input={handVerdict:'fair',performanceVerdict:'fair'},sample=await pilot.save(s,r,0,input);
  const old={...sample,id:'old-formula-opinion',version:'player-pilot-0.1.0',ratingVersion:'stats-rating-0.2.0',handVersion:'hand-structure-0.1.0',revisionOf:null};
  s.setItem(pilot.KEY,JSON.stringify([old]));const current=await pilot.save(s,r,0,input),revision=await pilot.save(s,r,0,{...input,handVerdict:'low',reason:'尾牌偏散'});
  assert.deepEqual(pilot.read(s)[0],old);assert.equal(current.revisionOf,null);assert.equal(revision.revisionOf,current.id);
  assert.equal(current.displayed.teamReference.version,reference.VERSION);assert.equal(current.implementationVersion,assessment.VERSION);
  const summary=pilot.summarize(pilot.read(s));assert.equal(summary.groups.length,2);assert.equal(summary.records,3);assert.equal(summary.revisionsExcluded,1);
  for(const v of pilot.read(s)){assert.equal(v.reward,null);assert.equal(v.eligibleForTraining,false);}
});
test('new formula refuses old control definitions and malformed placements',()=>{
  const r=round(),report=assessment.assess(r,0);assert.equal(rating.rate(r,legacy.assess(r,0)).reason,'definition_mismatch');
  assert.equal(rating.rate({...r,finishOrder:[0,1,2,4]},report).reason,'invalid_data');
});
test('conflicting recorded results or counts cannot produce personal points or team reference',()=>{
  for(const change of [r=>r.events.at(-1).remainingBefore[0]++,r=>r.winnerTeam=1-r.winnerTeam,r=>r.remaining[0]++]){
    const r=round();change(r);const report=assessment.assess(r,0);
    assert.equal(report.metrics.find(m=>m.id==='Q01').status,'invalid');assert.equal(report.teamReference.available,false);
    assert.equal(rating.rate(r,report).score,null);
  }
});
