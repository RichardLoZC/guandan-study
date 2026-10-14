/* Selection is private preparation. Background clicks only commit after a
   stationary press/release; dragging, scrolling and controls retain ownership. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GuandanHandSelection=Object.freeze(api);
})(globalThis,function(){
  'use strict';
  const MOVE_SLOP=6;
  // Only known empty surfaces clear selection. Newly added controls or table
  // information do not silently acquire a destructive click action.
  const surfaces='.play-zone,.table-seats,.hand-pane,.hand-scroll,#hand-cards,.card-row,.hand-cluster,.felt,.felt-line,.felt-emblem,.hand-pan-note';
  const editable='input,textarea,select,[contenteditable]:not([contenteditable="false"])';
  const modified=event=>event.shiftKey||event.ctrlKey||event.metaKey||event.altKey;
  const stamp=ids=>JSON.stringify([...ids].sort());
  function range(order,selected,anchor,id){
    const start=order.indexOf(anchor),end=order.indexOf(id);
    if(start<0||end<0)return [...selected];
    return [...new Set([...selected,...order.slice(Math.min(start,end),Math.max(start,end)+1)])];
  }
  function create({table,getOrder,getSelected,getSignature,canSelect,hasDialog,cancelGesture,onSelect}){
    let press=null,anchor=null,anchorLayout='',anchorSelection='';
    function clear(){
      cancelGesture();
      press=null;anchor=null;
      if(getSelected().size)onSelect([]);
    }
    function choose(id,event={}){
      if(!canSelect()||hasDialog())return;
      const order=getOrder(),selected=getSelected(),layout=getSignature();
      if(!order.includes(id))return;
      if(layout!==anchorLayout||stamp(selected)!==anchorSelection)anchor=null;
      let next;
      if(event.shiftKey&&anchor&&selected.has(anchor))next=range(order,selected,anchor,id);
      else{
        const toggled=new Set(selected);toggled.has(id)?toggled.delete(id):toggled.add(id);
        next=[...toggled];anchor=toggled.has(id)?id:null;
      }
      onSelect(next);anchorLayout=layout;anchorSelection=stamp(getSelected());
    }
    function blank(event){
      const target=document.elementFromPoint(event.clientX,event.clientY);
      if(!target||!table.contains(target)||!target.matches(surfaces))return false;
      // Ignore scrollbar gutters, including scaled desktop and Windows bars.
      for(let el=target;el&&table.contains(el);el=el.parentElement){
        const style=getComputedStyle(el),box=el.getBoundingClientRect();
        const sx=el.offsetWidth?box.width/el.offsetWidth:1,sy=el.offsetHeight?box.height/el.offsetHeight:1;
        const left=box.left+el.clientLeft*sx,top=box.top+el.clientTop*sy;
        if(/(auto|scroll|hidden|clip)/.test(style.overflowX)&&(event.clientX<left||event.clientX>=left+el.clientWidth*sx))return false;
        if(/(auto|scroll|hidden|clip)/.test(style.overflowY)&&(event.clientY<top||event.clientY>=top+el.clientHeight*sy))return false;
      }
      return true;
    }
    function cancelPress(){press=null;}
    window.addEventListener('pointerdown',event=>{
      press=null;
      if(!event.isPrimary||event.button!==0||modified(event)||!canSelect()||hasDialog()||!getSelected().size||!blank(event))return;
      press={pointer:event.pointerId,x:event.clientX,y:event.clientY,layout:getSignature(),selection:stamp(getSelected()),released:false};
    },true);
    window.addEventListener('pointermove',event=>{
      if(press&&event.pointerId===press.pointer&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>=MOVE_SLOP)cancelPress();
    },true);
    window.addEventListener('pointerup',event=>{
      if(!press||event.pointerId!==press.pointer)return;
      if(event.button!==0||modified(event)||Math.hypot(event.clientX-press.x,event.clientY-press.y)>=MOVE_SLOP||!blank(event)){cancelPress();return;}
      press.released=true;press.time=performance.now();
    },true);
    table.addEventListener('click',event=>{
      const old=press;press=null;
      if(!old?.released||!event.detail||event.defaultPrevented||modified(event)||performance.now()-old.time>1000)return;
      if(!canSelect()||hasDialog()||!blank(event)||old.layout!==getSignature()||old.selection!==stamp(getSelected()))return;
      clear();
    });
    window.addEventListener('pointercancel',cancelPress,true);
    window.addEventListener('scroll',cancelPress,true);
    window.addEventListener('wheel',cancelPress,{passive:true,capture:true});
    window.addEventListener('resize',cancelPress);window.addEventListener('blur',cancelPress);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelPress();});
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||event.repeat||event.isComposing||event.defaultPrevented||modified(event)||hasDialog()||event.target.closest?.(editable))return;
      // Escape has one effect per press. Cancelling a drag/box preserves the
      // prior selection; a subsequent Escape clears it. Dialogs own Escape.
      if(cancelGesture()){
        cancelPress();event.preventDefault();event.stopImmediatePropagation();
      }else if(canSelect()&&getSelected().size){
        clear();event.preventDefault();event.stopImmediatePropagation();
      }
    },true);
    return {choose,clear};
  }
  return {range,create};
});
