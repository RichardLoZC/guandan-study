/* A view switch owns graphics only; it never starts/cancels AI or commits moves. */
'use strict';
(() => {
  const bridge=window.GuandanTable,root=document.documentElement,zone=document.querySelector('.play-zone');
  const host=document.getElementById('three-stage'),flat=document.getElementById('view-2d'),spatial=document.getElementById('view-3d'),status=document.getElementById('view-status');
  let renderer=null,loadingController=null,generation=0,desired='2d',loading=false,disposed=false;
  function controls(){
    const active=Boolean(renderer);
    root.classList.toggle('view-3d',active);
    flat.setAttribute('aria-pressed',String(desired==='2d'));spatial.setAttribute('aria-pressed',String(desired==='3d'));
    spatial.textContent=loading?'载入 3D…':'3D 握牌';spatial.setAttribute('aria-busy',String(loading));
    host.hidden=!active;status.hidden=!active;status.textContent='点选牌面 · 理牌可轮换组合';
    document.getElementById('hand-scroll').setAttribute('aria-label',active?'扇形手牌；Tab 逐张查看，空格选牌':'手牌区域，可上下滚动查看');
  }
  function resetButtons(){for(const button of bridge.buttons().values())button.style.removeProperty('--hit-x'),button.style.removeProperty('--hit-y'),button.style.removeProperty('--hit-w'),button.style.removeProperty('--hit-h');}
  function clear(){renderer?.dispose();renderer=null;host.replaceChildren();resetButtons();controls();bridge.layout();}
  function fallback(error){if(disposed)return;generation++;desired='2d';loading=false;clear();bridge.notice('3D 暂不可用，已返回 2D：'+(error?.message||'图形环境中断'));console.warn('3D view fallback',error?.message);}
  function sync(){
    const snapshot=bridge.snapshot();
    if(renderer&&(!snapshot||!snapshot.classic)){desired='2d';generation++;clear();return;}
    if(renderer){try{renderer.setState(snapshot,{buttons:bridge.buttons()});}catch(error){fallback(error);}}
  }
  async function choose(mode){
    if(mode==='3d'&&desired==='3d'&&(loading||renderer))return;
    desired=mode;const token=++generation;loadingController?.abort();loadingController=null;
    if(mode==='2d'){loading=false;clear();return;}
    if(renderer){controls();return;}
    if(!bridge.snapshot()?.classic){desired='2d';controls();bridge.notice('旧拖 3 存档继续使用 2D；新经典掼蛋可体验 3D。');return;}
    loading=true;loadingController=new AbortController();const signal=loadingController.signal;controls();
    let candidate=null;
    try{
      const module=await import('./table3d.js');
      if(token!==generation||disposed)return;
      candidate=await module.createTableView({host,zone,signal,onSelect:id=>bridge.select(id),onFailure:error=>{if(token===generation&&desired==='3d'&&candidate&&renderer===candidate)fallback(error);}});
      if(token!==generation||disposed){candidate.dispose();return;}
      renderer=candidate;loading=false;
      controls();bridge.layout();sync();renderer?.resize();
    }catch(error){candidate?.dispose();if(token===generation)fallback(error);}
  }
  flat.addEventListener('click',()=>choose('2d'));spatial.addEventListener('click',()=>choose('3d'));
  document.getElementById('hand-cards').addEventListener('pointerover',event=>renderer?.hover(event.target.closest('.playing-card')?.dataset.id||null));
  document.getElementById('hand-cards').addEventListener('pointerleave',()=>renderer?.hover(null));
  document.getElementById('hand-cards').addEventListener('focusin',event=>renderer?.hover(event.target.closest('.playing-card')?.dataset.id||null));
  document.getElementById('hand-cards').addEventListener('focusout',()=>renderer?.hover(null));
  const observer=new ResizeObserver(()=>{if(renderer){renderer.resize();sync();}});observer.observe(zone);
  document.getElementById('large-type').addEventListener('click',()=>{sync();});
  document.addEventListener('visibilitychange',()=>renderer?.setVisible(!document.hidden));
  window.addEventListener('beforeunload',()=>{disposed=true;generation++;loadingController?.abort();observer.disconnect();renderer?.dispose();});
  window.tableView=Object.freeze({sync});controls();
  if(new URLSearchParams(location.search).get('view')!=='2d')choose('3d');
})();
