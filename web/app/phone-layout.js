/* Phone presentation only: reuse the existing controls and their handlers. */
(function(scope){
  'use strict';
  function isPhone({nativeKind,platform,userAgent='',screenWidth,screenHeight}){
    if(nativeKind==='phone'||nativeKind==='tablet')return nativeKind==='phone';
    const shortSide=Math.min(screenWidth,screenHeight);
    return Boolean((platform==='pad'||/Android|iPhone|iPod/i.test(userAgent))&&shortSide>0&&shortSide<600);
  }
  const api={isPhone};
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  const root=document.documentElement;
  function detect(){
    let nativeKind;try{nativeKind=scope.GuandanPadNative?.deviceKind?.();}catch{}
    return isPhone({nativeKind,platform:root.dataset.platform,userAgent:navigator.userAgent,screenWidth:screen.width,screenHeight:screen.height});
  }
  root.dataset.phone=String(detect());
  let mounted=false,ready=false,wasBlocked=false;
  const moved=[];
  const byId=id=>document.getElementById(id);
  function move(node,parent){const marker=document.createComment('phone-control-home');node.before(marker);moved.push({node,marker});parent.append(node);}
  function refresh(){
    const enabled=detect();root.dataset.phone=String(enabled);
    if(enabled)root.dataset.handStyle='stack';
    if(!ready)return;
    if(enabled&&!mounted){
      move(document.querySelector('.match-strip'),document.querySelector('.app-top'));
      for(const id of ['language-toggle','open-review','open-settings','open-history','hint-button'])move(byId(id),byId('phone-menu-items'));
      for(const node of [document.querySelector('.view-picker'),byId('arrange-priority'),document.querySelector('.hand-options')])move(node,byId('phone-hand-options'));
      mounted=true;
    }else if(!enabled&&mounted){
      for(const id of ['phone-menu-dialog','phone-hand-dialog','phone-card-dialog'])if(byId(id).open)closeDialog(byId(id));
      for(const {node,marker}of moved.splice(0)){marker.replaceWith(node);}
      mounted=false;
    }
    // Native phones rotate before rendering. Browser previews and constrained
    // windows show a rotation prompt instead of a broken portrait card table.
    const blocked=enabled&&innerHeight>innerWidth;
    root.dataset.phonePortrait=String(blocked);byId('phone-rotate').hidden=!blocked;
    byId('preview').inert=blocked;
    if(blocked&&!wasBlocked){
      for(const dialog of document.querySelectorAll('dialog[open]'))closeDialog(dialog);
      window.GuandanTable?.cancelDrag();stopBots();
    }
    if(!blocked&&wasBlocked)scheduleBots();
    wasBlocked=blocked;
    window.GuandanTable?.layout();window.tableView?.sync();
  }
  scope.GuandanPhone=Object.freeze({refresh,get active(){return root.dataset.phone==='true';},blocked:()=>root.dataset.phonePortrait==='true'});
  document.addEventListener('DOMContentLoaded',()=>{
    ready=true;refresh();
    byId('phone-menu-toggle').addEventListener('click',event=>openDialog(byId('phone-menu-dialog'),event.currentTarget));
    byId('phone-tools-toggle').addEventListener('click',event=>openDialog(byId('phone-hand-dialog'),event.currentTarget));
    for(const id of ['open-review','open-settings','open-history','hint-button'])byId(id).addEventListener('click',()=>{if(byId('phone-menu-dialog').open)closeDialog(byId('phone-menu-dialog'));},true);
    for(const id of ['hand-flat','hand-fan','sort-hand','undo-arrange','clear-selection'])byId(id).addEventListener('click',()=>{if(byId('phone-hand-dialog').open)closeDialog(byId('phone-hand-dialog'));});
    byId('arrange-priority').addEventListener('change',()=>{if(byId('phone-hand-dialog').open)closeDialog(byId('phone-hand-dialog'));});
    function inspect(event){
      if(!mounted||event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
      const target=event.target.closest('.table-play:not(.is-pass),.seat-remainder');
      if(!target||target.hidden||!target.querySelector('img[data-card-face]'))return;
      event.preventDefault();
      byId('phone-card-title').textContent=target.getAttribute('aria-label')||'桌面明牌';
      byId('phone-card-images').replaceChildren(...[...target.querySelectorAll('img[data-card-face]')].map(img=>img.cloneNode(true)));
      openDialog(byId('phone-card-dialog'),target);
    }
    document.querySelector('.table-seats').addEventListener('click',inspect);
    document.querySelector('.table-seats').addEventListener('keydown',inspect);
    window.addEventListener('resize',refresh);
  });
})(globalThis);
