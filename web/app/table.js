 'use strict';
const root=document.documentElement,byId=id=>document.getElementById(id);
const SKINS={jumbo:{name:'经典大角标',note:'传统人物牌 · 红黑双色'},accessible:{name:'清晰四色',note:'四种花色 · 各有颜色'},minimal:{name:'极简纸牌',note:'干净牌面 · 更少装饰'}};
const SKIN_KEY='guandan.desktop.cardSkin.v1',PREFS_KEY='guandan.desktop.preferences.v1';
const PLAYERS=[{name:'你',avatar:null},{name:'青岚',avatar:'assets/avatars/qing-lan.png'},{name:'知秋',avatar:'assets/avatars/zhi-qiu.png'},{name:'墨白',avatar:'assets/avatars/mo-bai.png'}];
let prefs={theme:'day',large:false,book:true,paused:false,dealAnimation:true,handStyle:'flat',arrangePriority:'balanced'};
let currentSkin='jumbo',pendingSkin='jumbo';
try{const previous=JSON.parse(localStorage.getItem('guandan-engine-choices')||'null');if(previous?.book===false)prefs.book=false;Object.assign(prefs,JSON.parse(localStorage.getItem(PREFS_KEY)||'{}'));const saved=localStorage.getItem(SKIN_KEY);if(Object.hasOwn(SKINS,saved))currentSkin=saved;}catch{}
// Existing solo games used one switch for bots and advice. Preserve that choice
// on upgrade, then store the two preferences independently.
if(typeof prefs.aiBook!=='boolean')prefs.aiBook=prefs.book!==false;
prefs.handStyle=prefs.handStyle==='fan'?'fan':'flat';root.dataset.handStyle=prefs.handStyle;
if(!Object.hasOwn(GuandanArrange.priorities,prefs.arrangePriority))prefs.arrangePriority='balanced';
let liveRound=null,loadError=null,initialDeal=false;
try{initialDeal=!localStorage.getItem(GuandanMatch.SAVE_KEY);liveRound=GuandanMatch.read(localStorage);}catch(error){loadError=error;}
let selected=new Set(),toastTimer,botTimer,botWait=null,hintSnapshot=null,playKey=null,pendingDeclaration=null,handLayout=null,handEditor=null,handMarquee=null,handSelection=null,renderedHandKey='';
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
function arrangementKey(){return liveRound?.id+'|'+liveRound?.level+'|'+prefs.arrangePriority+'|'+(liveRound?.hand||[]).map(c=>c.id).sort().join(',');}
function layoutKey(){return (liveRound?.remote?'lan:':'solo:')+liveRound?.id+'|'+(liveRound?.playerIds?.[0]??0);}
function currentLayout(){
  const key=layoutKey(),hand=liveRound?.hand||[];
  handLayout=handLayout?.key===key?GuandanHandLayout.reconcile(handLayout,key,hand):GuandanHandLayout.load(localStorage,key,hand);
  return handLayout;
}
function storeLayout(next){
  handLayout=next;
  try{GuandanHandLayout.save(localStorage,next);}catch{toast('牌序已调整，但未能保存到本机。');}
}
function commitLayout(next){storeLayout(next);arrangement.index=-1;resizeHand();renderHand();window.tableView?.sync();}
function displayLayout(){return liveRound?.game.result?GuandanHandLayout.create(layoutKey(),liveRound.hand):currentLayout();}
function ownHand(){
  const hand=liveRound?.hand||[];
  if(arrangement.key!==arrangementKey())arrangement={key:arrangementKey(),plans:[],index:-1};
  return GuandanHandLayout.ordered(displayLayout(),hand);
}
function cycleArrangement(){
  if(!canArrange())return;
  ownHand(); // Invalidate cached plans after cards, round or priority change.
  if(!arrangement.plans.length)arrangement.plans=GuandanArrangeSearch.plans(liveRound.hand,liveRound.level,{priority:prefs.arrangePriority});
  if(!arrangement.plans.length)return;
  const index=(arrangement.index+1)%arrangement.plans.length;
  handEditor.replace(GuandanHandLayout.fromPlan(layoutKey(),liveRound.hand,arrangement.plans[index]));
  arrangement.index=index;renderArrangement();
}
function renderArrangement(){
  ownHand();
  const plan=arrangement.plans[arrangement.index],summary=byId('arrangement-summary');
  summary.replaceChildren();
  const arrangeLabel=document.createElement('span');arrangeLabel.textContent='理牌';
  const arrangeCount=document.createElement('span');arrangeCount.className='arrange-cycle';arrangeCount.setAttribute('aria-hidden','true');
  arrangeCount.textContent=plan?(arrangement.index+1)+'/'+arrangement.plans.length:'';
  byId('arrange-hand').replaceChildren(arrangeLabel,arrangeCount);
  if(liveRound?.game.result)return;
  for(const id of ['arrange-hand','arrange-priority','sort-hand'])byId(id).disabled=!canArrange();
  if(plan){
    const status=document.createElement('strong');status.className='arrangement-status';
    const missing={flush:'未找到同花顺',bomb:'未找到炸弹',runs:'未找到顺连',pairs:'未找到对子'};
    status.textContent=(plan.matches===0?missing[prefs.arrangePriority]+' · ':'')+'组合 '+(arrangement.index+1)+' / '+arrangement.plans.length;
    summary.append(status);
  }
}
const canPlay=()=>Boolean(liveRound?.canAct&&!handEditor?.editing&&!handMarquee?.active&&!paused&&!fault&&!dealMotion.active&&(!liveRound.remote||window.GuandanLan?.ready));
const canArrange=()=>Boolean(liveRound?.hand.length&&!liveRound.game.result&&!dealMotion.active);
// Choosing and arranging are private preparation, independent of whose turn
// it is, model availability, pause state or a pending LAN response.
const canSelect=()=>canArrange()&&!handEditor?.editing&&!handMarquee?.active;
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
function setSelection(ids){
  const held=new Set(ownHand().map(card=>card.id));
  selected=new Set(ids.filter(id=>held.has(id)));
  playKey=null;hintSnapshot=null;clearToast();updateSelection();
}
function selectCard(id,event){
  handSelection.choose(id,event);
}
function renderHand(){
  const hand=ownHand(),container=byId('hand-cards'),layout=displayLayout();
  GuandanCore.setLevel(liveRound?.level||'2');
  handEditor?.reconcile();
  handMarquee?.reconcile();
  const key=JSON.stringify([layout,liveRound?.level,Boolean(liveRound?.game.result)]);
  // Opponent turns must not detach the pressed card or steal touch capture.
  // The public table updates freely while the unchanged hand keeps its nodes.
  if(key===renderedHandKey&&cardNodes.size===hand.length&&hand.every(card=>cardNodes.has(card.id))){renderArrangement();updateSelection();return;}
  renderedHandKey=key;
  const previousFocus=document.activeElement?.closest('.playing-card')?.dataset.id;
  const previousPosition=[...container.querySelectorAll('.playing-card')].findIndex(button=>button.dataset.id===previousFocus);
  const liveIds=new Set(hand.map(card=>card.id));
  for(const [id] of cardNodes)if(!liveIds.has(id))cardNodes.delete(id);
  const duplicates=new Map(),ordinals=new Map(),rows=[];
  hand.forEach(card=>duplicates.set(card.face,(duplicates.get(card.face)||0)+1));
  for(const tier of liveRound?.game.result?[1]:[0,1]){
    const row=document.createElement('div');row.className='card-row'+(!layout.rows[tier].length?' is-empty':'');row.dataset.row=tier;row.setAttribute('role','group');row.setAttribute('aria-label',tier===0?'上排手牌':'下排手牌');rows.push(row);
    const label=document.createElement('span');label.className='hand-tier-label';label.textContent=tier===0?'上排':'下排';row.append(label);
    for(const segment of GuandanHandLayout.segments(layout,tier)){
      const cluster=document.createElement('div');cluster.className='hand-cluster';row.append(cluster);
      if(segment.groupIndex>=0){
        const plays=GuandanPlayChoices.strongestFirst(GuandanCore.recognize(segment.ids.map(id=>hand.find(card=>card.id===id))));
        const play=plays[0],style=GuandanPresentation.combinationStyle(play);
        cluster.classList.add('saved-group');cluster.classList.toggle('small-group',segment.ids.length<=3);cluster.style.setProperty('--group-color',style.color);cluster.dataset.rarity=style.rarity;
        const marker=document.createElement('span');marker.className='group-marker';marker.setAttribute('aria-hidden','true');cluster.append(marker);
        const action=document.createElement('button');action.type='button';action.className='group-action';
        const groupLabel=document.createElement('span');groupLabel.className='group-label';groupLabel.textContent=play?.label||'组合';
        const groupVerb=document.createElement('span');groupVerb.className='group-verb';groupVerb.textContent='打出组合';
        action.append(groupLabel,groupVerb);
        action.dataset.ids=JSON.stringify(segment.ids);action.dataset.layoutKey=layout.key;
        action.addEventListener('click',()=>playGroup(segment.ids,layout.key,action));cluster.append(action);
      }
    for(const id of segment.ids){
      const card=hand.find(card=>card.id===id);if(!card)continue;
      let button=cardNodes.get(card.id);
      const ordinal=(ordinals.get(card.face)||0)+1;ordinals.set(card.face,ordinal);
      if(!button){
        button=document.createElement('button');button.type='button';button.className='playing-card';button.dataset.id=card.id;
        button.setAttribute('aria-keyshortcuts','Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown');
        const img=imageFor(card.face);img.setAttribute('aria-hidden','true');button.append(img);
        const mark=document.createElement('span');mark.className='selected-mark';mark.textContent='✓';mark.setAttribute('aria-hidden','true');button.append(mark);
        if(card.suit==='joker'){
          button.classList.add(card.rank==='BJ'?'big-joker':'small-joker');
          const label=document.createElement('span');label.className='joker-label';label.setAttribute('aria-hidden','true');
          label.dataset.joker=card.rank;for(const character of (GuandanI18n.locale==='en'?'JOKER':card.label)){const line=document.createElement('span');line.textContent=character;label.append(line);}button.append(label);
        }
        if(card.isWild){const wild=document.createElement('span');wild.className='wild-label';wild.textContent='百搭';wild.setAttribute('aria-hidden','true');button.append(wild);}
        button.addEventListener('click',event=>selectCard(card.id,event));
        cardNodes.set(card.id,button);
      }
      button.setAttribute('aria-label',card.label+(card.isWild?' 逢人配':'')+(duplicates.get(card.face)>1?' 第'+ordinal+'张':''));
      const groupIndex=segment.groupIndex;button.classList.toggle('arranged',groupIndex>=0);button.style.removeProperty('--group-color');
      button.dataset.clusterStart=String(id===segment.ids[0]);
      cluster.append(button);
    }
    }
  }
  if(!hand.length){rows.length=0;const empty=document.createElement('p');empty.className='empty-hand-message';empty.textContent=liveRound?.game.result?'手牌已出完。':'手牌已出完，等待本局结束。';rows.push(empty);}
  container.replaceChildren(...rows);renderArrangement();byId('hand-count').textContent=hand.length;byId('hand-scroll').classList.toggle('empty-hand',!hand.length);updateSelection();
  if(previousFocus&&canArrange()){
    const target=cardNodes.get(previousFocus)||cardNodes.get(hand[Math.min(Math.max(previousPosition,0),hand.length-1)]?.id);
    target?.focus({preventScroll:true});
  }
}
function resizeHand(){
  const width=byId('hand-scroll').clientWidth-16;if(width<=0)return;
  const styles=getComputedStyle(root),cardWidth=parseFloat(styles.getPropertyValue('--hand-card-width')),baseStep=parseFloat(styles.getPropertyValue('--hand-step'));
  const layout=displayLayout(),counts=layout.rows.map((row,tier)=>({cards:row.length,clusters:GuandanHandLayout.segments(layout,tier).length}));
  const stylesHand=getComputedStyle(byId('hand-scroll')),gap=parseFloat(stylesHand.getPropertyValue('--hand-group-gap'))||18;
  const cardHeight=parseFloat(styles.getPropertyValue('--hand-card-height'));
  const header=parseFloat(stylesHand.getPropertyValue('--group-action-space'))||0;
  byId('hand-scroll').style.setProperty('--hand-shelf-height',GuandanHandFan.shelfHeight(cardWidth,cardHeight,header)+'px');
  const widthFor=(count,step)=>94+count.clusters*cardWidth+Math.max(0,count.cards-count.clusters)*step+Math.max(0,count.clusters-1)*gap;
  const fittedStep=Math.min(...counts.filter(count=>count.cards>count.clusters).map(count=>(width-widthFor(count,0))/(count.cards-count.clusters)));
  const step=Math.max(Math.min(baseStep,30),Math.min(baseStep,Math.floor(fittedStep*100)/100));
  byId('hand-scroll').style.setProperty('--hand-step',step+'px');
  byId('hand-scroll').style.setProperty('--hand-rows',2);
  byId('hand-cards').style.setProperty('--row-width',Math.max(0,...counts.map(count=>widthFor(count,step)))+'px');
}
function groupPlaySelection(ids,key){
  if(!canPlay()||hasOpenDialog()||liveRound.phase!=='playing'||key!==layoutKey()||ids.length<2)return null;
  const group=currentLayout().groups.find(group=>group.ids.length===ids.length&&group.ids.every(id=>ids.includes(id)));
  if(!group)return null;
  const result=liveRound.selection(ids,0);
  if(!result.play)return null;
  return {ids:[...ids],key:result.play.key};
}
function playGroup(ids,key,trigger){
  // Recheck membership, turn and legality at click time, including LAN updates.
  const choice=groupPlaySelection(ids,key);if(!choice)return;
  requestPlay(choice.ids,trigger||byId('play-button'));
}
function updateGroupActions(){
  if(!liveRound)return;
  GuandanCore.setLevel(liveRound.level);
  for(const button of byId('hand-cards').querySelectorAll('.group-action')){
    const ids=JSON.parse(button.dataset.ids),choice=groupPlaySelection(ids,button.dataset.layoutKey);
    button.disabled=!choice;
    const cards=ids.map(id=>liveRound.hand.find(card=>card.id===id)).filter(Boolean);
    const plays=GuandanPlayChoices.strongestFirst(GuandanCore.recognize(cards)),play=plays.find(play=>play.key===choice?.key)||plays[0];
    const note=play?.label||'这些牌暂不能组成有效牌型';
    button.title=choice?note:note+' · 当前不能打出组合';
    button.setAttribute('aria-label','打出组合 · '+note);
  }
}
function currentTurnStatus(){
  return GuandanPresentation.turnStatus(liveRound,{blocked:Boolean(paused||fault||dealMotion.active||(liveRound?.remote?window.GuandanLan?.turnMessage:hasOpenDialog()))});
}
function renderTable(){
  const game=liveRound.game,table=game.tablePlay,actions=GuandanPresentation.tableActions(game,liveRound.state.level);
  const turn=currentTurnStatus();
  for(let seat=0;seat<4;seat++){
    const action=actions[seat],anchor=seat===0?document.querySelector('.self-play-anchor'):document.querySelector('.player[data-seat="'+seat+'"] .seat-anchor');
    let play=anchor.querySelector('.table-play');
    if(!play){play=document.createElement('div');play.dataset.playSeat=seat;play.innerHTML='<div class="table-cards"></div><div class="table-caption"></div>';anchor.append(play);}
    play.hidden=!action||liveRound.phase!=='playing';
    play.className='table-play '+seatStyle(seat)+(action?.cards.length>4?' long-play':'')+(action?.type==='pass'?' is-pass':'')+(action?.latest?' is-latest':'')+(table?.owner===seat?' is-leading':'');
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
    player.classList.toggle('last-player',table?.owner===seat);player.classList.toggle('is-turn',turn?.seat===seat);
    player.classList.toggle('is-thinking',turn?.seat===seat&&turn.kind==='ai');
    const bubble=player.querySelector('.seat-bubble'),finished=game.players[seat].finished||Boolean(game.result),isTurn=player.classList.contains('is-turn');
    bubble.classList.toggle('recent-play',table?.owner===seat);
    bubble.hidden=liveRound.phase==='playing'&&!game.result&&!finished&&!isTurn&&Boolean(actions[seat]);
    bubble.textContent=finished?'第'+(game.finishOrder.indexOf(seat)+1)+'名':isTurn?turn.label:!game.actionHistory.length&&game.starter===seat?'本副先手':'等待出牌';
    if(liveRound.phase!=='playing')bubble.textContent=isTurn?turn.label:'等待贡还';
  });
}
function renderSeatRemainders(){
  const hands=liveRound.game.result?liveRound.revealedHands:[];
  for(const player of document.querySelectorAll('.player[data-seat]')){
    const seat=Number(player.dataset.seat),hand=hands.find(hand=>hand.seat===seat);
    let reveal=player.querySelector('.seat-remainder');
    if(!reveal){reveal=document.createElement('section');reveal.className='seat-remainder';
      player.querySelector('.seat-anchor').append(reveal);}
    reveal.replaceChildren();reveal.hidden=!hand;
    if(!hand)continue;
    reveal.setAttribute('aria-label',playerAt(seat).name+'的剩余手牌');
    const heading=document.createElement('div');heading.className='remainder-heading';heading.textContent='余牌';
    const count=document.createElement('b');count.textContent=hand.cards.length;heading.append(count,document.createTextNode('张'));reveal.append(heading);
    for(let index=0;index<hand.cards.length;index+=10){
      const row=document.createElement('div');row.className='remainder-row';
      for(const card of hand.cards.slice(index,index+10)){const img=imageFor(card.face,card.label);img.dataset.revealedId=card.id;row.append(img);}
      reveal.append(row);
    }
  }
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
  botWait?.cancel();botWait=null;
  if(activeTask==='npc'){workEpoch++;activeTask=null;model.cancel();}
}
function openDialog(dialog,trigger){
  if(dialog.open)return;handEditor?.cancel();handMarquee?.cancel();dealMotion.finish();stopBots();dialogFocus.set(dialog,trigger);dialog.showModal();renderGame();
}
function closeDialog(dialog,focusTarget){if(focusTarget)dialogFocus.set(dialog,focusTarget);dialog.close();}
function declarationIsCurrent(pending){
  return Boolean(pending&&pending.round===liveRound&&pending.revision===liveRound.revision&&canPlay()&&liveRound.phase==='playing'&&liveRound.selection(pending.ids,0,pending.key).play);
}
function syncDeclaration(){
  if(!pendingDeclaration||!byId('declare-dialog').open)return;
  const pending=pendingDeclaration,valid=pending.sending||declarationIsCurrent(pending);
  byId('confirm-declaration').disabled=pending.sending||!valid;
  byId('confirm-declaration').textContent=pending.sending?'正在出牌…':'确认出牌';
  byId('declare-options').querySelectorAll('input').forEach(radio=>{radio.disabled=pending.sending||!valid;});
  if(!valid){byId('declare-error').hidden=false;byId('declare-error').textContent='牌局或连接已变化，请返回牌桌重新声明。';}
}
function submitPlay(ids,key,round,revision){
  if(!canPlay()||liveRound!==round||liveRound.revision!==revision)return false;
  const checked=liveRound.selection(ids,0,key);if(checked.error)return false;
  if(liveRound.remote)return window.GuandanLan.command('play',{ids,key}).then(result=>Boolean(result));
  const teaching=hintSnapshot?.roundId===liveRound.id&&hintSnapshot.revision===revision?hintSnapshot:null;
  return saveAction(()=>liveRound.commit(0,ids,{key,expectedRevision:revision,teaching}));
}
function requestPlay(ids,trigger){
  if(!canPlay()||hasOpenDialog())return;
  const checked=liveRound.selection(ids,0);if(checked.error)return;
  const round=liveRound,revision=round.revision;
  if(!(checked.plays?.length>1)){
    Promise.resolve(submitPlay(ids,checked.play?.key,round,revision)).catch(()=>{});return;
  }
  // Opening the chooser is preparation only. Every ambiguous route, including
  // saved groups and adopted advice, requires a separate explicit confirmation.
  pendingDeclaration={round,revision,ids:[...ids],key:checked.play.key,sending:false};
  byId('declare-error').hidden=true;
  const strongest=GuandanPlayChoices.hasStrongest(checked.plays);
  byId('declare-note').textContent=strongest?'默认选中牌力较大的解释，确认后才出牌。':'不同牌型不能互相比较；同牌型按牌力排列。请确认本次打法。';
  const cards=byId('declare-cards');cards.replaceChildren();
  for(const card of ids.map(id=>ownHand().find(card=>card.id===id))){
    const item=document.createElement('span');item.className='declare-card';item.append(imageFor(card.face,card.label));
    if(card.isWild){const badge=document.createElement('b');badge.textContent='逢人配';item.append(badge);}cards.append(item);
  }
  const options=byId('declare-options');options.replaceChildren();
  const heading=document.createElement('p');heading.className='declare-options-heading';heading.textContent='声明牌型';options.append(heading);
  checked.plays.forEach((play,index)=>{
    const label=document.createElement('label');label.className='declare-option';
    const radio=document.createElement('input');radio.type='radio';radio.name='declared-play';radio.value=play.key;radio.checked=index===0;
    const copy=document.createElement('span'),heading=document.createElement('strong');heading.textContent=play.label;copy.append(heading);
    const sameType=checked.plays.filter(candidate=>candidate.type===play.type);
    if(index===0&&strongest||!strongest&&sameType.length>1&&sameType[0]===play){const badge=document.createElement('em');badge.textContent=strongest?'牌力较大':'同型较大';copy.append(badge);}
    const detail=document.createElement('small');detail.textContent=GuandanPlayChoices.describe(play);copy.append(detail);
    radio.addEventListener('change',()=>{if(pendingDeclaration&&!pendingDeclaration.sending){pendingDeclaration.key=play.key;syncDeclaration();}});
    label.append(radio,copy);options.append(label);
  });
  openDialog(byId('declare-dialog'),trigger);
  options.querySelector('input:checked').focus({preventScroll:true});
}
async function confirmDeclaration(){
  const pending=pendingDeclaration;
  if(!pending||pending.sending||!declarationIsCurrent(pending)){syncDeclaration();return;}
  pending.sending=true;syncDeclaration();
  try{
    const sent=await submitPlay(pending.ids,pending.key,pending.round,pending.revision);
    if(pendingDeclaration!==pending||!byId('declare-dialog').open)return;
    if(sent){closeDialog(byId('declare-dialog'));return;}
    byId('declare-error').textContent='未能出牌，请检查牌局状态后重试。';
  }catch(error){
    if(pendingDeclaration!==pending||!byId('declare-dialog').open)return;
    byId('declare-error').textContent=error.message||'未能出牌，请检查牌局状态后重试。';
  }
  finally{pending.sending=false;}
  byId('declare-error').hidden=false;syncDeclaration();
}
function updateSelection(){
  const held=new Set(ownHand().map(card=>card.id));selected=new Set([...selected].filter(id=>held.has(id)));
  const result=selected.size&&liveRound?.canAct?liveRound.selection([...selected],0,playKey):null;
  const isTribute=liveRound&&liveRound.phase!=='playing';
  const waitingTribute=liveRound?.needsTributeConfirmation;
  const title=selected.size?'已选 '+selected.size+' 张':!liveRound?'存档待恢复':waitingTribute?(liveRound.isTuo3?'请确认翻牌与搭档':'请确认桌面贡还结果'):isTribute?(liveRound.canAct?(liveRound.phase==='give'?'请选择进贡牌':'请选择还贡牌'):'等待'+playerAt(liveRound.actingSeat).name+(liveRound.phase==='give'?'进贡':'还贡')):canPlay()?'请选择手牌':ownHand().length?'请等待':'你的手牌已出完';
  const note=document.createElement('span');note.textContent=result?.error||result?.play?.label||(paused?'对局已暂停':fault?'请先处理上方提示':waitingTribute?'看清后点击「开始出牌」':isTribute?(liveRound.canAct?'合法贡还牌已标记':'你暂时无需操作'):canPlay()?'或点击「看建议」':activeTask==='npc'?'模型正在思考':'可查看本局记录');
  if(handMarquee?.active)note.textContent='松手完成框选 · Esc 取消';
  else if(handEditor?.editing)note.textContent='松手放下 · Esc 取消移动';
  else if(!selected.size&&canArrange()&&!isTribute)note.textContent=canPlay()?'按住拖动理牌':'可先选牌、理牌，轮到你再出牌';
  else if(selected.size&&!liveRound?.canAct&&!isTribute){
    GuandanCore.setLevel(liveRound.level);
    const preview=GuandanPlayChoices.strongestFirst(GuandanCore.recognize(ownHand().filter(card=>selected.has(card.id))));
    note.textContent=preview[0]?.label||'已选手牌，按住拖动理牌';
  }
  byId('selection-status').replaceChildren(document.createTextNode(handEditor?.editing&&!selected.size?'自由理牌中':title),note);
  byId('play-button').disabled=!canPlay()||!(result?.play||result?.tribute);
  byId('play-button').textContent=isTribute?(liveRound.phase==='give'?'确认进贡':'确认还贡'):result?.plays?.length>1?'声明出牌':'出牌 ↗';
  byId('play-button').title=result?.plays?.length>1?'这组牌有多种解释，点击后声明牌型':'';
  byId('pass-button').disabled=!canPlay()||isTribute||!liveRound?.game.tablePlay;
  byId('hint-button').disabled=!canPlay()||isTribute||Boolean(activeTask);
  byId('clear-selection').disabled=selected.size===0;
  const allowed=isTribute&&liveRound.canAct?new Set(liveRound.tributeChoices.map(card=>card.id)):null;
  cardNodes.forEach((button,id)=>{
    const on=selected.has(id);button.classList.toggle('selected',on);button.setAttribute('aria-pressed',String(on));
    button.disabled=!canArrange();
    button.classList.toggle('unavailable',Boolean(!handEditor?.editing&&allowed&&!allowed.has(id)));button.classList.toggle('playable-tribute',Boolean(!handEditor?.editing&&allowed?.has(id)));
  });
  updateGroupActions();syncDeclaration();
  window.tableView?.sync();
}
function renderGame(){
  if(byId('toast').classList.contains('visible'))placeToast();
  const legacyRules=byId('legacy-tuo3-rules');if(legacyRules)legacyRules.hidden=!liveRound?.isTuo3;
  if(!liveRound){byId('hand-count').textContent='—';updateSelection();return;}
  const game=liveRound.game,state=liveRound.state;
  if(game.result){selected.clear();playKey=null;}
  renderTable();renderTribute();
  root.classList.toggle('tuo3-mode',liveRound.isTuo3);
  byId('classic-score').hidden=liveRound.isTuo3;byId('tuo3-score').hidden=!liveRound.isTuo3;
  if(liveRound.isTuo3){byId('my-points').textContent=signed(state.tuo3.totals[0]);byId('current-partner').textContent=liveRound.names[2];}
  byId('our-level').textContent=state.levels[0];byId('their-level').textContent=state.levels[1];
  byId('round-label').textContent=(liveRound.isTuo3?'拖 3 · ':'')+'第'+state.round+'副';byId('current-level').textContent=state.level;byId('wild-reference').textContent='♥'+state.level+' 逢人配';
  document.querySelector('.hand-pane').hidden=false;byId('round-end-banner').hidden=!game.result;
  document.querySelector('.play-zone').classList.toggle('is-round-over',Boolean(game.result));
  document.querySelector('.arena-layout')?.classList.toggle('is-round-over',Boolean(game.result));
  renderSeatRemainders();
  byId('pause-button').setAttribute('aria-pressed',String(paused));byId('pause-button').textContent=paused?'继续':'暂停';
  const actor=playerAt(liveRound.actingSeat)?.name||'';
  const status=currentTurnStatus(),connection=liveRound.remote?window.GuandanLan?.turnMessage:'';
  let turn=game.result?'本局已结束':paused?'对局已暂停':fault?'请处理提示':connection|| (dealMotion.active?'正在发牌':liveRound.needsTributeConfirmation?(liveRound.isTuo3?'看清分组后开始':'看清贡还后开始'):liveRound.confirmWaiting?'等待其他玩家确认':liveRound.phase==='give'?actor+'进贡':liveRound.phase==='return'?actor+'还贡':status?.seat===0?'轮到你出牌':status?actor+' · '+status.label:'对局已暂停');
  document.querySelector('.turn-pill strong').textContent=turn;
  document.querySelector('.turn-pill').classList.toggle('is-self-turn',status?.seat===0);
  if(game.result){byId('round-end-banner').querySelector('h2').textContent=(game.result.winnerTeam===0?'我方':'对方')+(liveRound.isTuo3?'取得头游':'获胜');byId('round-end-banner').querySelector('p').textContent=game.result.summary;}
  byId('engine-indicator').textContent=fault?'需要处理提示':activeTask==='health'?'正在加载离线模型…':model.ready?'DanLM · 离线就绪':'模型等待加载';
  resizeHand();renderHand();window.GuandanLan?.controls();
}
function saveAction(action){
  stopBots();if(!liveRound)return false;clearToast();
  const oldState=liveRound.state,oldRevision=liveRound.revision,actor=liveRound.actingSeat;
  try{
    action();liveRound.persist(localStorage);
  }catch(error){liveRound.state=oldState;liveRound.revision=oldRevision;reportError(error,'save');return false;}
  if(actor===0)selected.clear();playKey=null;hintSnapshot=null;clearError();renderGame();
  if(liveRound.game.result){
    try{GuandanMatch.archive(localStorage,liveRound);}catch{toast('本局已保存，历史复盘暂未保存。请导出备份后再继续。');}
  }else scheduleBots();
  return true;
}
function scheduleBots(){
  clearTimeout(botTimer);botTimer=null;
  if(!liveRound||liveRound.remote||liveRound.game.result||liveRound.needsTributeConfirmation||paused||fault||dealMotion.active||hasOpenDialog()||document.hidden||liveRound.actingSeat===0||activeTask)return;
  const id=liveRound.id,revision=liveRound.revision,seat=liveRound.actingSeat;
  botTimer=setTimeout(async()=>{
    botTimer=null;if(!liveRound||liveRound.remote||id!==liveRound.id||revision!==liveRound.revision||liveRound.actingSeat!==seat||liveRound.needsTributeConfirmation||paused||fault||dealMotion.active||hasOpenDialog()||document.hidden||activeTask)return;
    const epoch=++workEpoch,wait=GuandanTurnTiming.begin();botWait=wait;activeTask='npc';renderGame();
    try{
      const decision=liveRound.phase!=='playing'?liveRound.chooseTribute():null;
      const [rawResponse,ready]=await Promise.all([
        decision?null:model.request({observation:liveRound.observation(seat),provider:'danlm',book:prefs.aiBook,variant:liveRound.state.ruleMode}),wait.promise
      ]);
      if(!ready||epoch!==workEpoch||!liveRound||liveRound.remote||id!==liveRound.id||revision!==liveRound.revision||liveRound.actingSeat!==seat||liveRound.needsTributeConfirmation||paused||fault||dealMotion.active||hasOpenDialog()||document.hidden)return;
      activeTask=null;
      if(decision)saveAction(()=>liveRound.commit(seat,[decision.card.id],{expectedRevision:revision,automatic:true}));
      else{const response=liveRound.adaptModel(rawResponse,seat);saveAction(()=>liveRound.commitModel(response,revision,seat));}
    }catch(error){if(epoch===workEpoch){activeTask=null;reportError(new Error('AI 计算失败：'+error.message),'model');}}
    finally{wait.cancel();if(botWait===wait)botWait=null;if(epoch===workEpoch){activeTask=null;renderGame();}}
  },0);
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
    const rawResponse=liveRound.remote?await window.GuandanLan.command('advice',{book:prefs.book!==false}):await model.request({observation:liveRound.observation(0),selected:chosen,teaching:true,provider:'danlm',book:prefs.book,variant:liveRound.state.ruleMode});
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
  const {response,candidate,notes,advanced,line}=displayedAdvice,ids=candidate.play?.cards.map(c=>c.id)||[],usedBook=Boolean(response.result?.book||advanced?.book);
  byId('teaching-details').replaceChildren();
    byId('advice-title').textContent=candidate.play?'出'+candidate.play.label:'建议不出';
    byId('advice-reason').textContent=line;byId('advice-source').textContent=liveRound.isTuo3?'DanLM + 拖3规则筛选 · 权重未针对拖3重训':'DanLM'+(usedBook?' + 秘籍策略':'')+' · 解释来自教学层，评分不等于胜率';
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
      'DanLM ranked the legal candidate moves using your hand and public information.'+(usedBook?' Strategy-book guidance is enabled.':''),
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
  selected=new Set(hintSnapshot.ids);playKey=null;updateSelection();
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
byId('clear-selection').addEventListener('click',()=>handSelection.clear());
byId('play-button').addEventListener('click',event=>requestPlay([...selected],event.currentTarget));
byId('confirm-declaration').addEventListener('click',confirmDeclaration);
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
async function setAiBook(enabled){
  if(window.GuandanLan?.active){
    try{await window.GuandanLan.command('ai-book',{enabled});}catch{}finally{window.GuandanLan.controls();}
    return;
  }
  stopBots();prefs.aiBook=enabled;savePrefs();renderGame();scheduleBots();
}
byId('ai-book-enabled').checked=prefs.aiBook;
byId('ai-book-enabled').addEventListener('change',event=>setAiBook(event.target.checked));
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
    if(dialog.id==='declare-dialog')pendingDeclaration=null;
    if(dialog.id==='analysis-dialog'&&activeTask==='teaching'){workEpoch++;activeTask=null;model.cancel();}
    renderGame();const target=dialogFocus.get(dialog);if(!hasOpenDialog()&&target?.isConnected&&!target.disabled)target.focus({preventScroll:true});scheduleBots();
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
  const zone=document.querySelector('.play-zone'),height=document.querySelector('.hand-pane').getBoundingClientRect().height;
  zone.style.setProperty('--hand-pane-height',height+'px');
}
const tableObserver=new ResizeObserver(measureTable);
tableObserver.observe(document.querySelector('.hand-pane'));tableObserver.observe(document.querySelector('.play-zone'));
// Changing the hand shape never changes the selected cards or saved positions.
window.GuandanTable=Object.freeze({
  handStyle:()=>prefs.handStyle,
  setHandStyle(style){prefs.handStyle=style==='fan'?'fan':'flat';savePrefs();},
  cancelDrag(){handEditor?.cancel();handMarquee?.cancel();},
  layout(){resizeHand();renderHand();},
});

