'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../web/app/core.js'),layout=require('../web/app/hand-layout.js'),search=require('../web/app/arrange-search.js');
const source=fs.readFileSync(require.resolve('../web/app/table.js'),'utf8');
function fixture(){
 core.setLevel('2');
 const upper=[...['3','4','5','6','7'].map(rank=>'1-clubs-'+rank),'1-hearts-K','1-spades-K'];
 const lower=[...['8','9','10','J','Q'].map(rank=>'1-clubs-'+rank),'1-hearts-8','1-spades-8','1-diamonds-8','1-hearts-7','1-spades-7','1-diamonds-5','1-spades-5','1-joker-SJ'];
 const hand=core.sortCards(core.deck().filter(card=>[...upper,...lower].includes(card.id)));
 const saved={version:1,key:'solo:r|0',source:'manual',rows:[upper,lower],groups:[{ids:upper.slice(0,5),label:'同花顺 3-4-5-6-7'},{ids:upper.slice(5),label:'对子 K'}]};
 return {hand,saved};
}
const upperGroups=state=>state.groups.filter(group=>group.ids.every(id=>state.rows[0].includes(id)));
test('all arrangement priorities operate on the lower pool and preserve reserved groups verbatim',()=>{
 const {hand,saved}=fixture(),before=structuredClone(saved),pool=hand.filter(card=>saved.rows[1].includes(card.id));
 for(const priority of ['balanced','flush','bomb','runs','pairs'])for(const plan of search.plans(pool,'2',{priority})){
  const next=layout.fromPlan(saved.key,hand,plan,saved);
  assert.deepEqual(next.rows[0],saved.rows[0]);assert.deepEqual(upperGroups(next),saved.groups);
  assert.deepEqual([...next.rows[1]].sort(),[...saved.rows[1]].sort());
  assert.equal(new Set(next.rows.flat()).size,hand.length);
 }
 assert.deepEqual(saved,before,'automatic arrangement must leave its undo snapshot intact');
});
test('rank sort resets only the lower row, including after an automatic arrangement',()=>{
 const {hand,saved}=fixture(),pool=hand.filter(card=>saved.rows[1].includes(card.id));
 const arranged=layout.fromPlan(saved.key,hand,search.plans(pool,'2')[0],saved),before=structuredClone(arranged);
 const sorted=layout.fromPlan(saved.key,hand,null,arranged);
 assert.deepEqual(sorted.rows,[saved.rows[0],pool.map(card=>card.id)]);
 assert.deepEqual(sorted.groups,saved.groups);assert.deepEqual(arranged,before);
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
 layout.save(storage,sorted);assert.deepEqual(layout.load(storage,saved.key,hand),sorted);
});
test('stale, partial and duplicate lower plans cannot steal reserved cards or lose cards',()=>{
 const {hand,saved}=fixture();
 for(const ids of [saved.rows.flat(),saved.rows[1].slice(1),[...saved.rows[1].slice(1),saved.rows[1][1]],[...saved.rows[1].slice(1),'foreign']]){
  assert.deepEqual(layout.fromPlan(saved.key,hand,{groups:[{ids,label:'stale'}]},saved),saved);
 }
 const allUp={...saved,rows:[saved.rows.flat(),[]]};
 assert.deepEqual(layout.fromPlan(saved.key,hand,null,allUp),allUp);
});
test('new tribute cards enter the lower working row even when the reserved row is shorter',()=>{
 const saved={version:1,key:'r',source:'manual',rows:[['a'],['b','c','d']],groups:[]};
 assert.deepEqual(layout.reconcile(saved,'r',['a','b','c','d','e'].map(id=>({id}))).rows,[['a'],['b','c','d','e']]);
});
function controller(){
 const {hand,saved}=fixture(),nodes=new Map(),calls=[],data=new Map();
 function node(){return {children:[],disabled:false,replaceChildren(...children){this.children=children;},append(child){this.children.push(child);},setAttribute(){}};}
 const context={liveRound:{id:'r',level:'2',playerIds:[0,1,2,3],hand,game:{}},prefs:{arrangePriority:'balanced'},handLayout:saved,
  GuandanHandLayout:layout,GuandanArrangeSearch:{plans(cards,level,options){calls.push(cards.map(card=>card.id));return search.plans(cards,level,options);}},
  localStorage:{getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)},selected:new Set([saved.rows[0][0],saved.rows[1][0]]),
  document:{createElement:node},byId:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},
  window:{},dealMotion:{active:false},handMarquee:null,resizeHand(){},toast(){},renderHand(){context.ownHand();}};
 context.handEditor={editing:false,replace(next){context.commitLayout(next);}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('let arrangement='),source.indexOf('const canPlay='))+
  source.slice(source.indexOf('const canPrepare='),source.indexOf('const hasOpenDialog='))+
  '\ngetArrangement=()=>arrangement;autoEnabled=()=>canAutoArrange();',context);
 return {c:context,calls,nodes,saved,hand};
}
test('cycling and priority changes use only the lower pool; moving a card up invalidates cached plans',()=>{
 const {c,calls,saved,hand}=controller(),chosen=[...c.selected],state=JSON.stringify(c.liveRound);
 c.cycleArrangement();c.cycleArrangement();assert.equal(calls.length,1);
 assert.deepEqual([...calls[0]].sort(),[...saved.rows[1]].sort());
 assert.deepEqual(c.currentLayout().rows[0],saved.rows[0]);assert.deepEqual([...c.selected],chosen);
 const reserve=c.currentLayout().rows[1][0];c.commitLayout(layout.move(c.currentLayout(),[reserve],0,0));
 c.cycleArrangement();assert.equal(calls.length,2);assert.ok(!calls[1].includes(reserve));assert.equal(c.currentLayout().rows[0][0],reserve);
 c.prefs.arrangePriority='flush';c.cycleArrangement();assert.equal(calls.length,3);assert.ok(!calls[2].includes(reserve));
 assert.equal(JSON.stringify(c.liveRound),state,'presentation changes cannot mutate the match or model hand');
 assert.equal(new Set(c.currentLayout().rows.flat()).size,hand.length);
});
test('empty lower row disables automatic controls but keeps manual editing available',()=>{
 const {c,calls,hand,nodes}=controller();
 c.commitLayout(layout.move(c.currentLayout(),c.currentLayout().rows[1],0,0));
 const before=JSON.stringify(c.currentLayout());c.renderArrangement();c.cycleArrangement();c.sortLowerHand();
 assert.equal(c.autoEnabled(),false);assert.equal(calls.length,0);assert.equal(JSON.stringify(c.currentLayout()),before);
 for(const id of ['arrange-hand','arrange-priority','sort-hand'])assert.equal(nodes.get(id).disabled,true);
 c.commitLayout(layout.move(c.currentLayout(),[hand[0].id],1,0));c.renderArrangement();
 assert.equal(c.autoEnabled(),true);assert.equal(nodes.get('arrange-hand').disabled,false);c.cycleArrangement();assert.equal(calls.length,1);
});
test('phone shows rank order without rearranging or overwriting saved desktop groups',()=>{
 const {c,calls,saved,hand}=controller(),before=JSON.stringify(saved);
 c.window.GuandanPhone={active:true};
 assert.deepEqual(c.currentLayout().rows,[[],hand.map(card=>card.id)]);
 assert.equal(c.currentLayout().groups.length,0);assert.equal(c.autoEnabled(),false);
 c.cycleArrangement();c.sortLowerHand();assert.equal(calls.length,0);
 assert.equal(JSON.stringify(c.handLayout),before);
 c.window.GuandanPhone.active=false;
 assert.deepEqual(c.currentLayout().rows,saved.rows);assert.deepEqual(c.currentLayout().groups,saved.groups);
});
