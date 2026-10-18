/* Flat and curved hands share the same DOM, game state and pointer editor. */
'use strict';
(() => {
  const bridge=window.GuandanTable,root=document.documentElement;
  const flat=document.getElementById('hand-flat'),fan=document.getElementById('hand-fan');
  const scroll=document.getElementById('hand-scroll'),container=document.getElementById('hand-cards');
  const properties=['--fan-x','--fan-y','--fan-angle','--fan-order'];
  function sync(){
    const curved=root.dataset.handStyle==='fan';
    for(const row of container.querySelectorAll('.card-row')){
      const buttons=[...row.querySelectorAll('.playing-card')];
      if(!curved){
        for(const button of buttons)for(const property of properties)button.style.removeProperty(property);
        for(const cluster of row.querySelectorAll('.saved-group')){
          cluster.style.removeProperty('--group-left');cluster.style.removeProperty('--group-width');
        }
        continue;
      }
      const styles=getComputedStyle(row),number=name=>parseFloat(styles.getPropertyValue(name));
      const breaks=buttons.map((button,index)=>button.dataset.clusterStart==='true'?index:0).filter(Boolean);
      const positions=GuandanHandFan.layout(buttons.length,{width:row.clientWidth,cardWidth:number('--hand-card-width'),cardHeight:number('--hand-card-height'),step:number('--hand-step'),breaks,gap:number('--hand-group-gap')||18,minStep:root.dataset.phone==='true'?18:24});
      buttons.forEach((button,index)=>{
        const p=positions[index];button.style.setProperty('--fan-x',p.x+'px');button.style.setProperty('--fan-y',p.y+'px');
        button.style.setProperty('--fan-angle',p.angle+'deg');button.style.setProperty('--fan-order',index);
      });
      for(const cluster of row.querySelectorAll('.saved-group')){
        const cards=[...cluster.querySelectorAll('.playing-card')],first=positions[buttons.indexOf(cards[0])],last=positions[buttons.indexOf(cards.at(-1))];
        cluster.style.setProperty('--group-left',first.x+'px');
        cluster.style.setProperty('--group-width',(last.x-first.x+number('--hand-card-width'))+'px');
      }
    }
  }
  function choose(style,persist=true){
    bridge.cancelDrag();style=root.dataset.phone==='true'?'stack':style==='fan'?'fan':'flat';
    if(persist&&style!=='stack')bridge.setHandStyle(style);
    root.dataset.handStyle=style;
    flat.setAttribute('aria-pressed',String(style==='flat'));fan.setAttribute('aria-pressed',String(style==='fan'));
    scroll.setAttribute('aria-label',style==='stack'?'同点数叠放；点击牌头选牌，滑动查看全部手牌':style==='fan'?'弧形双层手牌；点击选牌，按住拖动理牌，空白处左右滚动':'双层手牌；点击选牌，按住拖动理牌，空白处左右滚动');
    scroll.setAttribute('title',style==='stack'?'同点数叠放；点击牌头选牌，滑动查看全部手牌':'点击选牌，Shift 点击连续选牌；轻点空白处或 Esc 取消选择。空白处拖动框选：向右全包，向左相交；Shift 追加。');
    bridge.layout();sync();
  }
  function dropTarget(x,y){
    if(root.dataset.handStyle!=='fan')return null;
    const rows=[...container.querySelectorAll('.card-row')].map(row=>({bounds:row.getBoundingClientRect(),cards:[...row.querySelectorAll('.playing-card')].map(button=>{
      const styles=getComputedStyle(button),matrix=styles.transform?.match(/^matrix(?:3d)?\(([^)]+)\)$/)?.[1].split(',').map(Number);
      const angle=matrix?Math.atan2(matrix[1],matrix[0])*180/Math.PI:parseFloat(styles.getPropertyValue('--fan-angle'))||0;
      const width=button.offsetWidth,height=button.offsetHeight;
      return {...GuandanHandFan.topCorner(button.getBoundingClientRect(),width,height,angle),width,height,angle};
    })}));
    return GuandanHandFan.dropTarget(rows,scroll.getBoundingClientRect(),x,y);
  }
  flat.addEventListener('click',()=>choose('flat'));fan.addEventListener('click',()=>choose('fan'));
  const observer=new ResizeObserver(sync);observer.observe(scroll);observer.observe(container);
  window.addEventListener('beforeunload',()=>observer.disconnect());
  window.tableView=Object.freeze({sync,dropTarget});
  choose(bridge.handStyle(),false);
})();
