/* Pointer and keyboard editing for the shared flat/curved DOM hand. */
'use strict';
window.createHandEditor=function(options){
  const {root,container,scroll,undoButton,getLayout,getHand,getSelected,canEdit,commit,onModeChange,onArrange,curvedTarget,imageFor}=options;
  const marker=document.createElement('div'),ghost=document.createElement('div');
  marker.className='hand-drop-marker';ghost.className='hand-drag-ghost';
  marker.hidden=ghost.hidden=true;marker.setAttribute('aria-hidden','true');ghost.setAttribute('aria-hidden','true');document.body.append(marker,ghost);
  const MOVE_SLOP=6;
  let editing=false,gesture=null,blockTrailingClick=false,undo=null,signature='',scrollFrame=0;
  const handSignature=()=>getLayout().key+'|'+getHand().map(card=>card.id).sort().join('|');
  function controls(){
    root.classList.toggle('hand-editing',editing);
    undoButton.hidden=false;undoButton.disabled=!undo||!canEdit();
  }
  function cancel(suppressClick=true){
    const old=gesture;gesture=null;cancelAnimationFrame(scrollFrame);scrollFrame=0;marker.hidden=ghost.hidden=true;
    root.classList.remove('hand-dragging');container.querySelectorAll('.drag-source,.drop-row').forEach(node=>node.classList.remove('drag-source','drop-row'));
    if(old&&suppressClick)blockTrailingClick=true;
    if(old?.capture?.hasPointerCapture?.(old.pointer))old.capture.releasePointerCapture(old.pointer);
    if(editing){editing=false;controls();onModeChange(false);}
  }
  function reconcile(){
    const next=handSignature();
    if(signature!==next){signature=next;undo=null;cancel();}
    if(!canEdit())cancel();
    controls();
  }
  function replace(after,movedIds){
    if(!canEdit())return false;
    const before=getLayout();
    if(after===before||JSON.stringify(after)===JSON.stringify(before))return false;
    cancel();undo=before;if(movedIds)onArrange?.(movedIds);commit(after);controls();return true;
  }
  function apply(ids,row,index){
    const changed=replace(GuandanHandLayout.move(getLayout(),ids,row,index),ids);
    // Dropping an existing group back in place still finishes arranging it.
    if(!changed&&canEdit()){onArrange?.(ids);onModeChange(false);}
  }
  function flatTarget(x,y){
    const box=scroll.getBoundingClientRect();if(x<box.left||x>box.right||y<box.top||y>box.bottom)return null;
    const rows=[...container.querySelectorAll('.card-row')];
    const row=rows.findLastIndex(node=>y>=node.getBoundingClientRect().top-8);
    if(row<0)return null;
    const node=rows[row],buttons=[...node.querySelectorAll('.playing-card')],bounds=node.getBoundingClientRect();
    let index=buttons.findIndex(button=>{const b=button.getBoundingClientRect();return x<b.left+Math.min(b.width,parseFloat(getComputedStyle(scroll).getPropertyValue('--hand-step'))||40)/2;});
    if(index<0)index=buttons.length;
    const next=buttons[index]?.getBoundingClientRect(),last=buttons.at(-1)?.getBoundingClientRect();
    return {row,index,x:next?next.left-3:last?last.right-3:bounds.left+bounds.width/2,y:bounds.top+3,height:Math.min(bounds.height,95)};
  }
  function targetAt(x,y){
    if(document.elementFromPoint?.(x,y)?.closest('.group-action,.hand-tools,.hand-options,.action-bar,dialog,.app-top'))return null;
    return root.dataset.handStyle==='fan'?curvedTarget(x,y):flatTarget(x,y);
  }
  function position(event){
    if(!gesture)return;
    gesture.lastPoint={clientX:event.clientX,clientY:event.clientY};
    {
      const box=scroll.getBoundingClientRect(),before=scroll.scrollLeft;
      if(event.clientY>=box.top&&event.clientY<=box.bottom){
        if(event.clientX<box.left+35)scroll.scrollLeft-=12;else if(event.clientX>box.right-35)scroll.scrollLeft+=12;
      }
      if(scroll.scrollLeft!==before&&!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;if(gesture?.dragging)position(gesture.lastPoint);});
    }
    const target=targetAt(event.clientX,event.clientY);gesture.target=target;
    marker.hidden=!target;
    if(target){marker.style.left=target.x+'px';marker.style.top=target.y+'px';marker.style.height=target.height+'px';marker.style.transform='rotate('+(target.angle||0)+'deg)';}
    container.querySelectorAll('.card-row').forEach((node,row)=>node.classList.toggle('drop-row',row===target?.row));
    ghost.style.left=Math.min(innerWidth-105,Math.max(4,event.clientX+14))+'px';ghost.style.top=Math.max(4,Math.min(innerHeight-125,event.clientY-75))+'px';
  }
  function beginDrag(){
    if(!gesture)return;
    gesture.dragging=true;root.classList.add('hand-dragging');
    const card=getHand().find(card=>card.id===gesture.id);ghost.replaceChildren(imageFor(card.face));
    if(gesture.ids.length>1){const count=document.createElement('b');count.textContent=String(gesture.ids.length);ghost.append(count);}
    ghost.hidden=false;for(const id of gesture.ids)container.querySelector('[data-id="'+CSS.escape(id)+'"]')?.classList.add('drag-source');
  }
  function start(event,id){
    if(!canEdit()||gesture||event.button!==0||!event.isPrimary)return false;
    if(!getHand().some(card=>card.id===id))return false;
    const selected=getSelected(),ids=getLayout().rows.flat().filter(held=>selected.has(id)?selected.has(held):held===id);
    const capture=scroll;
    gesture={pointer:event.pointerId,id,ids,x:event.clientX,y:event.clientY,signature:handSignature(),capture,dragging:false,target:null};
    // A fresh physical press must not inherit the previous drag's click guard.
    blockTrailingClick=false;
    return true;
  }
  container.addEventListener('pointerdown',event=>{const card=event.target.closest('.playing-card');if(card)start(event,card.dataset.id);});
  container.addEventListener('contextmenu',event=>{if(canEdit()&&event.target.closest('.playing-card'))event.preventDefault();});
  window.addEventListener('pointermove',event=>{
    if(!gesture||event.pointerId!==gesture.pointer)return;
    if(!canEdit()||document.hidden||gesture.signature!==handSignature()){cancel();return;}
    const distance=Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y);
    if(!gesture.dragging){
      if(distance<MOVE_SLOP)return;
      // Claim a drag immediately after a small movement tolerance. There is
      // no hold delay; stationary presses and tiny jitters remain clicks.
      const current=gesture;editing=true;controls();onModeChange(true);
      if(gesture!==current)return;
      current.capture.setPointerCapture?.(current.pointer);beginDrag();
    }
    event.preventDefault();position(event);
  },{passive:false,capture:true});
  window.addEventListener('pointerup',event=>{
    if(!gesture||event.pointerId!==gesture.pointer)return;
    const old=gesture;if(old.dragging)position(event);const target=old.target;
    cancel(old.dragging);
    if(old.signature!==handSignature()||!canEdit())return;
    if(!old.dragging)return; // The native card button owns click selection.
    if(old.dragging&&target)apply(old.ids,target.row,target.index);
  });
  window.addEventListener('pointercancel',event=>{if(event.pointerId===gesture?.pointer)cancel();});
  window.addEventListener('pointerdown',event=>{if(gesture&&!event.isPrimary)cancel();});
  // Touch starts with implicit capture on the card. Transferring it to the
  // scroll area emits a loss on the old owner, but must not cancel the drag.
  window.addEventListener('lostpointercapture',event=>{if(gesture?.pointer===event.pointerId&&!gesture.capture?.hasPointerCapture?.(event.pointerId))cancel();});
  // Escape may cancel while the pointer stays held for seconds. The old
  // gesture owns its eventual click until a new physical press begins.
  window.addEventListener('pointerdown',event=>{if(event.isPrimary&&event.button===0)blockTrailingClick=false;},true);
  container.addEventListener('click',event=>{if(event.detail&&blockTrailingClick){event.preventDefault();event.stopImmediatePropagation();}},true);
  container.addEventListener('keydown',event=>{
    const card=event.target.closest('.playing-card');if(!canEdit()||!card||!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();cancel();const layout=getLayout(),id=card.dataset.id,row=layout.rows.findIndex(list=>list.includes(id)),index=layout.rows[row].indexOf(id);
    const ids=getSelected().has(id)?layout.rows.flat().filter(id=>getSelected().has(id)):[id];
    if(event.key==='ArrowUp'||event.key==='ArrowDown'){
      const target=event.key==='ArrowUp'?0:1;if(target!==row)apply(ids,target,Math.min(index,layout.rows[target].length));
    }else{
      const members=layout.rows[row].map((id,index)=>ids.includes(id)?index:-1).filter(index=>index>=0);
      apply(ids,row,event.key==='ArrowLeft'?Math.max(0,members[0]-1):Math.min(layout.rows[row].length,members.at(-1)+2));
    }
    container.querySelector('[data-id="'+CSS.escape(id)+'"]')?.focus({preventScroll:true});
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&gesture&&!document.querySelector('dialog[open]')){event.preventDefault();cancel();}});
  window.addEventListener('resize',cancel);window.addEventListener('blur',cancel);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
  undoButton.addEventListener('click',()=>{if(!undo||!canEdit())return;cancel();const before=undo;undo=null;commit(GuandanHandLayout.reconcile(before,getLayout().key,getHand()));controls();});
  return {get editing(){return editing;},get active(){return Boolean(gesture);},start,cancel,reconcile,replace,forgetUndo(){undo=null;controls();}};
};
