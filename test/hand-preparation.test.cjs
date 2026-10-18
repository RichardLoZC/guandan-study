'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {Match}=require('../web/app/match.js');
const source=fs.readFileSync(require.resolve('../web/app/table.js'),'utf8');
function fixture(){
  const round=new Match();round.game.currentPlayer=round.game.starter=1;
  const context={liveRound:round,selected:new Set(),handEditor:{editing:false},handMarquee:null,paused:false,fault:null,dealMotion:{active:false},window:{},
    ownHand:()=>round.hand,clearToast(){},updateSelection(){},playKey:null,hintSnapshot:null,
    document:{addEventListener(){}},getComputedStyle(){}};
  context.window.addEventListener=()=>{};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../web/app/hand-selection.js'),'utf8')+'\n'+source.slice(source.indexOf('const canPlay='),source.indexOf('const hasOpenDialog='))+
    '\nchecks={canPlay,canArrange,canSelect};\n'+source.slice(source.indexOf('function setSelection('),source.indexOf('function renderHand('))+
    '\nhandSelection=GuandanHandSelection.create({table:{addEventListener(){}},getOrder:()=>ownHand().map(card=>card.id),getSelected:()=>selected,getSignature:()=>liveRound.id,canSelect,hasDialog:()=>false,cancelGesture:()=>false,onSelect:setSelection});',context);
  return {round,context};
}
test('off-turn, paused, failed inference and disconnected LAN permit local selection and arrangement, never play',()=>{
  const scenarios=[()=>{},c=>c.paused=true,c=>c.fault='model unavailable',c=>{c.liveRound.remote=true;c.window.GuandanLan={ready:false};},c=>c.liveRound.state.phase='return'];
  for(const setup of scenarios){
    const {round,context:c}=fixture();setup(c);const before=JSON.stringify(round.state),ids=round.hand.slice(0,3).map(card=>card.id);
    assert.equal(c.checks.canArrange(),true);assert.equal(c.checks.canSelect(),true);assert.equal(c.checks.canPlay(),false);
    for(const id of ids)c.selectCard(id);assert.deepEqual([...c.selected],ids);
    c.selectCard(ids[1]);assert.deepEqual([...c.selected],[ids[0],ids[2]]);
    assert.equal(JSON.stringify(round.state),before,'preparation must not mutate the deal');
    assert.throws(()=>round.commit(0,ids),/不能/);
  }
});
test('a human tribute turn permits arranging all cards, while only one legal tribute card can be committed',()=>{
  const {round,context:c}=fixture();round.game.currentPlayer=0;
  Object.defineProperty(round,'actingSeat',{value:0});Object.defineProperty(round,'tributeChoices',{value:[round.hand[0]]});round.state.phase='return';
  const ids=round.hand.slice(0,3).map(card=>card.id);ids.forEach(id=>c.selectCard(id));
  assert.equal(c.checks.canSelect(),true);assert.deepEqual([...c.selected],ids);
  assert.ok(round.selection(ids,0).error);assert.ok(round.selection([ids[1]],0).error);
  assert.equal(round.selection([ids[0]],0).tribute.id,ids[0]);
});
test('phone disables arrangement while retaining off-turn selection and legal play',()=>{
 const {round,context:c}=fixture();c.window.GuandanPhone={active:true,blocked:()=>false};
 assert.equal(c.checks.canArrange(),false);assert.equal(c.checks.canSelect(),true);assert.equal(c.checks.canPlay(),false);
 const card=round.hand[0];c.selectCard(card.id);assert.deepEqual([...c.selected],[card.id]);
 round.game.currentPlayer=round.game.starter=0;assert.equal(c.checks.canPlay(),true);
 assert.ok(round.selection([...c.selected],0).play);
});
test('bot action completion preserves prepared selection; a local action clears it',()=>{
  for(const actor of [1,2,3,0]){
    const {round,context:c}=fixture();round.game.currentPlayer=round.game.starter=actor;
    const selected=round.hand.slice(0,2).map(card=>card.id);selected.forEach(id=>c.selected.add(id));
    Object.assign(c,{stopBots(){},clearError(){},localStorage:{setItem(){}},renderGame(){},scheduleBots(){},hintSnapshot:{},reportError(error){throw error;}});
    vm.runInContext(source.slice(source.indexOf('function saveAction('),source.indexOf('function scheduleBots(')),c);
    const card=round.game.players[actor].hand[0];c.saveAction(()=>round.commit(actor,[card.id]));
    assert.deepEqual([...c.selected],actor===0?[]:selected);
  }
});
test('selection cannot target foreign cards, finished hands or the hidden dealing stage',()=>{
  const {round,context:c}=fixture();c.selectCard(round.game.players[1].hand[0].id);assert.equal(c.selected.size,0);
  c.dealMotion.active=true;assert.equal(c.checks.canSelect(),false);c.selectCard(round.hand[0].id);assert.equal(c.selected.size,0);
  c.dealMotion.active=false;round.game.result={};assert.equal(c.checks.canSelect(),false);assert.equal(c.checks.canArrange(),false);
});
test('an active selection box cannot submit a move or receive a trailing card click',()=>{
  const {round,context:c}=fixture();round.game.currentPlayer=round.game.starter=0;c.handMarquee={active:true};
  assert.equal(c.checks.canArrange(),true);assert.equal(c.checks.canPlay(),false);assert.equal(c.checks.canSelect(),false);
  c.selectCard(round.hand[0].id);assert.equal(c.selected.size,0);
  c.handMarquee.active=false;assert.equal(c.checks.canPlay(),true);
});

