'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {Match}=require('../web/app/match.js'),layout=require('../web/app/hand-layout.js');
const source=fs.readFileSync(require.resolve('../web/app/table.js'),'utf8');
function fixture(){
 const match=new Match(),deck=match.game.players.flatMap(player=>player.hand),ids=['5','6','7','8','9'].map(rank=>'1-clubs-'+rank);
 const cards=ids.map(id=>deck.splice(deck.findIndex(card=>card.id===id),1)[0]);
 match.game.players[0].hand=[...cards,...deck.splice(0,22)];
 for(let seat=1;seat<4;seat++)match.game.players[seat].hand=deck.splice(0,27);
 match.game.currentPlayer=match.game.starter=0;
 return {match,ids};
}
function harness(){
 const {match,ids}=fixture(),key='solo:'+match.id;let current=layout.move(layout.create(key,match.hand),ids,0,0),enabled=true,dialog=false;
 const commands=[];
 const context={liveRound:match,canPlay:()=>enabled&&match.canAct,hasOpenDialog:()=>dialog,layoutKey:()=>key,currentLayout:()=>current,
  saveAction:action=>action(),window:{GuandanLan:{command:async(...args)=>commands.push(args)}}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function groupPlaySelection('),source.indexOf('function updateGroupActions(')),context);
 return {match,ids,key,context,commands,choose:()=>context.groupPlaySelection(ids,key),play:()=>context.playGroup(ids,key),setEnabled:v=>enabled=v,setDialog:v=>dialog=v,setLayout:v=>current=v,get current(){return current;}};
}
test('playing a saved group submits exactly its physical cards and keeps a straight flush as a straight flush',()=>{
 const h=harness(),before=h.match.hand.map(card=>card.id),choice=h.choose();assert.ok(choice);
 assert.equal(h.match.selection(choice.ids,0,choice.key).play.type,'straight-flush');
 h.play();assert.equal(h.match.hand.length,22);assert.equal(h.match.game.tablePlay.play.type,'straight-flush');
 assert.deepEqual(h.match.hand.map(card=>card.id).sort(),before.filter(id=>!h.ids.includes(id)).sort());
 const after=JSON.stringify(h.match.state);h.play();assert.equal(JSON.stringify(h.match.state),after,'a stale second click never passes or plays');
});
test('off-turn, paused, open dialogs, tribute, missing groups and stale rounds cannot submit',()=>{
 const cases=[h=>h.setEnabled(false),h=>h.setDialog(true),h=>h.match.game.currentPlayer=1,h=>h.match.state.phase='return',h=>h.setLayout({...h.current,groups:[]})];
 for(const setup of cases){const h=harness();setup(h);const before=JSON.stringify(h.match.state);assert.equal(h.choose(),null);h.play();assert.equal(JSON.stringify(h.match.state),before);assert.equal(h.commands.length,0);}
 const h=harness();assert.equal(h.context.groupPlaySelection(h.ids,'old-round'),null);assert.equal(h.context.groupPlaySelection([],h.key),null);
 h.match.game.players[0].hand=h.match.hand.filter(card=>card.id!==h.ids[0]);assert.equal(h.choose(),null);
});
test('a group that cannot beat the table stays unavailable and never becomes PASS',()=>{
 const h=harness(),core=require('../web/app/core.js');
 // Let an opponent lead a six-card bomb, which outranks a five-card straight flush.
 const cards=h.match.game.players.flatMap(player=>player.hand).filter(card=>card.rank==='4').slice(0,6);
 const bomb=core.recognize(cards)[0];assert.equal(bomb.type,'bomb');
 h.match.game.tablePlay={owner:1,play:bomb};
 const before=JSON.stringify(h.match.state);assert.equal(h.choose(),null);h.play();assert.equal(JSON.stringify(h.match.state),before);
});
test('LAN uses the existing play command, with group IDs rather than any current selection',()=>{
 const h=harness();h.match.remote=true;const before=JSON.stringify(h.match.state);h.play();assert.equal(h.commands.length,1);
 assert.equal(h.commands[0][0],'play');assert.deepEqual([...h.commands[0][1].ids],h.ids);assert.ok(h.commands[0][1].key);
 assert.equal(JSON.stringify(h.match.state),before,'only the host changes game state');
});
