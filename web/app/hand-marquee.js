/* Mouse box selection for the shared flat/fan hand. Geometry is independent
   of DOM hit boxes: rotated faces and their visible overlap are respected. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GuandanHandMarquee=Object.freeze(api);
})(globalThis,function(){
  'use strict';
  const EPS=1e-7;
  const area=polygon=>Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p.x*q.y-p.y*q.x;},0))/2;
  function clip(poly,a,b,inside=true){
    const side=p=>((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))*(inside?1:-1),out=[];
    if(!poly.length)return out;
    for(let i=0;i<poly.length;i++){
      const p=poly[i],q=poly[(i+1)%poly.length],dp=side(p),dq=side(q);
      if(dp>=-EPS)out.push(p);
      if((dp>EPS&&dq<-EPS)||(dp<-EPS&&dq>EPS)){
        const t=dp/(dp-dq);out.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});
      }
    }
    return out;
  }
  const rectangle=box=>[{x:box.left,y:box.top},{x:box.right,y:box.top},{x:box.right,y:box.bottom},{x:box.left,y:box.bottom}];
  function intersection(poly,boundary){
    for(let i=0;i<boundary.length&&poly.length;i++)poly=clip(poly,boundary[i],boundary[(i+1)%boundary.length]);
    return poly;
  }
  // Subtract one convex face, retaining disjoint convex pieces of the face
  // behind it. Repeating this computes only the portions the player can see.
  function subtract(poly,cover){
    if(area(intersection(poly,cover))<EPS)return [poly];
    let remaining=poly;const pieces=[];
    for(let i=0;i<cover.length&&remaining.length;i++){
      const a=cover[i],b=cover[(i+1)%cover.length],outside=clip(remaining,a,b,false);
      if(area(outside)>EPS)pieces.push(outside);
      remaining=clip(remaining,a,b);
    }
    return pieces;
  }
  function facePolygon(bounds,width,height,angle=0){
    const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
    const scale=bounds.width/(Math.abs(width*c)+Math.abs(height*s));
    const w=width*scale,h=height*scale,cx=(bounds.left+bounds.right)/2,cy=(bounds.top+bounds.bottom)/2;
    return [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([x,y])=>({x:cx+x*c-y*s,y:cy+x*s+y*c}));
  }
  function visibleFaces(cards,bounds){
    const viewport=rectangle(bounds),covered=[],result=[];
    for(const card of [...cards].reverse()){
      const face=intersection(card.polygon,viewport);if(area(face)<EPS)continue;
      let pieces=[face];
      for(const cover of covered){pieces=pieces.flatMap(piece=>subtract(piece,cover));if(!pieces.length)break;}
      covered.push(face);
      if(pieces.length)result.push({id:card.id,pieces});
    }
    return result.reverse();
  }
  function hitIds(faces,bounds,crossing){
    if(bounds.right-bounds.left<1||bounds.bottom-bounds.top<1)return [];
    const box=rectangle(bounds),within=p=>p.x>=bounds.left-EPS&&p.x<=bounds.right+EPS&&p.y>=bounds.top-EPS&&p.y<=bounds.bottom+EPS;
    return faces.filter(face=>crossing?face.pieces.some(piece=>area(intersection(piece,box))>EPS):face.pieces.every(piece=>piece.every(within))).map(face=>face.id);
  }
  function create({root,scroll,container,canSelect,getSignature,getSelected,onSelect,onModeChange,translate=s=>s}){
    const overlay=document.createElement('div'),label=document.createElement('span');
    overlay.className='hand-marquee';overlay.hidden=true;overlay.setAttribute('aria-hidden','true');overlay.append(label);document.body.append(overlay);
    let gesture=null,blockTrailingClick=false;
    const blockedTarget='.playing-card,.group-action,button,input,select,a,dialog';
    function viewport(){
      let bounds={left:0,top:0,right:innerWidth,bottom:innerHeight};
      // Include every clipping ancestor, including the scrolling public table.
      for(let el=scroll;el;el=el.parentElement){
        const style=getComputedStyle(el),rect=el.getBoundingClientRect();
        const sx=el.offsetWidth?rect.width/el.offsetWidth:1,sy=el.offsetHeight?rect.height/el.offsetHeight:1;
        const left=rect.left+el.clientLeft*sx,top=rect.top+el.clientTop*sy;
        // client dimensions exclude borders and non-overlay scrollbars. A
        // Windows scrollbar must not make hidden card pixels part of a hit.
        if(el===scroll||/(auto|scroll|hidden|clip)/.test(style.overflowX)){bounds.left=Math.max(bounds.left,left);bounds.right=Math.min(bounds.right,left+el.clientWidth*sx);}
        if(el===scroll||/(auto|scroll|hidden|clip)/.test(style.overflowY)){bounds.top=Math.max(bounds.top,top);bounds.bottom=Math.min(bounds.bottom,top+el.clientHeight*sy);}
      }
      return bounds;
    }
    function geometry(bounds){
      const cards=[...container.querySelectorAll('.playing-card')].map(button=>{
        const img=button.querySelector('img'),style=getComputedStyle(button),matrix=style.transform?.match(/^matrix(?:3d)?\(([^)]+)\)$/)?.[1].split(',').map(Number);
        const angle=matrix?Math.atan2(matrix[1],matrix[0])*180/Math.PI:0;
        return {id:button.dataset.id,polygon:facePolygon(img.getBoundingClientRect(),img.offsetWidth,img.offsetHeight,angle)};
      });
      return visibleFaces(cards,bounds);
    }
    function cancel(suppress=true){
      const old=gesture;gesture=null;overlay.hidden=true;root.classList.remove('hand-box-selecting');
      container.querySelectorAll('.marquee-hit').forEach(button=>button.classList.remove('marquee-hit'));
      if(old?.dragging&&suppress)blockTrailingClick=true;
      if(old&&scroll.hasPointerCapture?.(old.pointer))scroll.releasePointerCapture(old.pointer);
      if(old?.dragging)onModeChange(false);
    }
    function reconcile(){if(gesture&&(!canSelect()||gesture.signature!==getSignature()))cancel();}
    function update(event){
      const g=gesture;if(!g)return;
      const x=Math.max(g.clip.left,Math.min(g.clip.right,event.clientX)),y=Math.max(g.clip.top,Math.min(g.clip.bottom,event.clientY));
      const box={left:Math.min(g.x,x),right:Math.max(g.x,x),top:Math.min(g.y,y),bottom:Math.max(g.y,y)},crossing=x<g.x;
      const hits=hitIds(g.faces,box,crossing);g.result=new Set(g.additive?[...g.selected,...hits]:hits);
      overlay.dataset.crossing=String(crossing);
      Object.assign(overlay.style,{left:box.left+'px',top:box.top+'px',width:(box.right-box.left)+'px',height:(box.bottom-box.top)+'px'});
      label.textContent=translate(crossing?'相交选择':'框内选择')+' · '+g.result.size;
      container.querySelectorAll('.playing-card').forEach(button=>button.classList.toggle('marquee-hit',g.result.has(button.dataset.id)));
    }
    scroll.addEventListener('pointerdown',event=>{
      if(event.isPrimary&&event.button===0)blockTrailingClick=false;
      if(event.pointerType!=='mouse'||!event.isPrimary||event.button!==0||gesture||!canSelect()||event.target.closest(blockedTarget))return;
      const bounds=viewport(),x=event.clientX,y=event.clientY;
      if(x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom)return;
      // Scrollbars belong to scrolling, even when their event target is the
      // scroll element. clientWidth/clientHeight exclude non-overlay bars.
      const rect=scroll.getBoundingClientRect(),sx=rect.width/scroll.offsetWidth,sy=rect.height/scroll.offsetHeight;
      if(x>rect.left+(scroll.clientLeft+scroll.clientWidth)*sx||y>rect.top+(scroll.clientTop+scroll.clientHeight)*sy)return;
      const faces=geometry(bounds);
      if(!faces.length||hitIds(faces,{left:x-.5,right:x+.5,top:y-.5,bottom:y+.5},true).length)return;
      gesture={pointer:event.pointerId,x,y,clip:bounds,faces,selected:[...getSelected()],additive:event.shiftKey,signature:getSignature(),dragging:false,result:new Set()};
      event.preventDefault();
    });
    window.addEventListener('pointermove',event=>{
      if(!gesture||event.pointerId!==gesture.pointer)return;
      reconcile();if(!gesture)return;
      if(!gesture.dragging){
        if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<6)return;
        gesture.dragging=true;root.classList.add('hand-box-selecting');overlay.hidden=false;
        scroll.setPointerCapture?.(gesture.pointer);onModeChange(true);
      }
      event.preventDefault();update(event);
    },{passive:false,capture:true});
    window.addEventListener('pointerup',event=>{
      if(!gesture||event.pointerId!==gesture.pointer)return;
      reconcile();if(!gesture)return;
      const old=gesture;if(old.dragging)update(event);cancel(old.dragging);
      if(old.dragging&&canSelect()&&old.signature===getSignature())onSelect([...old.result]);
    });
    window.addEventListener('pointercancel',event=>{if(gesture?.pointer===event.pointerId)cancel();});
    window.addEventListener('lostpointercapture',event=>{if(gesture?.pointer===event.pointerId&&!scroll.hasPointerCapture?.(event.pointerId))cancel();});
    window.addEventListener('pointerdown',event=>{if(gesture&&!event.isPrimary)cancel();});
    window.addEventListener('resize',cancel);window.addEventListener('blur',cancel);
    window.addEventListener('scroll',()=>{if(gesture)cancel();},true);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&gesture){event.preventDefault();cancel();}});
    window.addEventListener('pointerdown',event=>{if(event.isPrimary&&event.button===0)blockTrailingClick=false;},true);
    scroll.addEventListener('click',event=>{if(event.detail&&blockTrailingClick){event.preventDefault();event.stopImmediatePropagation();}},true);
    return {get active(){return Boolean(gesture?.dragging);},get pending(){return Boolean(gesture);},cancel,reconcile};
  }
  return {facePolygon,visibleFaces,hitIds,create};
});
