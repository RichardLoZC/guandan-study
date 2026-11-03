/* Every client shares flat and rank-stack views; old fan preferences migrate. */
'use strict';
(() => {
  const bridge=window.GuandanTable,root=document.documentElement;
  const flat=document.getElementById('hand-flat'),fan=document.getElementById('hand-fan');
  const scroll=document.getElementById('hand-scroll'),container=document.getElementById('hand-cards');
  fan.textContent='叠牌';scroll.querySelector('.hand-pan-note')?.remove();
  const properties=['--fan-x','--fan-y','--fan-angle','--fan-order'];
  function sync(){
    for(const row of container.querySelectorAll('.card-row')){
      const buttons=[...row.querySelectorAll('.playing-card')];
      for(const button of buttons)for(const property of properties)button.style.removeProperty(property);
      for(const cluster of row.querySelectorAll('.saved-group')){
        cluster.style.removeProperty('--group-left');cluster.style.removeProperty('--group-width');
      }
    }
  }
  function choose(style,persist=true){
    bridge.cancelDrag();style=root.dataset.phone==='true'||['fan','stack'].includes(style)?'stack':'flat';
    if(persist&&root.dataset.phone!=='true')bridge.setHandStyle(style);
    root.dataset.handStyle=style;
    flat.setAttribute('aria-pressed',String(style==='flat'));fan.setAttribute('aria-pressed',String(style==='stack'));
    const stackLabel=root.dataset.phone==='true'?'同点数叠放；点击牌头选牌，滑动查看全部手牌':'同点数叠放；点击牌头选牌，拖动调整组合';
    scroll.setAttribute('aria-label',style==='stack'?stackLabel:'单层手牌；点击选牌，拖动调整牌序');
    scroll.setAttribute('title',style==='stack'?stackLabel:'点击选牌，Shift 点击连续选牌；轻点空白处或 Esc 取消选择。空白处拖动框选：向右全包，向左相交；Shift 追加。');
    bridge.layout();sync();
  }
  const dropTarget=()=>null;
  flat.addEventListener('click',()=>choose('flat'));fan.addEventListener('click',()=>choose('fan'));
  const observer=new ResizeObserver(sync);observer.observe(scroll);observer.observe(container);
  window.addEventListener('beforeunload',()=>observer.disconnect());
  window.tableView=Object.freeze({sync,dropTarget});
  choose(bridge.handStyle(),false);
})();
