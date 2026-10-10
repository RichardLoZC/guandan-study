 'use strict';
const root=document.documentElement,byId=id=>document.getElementById(id);
const SKINS={jumbo:{name:'经典大角标',note:'传统人物牌 · 红黑双色'},accessible:{name:'清晰四色',note:'四种花色 · 各有颜色'},minimal:{name:'极简纸牌',note:'干净牌面 · 更少装饰'}};
const SKIN_KEY='guandan.desktop.cardSkin.v1',PREFS_KEY='guandan.desktop.preferences.v1';
const PLAYERS=[{name:'你',avatar:null},{name:'青岚',avatar:'assets/avatars/qing-lan.png'},{name:'知秋',avatar:'assets/avatars/zhi-qiu.png'},{name:'墨白',avatar:'assets/avatars/mo-bai.png'}];
let prefs={theme:'day',large:false,book:true,paused:false,dealAnimation:true};
let currentSkin='jumbo',pendingSkin='jumbo';
try{const previous=JSON.parse(localStorage.getItem('guandan-engine-choices')||'null');if(previous?.book===false)prefs.book=false;Object.assign(prefs,JSON.parse(localStorage.getItem(PREFS_KEY)||'{}'));const saved=localStorage.getItem(SKIN_KEY);if(Object.hasOwn(SKINS,saved))currentSkin=saved;}catch{}
let liveRound=null,loadError=null,initialDeal=false;
try{initialDeal=!localStorage.getItem(GuandanMatch.SAVE_KEY);liveRound=GuandanMatch.read(localStorage);}catch(error){loadError=error;}
let selected=new Set(),columns=27,toastTimer,botTimer,hintSnapshot=null,playKey=null;
let paused=Boolean(prefs.paused),fault=null,faultKind=null,workEpoch=0,activeTask=null,confirmMode='restart';
const model=new DanLMClient(),cardNodes=new Map(),dialogFocus=new WeakMap();
const dealView=new DealAnimation.TableView({stage:byId('deal-stage'),table:document.querySelector('.play-zone'),receipt:byId('tribute-receipt'),hand:byId('hand-cards')});
const dealMotion=new DealAnimation.Player({view:dealView,onFinish:(meta,restoreFocus)=>{
  if(meta.id!==liveRound?.id)return;
  renderGame();scheduleBots();
  if(restoreFocus&&!hasOpenDialog()&&!document.hidden)(liveRound.needsTributeConfirmation?byId('confirm-tribute'):byId('hand-scroll')).focus({preventScroll:true});
}});
dealView.onSkip=()=>dealMotion.finish();
const playerAt=(seat,round=liveRound)=>round?.remote?{name:round.names[seat],avatar:PLAYERS[round.playerIds[seat]]?.avatar||'assets/brand/app-icon.png'}:PLAYERS[(round?.playerIds||[0,1,2,3])[seat]];
const seatStyle=(seat,round=liveRound)=>'seat-'+seat+' identity-'+(round?.playerIds||[0,1,2,3])[seat];
const signed=value=>(value>0?'+':'')+value;
const TUO3_RULES=[
  '两副牌、四人、固定打 2，红桃 2 为逢人配。没有升级或贡还。首副随机决定翻牌者，以后由上副头游翻牌；洗牌、倒牌与发牌由系统完成。',
  '翻一张非王牌：拿到这张实体牌的人先出，两张同花同点牌的持有者为搭档；两张在同一家则保留原搭档。每副配对后自动对坐，个人积分跟随玩家。',
  '每副第一手不能含 3，包括用逢人配组成含 3 的牌型。此后可以出 3，但三带二全程不能带对 3。',
  '头游搭档为二／三／末游，胜方两人各加 3／2／1 分，负方两人各减相应分数。',
  '拖三须先以最大牌收回牌权，最后一手全部由 3 和红桃 2 组成。只有头游，以及头游搭档取得二游时可以拖三计分；敌家和三游均不计拖三。',
  '头游拖三后，搭档立即硬接风，其他人不能压。接风首手不能含 3；仅剩纯三（含红桃 2）或含 3 的同花顺时，可以整手出完。仅剩含 3 的普通顺子须拆开出。仅剩纯三接风出完视为拖三成功。',
  '拖三时每张红桃 3、红桃 2 各计 2 分，其他 3 各计 1 分。结束时所有未出完者的这些分牌按同值扣分。每项加减都由本副两名搭档共同承担，另一队反向加减；四人总积分之和保持为 0。'
];
let arrangement={key:'',plans:[],index:-1};
function arrangementKey(){return liveRound?.id+'|'+liveRound?.level+'|'+(liveRound?.hand||[]).map(c=>c.id).sort().join(',');}
function ownHand(){
  const hand=liveRound?.hand||[];
  if(arrangement.key!==arrangementKey())arrangement={key:arrangementKey(),plans:[],index:-1};
  const plan=arrangement.plans[arrangement.index];if(!plan)return hand;
  const cards=new Map(hand.map(c=>[c.id,c]));return plan.ids.map(id=>cards.get(id)).filter(Boolean);
}
function cycleArrangement(){
  if(!liveRound||!ownHand().length||dealMotion.active)return;
  if(!arrangement.plans.length)arrangement.plans=GuandanArrange.plans(liveRound.hand,liveRound.level);
  arrangement.index=(arrangement.index+2)%(arrangement.plans.length+1)-1;
  renderHand();window.tableView?.sync();
}
function renderArrangement(){
  const plan=arrangement.plans[arrangement.index],summary=byId('arrangement-summary');summary.hidden=!plan;
  summary.replaceChildren();byId('arrange-hand').textContent=plan?'理牌 '+(arrangement.index+1)+'/'+arrangement.plans.length:'理牌';
  byId('arrange-hand').disabled=!ownHand().length||dealMotion.active;
  if(plan){for(const [index,group]of plan.groups.entries())if(group.ids.length>1){const chip=document.createElement('span');chip.textContent=group.label;chip.style.setProperty('--group-color',arrangementColor(index));summary.append(chip);}if(!summary.childElementCount)summary.textContent='目前以单张排列';}
}
const arrangementColor=index=>['#f0ce79','#82cbde','#dfa3ce','#aace8c','#efa48f'][index%5];
const canPlay=()=>Boolean(liveRound?.canAct&&!paused&&!fault&&!dealMotion.active&&(!liveRound.remote||window.GuandanLan?.ready));
const hasOpenDialog=()=>Boolean(document.querySelector('dialog[open]'));
function beginDealAnimation(){
  stopBots();
  if(prefs.dealAnimation===false||!liveRound||liveRound.game.result||fault)return;
  const players=[0,1,2,3].map(seat=>({...playerAt(seat),identity:liveRound.playerIds[seat]}));
  dealMotion.start({id:liveRound.id,round:liveRound.state.round,level:liveRound.state.level,mode:liveRound.isTuo3?'拖 3':'经典掼蛋',players});
  renderGame();
}
function savePrefs(){try{localStorage.setItem(PREFS_KEY,JSON.stringify(prefs));}catch{toast('外观偏好未能保存。');}}
function placeToast(){
  const notice=byId('toast'),dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
  const parent=dialog||(liveRound?.game.result?byId('round-end-banner'):document.querySelector('.action-bar'));
  if(notice.parentElement===parent)return;
  if(dialog)dialog.querySelector('.dialog-header').after(notice);
  else parent.append(notice);
}
function toast(message){
  byId('toast').textContent=message;placeToast();byId('toast').classList.add('visible');
  clearTimeout(toastTimer);toastTimer=setTimeout(clearToast,3400);
}
function clearToast(){clearTimeout(toastTimer);byId('toast').classList.remove('visible');}
function loadCardImage(img,skin,face){
  const version=String(Number(img.dataset.imageVersion||0)+1);img.dataset.imageVersion=version;let attempts=0;
  img.onerror=()=>{
    if(img.dataset.imageVersion!==version)return;
    if(attempts++>=2){img.onerror=null;img.src='assets/minimal/'+face+'.svg';return;}
    requestAnimationFrame(()=>{if(img.dataset.imageVersion===version)img.src='assets/'+skin+'/'+face+'.svg?v=110&r='+attempts;});
  };
  img.src='assets/'+skin+'/'+face+'.svg?v=110';
}
function imageFor(face,label='',lockedSkin){
  const img=document.createElement('img');img.dataset.cardFace=face;
  if(lockedSkin)img.dataset.fixedSkin=lockedSkin;img.alt=label;img.draggable=false;
  loadCardImage(img,lockedSkin||currentSkin,face);return img;
}
function setCardSkin(skin){
  if(!Object.hasOwn(SKINS,skin))return false;
  currentSkin=skin;root.dataset.cardSkin=skin;
  window.tableView?.sync();
  document.querySelectorAll('img[data-card-face]').forEach(img=>{if(!img.dataset.fixedSkin)loadCardImage(img,skin,img.dataset.cardFace);});
  try{localStorage.setItem(SKIN_KEY,skin);return true;}catch{return false;}
}
function selectSkinOption(skin){
  pendingSkin=skin;document.querySelectorAll('[data-skin-option]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.skinOption===skin)));
}
function buildSkinOptions(){
  for(const [key,skin] of Object.entries(SKINS)){
    const button=document.createElement('button');button.type='button';button.className='skin-option';button.dataset.skinOption=key;button.setAttribute('aria-pressed',String(key===currentSkin));
    const preview=document.createElement('span');preview.className='skin-card-preview';
    for(const face of ['spadeAce','heartKing','clubQueen'])preview.append(imageFor(face,'',key));
    const title=document.createElement('strong');title.textContent=skin.name;
    const note=document.createElement('span');note.className='skin-note';note.textContent=skin.note;
    const check=document.createElement('span');check.className='skin-check';check.textContent='✓';check.setAttribute('aria-hidden','true');
    button.append(preview,title,note,check);button.addEventListener('click',()=>selectSkinOption(key));byId('skin-options').append(button);
  }
}
function selectCard(id){
  if(!canPlay()||cardNodes.get(id)?.disabled||!ownHand().some(held=>held.id===id))return;
  clearToast();
  if(liveRound.phase!=='playing')selected=new Set([id]);else selected.has(id)?selected.delete(id):selected.add(id);
  playKey=null;updateSelection();
}
function renderHand(){
  const hand=ownHand(),container=byId('hand-cards');
  const previousFocus=document.activeElement?.closest('.playing-card')?.dataset.id;
  const previousPosition=[...container.querySelectorAll('.playing-card')].findIndex(button=>button.dataset.id===previousFocus);
  const liveIds=new Set(hand.map(card=>card.id));
  for(const [id] of cardNodes)if(!liveIds.has(id))cardNodes.delete(id);
  const duplicates=new Map(),ordinals=new Map(),rows=[];
  const groups=arrangement.plans[arrangement.index]?.groups||[];
  hand.forEach(card=>duplicates.set(card.face,(duplicates.get(card.face)||0)+1));
  for(let index=0;index<hand.length;index+=columns){
    const row=document.createElement('div');row.className='card-row';rows.push(row);
    for(const card of hand.slice(index,index+columns)){
      let button=cardNodes.get(card.id);
      const ordinal=(ordinals.get(card.face)||0)+1;ordinals.set(card.face,ordinal);
      if(!button){
        button=document.createElement('button');button.type='button';button.className='playing-card';button.dataset.id=card.id;
        const img=imageFor(card.face);img.setAttribute('aria-hidden','true');button.append(img);
        const mark=document.createElement('span');mark.className='selected-mark';mark.textContent='✓';mark.setAttribute('aria-hidden','true');button.append(mark);
        if(card.suit==='joker'){
          button.classList.add(card.rank==='BJ'?'big-joker':'small-joker');
          const label=document.createElement('span');label.className='joker-label';label.setAttribute('aria-hidden','true');
          label.dataset.joker=card.rank;for(const character of (GuandanI18n.locale==='en'?'JOKER':card.label)){const line=document.createElement('span');line.textContent=character;label.append(line);}button.append(label);
        }
        if(card.isWild){const wild=document.createElement('span');wild.className='wild-label';wild.textContent='百搭';wild.setAttribute('aria-hidden','true');button.append(wild);}
        button.addEventListener('click',()=>selectCard(card.id));
        cardNodes.set(card.id,button);
      }
      button.setAttribute('aria-label',card.label+(card.isWild?' 逢人配':'')+(duplicates.get(card.face)>1?' 第'+ordinal+'张':''));
      const groupIndex=groups.findIndex(g=>g.ids.length>1&&g.ids.includes(card.id));button.classList.toggle('arranged',groupIndex>=0);button.style.setProperty('--group-color',arrangementColor(Math.max(0,groupIndex)));
      row.append(button);
    }
  }
  if(!hand.length){const empty=document.createElement('p');empty.className='empty-hand-message';empty.textContent='手牌已出完，等待本局结束。';rows.push(empty);}
  container.replaceChildren(...rows);renderArrangement();byId('hand-count').textContent=hand.length;byId('hand-scroll').classList.toggle('empty-hand',!hand.length);updateSelection();
  if(previousFocus&&canPlay()){
    const target=cardNodes.get(previousFocus)||cardNodes.get(hand[Math.min(Math.max(previousPosition,0),hand.length-1)]?.id);
    target?.focus({preventScroll:true});
  }
}
function resizeHand(render=true){
  const width=byId('hand-scroll').clientWidth;if(!width)return;
  const styles=getComputedStyle(root),cardWidth=parseFloat(styles.getPropertyValue('--hand-card-width')),baseStep=parseFloat(styles.getPropertyValue('--hand-step'));
  const fittedStep=(width-16-cardWidth)/Math.max(1,ownHand().length-1);
  const step=innerHeight<=740&&fittedStep>=36?Math.min(baseStep,Math.floor(fittedStep*100)/100):baseStep;
  byId('hand-scroll').style.setProperty('--hand-step',step+'px');
  const capacity=Math.max(1,Math.floor((width-16-cardWidth)/step)+1);
  const rows=Math.max(1,Math.ceil(ownHand().length/capacity)),next=Math.max(1,Math.ceil(ownHand().length/rows));
  byId('hand-scroll').style.setProperty('--hand-rows',rows);
  const changed=next!==columns;columns=next;if(render&&changed)renderHand();
}
function renderTable(){
  const game=liveRound.game,table=game.tablePlay,actions=GuandanPresentation.tableActions(game,liveRound.state.level);
  for(let seat=0;seat<4;seat++){
    const action=actions[seat],anchor=seat===0?document.querySelector('.self-play-anchor'):document.querySelector('.player[data-seat="'+seat+'"] .seat-anchor');
    let play=anchor.querySelector('.table-play');
    if(!play){play=document.createElement('div');play.dataset.playSeat=seat;play.innerHTML='<div class="table-cards"></div><div class="table-caption"></div>';anchor.append(play);}
    play.hidden=!action||Boolean(game.result)||liveRound.phase!=='playing';
    play.className='table-play '+seatStyle(seat)+(action?.cards.length>4?' long-play':'')+(action?.type==='pass'?' is-pass':'')+(table?.owner===seat?' is-leading':'');
    if(!action)continue;
    const cards=play.querySelector('.table-cards');cards.hidden=action.type==='pass';cards.style.setProperty('--played-count',action.cards.length);
    cards.replaceChildren(...action.cards.map(card=>imageFor(card.face,card.label)));cards.setAttribute('aria-label',playerAt(seat).name+'出的'+action.label);
    const label=document.createElement('strong');label.textContent=action.label;
    play.querySelector('.table-caption').replaceChildren(document.createTextNode(playerAt(seat).name+(action.type==='pass'?'不出':'出了')),label);
    play.setAttribute('aria-label',playerAt(seat).name+(action.type==='pass'?'不出，PASS':'出了'+action.label));
  }
  document.querySelectorAll('.player[data-seat]').forEach(player=>{
    const seat=Number(player.dataset.seat);
    for(const id of [0,1,2,3])player.classList.toggle('identity-'+id,liveRound.playerIds[seat]===id);
    const heading=player.querySelector('.player-info strong');let name=heading.querySelector('.player-name');if(!name){name=document.createElement('span');name.className='player-name';heading.firstChild.replaceWith(name);}name.setAttribute('translate',liveRound.remote?'no':'yes');name.textContent=playerAt(seat).name+' ';
    player.querySelector('.avatar img').setAttribute('src',playerAt(seat).avatar);
    let score=player.querySelector('.player-score');
    if(!score){score=document.createElement('span');score.className='player-score';player.querySelector('.player-info').append(score);}
    score.hidden=!liveRound.isTuo3;score.textContent=liveRound.isTuo3?'累计 '+signed(liveRound.state.tuo3.totals[liveRound.playerIds[seat]])+' 分':'';
    player.querySelector('.remaining b').textContent=game.players[seat].hand.length;
    player.classList.toggle('last-player',table?.owner===seat);player.classList.toggle('is-turn',!game.result&&!liveRound.needsTributeConfirmation&&liveRound.actingSeat===seat);
    const bubble=player.querySelector('.seat-bubble'),finished=game.players[seat].finished,isTurn=player.classList.contains('is-turn');
    bubble.classList.toggle('recent-play',table?.owner===seat);
    bubble.hidden=liveRound.phase==='playing'&&!game.result&&!finished&&!isTurn&&Boolean(actions[seat]);
    bubble.textContent=finished?'第'+(game.finishOrder.indexOf(seat)+1)+'名':isTurn?'正在出牌':!game.actionHistory.length&&game.starter===seat?'本副先手':'等待出牌';
    if(liveRound.phase!=='playing')bubble.textContent=liveRound.actingSeat===seat?(liveRound.phase==='give'?'正在进贡':'正在还贡'):'等待贡还';
  });
}
function renderTribute(){
  const view=liveRound.tributeDisplay,panel=byId('tribute-panel'),receipt=byId('tribute-receipt');
  panel.setAttribute('aria-label',liveRound.isTuo3?'本副翻牌与搭档':'本局贡还明牌');
  receipt.setAttribute('aria-label',liveRound.isTuo3?'本副翻牌与规则摘要':'本副贡还摘要');
  const expanded=Boolean(view&&(!view.complete||view.awaitingConfirmation));
  panel.hidden=!expanded;receipt.hidden=!view||expanded;
  document.querySelector('.play-zone').classList.toggle('is-tribute',expanded);
  byId('confirm-tribute').hidden=!view?.awaitingConfirmation;
  document.querySelector('.actions').classList.toggle('awaiting-tribute',Boolean(view?.awaitingConfirmation));
  const transfers=byId('tribute-transfers'),receiptCards=byId('tribute-receipt-cards');transfers.replaceChildren();receiptCards.replaceChildren();
  if(!view)return;
  byId('tribute-title').textContent=view.title;byId('tribute-reason').textContent=view.reason;byId('tribute-message').textContent=view.message;
  byId('confirm-tribute').disabled=paused||Boolean(fault)||dealMotion.active;
  byId('tribute-receipt-title').textContent=liveRound.isTuo3?'拖 3 · 本副翻牌':view.mode==='抗贡'?'本副抗贡 · 免贡还':view.mode+' · 未抗贡';
  byId('tribute-receipt-leader').textContent=liveRound.isTuo3?Tuo3Rules.hint(liveRound.state):playerAt(view.starter??liveRound.actingSeat).name+'先手';
  for(const row of view.rows){
    const item=document.createElement('div');item.className='tribute-transfer '+seatStyle(row.from)+(row.active?' is-current':'');
    const card=document.createElement('div');card.className='tribute-card';
    if(row.card)card.append(imageFor(row.card.face,row.card.label));else{card.classList.add('is-pending');card.textContent='待选';}
    const copy=document.createElement('div');copy.className='tribute-copy';
    const route=document.createElement('div');route.className='tribute-route';
    const from=document.createElement('strong');from.className=seatStyle(row.from);from.textContent=playerAt(row.from).name;route.append(from);
    if(row.to!==null){const to=document.createElement('strong');to.className=seatStyle(row.to);to.textContent=playerAt(row.to).name;route.append(document.createTextNode(' → '),to);}
    const action=document.createElement('b');action.textContent=row.kind+(row.card?' '+row.card.label:'');
    const status=document.createElement('span');status.textContent=row.active?'当前操作 · '+row.status:row.status;
    copy.append(route,action,status);item.append(card,copy);(expanded?transfers:receiptCards).append(item);
  }
}
function setTheme(theme){
  root.dataset.theme=theme;window.tableView?.sync();byId('theme-day').setAttribute('aria-pressed',String(theme==='day'));byId('theme-night').setAttribute('aria-pressed',String(theme==='night'));
}

function revealAvatar(seat,round=liveRound){
  const avatar=document.createElement('span');avatar.className='reveal-avatar';avatar.setAttribute('aria-hidden','true');
  if(playerAt(seat,round).avatar){const img=document.createElement('img');img.src=playerAt(seat,round).avatar;img.alt='';avatar.append(img);}else avatar.textContent='你';
  return avatar;
}
function renderFinalPlay(section,play,round=liveRound){
  section.hidden=!play;
  const group=section.querySelector('.final-play-content');group.replaceChildren();
  if(!play)return;
  group.className='final-play-content '+seatStyle(play.seat,round);
  const heading=document.createElement('div');heading.className='final-play-heading';
  const name=document.createElement('strong');name.textContent=playerAt(play.seat,round).name;
  const status=document.createElement('span');status.textContent=play.place?'第'+play.place+'名 · 已出完':'本局最后一次出牌';
  heading.append(revealAvatar(play.seat,round),name,status);
  const label=document.createElement('b');label.className='final-play-label';label.textContent=play.label;
  const meta=document.createElement('div');meta.className='final-play-meta';meta.append(heading,label);
  const cards=document.createElement('div');cards.className='final-play-cards';cards.setAttribute('aria-label',playerAt(play.seat,round).name+'最后打出的'+play.label);
  cards.append(...play.cards.map(card=>imageFor(card.face,card.label+(card.isWild?' 逢人配':''))));
  group.append(meta,cards);
}
function renderRevealedHands(section,hands,round=liveRound){
  section.hidden=!hands.length;
  const list=section.querySelector('.revealed-hands');list.replaceChildren();
  for(const {seat,cards} of hands){
    const group=document.createElement('section');group.className='revealed-hand '+seatStyle(seat,round);
    const heading=document.createElement('div');heading.className='revealed-heading';
    const avatar=revealAvatar(seat,round);
    const name=document.createElement('strong');name.textContent=playerAt(seat,round).name;
    const count=document.createElement('span');count.textContent='剩 '+cards.length+' 张';heading.append(avatar,name,count);
    const row=document.createElement('div');row.className='revealed-cards';row.setAttribute('aria-label',playerAt(seat,round).name+'的剩余手牌');
    row.append(...cards.map(card=>imageFor(card.face,card.label+(card.isWild?' 逢人配':''))));
    group.append(heading,row);list.append(group);
  }
}

function renderScores(section,score,round=liveRound){
  section.hidden=!score;section.replaceChildren();if(!score)return;
  const title=document.createElement('h3');title.textContent='本副积分 · 按玩家累计';section.append(title);
  const table=document.createElement('table'),head=document.createElement('tr');
  for(const label of ['玩家','名次分','拖三分','余牌分','本副','累计']){const th=document.createElement('th');th.textContent=label;th.scope='col';head.append(th);}
  const thead=document.createElement('thead');thead.append(head);table.append(thead);
  const body=document.createElement('tbody');
  for(const row of score.rows){
    const tr=document.createElement('tr');tr.className=seatStyle(row.seat,round);
    for(const [index,value] of [row.name,...['placement','drag','remainder','delta','total'].map(key=>signed(row[key]))].entries()){
      const cell=document.createElement(index===0?'th':'td');cell.textContent=value;if(index===0)cell.scope='row';tr.append(cell);
    }body.append(tr);
  }table.append(body);section.append(table);
  const details=document.createElement('div');details.className='score-details';
  for(const detail of score.details){
    const line=document.createElement('p');line.textContent=detail.label+'：'+signed(detail.value)+' 分'+(detail.cards.length?'（'+detail.cards.map(GuandanCore.cardLabel).join('、')+'）':'');details.append(line);
  }
  const note=document.createElement('p');note.textContent='以上每项由本副搭档共同加减，另一队反向记分。';details.append(note);section.append(details);
}

function downloadText(filename,text){
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');
  link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function reportError(error,kind='action'){
  if(kind==='model'&&fault&&faultKind!=='model')return;
  faultKind=kind;
  fault=error?.message||String(error);byId('error-message').textContent=fault;
  byId('error-banner').hidden=false;byId('retry-model').disabled=!liveRound;
  dealMotion.finish();
  renderGame();
}
function clearError(kind){if(kind&&faultKind!==kind)return;fault=null;faultKind=null;byId('error-banner').hidden=true;}
function stopBots(){
  clearTimeout(botTimer);botTimer=null;
  if(activeTask==='npc'){workEpoch++;activeTask=null;model.cancel();}
}
function openDialog(dialog,trigger){
  if(dialog.open)return;dealMotion.finish();stopBots();dialogFocus.set(dialog,trigger);dialog.showModal();renderGame();
}
function closeDialog(dialog,focusTarget){if(focusTarget)dialogFocus.set(dialog,focusTarget);dialog.close();}
function updateSelection(){
  const held=new Set(ownHand().map(card=>card.id));selected=new Set([...selected].filter(id=>held.has(id)));
  const result=selected.size&&liveRound?.canAct?liveRound.selection([...selected],0,playKey):null;
  const isTribute=liveRound&&liveRound.phase!=='playing';
  const waitingTribute=liveRound?.needsTributeConfirmation;
  const title=selected.size?'已选 '+selected.size+' 张':!liveRound?'存档待恢复':waitingTribute?(liveRound.isTuo3?'请确认翻牌与搭档':'请确认桌面贡还结果'):isTribute?(liveRound.canAct?(liveRound.phase==='give'?'请选择进贡牌':'请选择还贡牌'):'等待'+playerAt(liveRound.actingSeat).name+(liveRound.phase==='give'?'进贡':'还贡')):canPlay()?'请选择手牌':ownHand().length?'请等待':'你的手牌已出完';
  const note=document.createElement('span');note.textContent=result?.error||result?.play?.label||(paused?'对局已暂停':fault?'请先处理上方提示':waitingTribute?'看清后点击「开始出牌」':isTribute?(liveRound.canAct?'合法贡还牌已标记':'你暂时无需操作'):canPlay()?'或点击「看建议」':activeTask==='npc'?'模型正在思考':'可查看本局记录');
  byId('selection-status').replaceChildren(document.createTextNode(title),note);
  byId('play-button').disabled=!canPlay()||!(result?.play||result?.tribute);
  byId('play-button').textContent=isTribute?(liveRound.phase==='give'?'确认进贡':'确认还贡'):'出牌 ↗';
  byId('pass-button').disabled=!canPlay()||isTribute||!liveRound?.game.tablePlay;
  byId('hint-button').disabled=!canPlay()||isTribute||Boolean(activeTask);
  byId('clear-selection').disabled=selected.size===0;
  const allowed=isTribute?new Set(liveRound.canAct?liveRound.tributeChoices.map(card=>card.id):[]):null;
  cardNodes.forEach((button,id)=>{
    const on=selected.has(id);button.classList.toggle('selected',on);button.setAttribute('aria-pressed',String(on));
    button.disabled=!canPlay()||(allowed&&!allowed.has(id));
    button.classList.toggle('unavailable',Boolean(allowed&&!allowed.has(id)));button.classList.toggle('playable-tribute',Boolean(allowed?.has(id)));
  });
  const picker=byId('play-kind'),choices=result?.plays||[];
  picker.hidden=choices.length<2;picker.replaceChildren();
  for(const play of choices){const option=document.createElement('option');option.value=play.key;option.textContent=play.label;picker.append(option);}
  if(result?.play)picker.value=result.play.key;
  window.tableView?.sync();
}
function renderGame(){
  if(byId('toast').classList.contains('visible'))placeToast();
  const legacyRules=byId('legacy-tuo3-rules');if(legacyRules)legacyRules.hidden=!liveRound?.isTuo3;
  if(!liveRound){byId('hand-count').textContent='—';updateSelection();return;}
  const game=liveRound.game,state=liveRound.state;renderTable();renderTribute();
  root.classList.toggle('tuo3-mode',liveRound.isTuo3);
  byId('classic-score').hidden=liveRound.isTuo3;byId('tuo3-score').hidden=!liveRound.isTuo3;
  if(liveRound.isTuo3){byId('my-points').textContent=signed(state.tuo3.totals[0]);byId('current-partner').textContent=liveRound.names[2];}
  byId('our-level').textContent=state.levels[0];byId('their-level').textContent=state.levels[1];
  byId('round-label').textContent=(liveRound.isTuo3?'拖 3 · ':'')+'第'+state.round+'副';byId('current-level').textContent=state.level;byId('wild-reference').textContent='♥'+state.level+' 逢人配';
  document.querySelector('.hand-pane').hidden=Boolean(game.result);byId('round-end-banner').hidden=!game.result;
  document.querySelector('.play-zone').classList.toggle('is-round-over',Boolean(game.result));
  renderFinalPlay(byId('round-final-play'),liveRound.finalPlay);
  renderRevealedHands(byId('round-reveal'),liveRound.revealedHands);
  renderScores(byId('round-score'),state.tuo3?.settlement);
  byId('pause-button').setAttribute('aria-pressed',String(paused));byId('pause-button').textContent=paused?'继续':'暂停';
  const actor=playerAt(liveRound.actingSeat)?.name||'';
  let turn=game.result?'本局已结束':paused?'对局已暂停':fault?'请处理提示':dealMotion.active?'正在发牌':liveRound.needsTributeConfirmation?(liveRound.isTuo3?'看清分组后开始':'看清贡还后开始'):liveRound.phase==='give'?actor+'进贡':liveRound.phase==='return'?actor+'还贡':liveRound.confirmWaiting?'等待其他玩家确认':liveRound.actingSeat===0?'轮到你出牌':actor+'正在思考';
  document.querySelector('.turn-pill strong').textContent=turn;
  if(game.result){byId('round-end-banner').querySelector('h2').textContent=(game.result.winnerTeam===0?'我方':'对方')+(liveRound.isTuo3?'取得头游':'获胜');byId('round-end-banner').querySelector('p').textContent=game.result.summary;}
  byId('engine-indicator').textContent=fault?'需要处理提示':activeTask==='health'?'正在加载离线模型…':model.ready?'DanLM · 离线就绪':'模型等待加载';
  resizeHand(false);renderHand();window.GuandanLan?.controls();
}
function saveAction(action){
  stopBots();if(!liveRound)return;clearToast();
  const oldState=liveRound.state,oldRevision=liveRound.revision;
  try{
    action();liveRound.persist(localStorage);
  }catch(error){liveRound.state=oldState;liveRound.revision=oldRevision;reportError(error,'save');return;}
  selected.clear();playKey=null;hintSnapshot=null;clearError();renderGame();
  if(liveRound.game.result){
    try{GuandanMatch.archive(localStorage,liveRound);}catch{toast('本局已保存，历史复盘暂未保存。请导出备份后再继续。');}
  }else scheduleBots();
}
function scheduleBots(){
  clearTimeout(botTimer);botTimer=null;
  if(!liveRound||liveRound.remote||liveRound.game.result||liveRound.needsTributeConfirmation||paused||fault||dealMotion.active||hasOpenDialog()||document.hidden||liveRound.actingSeat===0||activeTask)return;
  const id=liveRound.id,revision=liveRound.revision,seat=liveRound.actingSeat;
  botTimer=setTimeout(async()=>{
    botTimer=null;if(!liveRound||id!==liveRound.id||revision!==liveRound.revision||liveRound.needsTributeConfirmation||paused||fault||dealMotion.active||hasOpenDialog()||document.hidden)return;
    if(liveRound.phase!=='playing'){
      const choices=liveRound.tributeChoices;
      if(!choices.length){reportError(new Error('没有合法的贡还牌，请导出存档检查。'));return;}
      saveAction(()=>liveRound.commit(seat,[choices[0].id],{expectedRevision:revision,automatic:true}));return;
    }
    const epoch=++workEpoch;activeTask='npc';renderGame();
    try{
      const rawResponse=await model.request({observation:liveRound.observation(seat),provider:'danlm',book:prefs.book,variant:liveRound.state.ruleMode});
      if(epoch!==workEpoch||id!==liveRound.id||revision!==liveRound.revision||paused||dealMotion.active||hasOpenDialog()||document.hidden)return;
      const response=liveRound.adaptModel(rawResponse,seat);
      activeTask=null;saveAction(()=>liveRound.commitModel(response,revision,seat));
    }catch(error){if(epoch===workEpoch){activeTask=null;reportError(new Error('AI 计算失败：'+error.message),'model');}}
    finally{if(epoch===workEpoch){activeTask=null;renderGame();}}
  },600);
}
async function checkModel(){
  if(window.GuandanLan?.active){await window.GuandanLan.reconnect();return;}
  stopBots();if(activeTask)model.cancel();activeTask='health';const epoch=++workEpoch;
  byId('recheck-model').disabled=true;byId('model-status').textContent='正在检查本机模型…';renderGame();
  try{
    const response=await model.request({health:true});
    if(epoch!==workEpoch)return;if(!response.ready)throw new Error('模型没有就绪');
    clearError('model');byId('model-status').textContent='程序内置模型已加载 · 离线运行，无需联网';
  }catch(error){if(epoch===workEpoch){byId('model-status').textContent=error.message;reportError(error,'model');}}
  finally{if(epoch===workEpoch){activeTask=null;byId('recheck-model').disabled=false;renderGame();scheduleBots();}}
}
let displayedAdvice=null;
function addTeachingDetails(title,lines,{open=false}={}){
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=title;details.open=open;details.append(summary);
  for(const line of lines.filter(Boolean)){const p=document.createElement('p');p.textContent=line;details.append(p);}byId('teaching-details').append(details);
}
async function openAdvice(trigger){
  if(!canPlay()||liveRound.phase!=='playing'||activeTask)return;
  const revision=liveRound.revision,id=liveRound.id,checked=selected.size?liveRound.selection([...selected],0,playKey):null;
  const chosen=checked?.play?{type:'play',play:checked.play,score:0}:!selected.size&&liveRound.game.tablePlay?{type:'pass',score:0}:undefined;
  openDialog(byId('analysis-dialog'),trigger);
  displayedAdvice=null;byId('advice-title').textContent='正在分析这一手…';byId('advice-reason').textContent='只使用你的手牌和公开信息。';byId('adopt-from-dialog').disabled=true;
  byId('teaching-details').replaceChildren();byId('suggested-cards').replaceChildren();
  const epoch=++workEpoch;activeTask='teaching';renderGame();
  try{
    const rawResponse=liveRound.remote?await window.GuandanLan.command('advice'):await model.request({observation:liveRound.observation(0),selected:chosen,teaching:true,provider:'danlm',book:prefs.book,variant:liveRound.state.ruleMode});
    if(epoch!==workEpoch||revision!==liveRound.revision||id!==liveRound.id||!byId('analysis-dialog').open)return;
    const response=liveRound.adaptModel(rawResponse,0);
    const candidate=response.result?.candidates?.[0];if(!candidate)throw new Error('没有获得推荐打法');
    const ids=candidate.play?.cards.map(card=>card.id)||[];
    if(ids.length&&liveRound.selection(ids,0,candidate.play.key).error)throw new Error('模型返回了无效的牌，请重新计算');
    if(!ids.length&&!liveRound.game.tablePlay)throw new Error('模型返回了无效的不出动作');
    const notes=response.notes||[],advanced=response.advanced;
    const line=typeof notes[0]==='string'?notes[0]:advanced?.judgement||'这是模型对当前局面的推荐。';
    hintSnapshot={roundId:id,revision,ids,key:candidate.play?.key,label:candidate.play?.label||'不出',reason:line,engine:response.result.engine};
    displayedAdvice={response,candidate,notes,advanced,line};renderAdviceContent();
  }catch(error){if(epoch===workEpoch){byId('advice-title').textContent='这次计算未完成';byId('advice-reason').textContent=error.message+'。关闭面板后可再次查看建议。';}}
  finally{if(epoch===workEpoch){activeTask=null;renderGame();}}
}

function renderAdviceContent(){
  if(!displayedAdvice)return;
  const {response,candidate,notes,advanced,line}=displayedAdvice,ids=candidate.play?.cards.map(c=>c.id)||[];
  byId('teaching-details').replaceChildren();
    byId('advice-title').textContent=candidate.play?'出'+candidate.play.label:'建议不出';
    byId('advice-reason').textContent=line;byId('advice-source').textContent=liveRound.isTuo3?'DanLM + 拖3规则筛选 · 权重未针对拖3重训':'DanLM'+(prefs.book?' + 秘籍策略':'')+' · 解释来自教学层，评分不等于胜率';
    byId('suggested-cards').replaceChildren(...(candidate.play?.cards||[]).map(card=>imageFor(GuandanMatch.decorate(card).face,GuandanCore.cardLabel(card))));
    byId('adopt-from-dialog').textContent=ids.length?'选中推荐':'返回并确认不出';byId('adopt-from-dialog').disabled=false;
    addTeachingDetails('推荐依据',notes.filter(item=>typeof item==='string'),{open:true});
    if(response.selectedNotes?.length)addTeachingDetails('与你当前选择的比较',response.selectedNotes.filter(item=>typeof item==='string'));
    if(advanced){
      addTeachingDetails('接下来怎么走',advanced.plan||[]);
      addTeachingDetails('候选打法与余牌拆分',(advanced.options||[]).map(option=>option.label+'：剩约'+option.hands+'手；'+(option.groups||[]).map(group=>group.label).join('、')));
      const book=advanced.book||response.result.book;
      if(book)addTeachingDetails('秘籍依据与适用条件',(book.rows?.[0]?.evidence||[]).map(item=>item.reason));
      addTeachingDetails('公开信息与采样边界',[...(advanced.publicMemory||[]),advanced.caution,response.result.warning]);
    }
  if(GuandanI18n.locale==='en'){
    const t=GuandanI18n.t,play=candidate.play,table=liveRound.game.tablePlay;
    byId('advice-title').textContent=play?'Play '+t(play.label):'Pass recommended';
    byId('advice-reason').textContent=play?`Play ${play.cards.length} cards, leaving ${liveRound.hand.length-play.cards.length} in your hand.`:
      table?.owner===2?'Your partner controls the trick. Passing lets them keep the lead and preserves your cards.':'Pass this turn and keep your current hand.';
    byId('teaching-details').replaceChildren();
    addTeachingDetails('Recommendation and context',[
      'DanLM ranked the legal candidate moves using your hand and public information.'+(prefs.book?' Strategy-book guidance is enabled.':''),
      table?`${t(playerAt(table.owner).name)} currently leads with ${t(table.play.label)}.`:'You are leading a new trick.',
      `Remaining cards: ${liveRound.game.players.map((p,i)=>t(playerAt(i).name)+' '+p.hand.length).join(' · ')}.`,
      'This is a factual teaching summary, not the neural network’s internal reasoning. Model scores are not win probabilities.'
    ],{open:true});
    const options=response.result?.candidates||[];
    addTeachingDetails('Model candidates',options.slice(0,5).map(item=>(item.play?t(item.play.label):'Pass')+(Number.isFinite(item.score)?' · score '+Number(item.score).toFixed(3):'')));
    if(advanced?.options?.length)addTeachingDetails('Remaining combinations',advanced.options.map(option=>`${t(option.label)}: about ${option.hands} combinations left. ${(option.groups||[]).map(g=>t(g.label)).join(', ')}`));
    addTeachingDetails('Information limits',['Other players’ hidden hands are not available to the acting model. Sampling unseen cards does not establish a win rate.']);
  }
}
window.addEventListener('guandan-language-change',()=>{if(byId('analysis-dialog').open&&displayedAdvice)renderAdviceContent();});

function adoptAdvice(){
  if(!hintSnapshot||hintSnapshot.roundId!==liveRound.id||hintSnapshot.revision!==liveRound.revision||!canPlay())return;
  selected=new Set(hintSnapshot.ids);playKey=hintSnapshot.key;updateSelection();
  closeDialog(byId('analysis-dialog'),cardNodes.get(hintSnapshot.ids[0])||byId('pass-button'));
  toast(selected.size?'已选中推荐，请确认出牌。':'请点击「不出」确认。');
}
function openHistory(trigger){
  const list=byId('history-list');list.replaceChildren();
  if(!liveRound)return;
  for(const note of liveRound.state.notice||[]){const p=document.createElement('p');p.textContent=note;list.append(p);}
  for(const event of liveRound.events){const row=document.createElement('p');row.className='seat-'+event.seat;
    for(const [tag,text] of [['b',(event.index+1)+'. '+playerAt(event.seat).name],['span',event.label],['span','剩'+event.remaining[event.seat]+'张']]){const child=document.createElement(tag);child.textContent=text;row.append(child);}list.append(row);}
  if(!list.childElementCount){const p=document.createElement('p');p.textContent='本局尚未出牌。';list.append(p);}openDialog(byId('history-dialog'),trigger);
}
function exportSave(){
  if(liveRound?.remote){downloadText('掼蛋-联机复盘.json',JSON.stringify(liveRound.snapshot(),null,2));return;}
  downloadText('掼蛋-存档备份-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({exportedAt:new Date().toISOString(),game:localStorage.getItem(GuandanMatch.SAVE_KEY),reviews:localStorage.getItem(GuandanMatch.ARCHIVE_KEY)},null,2));
}
function replaceMatch(next){next.persist(localStorage);dealMotion.cancel();liveRound=next;selected.clear();playKey=null;hintSnapshot=null;cardNodes.clear();clearToast();clearError();renderGame();beginDealAnimation();scheduleBots();}

byId('theme-day').addEventListener('click',()=>{setTheme('day');prefs.theme='day';savePrefs();});
byId('theme-night').addEventListener('click',()=>{setTheme('night');prefs.theme='night';savePrefs();});
byId('large-type').addEventListener('click',()=>{prefs.large=root.classList.toggle('large-type');byId('large-type').setAttribute('aria-pressed',String(prefs.large));savePrefs();});
byId('pause-button').addEventListener('click',()=>{if(window.GuandanLan?.active){window.GuandanLan.command('pause').catch(()=>{});return;}paused=!paused;prefs.paused=paused;savePrefs();dealMotion.finish();stopBots();renderGame();if(!paused)scheduleBots();});
byId('confirm-tribute').addEventListener('click',()=>{
  if(!liveRound?.needsTributeConfirmation||paused||fault||dealMotion.active)return;
  if(liveRound.remote){window.GuandanLan.command('ack').catch(()=>{});return;}
  saveAction(()=>liveRound.acknowledgeTribute());
  if(!liveRound.needsTributeConfirmation)byId('hand-scroll').focus({preventScroll:true});
});
byId('clear-selection').addEventListener('click',()=>{clearToast();selected.clear();playKey=null;updateSelection();});
byId('play-kind').addEventListener('change',event=>{clearToast();playKey=event.target.value;updateSelection();});
byId('play-button').addEventListener('click',()=>{if(canPlay()){const ids=[...selected],key=playKey,teaching=hintSnapshot?.revision===liveRound.revision?hintSnapshot:null;if(liveRound.remote)window.GuandanLan.command('play',{ids,key}).catch(()=>{});else saveAction(()=>liveRound.commit(0,ids,{key,teaching}));}});
byId('pass-button').addEventListener('click',()=>{if(canPlay()&&liveRound.phase==='playing'&&liveRound.game.tablePlay){const teaching=hintSnapshot?.revision===liveRound.revision?hintSnapshot:null;if(liveRound.remote)window.GuandanLan.command('play',{ids:[]}).catch(()=>{});else saveAction(()=>liveRound.commit(0,[],{teaching}));}});
byId('hint-button').addEventListener('click',event=>openAdvice(event.currentTarget));
byId('adopt-from-dialog').addEventListener('click',adoptAdvice);
byId('close-analysis').addEventListener('click',()=>closeDialog(byId('analysis-dialog')));
byId('return-table').addEventListener('click',()=>closeDialog(byId('analysis-dialog')));
byId('open-history').addEventListener('click',event=>openHistory(event.currentTarget));
byId('close-history').addEventListener('click',()=>closeDialog(byId('history-dialog')));
byId('next-round').addEventListener('click',()=>{
  if(liveRound?.remote){window.GuandanLan.command('next').catch(()=>{});return;}
  stopBots();
  try{GuandanMatch.archive(localStorage,liveRound);}catch{
    confirmMode='skip-archive';byId('confirm-title').textContent='历史复盘暂时无法保存';
    byId('new-game-warning').textContent='当前牌局仍保存在本机。可先到设置中导出存档备份，或选择不保留这局的历史复盘并进入下一副。'+(liveRound.isTuo3?'个人积分会继续累计。':'双方级别会继续累计。');
    byId('confirm-new').textContent='不保留本局历史，开始下一副';openDialog(byId('confirm-dialog'),byId('next-round'));return;
  }
  try{replaceMatch(liveRound.next());}catch(error){reportError(error,'save');}
});
byId('open-settings').addEventListener('click',event=>openDialog(byId('settings-dialog'),event.currentTarget));
byId('book-enabled').checked=prefs.book!==false;
byId('book-enabled').addEventListener('change',event=>{prefs.book=event.target.checked;hintSnapshot=null;savePrefs();});
byId('deal-animation-enabled').checked=prefs.dealAnimation!==false;
byId('deal-animation-enabled').addEventListener('change',event=>{prefs.dealAnimation=event.target.checked;savePrefs();});
byId('recheck-model').addEventListener('click',checkModel);
byId('retry-model').addEventListener('click',()=>{clearError();try{liveRound?.persist(localStorage);}catch(error){reportError(error);return;}checkModel();});
byId('export-save').addEventListener('click',exportSave);byId('export-raw').addEventListener('click',exportSave);
function requestNewGame(event){
  confirmMode='restart';byId('confirm-title').textContent='开始全新的游戏';
  byId('new-game-warning').textContent='确认后结束当前牌局，重新发牌并回到第 1 副，双方从 2 开始升级。已完成的历史复盘保留。';
  byId('confirm-new').textContent='开始经典掼蛋';
  if(window.GuandanLan?.active){byId('new-game-warning').textContent='结束当前联机牌局，双方从 2 重新开始，并重新随机分位。';byId('confirm-new').textContent='开始联机新游戏';}
  openDialog(byId('confirm-dialog'),event.currentTarget);
}
const settingsRules=document.createElement('details'),rulesTitle=document.createElement('summary');rulesTitle.textContent='拖 3 规则与积分';settingsRules.append(rulesTitle);
settingsRules.id='legacy-tuo3-rules';settingsRules.hidden=!liveRound?.isTuo3;
for(const text of TUO3_RULES){const p=document.createElement('p');p.textContent=text;settingsRules.append(p);}
byId('settings-dialog').querySelector('.dialog-bottom').before(settingsRules);
byId('lan-new-game').addEventListener('click',requestNewGame);
byId('new-game').addEventListener('click',requestNewGame);
byId('confirm-new').addEventListener('click',()=>{
  if(typeof window!=='undefined'&&window.GuandanLan?.active){window.GuandanLan.command('new').then(result=>{if(result){closeDialog(byId('confirm-dialog'));closeDialog(byId('lan-dialog'));}}).catch(()=>{});return;}
  try{
    stopBots();
    if(confirmMode==='skip-archive')replaceMatch(liveRound.next());
    else{
      const raw=localStorage.getItem(GuandanMatch.SAVE_KEY);if(raw)localStorage.setItem(GuandanMatch.SAVE_KEY+'-before-restart',raw);
      replaceMatch(GuandanMatch.create('classic'));paused=false;prefs.paused=false;savePrefs();
    }
    closeDialog(byId('confirm-dialog'));if(byId('lan-dialog').open)closeDialog(byId('lan-dialog'));if(byId('settings-dialog').open)closeDialog(byId('settings-dialog'));if(!model.ready&&!activeTask)checkModel();
  }catch(error){reportError(error,'save');}
});
document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.addEventListener('close',()=>{
    if(dialog.id==='analysis-dialog'&&activeTask==='teaching'){workEpoch++;activeTask=null;model.cancel();}
    const target=dialogFocus.get(dialog);if(!hasOpenDialog()&&target?.isConnected&&!target.disabled)target.focus({preventScroll:true});renderGame();scheduleBots();
  });
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeDialog(dialog);});
});
document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>closeDialog(byId(button.dataset.closeDialog))));
byId('open-skins').addEventListener('click',event=>{selectSkinOption(currentSkin);openDialog(byId('skin-dialog'),event.currentTarget);});
byId('apply-skin').addEventListener('click',()=>{const saved=setCardSkin(pendingSkin);closeDialog(byId('skin-dialog'));toast('已使用'+SKINS[currentSkin].name+(saved?'。':'，偏好未能保存。'));});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&dealMotion.active&&!hasOpenDialog()){event.preventDefault();dealMotion.finish();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){dealMotion.finish();stopBots();}else scheduleBots();});
window.addEventListener('resize',()=>dealMotion.finish());
window.addEventListener('beforeunload',()=>{dealMotion.cancel();stopBots();model.cancel();});
new ResizeObserver(()=>resizeHand()).observe(byId('hand-scroll'));
function measureTable(){
  const zone=document.querySelector('.play-zone'),height=root.classList.contains('view-3d')&&!root.classList.contains('hand-expanded')?414:document.querySelector('.hand-pane').getBoundingClientRect().height;
  zone.style.setProperty('--hand-pane-height',height+'px');
  root.classList.toggle('compact-table',zone.clientHeight-height<460);
}
const tableObserver=new ResizeObserver(measureTable);
tableObserver.observe(document.querySelector('.hand-pane'));tableObserver.observe(document.querySelector('.play-zone'));
// Both views share these public data and the same existing card buttons.
window.GuandanTable=Object.freeze({
  snapshot(){return GuandanPresentation.project(liveRound,{hand:ownHand(),groups:arrangement.plans[arrangement.index]?.groups,skin:currentSkin,theme:root.dataset.theme,selected,enabled:canPlay(),allowed:liveRound&&liveRound.phase!=='playing'?new Set(liveRound.canAct?liveRound.tributeChoices.map(c=>c.id):[]):null,dealing:dealMotion.active,large:prefs.large,reduceMotion:prefs.dealAnimation===false||matchMedia('(prefers-reduced-motion: reduce)').matches});},
  buttons:()=>cardNodes,
  select:selectCard,
  layout(){resizeHand(false);renderHand();},
  notice:toast,
});

byId('arrange-hand').addEventListener('click',cycleArrangement);
buildSkinOptions();setCardSkin(currentSkin);setTheme(prefs.theme==='night'?'night':'day');
root.classList.toggle('large-type',Boolean(prefs.large));byId('large-type').setAttribute('aria-pressed',String(Boolean(prefs.large)));

window.addEventListener('guandan-language-change',()=>{
  document.querySelectorAll('.joker-label').forEach(label=>{const text=GuandanI18n.locale==='en'?'JOKER':label.dataset.joker==='BJ'?'大王':'小王';label.replaceChildren(...Array.from(text,ch=>{const span=document.createElement('span');span.textContent=ch;return span;}));});
  window.tableView?.sync();resizeHand();
});

renderGame();
if(loadError)reportError(loadError,'load');else{
  if(liveRound.loadWarning)byId('save-status').textContent=liveRound.loadWarning;
  try{liveRound.persist(localStorage);if(initialDeal)beginDealAnimation();}catch(error){reportError(error,'save');}checkModel();
}