test('public turn updates keep pressed card nodes, while a cleared cache on lobby exit rebuilds them',()=>{
  const core=require('../web/app/core.js'),layout=require('../web/app/hand-layout.js');core.setLevel('2');
  const hand=core.deck().filter(card=>['1-clubs-3','1-spades-3'].includes(card.id)).map(card=>({...card,face:'face',label:core.cardLabel(card)}));
  function node(){return {children:[],dataset:{},className:'',style:{setProperty(){},removeProperty(){}},classList:{toggle(){},add(){}},
    setAttribute(){},addEventListener(){},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
    querySelector(){return this.children[0];},querySelectorAll(){return this.children.flatMap(child=>[...(child.className==='playing-card'?[child]:[]),...child.querySelectorAll()]);}};}
  const container=node(),nodes=new Map([['hand-cards',container]]),cardNodes=new Map();let replacements=0;
  container.replaceChildren=(...items)=>{container.children=items;replacements++;};
  const c={document:{activeElement:null,createElement:node},GuandanCardArt:require('../web/app/card-art.js'),loadCardImage(img){img.dataset.levelCard='false';},currentSkin:'jumbo',GuandanCore:core,GuandanHandLayout:layout,GuandanI18n:{locale:'zh-CN'},window:{},
    liveRound:{level:'2',game:{}},renderedHandKey:'',cardNodes,handEditor:{reconcile(){}},handMarquee:null,ownHand:()=>hand,displayLayout:()=>layout.create('same-round',hand),
    byId:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},imageFor:node,selectCard(){},renderArrangement(){},updateSelection(){},canArrange:()=>true};
  vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function renderHand('),source.indexOf('function resizeHand(')),c);
  c.renderHand();const original=cardNodes.get(hand[0].id);assert.equal(replacements,1);
  c.renderHand();assert.equal(replacements,1,'a bot update cannot detach a pressed card');assert.equal(cardNodes.get(hand[0].id),original);
  cardNodes.clear();c.renderHand();assert.equal(replacements,2,'leaving a lobby must rebuild cleared node ownership');assert.equal(cardNodes.size,hand.length);assert.notEqual(cardNodes.get(hand[0].id),original);
});
