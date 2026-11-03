'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const personas=require('../web/app/personas.js'),feedback=require('../web/app/game-feedback.js');
const {Match}=require('../web/app/match.js'),{Room,PROTOCOL}=require('../web/app/lan-room.js'),{finished}=require('./helpers/series-fixtures.cjs');
test('historical identities are unique, stable for a game and preserved across deals',()=>{
 const match=new Match(),ids=match.state.personaIds;assert.ok(personas.valid(ids));assert.deepEqual(personas.assignment(match.id),ids);
 assert.deepEqual(new Match(match.state).names,match.names);assert.ok(match.names.slice(1).every(name=>personas.names.includes(name)));
 const completed=finished([0,1,2,3],{level:'K',levels:['K','2']});assert.deepEqual(completed.next().state.personaIds,completed.state.personaIds);
 assert.ok(new Set(Array.from({length:20},(_,i)=>personas.assignment('seed-'+i).join(','))).size>1);
});
test('legacy notices use the displayed identities after seats rotate',()=>{
 const ids=[2,0,3,1],names=['荀彧','你','郭嘉','白居易'];
 assert.equal(personas.notice('青岚向你进贡，墨白接风',ids,names),'白居易向你进贡，郭嘉接风');
});
test('LAN views agree on AI identity and preserve it through restore',async()=>{
 const room=new Room(),host=room.host('甲'),guest=room.join({code:room.code,name:'乙',protocol:PROTOCOL});
 await room.request(host.token,{protocol:PROTOCOL,op:'start',version:room.version,requestId:'start'});
 const first=room.projected(room.authenticate(host.token)).round,second=room.projected(room.authenticate(guest.token)).round;
 for(const view of [first,second])for(let seat=0;seat<4;seat++)if(!view.humanSeats.includes(seat))assert.equal(view.names[seat],personas.profile(view.state.personaIds,view.playerIds[seat]).name);
 assert.deepEqual(new Room({restored:room.serialize()}).match.state.personaIds,room.match.state.personaIds);
});
test('card impacts grow with card count and rank, and reactions use only public plays',()=>{
 const make=(count,value,type='single')=>({cards:Array(count).fill({}),primaryValue:value,type});
 assert.ok(feedback.impact(make(3,8)).gain>feedback.impact(make(1,8)).gain);
 assert.ok(feedback.impact(make(1,14)).gain>feedback.impact(make(1,3)).gain);
 assert.ok(feedback.impact(make(4,8,'bomb')).gain>feedback.impact(make(4,8)).gain);
 const reactions=feedback.expressions({kind:'play',seat:1,previousOwner:3,play:make(4,8,'bomb')});
 assert.deepEqual(reactions.map(r=>r.seat),[1,3]);assert.notEqual(reactions[0].face,reactions[1].face);
 assert.equal(feedback.expressions({kind:'pass',seat:0})[0].seat,0);
});
