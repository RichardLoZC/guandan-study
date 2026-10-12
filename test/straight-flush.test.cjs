const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const core=require('../web/app/core.js'),rules=require('../web/app/play-rules.js');
const {Match,read,SAVE_KEY}=require('../web/app/match.js');
const {Room,PROTOCOL}=require('../lan-room.cjs');
const flushIds=['5','6','7','8','9'].map(rank=>'1-clubs-'+rank);
function cards(ids,level='2'){core.setLevel(level);const deck=core.deck();return ids.map(id=>deck.find(card=>card.id===id));}
function fixture(ids=flushIds){
  const state=core.newMatch(),deck=core.deck(),chosen=new Set(ids);
  const ordered=[...cards(ids),...deck.filter(card=>!chosen.has(card.id))];
  state.game.players.forEach((player,seat)=>player.hand=core.sortCards(ordered.slice(seat*27,seat*27+27)));
  state.game.currentPlayer=state.game.starter=0;
  return new Match(state);
}
function worker(){
  // Execute the shipped worker's recognition, enumeration and policy payload
  // functions. Only its module bootstrap is adapted for this Node VM.
  const source=fs.readFileSync(require.resolve('../web/assets/fairWorker-CTCwrT35.js'),'utf8')
    .replace(/^import "\.\.\/app\/play-rules\.js\?v=\d+";\n/,'')
    .replaceAll('import.meta.url','"http://localhost/assets/fairWorker-CTCwrT35.js"');
  const context={self:{},performance,TextEncoder,TextDecoder,GuandanPlayRules:rules};
  vm.createContext(context);vm.runInContext(source,context);return context;
}
test('all suits, sequence ends, levels and wild substitutions classify only as straight flushes',()=>{
  const ai=worker(),sequence=['A','2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  for(const level of ['2','7','A'])for(const suit of ['clubs','diamonds','hearts','spades'])for(let start=0;start<10;start++){
    const base=cards(sequence.slice(start,start+5).map(rank=>'1-'+suit+'-'+rank),level);
    for(let wilds=0;wilds<=2;wilds++){
      const hand=[...base],available=cards(['1-hearts-'+level,'2-hearts-'+level],level).filter(card=>!hand.some(c=>c.id===card.id));
      for(let n=0;n<wilds&&available.length;n++){
        const index=hand.findIndex(card=>!card.isWild);hand[index]=available.shift();
      }
      ai.mt(level);
      for(const plays of [core.recognize(hand),ai.Ke(hand)]){
        assert.ok(plays.length>0);assert.ok(plays.every(play=>play.type==='straight-flush'));
      }
    }
  }
});
test('mixed suits remain ordinary straights, including wild cards, without artificial flushes',()=>{
  const hand=cards(['1-clubs-5','1-spades-6','1-clubs-7','1-clubs-8','1-clubs-9']),ai=worker();ai.mt('2');
  for(const chosen of [hand,[...hand.slice(0,4),...cards(['1-hearts-2'])]]){
    for(const plays of [core.recognize(chosen),ai.Ke(chosen)]){
      assert.ok(plays.length);assert.ok(plays.every(play=>play.type==='straight'));
    }
  }
});
test('straight flush strength stays above ordinary straights and five-card bombs, below six-card bombs',()=>{
  const flush=core.recognize(cards(flushIds))[0];
  const high=core.recognize(cards(['1-clubs-10','1-spades-J','1-clubs-Q','1-clubs-K','1-clubs-A']))[0];
  const bombCards=core.deck().filter(card=>card.rank==='K');
  const five=core.recognize(bombCards.slice(0,5))[0],six=core.recognize(bombCards.slice(0,6))[0];
  assert.ok(core.beats(flush,high));assert.ok(!core.beats(high,flush));
  assert.ok(core.beats(flush,five));assert.ok(!core.beats(flush,six));assert.ok(core.beats(six,flush));
});
test('selection, direct play and model commits reject a downgraded flush without changing the round',()=>{
  const match=fixture(),before=JSON.stringify(match.state),old=core.recognizeRecorded(cards(flushIds)).find(play=>play.type==='straight');
  const selected=match.selection(flushIds,0);
  assert.deepEqual(selected.plays.map(play=>play.type),['straight-flush']);
  assert.throws(()=>match.commit(0,flushIds,{key:old.key}),/牌型已失效/);
  assert.throws(()=>core.applyPlay(match.game,0,old),/同花顺/);
  assert.throws(()=>match.commitModel({result:{candidates:[{type:'play',play:old}]}},0,0),/牌型已失效/);
  assert.equal(JSON.stringify(match.state),before);assert.equal(match.revision,0);
  match.commitModel({result:{engine:'fixture',candidates:[{type:'play',play:selected.play}]}},0,0);
  assert.equal(match.game.tablePlay.play.type,'straight-flush');assert.equal(match.game.players[0].hand.length,22);
});
test('worker candidates and decomposition never downgrade flushes and keep genuinely mixed alternatives',()=>{
  const ai=worker();ai.mt('2');
  for(const hand of [cards(flushIds),cards([...flushIds,'2-spades-5']),cards(['1-clubs-5','1-clubs-6','1-clubs-7','1-clubs-8','1-hearts-2','2-spades-5'])]){
    for(const plays of [ai.be(hand),ai.Ks(hand)]){
      assert.ok(plays.some(play=>play.type==='straight-flush'));
      assert.ok(plays.every(play=>core.recognize(play.cards).some(legal=>legal.key===play.key)));
      assert.equal(plays.some(play=>play.type==='straight'),hand.length>5);
    }
  }
  for(let n=0;n<20;n++){
    const match=new Match(),hand=match.game.players[match.actingSeat].hand;
    for(const play of ai.be(hand))assert.ok(core.recognize(play.cards).some(legal=>legal.key===play.key));
  }
});
test('the actual DanLM policy input contains only legal types and rejects an obsolete selected action',()=>{
  const ai=worker(),match=fixture(),observation=match.observation();ai.mt('2');
  const input=ai.sa(observation,true,null);
  assert.ok(input.actions.some(candidate=>candidate.play?.type==='straight-flush'));
  for(const candidate of input.actions){
    if(candidate.type==='play')assert.ok(!match.selection(candidate.play.cards.map(card=>card.id),0,candidate.play.key).error);
  }
  const old=core.recognizeRecorded(cards(flushIds)).find(play=>play.type==='straight');
  assert.throws(()=>ai.sa(observation,true,{type:'play',play:old,score:0}),/合法候选/);
});
test('old saved actions stay readable without rewriting the historical play',()=>{
  const match=fixture();match.commit(0,flushIds);
  const state=structuredClone(match.state),old=core.recognizeRecorded(cards(flushIds)).find(play=>play.type==='straight');
  state.game.tablePlay.play=old;state.game.roundTrace[0].play=old;
  state.game.actionHistory[0].play=old;state.game.actionHistory[0].tablePlayAfter=old;
  const raw=JSON.stringify(state),values=new Map([[SAVE_KEY,raw]]);
  const restored=read({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)});
  assert.equal(restored.id,match.id);assert.equal(values.get(SAVE_KEY),raw);
  assert.equal(restored.game.tablePlay.play.type,'straight');
  assert.deepEqual(restored.events[0].cards.map(card=>card.id),old.cards.map(card=>card.id));
  assert.ok(restored.game.players[0].hand.every(card=>!flushIds.includes(card.id)));
  restored.commit(restored.actingSeat,[]);assert.equal(restored.revision,1);
});
test('LAN authority rejects the ordinary-straight key sent by an older client and broadcasts the flush',async()=>{
  const room=new Room(),host=room.host('Mac');room.join({code:room.code,name:'Pad',protocol:PROTOCOL});
  room.match=fixture();room.seats=[room.members[0].id,room.members[1].id,'bot:2','bot:3'];
  const version=room.version,before=JSON.stringify(room.match.state),old=core.recognizeRecorded(cards(flushIds)).find(play=>play.type==='straight');
  await assert.rejects(room.request(host.token,{op:'play',version,requestId:'old',ids:flushIds,key:old.key}),/牌型已失效/);
  assert.equal(room.version,version);assert.equal(JSON.stringify(room.match.state),before);
  const result=await room.request(host.token,{op:'play',version,requestId:'fixed',ids:flushIds});
  assert.equal(result.round.state.game.tablePlay.play.type,'straight-flush');
  assert.equal(result.round.state.game.players[0].hand.length,22);
});
