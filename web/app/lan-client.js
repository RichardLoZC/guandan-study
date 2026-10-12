'use strict';
(() => {
  const KEY='guandan.lan.session.v1',PROTOCOL=1,dialog=byId('lan-dialog');
  let session=null,room=null,offline=null,pollTimer=null,busy=false,connecting=false,pollingEpoch=null,online=false,generation=0,lastRender='',lastEnded=null,lastArchiveWarning=null;
  let mode='solo',nearby=[],scanning=false,scanEpoch=0,memberSignature='';
  const pending=new Map();let seq=0;
  window.GuandanLanReply=(id,json)=>{const task=pending.get(id);if(!task)return;pending.delete(id);clearTimeout(task.timer);try{const r=JSON.parse(json);r.error?task.reject(new Error(r.error)):task.resolve(r);}catch(error){task.reject(error);}};
  function transport(payload){
    if(window.GuandanLanNative)return window.GuandanLanNative.request(payload);
    if(window.GuandanPadNative?.lanRequest)return new Promise((resolve,reject)=>{
      const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('连接超时，请检查房主和 Wi-Fi'));},102000);
      pending.set(id,{resolve,reject,timer});window.GuandanPadNative.lanRequest(id,JSON.stringify(payload));
    });
    if(payload.action==='request'&&payload.address===location.host&&['127.0.0.1','localhost'].includes(location.hostname))return fetch('/api',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+(payload.token||'')},body:JSON.stringify(payload.body)}).then(r=>r.json()).then(r=>{if(r.error)throw new Error(r.error);return r;});
    return Promise.reject(new Error('请在电脑或安卓安装版中使用联机'));
  }
  function read(key){try{return localStorage.getItem(key);}catch{return null;}}
  function remember(){try{session?localStorage.setItem(KEY,JSON.stringify(session)):localStorage.removeItem(KEY);}catch{toast('连接信息未保存，关闭后需要重新加入。');}}
  function message(text=''){byId('lan-message').textContent=text;byId('lan-message').hidden=!text;}
  function suspendOffline(){
    if(offline)return;
    offline={round:liveRound,paused};dealMotion.cancel();stopBots();workEpoch++;model.cancel();activeTask=null;paused=true;
    selected.clear();hintSnapshot=null;clearError();renderGame();
  }
  function remoteRound(data){
    data.names.forEach(name=>GuandanI18n.protectName(name));const round=Object.create(GuandanMatch.Match.prototype);round.state=data.state;round.revision=data.revision;round.remote=true;
    for(const key of ['playerIds','names','actingSeat','tributeDisplay','tributeChoices','needsTributeConfirmation','canAct'])Object.defineProperty(round,key,{value:data[key]});
    round.confirmWaiting=data.confirmWaiting;round.persist=()=>{};round.adaptModel=response=>response;
    return round;
  }
  function showMode(value){mode=value;controls();if(mode==='multi'&&!session&&!scanning)discover();}
  function openGame(event){mode=session?'multi':'solo';controls();openDialog(dialog,event.currentTarget);if(mode==='multi'&&!session)discover();}
  function renderMembers(){
    const members=room?.members||[],signature=JSON.stringify([members,room?.host,room?.started,busy]);
    if(signature===memberSignature)return;memberSignature=signature;
    const list=byId('lan-members'),manage=byId('lan-manage-members');list.replaceChildren();manage.replaceChildren();
    const self=members.find(m=>m.self),colors=['#4f8561','#427dad','#b48128','#c76352'];
    for(let i=0;i<4;i++){
      const member=members[i];if(member)GuandanI18n.protectName(member.name);const card=document.createElement('div');card.className='lan-seat'+(member?'':' lan-seat-empty');
      const avatar=document.createElement('span');avatar.className='lan-seat-avatar';avatar.setAttribute('aria-hidden','true');
      avatar.style.setProperty('--player-color',colors[member?.identity??i]||colors[i]);avatar.textContent=member?Array.from(member.name)[0]:'＋';
      const name=document.createElement('strong');name.textContent=member?member.name+(member.self?(GuandanI18n.locale==='en'?' (you)':'（你）'):''):'等待入座';if(member)name.setAttribute('translate','no');
      const state=document.createElement('span');state.className='lan-seat-state';
      state.textContent=!member?(room?.started?'DanLM 机器人':'空位可由 AI 补齐'):!member.connected?'等待重连':room.started&&self?['你的座位','你的下家','你的队友','你的上家'][(member.seat-self.seat+4)%4]:member.host?'房主 · 已入座':'已入座';
      card.append(avatar,name,state);list.append(card);
      if(member&&room.host&&!room.started&&!member.host){
        const row=document.createElement('p');row.className='lan-manage-row';row.textContent=member.name+(member.connected?'':' · 离线');
        const remove=document.createElement('button');remove.className='text-action';remove.textContent='移除';remove.disabled=busy;
        remove.addEventListener('click',()=>command('kick',{memberId:member.id}).catch(()=>{}));row.append(remove);manage.append(row);
      }
    }
  }
  function controls(){
    const count=room?.members.length||0,inLobby=Boolean(session&&!room?.started),waiting=room?.waiting||[];
    byId('mode-solo').setAttribute('aria-pressed',String(mode==='solo'));byId('mode-multi').setAttribute('aria-pressed',String(mode==='multi'));
    byId('mode-solo').disabled=connecting;byId('mode-multi').disabled=connecting;
    byId('solo-panel').hidden=mode!=='solo';byId('multi-panel').hidden=mode!=='multi';
    byId('solo-current').hidden=Boolean(session);byId('lan-leave-confirm').hidden=!session;
    const solo=offline?.round||liveRound;
    byId('solo-progress').textContent='第 '+(solo?.state.round||1)+' 副 · 我方 '+(solo?.state.levels[0]||'2')+' / 对方 '+(solo?.state.levels[1]||'2')+' · 进度已保留';
    byId('lan-leave-note').textContent=session?.host?'多人牌桌会暂停，下次可以继续。你的单人进度会接着上次。':'离桌后由 DanLM 接替你的座位，你的单人进度会接着上次。';
    byId('open-lan').textContent=session?(online?'多人游戏 · '+count+'/4 ⌄':'多人游戏 · 连接中 ⌄'):'单人练习 ⌄';
    byId('lan-restore').hidden=Boolean(session)||!read(KEY+'.parked');
    byId('lan-connect').hidden=Boolean(session);byId('lan-room').hidden=!session;
    byId('lan-host').hidden=!window.GuandanLanNative;byId('lan-host').disabled=busy;byId('lan-join').disabled=busy;
    byId('lan-restore').disabled=busy;byId('lan-refresh').disabled=scanning||connecting;
    byId('lan-status').hidden=!session||inLobby||Boolean(online&&!room?.error&&!waiting.length&&!room?.paused&&!liveRound?.confirmWaiting);
    byId('lan-status-text').textContent=!online?'连接中断 · 正在重连':room?.error?room.error:waiting.length?'等待 '+waiting.join('、')+' 重新连接':room?.paused?'多人牌局已暂停':liveRound?.confirmWaiting?'等待其他玩家确认贡还':'';
    byId('lan-room-title').textContent=room?.code||'连接中…';byId('lan-count').textContent=room?count+' / 4 人':'尚未连接';
    byId('lan-addresses').textContent=(session?.addresses||[session?.address]).filter(Boolean).join(' 或 ');
    byId('lan-room-note').textContent=!online&&session?'正在连接牌桌…':room?.error?room.error:waiting.length?'等待 '+waiting.join('、')+' 重连。'+(!room?.started&&room?.host?'可在房间选项中移除离线玩家。':''):room?.started?(room.paused?'牌局已暂停，由房主继续。':'座位已分好。新游戏或打过 A 后，会重新随机分位。'):count===4?'四位玩家已到齐，全真人对局。':count>=2?count+' 位玩家已入座，可直接开局，也可等朋友坐满。':'等待朋友加入。两人即可开局，最多四位玩家。';
    if(session&&!room?.host&&!room?.started&&online&&!waiting.length)byId('lan-room-note').textContent+=(count>=2?' 等待房主开局。':'');
    byId('lan-footnote').hidden=Boolean(session);
    renderMembers();
    byId('lan-start').hidden=!room?.host||room?.started;byId('lan-start').textContent=count>=2?count+' 人开局':'等待朋友入座';
    byId('lan-start').disabled=busy||!online||count<2||Boolean(waiting.length);
    byId('lan-resume').hidden=!room?.started;byId('lan-resume').textContent=room?.host&&room.paused?'继续牌局':'返回牌桌';byId('lan-resume').disabled=busy||!online;
    byId('lan-lobby').hidden=!room?.host||!room?.started;byId('lan-lobby').disabled=busy||!online;
    byId('lan-new-game').hidden=!room?.host||!room?.started;
    byId('lan-retry').hidden=!session||Boolean(online&&!room?.error);byId('lan-retry').disabled=busy;byId('lan-retry').textContent=room?.error?'重试模型':'重新连接';
    root.classList.toggle('lan-lobby-active',inLobby);byId('lan-waiting-table').hidden=!inLobby;
    byId('lan-waiting-title').textContent=online?(count===4?'四位玩家已到齐':'等待朋友入座')+' · '+count+'/4':'尚未连接到牌桌';
    byId('lan-waiting-note').textContent=online?'人齐后由房主开局，自动随机分位。':'请打开牌桌查看连接状态，也可以切回单人练习。';
    for(const id of ['next-round','new-game','lan-new-game','pause-button'])byId(id).disabled=Boolean(session&&(!room?.host||!online||busy));
    if(session){byId('book-enabled').disabled=true;byId('pause-button').textContent=room?.paused?'继续多人牌局':'暂停多人牌局';byId('engine-indicator').textContent=count===4?'4 位玩家 · 自主出牌':room?.error?'房主模型需要重试':'多人游戏 · DanLM 补齐空位';}
    else byId('book-enabled').disabled=false;
  }
  function renderNearby(){
    const list=byId('lan-nearby');list.replaceChildren();
    for(const item of nearby){
      const button=document.createElement('button');button.type='button';button.className='lan-nearby-room';button.disabled=connecting;
      button.setAttribute('aria-pressed',String(byId('lan-address').value===item.address));
      GuandanI18n.protectName(item.name);const name=document.createElement('strong');name.textContent=item.name+'的牌桌';
      const meta=document.createElement('span');meta.textContent=item.count+'/4 人 · '+(item.started?'正在对局':item.count===4?'已坐满':'等待入座');button.append(name,meta);
      button.addEventListener('click',()=>{byId('lan-address').value=item.address;message();renderNearby();});list.append(button);
    }
  }
  async function discover(){
    if(session||scanning||connecting)return;
    const epoch=++scanEpoch,addressBefore=byId('lan-address').value;scanning=true;controls();
    byId('lan-discovery-status').textContent='正在寻找同一 Wi-Fi 下的牌桌…';
    try{
      const result=await transport({action:'discover'});if(epoch!==scanEpoch||session)return;
      nearby=result.rooms||[];
      if(byId('lan-address').value===addressBefore&&!byId('lan-manual').open){
        const selected=nearby.find(r=>r.address===addressBefore)||nearby.find(r=>!r.started&&r.count<4)||nearby[0];
        byId('lan-address').value=selected?.address||'';
      }
      byId('lan-discovery-status').textContent=nearby.length?'选好牌桌，输入房主的六位房间码。':'还没找到牌桌。请朋友在电脑上开一桌，或手动输入地址。';renderNearby();
    }catch{if(epoch===scanEpoch)byId('lan-discovery-status').textContent='暂时找不到附近牌桌，可在下方手动输入房主地址。';}
    finally{if(epoch===scanEpoch){scanning=false;controls();}}
  }
  function apply(data){
    if(!data?.room||!session||data.room.id!==session.roomId||room&&data.room.version<room.version)return;
    const started=room?.started;room=data.room;online=true;
    const signature=[room.id,room.version,room.paused,room.error,room.modelReady,room.waiting.join('|'),room.members.map(m=>m.id+':'+m.connected).join('|')].join('/');
    if(signature!==lastRender){
      lastRender=signature;
      if(data.round){
        const oldId=liveRound?.remote?liveRound.id:null;liveRound=remoteRound(data.round);paused=false;clearError();
        if(oldId!==liveRound.id){selected.clear();hintSnapshot=null;playKey=null;cardNodes.clear();dealMotion.cancel();}
        renderGame();
        if(!started&&room.started&&!room.paused&&!room.waiting.length&&mode==='multi'&&dialog.open)closeDialog(dialog);
        if(oldId!==liveRound.id&&!liveRound.game.result)beginDealAnimation();
      }else{liveRound=offline?.round||liveRound;paused=true;renderGame();}
    }
    // Retry a failed save on later polls even when the room version is unchanged.
    if(data.round&&liveRound.game.result&&lastEnded!==liveRound.id){
      try{GuandanMatch.archive(localStorage,liveRound,{source:'局域网实际对局'});lastEnded=liveRound.id;lastArchiveWarning=null;}
      catch{if(lastArchiveWarning!==liveRound.id)toast('联机复盘未保存，可在当前复盘面板导出。');lastArchiveWarning=liveRound.id;}
    }
    controls();
  }
  async function poll(){
    if(!session||pollingEpoch===generation)return;const epoch=generation;pollingEpoch=epoch;
    try{const data=await transport({action:'request',address:session.address,token:session.token,body:{op:'poll'}});if(epoch===generation){apply(data);message();}}
    catch(error){if(epoch===generation){online=false;message(error.message);renderGame();controls();}}
    finally{if(pollingEpoch===epoch)pollingEpoch=null;if(session&&epoch===generation){clearTimeout(pollTimer);pollTimer=setTimeout(poll,900);}}
  }
  async function command(op,details={}){
    if(!session||!room||busy)return;busy=true;const epoch=generation;
    controls();updateSelection();
    try{
      const result=await transport({action:'request',address:session.address,token:session.token,body:{op,version:room.version,requestId:crypto.randomUUID(),...details}});
      if(epoch!==generation)return;
      if(result.advice)return result.advice;
      if(result.left)return result;
      if(op==='play'){selected.clear();playKey=null;hintSnapshot=null;}
      apply(result);message();return result;
    }catch(error){if(epoch===generation){toast(error.message);await poll();message(error.message);}throw error;}
    finally{if(epoch===generation){busy=false;controls();updateSelection();}}
  }
  async function connect(host){
    if(busy||session)return;
    const address=byId('lan-address').value.trim(),code=byId('lan-code').value.trim();
    if(!host&&!address){byId('lan-manual').open=true;message('请选择附近的牌桌，或输入房主显示的地址。');return;}
    if(!host&&!/^\d{6}$/.test(code)){message('请输入六位数字房间码。');return;}
    busy=true;connecting=true;scanEpoch++;scanning=false;const epoch=generation;controls();renderNearby();message('正在连接…');
    try{
      const name=byId('lan-name').value.trim()||(GuandanI18n.locale==='en'?(window.GuandanLanNative?'Desktop player':'Android player'):(window.GuandanLanNative?'电脑玩家':'安卓玩家'));
      let clientId=read(KEY+'.device');if(!clientId)clientId=crypto.randomUUID();
      try{localStorage.setItem(KEY+'.device',clientId);localStorage.setItem(KEY+'.name',name);}catch{}
      const result=host?await transport({action:'host',name,fresh:true}):await transport({action:'request',address,body:{op:'join',code,name,clientId,protocol:PROTOCOL}});
      if(epoch!==generation)return;
      suspendOffline();session={...result,address:result.address||address,host,name};generation++;mode='multi';remember();lastRender='';await poll();
    }catch(error){message(error.message);}
    finally{busy=false;connecting=false;controls();renderNearby();}
  }
  async function reconnect(resume=false){
    if(!session)return;const epoch=generation,current=session;
    try{
      if(current.host){const result=await transport({action:'host',name:current.name});if(epoch!==generation)return;Object.assign(current,result);remember();}
      if(epoch!==generation)return;await poll();if(epoch===generation&&room?.error&&room.host)await command('retry');
      if(epoch===generation&&resume===true&&room?.host&&room.started&&room.paused)await command('pause');
      if(epoch===generation&&resume===true&&online&&room?.started&&!room.error&&!room.waiting.length)closeDialog(dialog);
    }catch(error){if(epoch===generation)message(error.message);}
  }
  function leaveLocal(keep=false){
    try{if(keep&&session)localStorage.setItem(KEY+'.parked',JSON.stringify(session));else localStorage.removeItem(KEY+'.parked');}catch{toast('暂未保存重连信息。');}
    generation++;scanEpoch++;scanning=false;busy=false;clearTimeout(pollTimer);session=null;room=null;online=false;lastRender='';mode='solo';remember();dealMotion.cancel();
    liveRound=offline?.round||GuandanMatch.read(localStorage);paused=offline?.paused||false;offline=null;selected.clear();cardNodes.clear();hintSnapshot=null;clearError();message();renderGame();controls();closeDialog(dialog);checkModel();
  }
  byId('open-lan').addEventListener('click',openGame);byId('lan-show-room').addEventListener('click',openGame);byId('lan-open-lobby').addEventListener('click',openGame);
  byId('mode-solo').addEventListener('click',()=>showMode('solo'));byId('mode-multi').addEventListener('click',()=>showMode('multi'));
  byId('solo-continue').addEventListener('click',()=>{paused=false;prefs.paused=false;savePrefs();closeDialog(dialog);renderGame();scheduleBots();});
  byId('lan-refresh').addEventListener('click',discover);byId('lan-address').addEventListener('input',renderNearby);
  byId('lan-restore').addEventListener('click',()=>{if(busy)return;try{const saved=JSON.parse(read(KEY+'.parked'));if(!saved)return;suspendOffline();session=saved;room=null;generation++;scanEpoch++;scanning=false;mode='multi';remember();lastRender='';reconnect(true);controls();}catch(error){message(error.message);}});
  byId('lan-host').addEventListener('click',()=>connect(true));
  byId('lan-join').addEventListener('click',event=>{event.preventDefault();return connect(false);});
  byId('lan-join-form').addEventListener('submit',event=>{event.preventDefault();return connect(false);});
  byId('lan-start').addEventListener('click',()=>command('start').then(result=>{if(result)closeDialog(dialog);}).catch(()=>{}));
  byId('lan-resume').addEventListener('click',async()=>{try{if(room?.host&&room.paused){if(!await command('pause'))return;}closeDialog(dialog);}catch{}});
  byId('lan-lobby').addEventListener('click',()=>{byId('lan-lobby-confirm').hidden=false;});
  byId('lan-confirm-lobby').addEventListener('click',()=>command('lobby').then(result=>{if(result)byId('lan-lobby-confirm').hidden=true;}).catch(()=>{}));
  byId('lan-cancel-lobby').addEventListener('click',()=>byId('lan-lobby-confirm').hidden=true);
  byId('lan-retry').addEventListener('click',reconnect);
  byId('lan-cancel-leave').addEventListener('click',()=>showMode('multi'));
  byId('lan-confirm-leave').addEventListener('click',async()=>{const host=session?.host;let left=false;try{if(online)left=Boolean((await command('leave'))?.left);}catch{}leaveLocal(host||!left);});
  window.GuandanLan=Object.freeze({get active(){return Boolean(session);},get ready(){return online&&!busy&&!room?.paused&&!room?.waiting?.length&&!room?.error;},get hosting(){return room?.host;},command,reconnect,controls});
  window.addEventListener?.('guandan-language-change',()=>{memberSignature='';controls();});
  byId('lan-name').value=read(KEY+'.name')||'';controls();
  try{const stored=JSON.parse(read(KEY)||'null');if(stored?.address&&stored?.token){suspendOffline();session=stored;generation++;mode='multi';controls();reconnect();}}catch{}
})();
