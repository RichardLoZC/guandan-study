const test=require('node:test'),assert=require('node:assert/strict');
const view=require('../web/app/presentation.js');
const {Match}=require('../web/app/match.js');
test('3D projection carries only owned entities and public counts; it cannot mutate a match',()=>{
  const match=new Match(),before=JSON.stringify(match.state),own=match.hand[0];
  const snapshot=view.project(match,{selected:new Set([own.id]),enabled:true});
  assert.equal(snapshot.hand.length,27);assert.equal(snapshot.hand.find(c=>c.id===own.id).selected,true);
  for(const seat of snapshot.seats)assert.deepEqual(Object.keys(seat),['seat','count','finished']);
  const hidden=match.game.players[1].hand[0].id;assert.ok(!JSON.stringify(snapshot).includes(hidden));
  snapshot.hand[0].face='corrupt';snapshot.seats[0].count=999;assert.equal(JSON.stringify(match.state),before);
});
test('duplicate physical cards, level wildcards and legal tribute choices stay distinct',()=>{
  const round={id:'r',revision:0,isTuo3:false,phase:'give',state:{level:'K'},game:{result:null,tablePlay:null,players:[{hand:[]}]},hand:[
    {id:'one',face:'heartKing',label:'♥K',isWild:true},{id:'two',face:'heartKing',label:'♥K',isWild:true},{id:'three',face:'joker',label:'大王',suit:'joker'}]};
  const result=view.project(round,{enabled:true,allowed:new Set(['two']),selected:new Set(['one'])});
  assert.deepEqual(result.hand.map(c=>[c.ordinal,c.duplicates,c.selectable,c.selected]),[[1,2,false,true],[2,2,true,false],[1,1,false,false]]);
  assert.equal(result.hand[0].isWild,true);assert.equal(result.hand[2].joker,true);
});
test('only a new committed own play animates; restore, new game and end do not replay it',()=>{
  const before={id:'a',revision:4,hand:[{id:'one'},{id:'two'}]},after={id:'a',revision:5,hand:[{id:'two'}],table:{owner:0,ids:['one']}};
  assert.deepEqual(view.departing(before,after),['one']);
  for(const patch of [{revision:4},{id:'b'},{ended:true},{dealing:true},{table:{owner:1,ids:['one']}}])assert.deepEqual(view.departing(before,{...after,...patch}),[]);
  assert.deepEqual(view.departing(after,after),[]);
});
test('27, 15, 5 and 1 cards retain readable dimensions and stable targets across Mac sizes',()=>{
  for(const width of [880,1040,1280,1680])for(const count of [27,15,5,1]){
    const layout=view.fanLayout(count,width,640);assert.equal(layout.length,count);
    for(const c of layout){assert.equal(c.width,120);assert.equal(c.height,180);assert.ok(c.hitWidth>=25);assert.ok(c.x-c.width/2>=0&&c.x+c.width/2<=width);}
    assert.deepEqual(layout,view.fanLayout(count,width,640));
  }
});

test('public table projection includes only committed faces, including a wildcard and joker',()=>{
 const m=new Match(),seat=m.actingSeat,id=m.game.players[seat].hand[0].id;
 m.commit(seat,[id]);const snapshot=view.project(m);
 assert.equal(snapshot.table.cards.length,1);assert.equal(snapshot.table.cards[0].id,id);assert.ok(snapshot.table.cards[0].face);
 const before=JSON.stringify(m.state);snapshot.table.cards[0].face='mutated';assert.equal(JSON.stringify(m.state),before);
 const round={id:'r',revision:1,phase:'playing',state:{level:'K'},hand:[],game:{players:[],tablePlay:{owner:1,play:{label:'public',cards:[{id:'wild',rank:'K',suit:'hearts'},{id:'joker',rank:'BJ',suit:'joker'}]}}}};
 const p=view.project(round);assert.equal(p.table.cards[0].isWild,true);assert.equal(p.table.cards[1].face,'redJoker');assert.equal(p.table.cards[1].label,'大王');
});
test('a throw happens only for a newly committed public play, never a pass or view restoration',()=>{
 const before={id:'r',revision:1,table:{owner:0,ids:['a']}},after={id:'r',revision:2,table:{owner:1,ids:['b']}};
 assert.equal(view.isNewTablePlay(before,after),true);
 for(const p of [{revision:1},{id:'new'},{ended:true},{dealing:true},{table:null},{table:before.table}])assert.equal(view.isNewTablePlay(before,{...after,...p}),false);
 assert.equal(view.isNewTablePlay(null,after),false);
});
test('public piles remain on the table and near their owners even for a ten-card bomb',()=>{
 for(let owner=0;owner<4;owner++)for(const n of [1,2,5,10])for(const p of view.tableLayout(owner,n)){
  assert.ok(Math.abs(p.x)<4.2);assert.ok(Math.abs(p.z)<2.8);assert.ok(p.y>.35&&p.y<.5);
  if(owner===1||owner===0)assert.ok(p.x>1.5);if(owner===3)assert.ok(p.x< -1.5);
 }
});
