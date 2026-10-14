'use strict';
const vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../../web/app/table.js'),'utf8');
// Exercise the actual table handlers. Rendering is stubbed; choices and commits
// use real Match instances, with controllable remote responses and revisions.
function install(context){
  const nodes=new Map();
  function element(){return {children:[],listeners:{},hidden:false,disabled:false,open:false,textContent:'',
    append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
    addEventListener(type,handler){this.listeners[type]=handler;},focus(){this.focused=true;},
    querySelector(){return this.children.flatMap(child=>child.children||[]).find(child=>child.checked);},
    querySelectorAll(){return this.children.flatMap(child=>child.children||[]).filter(child=>child.type==='radio');}};}
  const byId=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  Object.assign(context,{byId,document:{createElement:element},imageFor:element,pendingDeclaration:null,hintSnapshot:null,
    ownHand:()=>context.liveRound.hand,GuandanPlayChoices:require('../../web/app/play-choices.js'),
    openDialog:dialog=>{dialog.open=true;context.syncDeclaration();},
    closeDialog:dialog=>{dialog.open=false;context.pendingDeclaration=null;}});
  vm.runInContext(source.slice(source.indexOf('function declarationIsCurrent('),source.indexOf('function updateSelection(')),context);
  return nodes;
}
module.exports={install};
