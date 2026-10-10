const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const GuandanMatch=require('../web/app/match.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../web/app/table.js'),'utf8');
function harness(failSave=false,mode='classic'){
  const previous=GuandanMatch.create(mode);previous.state.round=6;
  if(!previous.isTuo3){previous.state.levels=['J','Q'];previous.commit(previous.actingSeat,[previous.game.players[previous.actingSeat].hand[0].id]);}
  const raw=JSON.stringify(previous.state),archive='[{"id":"preserved-archive"}]';
  const saved=new Map([[GuandanMatch.SAVE_KEY,raw],[GuandanMatch.ARCHIVE_KEY,archive]]),nodes=new Map();let handler;
  const context={GuandanMatch,liveRound:previous,paused:true,prefs:{paused:true},selected:new Set(['old-selection']),cardNodes:new Map(),
    playKey:'old-play',hintSnapshot:{roundId:previous.id},confirmMode:'restart',model:{ready:true},activeTask:null,
    stopBots(){},clearToast(){},clearError(){},renderGame(){},scheduleBots(){},savePrefs(){},checkModel(){},
    dealMotion:{cancel(){context.cancelledDeal=true;}},beginDealAnimation(){context.animatedDeal=JSON.parse(saved.get(GuandanMatch.SAVE_KEY)).id;},
    reportError(error){context.error=error;},closeDialog(dialog){dialog.open=false;},
    localStorage:{getItem:key=>saved.get(key)||null,setItem(key,value){if(failSave&&key===GuandanMatch.SAVE_KEY)throw new Error('QuotaExceededError');saved.set(key,value);}},
    byId(id){if(!nodes.has(id))nodes.set(id,{open:true,addEventListener(type,fn){handler=fn;}});return nodes.get(id);}
  };
  vm.createContext(context);
  vm.runInContext(source.match(/function replaceMatch\(next\)\{[^\n]+/)[0],context);
  const start=source.indexOf("byId('confirm-new').addEventListener");
  vm.runInContext(source.slice(start,source.indexOf("document.querySelectorAll('dialog')",start)),context);
  return {context,saved,raw,archive,handler};
}
test('new game resets deal and levels, clears prior actions, preserves archives and backs up the old game',()=>{
  const h=harness(),oldId=h.context.liveRound.id;h.handler();
  const fresh=h.context.liveRound;
  assert.notEqual(fresh.id,oldId);assert.equal(fresh.state.round,1);assert.deepEqual(fresh.state.levels,['2','2']);
  assert.deepEqual(fresh.game.players.map(p=>p.hand.length),[27,27,27,27]);assert.equal(fresh.game.actionHistory.length,0);
  assert.equal(fresh.phase,'playing');assert.equal(fresh.tributeDisplay,null);assert.equal(h.context.paused,false);
  assert.equal(h.context.selected.size,0);assert.equal(h.context.hintSnapshot,null);
  assert.equal(h.saved.get(GuandanMatch.ARCHIVE_KEY),h.archive);assert.equal(h.saved.get(GuandanMatch.SAVE_KEY+'-before-restart'),h.raw);
  assert.equal(h.context.animatedDeal,fresh.state.id);assert.equal(h.context.cancelledDeal,true);
});
test('failed new-game save leaves the original game, paused state and archives intact',()=>{
  const h=harness(true),previous=h.context.liveRound;h.handler();
  assert.equal(h.context.liveRound,previous);assert.equal(h.saved.get(GuandanMatch.SAVE_KEY),h.raw);
  assert.equal(h.saved.get(GuandanMatch.ARCHIVE_KEY),h.archive);assert.equal(h.context.paused,true);
  assert.ok(h.context.error);assert.equal(h.context.byId('confirm-dialog').open,true);
  assert.equal(h.context.animatedDeal,undefined);assert.equal(h.context.cancelledDeal,undefined);
});

test('restarting a legacy Tuo3 save starts classic and keeps the old variant recoverable',()=>{
  const h=harness(false,'tuo3');
  assert.equal(GuandanMatch.read(h.context.localStorage).isTuo3,true);
  h.handler();
  const fresh=h.context.liveRound;
  assert.equal(fresh.isTuo3,false);assert.equal(fresh.state.round,1);
  assert.deepEqual(fresh.state.levels,['2','2']);assert.equal(fresh.needsTributeConfirmation,false);
  assert.equal(h.saved.get(GuandanMatch.SAVE_KEY+'-before-restart'),h.raw);
  assert.equal(h.saved.get(GuandanMatch.ARCHIVE_KEY),h.archive);
  assert.equal(GuandanMatch.read(h.context.localStorage).isTuo3,false);
  assert.equal(GuandanMatch.read({getItem:()=>h.saved.get(GuandanMatch.SAVE_KEY+'-before-restart')}).isTuo3,true);
});
test('failed restart preserves a legacy Tuo3 save without converting it',()=>{
  const h=harness(true,'tuo3'),previous=h.context.liveRound;h.handler();
  assert.equal(h.context.liveRound,previous);assert.equal(h.saved.get(GuandanMatch.SAVE_KEY),h.raw);
  assert.ok(h.context.error);
});