handEditor=createHandEditor({root,container:byId('hand-cards'),scroll:byId('hand-scroll'),undoButton:byId('undo-arrange'),
  getLayout:currentLayout,getHand:()=>liveRound?.hand||[],getSelected:()=>selected,canEdit:canArrange,commit:commitLayout,imageFor,
  onArrange(ids){for(const id of ids)selected.delete(id);playKey=null;hintSnapshot=null;clearToast();},
  curvedTarget:(x,y)=>window.tableView?.dropTarget(x,y),onModeChange:()=>updateSelection()
});
handMarquee=GuandanHandMarquee.create({root,scroll:byId('hand-scroll'),container:byId('hand-cards'),
  canSelect:()=>canArrange()&&!handEditor?.active&&!hasOpenDialog(),
  getSignature:()=>JSON.stringify(displayLayout()),getSelected:()=>selected,
  onSelect:setSelection,
  onModeChange:()=>updateSelection(),translate:text=>GuandanI18n.t(text)
});
handSelection=GuandanHandSelection.create({table:document.querySelector('.play-zone'),
  getOrder:()=>ownHand().map(card=>card.id),getSelected:()=>selected,getSignature:()=>JSON.stringify(displayLayout()),
  canSelect,hasDialog:hasOpenDialog,onSelect:setSelection,
  cancelGesture(){
    const active=handEditor?.active||handMarquee?.pending;
    if(active){handEditor?.cancel();handMarquee?.cancel();}
    return active;
  }
});
byId('arrange-hand').addEventListener('click',cycleArrangement);
byId('arrange-priority').value=prefs.arrangePriority;
byId('arrange-priority').addEventListener('change',event=>{prefs.arrangePriority=event.target.value;savePrefs();cycleArrangement();});
byId('sort-hand').addEventListener('click',()=>{if(canArrange())handEditor.replace(GuandanHandLayout.create(layoutKey(),liveRound.hand));});
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
