/* Pointer/keyboard editing shared by flat cards and the 3D ray picker. */
'use strict';
window.createHandEditor=function(options){
  const {root,container,scroll,toggle,undoButton,help,getLayout,getHand,getSelected,canEdit,commit,select,onModeChange,spatial,imageFor}=options;
  const marker=document.createElement('div'),ghost=document.createElement('div');
  marker.className='hand-drop-marker';ghost.className='hand-drag-ghost';
  marker.hidden=ghost.hidden=true;marker.setAttribute('aria-hidden','true');ghost.setAttribute('aria-hidden','true');document.body.append(marker,ghost);
  let editing=false,gesture=null,suppressUntil=0,undo=null,signature='',roundKey='',scrollFrame=0;
  const handSignature=()=>getLayout().key+'|'+getHand().map(card=>card.id).sort().join('|');
  function cancel(){
    const old=gesture;gesture=null;cancelAnimationFrame(scrollFrame);scrollFrame=0;marker.hidden=ghost.hidden=true;
    root.classList.remove('hand-dragging');container.querySelectorAll('.drag-source,.drop-row').forEach(node=>node.classList.remove('drag-source','drop-row'));
    if(old?.dragging)suppressUntil=performance.now()+600;
    if(old?.capture?.hasPointerCapture(old.pointer))old.capture.releasePointerCapture(old.pointer);
  }
  function setEditing(value){
    cancel();editing=Boolean(value&&canEdit());root.classList.toggle('hand-editing',editing);
    toggle.setAttribute('aria-pressed',String(editing));toggle.textContent=editing?'完成理牌':'自由理牌';
    help.hidden=!editing;undoButton.hidden=!editing;undoButton.disabled=!undo;
    onModeChange(editing);
  }
  function reconcile(){
    const next=handSignature(),nextKey=getLayout().key,changedRound=roundKey&&roundKey!==nextKey;roundKey=nextKey;
    if(signature!==next){cancel();undo=null;undoButton.disabled=true;signature=next;}
    if(editing&&(!canEdit()||changedRound))setEditing(false);
    toggle.disabled=!canEdit();
  }
  function apply(ids,row,index){
    const before=getLayout(),after=GuandanHandLayout.move(before,ids,row,index);
    if(after===before)return;
    undo=before;commit(after);undoButton.disabled=false;
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
    if(document.elementFromPoint?.(x,y)?.closest('.hand-options,.action-bar,dialog,.app-top'))return null;
    return root.classList.contains('view-3d')?spatial()?.dropTarget(x,y):flatTarget(x,y);
  }
  function position(event){
    if(!gesture)return;
    gesture.lastPoint={clientX:event.clientX,clientY:event.clientY};
    if(!root.classList.contains('view-3d')){
      const box=scroll.getBoundingClientRect(),before=scroll.scrollLeft;
      if(event.clientY>=box.top&&event.clientY<=box.bottom){
        if(event.clientX<box.left+35)scroll.scrollLeft-=12;else if(event.clientX>box.right-35)scroll.scrollLeft+=12;
      }
      if(scroll.scrollLeft!==before&&!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;if(gesture?.dragging)position(gesture.lastPoint);});
    }
    const target=targetAt(event.clientX,event.clientY);gesture.target=target;
    marker.hidden=!target;
    if(target){marker.style.left=target.x+'px';marker.style.top=target.y+'px';marker.style.height=target.height+'px';}
    container.querySelectorAll('.card-row').forEach((node,row)=>node.classList.toggle('drop-row',row===target?.row));
    ghost.style.left=Math.min(innerWidth-105,Math.max(4,event.clientX+14))+'px';ghost.style.top=Math.max(4,Math.min(innerHeight-125,event.clientY-75))+'px';
  }
  function start(event,id,isSpatial=false){
    if(!editing||!canEdit()||gesture||event.button!==0||!event.isPrimary)return false;
    if(!getHand().some(card=>card.id===id))return false;
    const selected=getSelected(),ids=getLayout().rows.flat().filter(held=>selected.has(id)?selected.has(held):held===id);
    const capture=isSpatial?event.currentTarget:scroll;
    gesture={pointer:event.pointerId,id,ids,x:event.clientX,y:event.clientY,signature:handSignature(),capture,isSpatial,dragging:false,target:null};
    capture.setPointerCapture?.(event.pointerId);return true;
  }
  container.addEventListener('pointerdown',event=>{const card=event.target.closest('.playing-card');if(card)start(event,card.dataset.id);});
  window.addEventListener('pointermove',event=>{
    if(!gesture||event.pointerId!==gesture.pointer)return;
    if(!editing||!canEdit()||gesture.signature!==handSignature()){cancel();return;}
    if(!gesture.dragging){
      if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<7)return;
      gesture.dragging=true;root.classList.add('hand-dragging');
      const card=getHand().find(card=>card.id===gesture.id);ghost.replaceChildren(imageFor(card.face));
      if(gesture.ids.length>1){const count=document.createElement('b');count.textContent=String(gesture.ids.length);ghost.append(count);}
      ghost.hidden=false;for(const id of gesture.ids)container.querySelector('[data-id="'+CSS.escape(id)+'"]')?.classList.add('drag-source');
    }
    event.preventDefault();position(event);
  },{passive:false});
  window.addEventListener('pointerup',event=>{
    if(!gesture||event.pointerId!==gesture.pointer)return;
    const old=gesture;if(old.dragging)position(event);const target=old.target;
    cancel();suppressUntil=performance.now()+600;
    if(old.signature!==handSignature()||!canEdit()||!editing)return;
    if(old.dragging){if(target)apply(old.ids,target.row,target.index);}else select(old.id);
  });
  window.addEventListener('pointercancel',cancel);
  window.addEventListener('lostpointercapture',event=>{if(gesture?.pointer===event.pointerId)cancel();});
  scroll.addEventListener('lostpointercapture',()=>{if(gesture&&!gesture.isSpatial)cancel();});
  container.addEventListener('click',event=>{if(event.detail&&performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
  container.addEventListener('keydown',event=>{
    const card=event.target.closest('.playing-card');if(!editing||!card||!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
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
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&editing&&!document.querySelector('dialog[open]')){event.preventDefault();if(gesture)cancel();else setEditing(false);}});
  window.addEventListener('resize',cancel);window.addEventListener('blur',cancel);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
  toggle.addEventListener('click',()=>setEditing(!editing));
  undoButton.addEventListener('click',()=>{if(!undo||!editing)return;cancel();const before=undo;undo=null;commit(GuandanHandLayout.reconcile(before,getLayout().key,getHand()));undoButton.disabled=true;});
  return {get editing(){return editing;},start,cancel,setEditing,reconcile,forgetUndo(){undo=null;undoButton.disabled=true;},moveSelected(row){if(editing&&canEdit())apply([...getSelected()],row,getLayout().rows[row].length);}};
};
