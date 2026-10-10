'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DealAnimation=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  const SHUFFLE=550,GAP=24,FLIGHT=360,CARDS=108,DEALT=SHUFFLE+(CARDS-1)*GAP+FLIGHT,DURATION=DEALT+600;
  function progressAt(elapsed){
    const arrived=Math.max(0,Math.min(CARDS,Math.floor((elapsed-SHUFFLE-FLIGHT)/GAP)+1));
    return {phase:elapsed<SHUFFLE?'shuffle':elapsed<DEALT?'deal':'reveal',
      counts:[0,1,2,3].map(seat=>Math.max(0,Math.min(27,Math.ceil((arrived-seat)/4)))),done:elapsed>=DURATION};
  }
  // Presentation only: the complete deal has already been saved before start().
  // An interrupted or skipped sequence never deals again or writes game state.
  class Player{
    constructor({view,onFinish=()=>{},now=()=>performance.now(),frame=fn=>requestAnimationFrame(fn),
      cancelFrame=id=>cancelAnimationFrame(id),reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches,
      hidden=()=>document.hidden}){
      Object.assign(this,{view,onFinish,now,frame,cancelFrame,reduced,hidden});this.session=null;this.frameId=null;
    }
    get active(){return Boolean(this.session);}
    start(meta){
      this.cancel();
      if(this.hidden()||this.reduced())return false;
      const session={meta,started:0,revealed:false};this.session=session;
      try{
        this.view.begin(meta);session.started=this.now();
        const tick=()=>{
          if(this.session!==session)return;
          if(this.hidden()||this.reduced()){this.finish();return;}
          try{
            const progress=progressAt(this.now()-session.started);this.view.update(progress);
            if(progress.phase==='reveal'&&!session.revealed){session.revealed=true;this.view.reveal();}
            if(progress.done){this.finish();return;}
            this.frameId=this.frame(tick);
          }catch{this.finish();}
        };
        this.frameId=this.frame(tick);return true;
      }catch{this.cancel();return false;}
    }
    clear(){
      const session=this.session;if(!session)return null;
      this.session=null;
      if(this.frameId!==null)this.cancelFrame(this.frameId);this.frameId=null;
      const focus=this.view.containsFocus?.()||false;this.view.clear();
      return {...session,focus};
    }
    finish(){const session=this.clear();if(session)this.onFinish(session.meta,session.focus);}
    cancel(){this.clear();}
  }
  class TableView{
    constructor({stage,table,receipt,hand}){
      Object.assign(this,{stage,table,receipt,hand});this.animations=[];this.phase=null;this.counts=[];
    }
    node(tag,className,text){
      const node=this.stage.ownerDocument.createElement(tag);node.className=className;
      if(text!==undefined)node.textContent=text;return node;
    }
    begin(meta){
      const doc=this.stage.ownerDocument;this.stage.replaceChildren();this.stage.hidden=false;this.stage.dataset.phase='shuffle';
      this.table.inert=true;this.receipt.inert=true;this.stage.parentElement.setAttribute('aria-busy','true');
      this.phase=null;this.counts=[];this.focused=false;
      const veil=this.node('div','deal-veil');veil.setAttribute('aria-hidden','true');
      const intro=this.node('header','deal-intro');intro.append(this.node('span','','新的一副'),this.node('h2','','第 '+meta.round+' 副'),this.node('p','',meta.mode+' · 打 '+meta.level));
      const deck=this.node('div','deal-deck');deck.setAttribute('aria-hidden','true');
      for(let i=0;i<4;i++)deck.append(this.node('i','deal-card-back'));
      this.status=this.node('p','deal-status','正在洗牌');this.status.setAttribute('role','status');
      const skip=this.node('button','deal-skip','跳过动画');skip.type='button';skip.setAttribute('aria-label','跳过发牌动画');skip.addEventListener('click',()=>this.onSkip?.());
      this.skip=skip;this.stage.append(veil,intro,deck,this.status,skip);
      this.seats=meta.players.map((player,seat)=>{
        const node=this.node('div','deal-seat deal-seat-'+seat+' identity-'+player.identity),pile=this.node('div','deal-pocket deal-card-back');
        pile.setAttribute('aria-hidden','true');node.append(pile);
        const avatar=this.node('span','deal-avatar');avatar.setAttribute('aria-hidden','true');
        if(player.avatar){const img=this.node('img','');img.src=player.avatar;img.alt='';avatar.append(img);}else avatar.textContent='你';
        const copy=this.node('div','deal-player'),name=this.node('strong','',player.name),counter=this.node('span','deal-counter');
        const count=this.node('b','','0');counter.append(count,doc.createTextNode(' 张'));counter.setAttribute('aria-live','off');copy.append(name,counter);
        node.append(avatar,copy);this.stage.append(node);return {node,pile,count};
      });
      const area=this.stage.getBoundingClientRect(),rect=deck.getBoundingClientRect();
      const origin={x:rect.left+rect.width/2-area.left,y:rect.top+rect.height/2-area.top};
      this.origins=this.seats.map(({pile,node})=>{let r=pile.getBoundingClientRect();if(!r.width)r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
      for(let i=0;i<CARDS;i++){
        const seat=i%4,target=this.origins[seat],card=this.node('i','deal-card-back deal-flight');
        card.setAttribute('aria-hidden','true');card.style.left=origin.x+'px';card.style.top=origin.y+'px';this.stage.append(card);
        const x=target.x-area.left-origin.x,y=target.y-area.top-origin.y,angle=seat===1?10:seat===3?-10:seat===2?-4:3;
        const base='translate(-50%,-50%)';
        this.animations.push(card.animate([
          {transform:base+' translate(0,0) rotate(-7deg) scale(1)',opacity:0,offset:0},
          {transform:base+' translate(0,0) rotate(-7deg) scale(1)',opacity:1,offset:.06},
          {transform:`${base} translate(${x*.55}px,${y*.55-28}px) rotate(${angle*1.8}deg) scale(.9)`,opacity:1,offset:.55},
          {transform:`${base} translate(${x}px,${y}px) rotate(${angle}deg) scale(.7)`,opacity:1,offset:.92},
          {transform:`${base} translate(${x}px,${y}px) rotate(${angle}deg) scale(.7)`,opacity:0,offset:1}
        ],{duration:FLIGHT,delay:SHUFFLE+i*GAP,easing:'linear',fill:'both'}));
      }
    }
    update({phase,counts}){
      if(!this.focused&&!this.stage.ownerDocument.querySelector('dialog[open]')){this.skip.focus({preventScroll:true});this.focused=true;}
      if(phase!==this.phase){this.phase=phase;this.stage.dataset.phase=phase;this.status.textContent={shuffle:'正在洗牌',deal:'正在发牌 · 每人 27 张',reveal:'展开手牌'}[phase];}
      counts.forEach((count,seat)=>{
        if(this.counts[seat]===count)return;this.counts[seat]=count;
        this.seats[seat].count.textContent=count;this.seats[seat].pile.style.opacity=count?'1':'0';
      });
    }
    reveal(){
      const origin=this.origins[0];
      [...this.hand.querySelectorAll('.playing-card')].forEach((card,index)=>{
        const r=card.getBoundingClientRect();
        this.animations.push(card.animate([
          {transform:`translate(${origin.x-r.left-r.width/2}px,${origin.y-r.top-r.height/2}px) scale(.65) rotate(-5deg)`,opacity:0},
          {transform:'translate(0,0) scale(1) rotate(0)',opacity:1}
        ],{duration:380,delay:index*8,easing:'cubic-bezier(.2,.75,.25,1)',fill:'both'}));
      });
    }
    containsFocus(){return this.stage.contains(this.stage.ownerDocument.activeElement);}
    clear(){
      for(const animation of this.animations)animation.cancel();this.animations=[];
      this.table.inert=false;this.receipt.inert=false;this.stage.parentElement.removeAttribute('aria-busy');
      this.stage.hidden=true;this.stage.replaceChildren();this.phase=null;this.counts=[];
    }
  }
  return {Player,TableView,progressAt,duration:DURATION};
});
