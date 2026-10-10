'use strict';
let reviewRound=null,replayIndex=0,replayTimer=null;
const timelineNodes=new Map();
const el=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
function avatarFor(seat){
  const wrap=el('span','review-avatar'),player=playerAt(seat,reviewRound);
  if(player.avatar){const img=el('img');img.src=player.avatar;img.alt='';wrap.append(img);}else wrap.textContent='你';
  return wrap;
}
function stopReplay(){clearInterval(replayTimer);replayTimer=null;byId('replay-auto').textContent='播放';}
window.stopReviewPlayback=stopReplay;
function showReviewTab(name){
  stopReplay();
  document.querySelectorAll('[data-review-tab]').forEach(button=>{
    const active=button.dataset.reviewTab===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  });
  for(const tab of ['overview','decisions','replay'])byId('review-'+tab).hidden=tab!==name;
  if(name==='replay')renderReplay();
  byId('review-dialog').scrollTop=0;
}
function prepareReview(snapshot,trigger){
  stopReplay();reviewRound=snapshot;replayIndex=0;
  byId('replay-mine').checked=false;byId('replay-moment').value='after';
  byId('replay-range').max=Math.max(0,reviewRound.events.length-1);
  byId('review-source').textContent=(snapshot.ruleMode==='tuo3'?'拖 3 · ':'经典掼蛋 · ')+'第'+snapshot.round+'副 · 实际牌局记录';
  byId('review-title').textContent=snapshot.completed?'这一局，回头看清楚':'本局进行中 · 回看已发生的行动';
  byId('review-boundary').textContent='复盘来自本机实际对局。只保留当时已请求的模型建议；没有当时的建议时，不补造评分或胜率。';
  renderOverview();buildTimeline();showReviewTab('overview');openDialog(byId('review-dialog'),trigger);
}
window.openCurrentReview=trigger=>{
  if(!liveRound)return;
  const select=byId('review-selector');select.replaceChildren();
  const current=el('option','','当前第'+liveRound.state.round+'副');current.value='current';select.append(current);
  try{for(const round of GuandanMatch.archives(localStorage).filter(round=>round.id!==liveRound.id)){
    const option=el('option','',(round.ruleMode==='tuo3'?'拖 3 · ':'经典 · ')+'第'+round.round+'副 · 打'+round.level+' · '+(round.winnerTeam===0?'我方':'对方')+(round.ruleMode==='tuo3'?'取得头游':'获胜'));option.value=round.id;select.append(option);
  }}catch(error){toast(error.message);}
  prepareReview(liveRound.snapshot(),trigger);
};
byId('review-selector').addEventListener('change',event=>{
  try{const snapshot=event.target.value==='current'?liveRound.snapshot():GuandanMatch.archives(localStorage).find(round=>round.id===event.target.value);if(snapshot)prepareReview(snapshot,byId('open-review'));}
  catch(error){toast(error.message);}
});
function renderOverview(){
  const round=reviewRound,team=round.winnerTeam===0?'我方':'对方';
  byId('result-title').textContent=round.ruleMode==='tuo3'&&round.completed?team+'取得头游':round.completed?(round.placement==='12'?'我方双上':round.placement==='34'?'对方双上':team+'获胜'):'本局尚未结束';
  byId('result-summary').textContent=round.completed?round.names[round.finishOrder[0]]+'第1，'+round.names[round.finishOrder[1]]+'第2。复盘关注当时的选择与条件。':'已记录'+round.events.length+'次行动，可回看当前进度。';
  byId('result-badge').textContent=round.completed?(round.ruleMode==='tuo3'?'你 '+signed(round.settlement.rows.find(row=>row.identity===0).delta)+' 分':team+' +'+round.levelDelta+'级'):'进行中';
  for(const id of ['review-stats','finish-list','takeaways','decision-list'])byId(id).replaceChildren();
  for(const [value,label] of [[round.stats.actions,'全局行动'],[round.stats.myPlays,'我的出牌'],[round.stats.myPasses,'我的不出'],[round.stats.myBombs,'我的炸弹']]){
    const stat=el('div','review-stat');stat.append(el('strong','',String(value)),el('span','',label));byId('review-stats').append(stat);
  }
  for(const seat of round.finishOrder){
    const row=el('div','finish-person '+seatStyle(seat,round)),copy=el('div');copy.append(el('strong','',round.names[seat]),el('span','',seat%2===0?'我方':'对方'));
    const rank=round.actuallyFinished.includes(seat)?'第'+(round.finishOrder.indexOf(seat)+1)+'名':'余'+round.remaining[seat]+'张';
    row.append(avatarFor(seat),copy,el('b','finish-rank',rank));byId('finish-list').append(row);
  }
  renderFinalPlay(byId('review-final-play'),round.completed?round.finalPlay:null,round);
  renderRevealedHands(byId('review-reveal'),round.completed?(round.revealedHands||[]):[],round);
  renderScores(byId('review-score'),round.settlement,round);
  if(!round.keyDecisions.length){
    byId('takeaways').append(el('p','','你还没有行动，稍后可回看自己的选择。'));
    byId('decision-list').append(el('p','','目前没有个人行动可供分析。'));
  }
  round.keyDecisions.forEach((key,index)=>{
    const button=el('button','takeaway');button.append(el('span','takeaway-number','0'+(index+1)),el('strong','',key.title),el('span','',key.tag+' · 第'+(key.eventIndex+1)+'次行动'));
    button.addEventListener('click',()=>{showReviewTab('decisions');const target=byId('decision-'+index);target.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});});
    byId('takeaways').append(button);
    const card=el('article','decision-card');card.id='decision-'+index;card.tabIndex=-1;
    const heading=el('div','decision-heading');heading.append(el('span','decision-tag',key.tag),el('span','','第'+(key.eventIndex+1)+'次行动 · 规则解读'));
    card.append(heading,el('h3','',key.title));
    const comparison=el('div','decision-comparison');
    for(const [label,value] of [['当时的选择',key.actual],['可以再想一想',key.alternative]]){
      const side=el('div');side.append(el('span','',label),el('strong','',value));comparison.append(side);
    }
    card.append(comparison,el('p','',decisionBody(key,round)));
    const jump=el('button','secondary-button','回到这一手 →');
    jump.addEventListener('click',()=>{
      byId('replay-moment').value='before';replayIndex=key.eventIndex;showReviewTab('replay');
      document.querySelector('[data-review-tab="replay"]').focus({preventScroll:true});
    });
    card.append(jump);byId('decision-list').append(card);
  });
}
function buildTimeline(){
  timelineNodes.clear();byId('review-timeline').replaceChildren();
  for(const event of reviewRound.events){
    const button=el('button','timeline-event '+seatStyle(event.seat,reviewRound));
    button.dataset.eventIndex=event.index;
    button.append(el('span','event-number',String(event.index+1)),el('span','event-player',reviewRound.names[event.seat]),el('strong','',event.label));
    button.addEventListener('click',()=>seekReplay(event.index));
    timelineNodes.set(event.index,button);byId('review-timeline').append(button);
  }
}
function syncTimeline(){
  const timeline=byId('review-timeline'),mine=byId('replay-mine').checked;
  timelineNodes.forEach((button,index)=>{
    button.hidden=mine&&reviewRound.events[index].seat!==0;
    button.setAttribute('aria-current',String(index===replayIndex));
  });
  const active=timelineNodes.get(replayIndex);
  if(active&&!active.hidden){
    const top=active.offsetTop,bottom=top+active.offsetHeight;
    if(top<timeline.scrollTop||bottom>timeline.scrollTop+timeline.clientHeight)timeline.scrollTop=Math.max(0,top-40);
  }
}
function renderReplay(){
  const round=reviewRound,event=round.events[replayIndex],before=byId('replay-moment').value==='before';
  if(!event){
    byId('replay-counter').textContent='暂无行动';byId('replay-felt').replaceChildren(el('p','','本局还没有行动记录。'));
    byId('replay-hand-title').textContent='初始手牌';byId('replay-hand-cards').replaceChildren(...round.initialOwnHand.map(card=>imageFor(card.face,card.label)));
    for(const id of ['replay-first','replay-prev','replay-next','replay-last','replay-auto','replay-range'])byId(id).disabled=true;
    return;
  }
  const history=round.events.slice(0,replayIndex+(before?0:1));
  const counts=before?event.remainingBefore:event.remaining;
  const table=before?event.tableBefore:event.tableAfter;
  const hand=before?event.ownBefore:event.ownAfter;
  byId('replay-counter').textContent=(replayIndex+1)+' / '+round.events.length+' 次行动';
  byId('replay-range').value=replayIndex;byId('replay-range').disabled=false;
  byId('replay-range').setAttribute('aria-valuetext','第'+(replayIndex+1)+'次，'+round.names[event.seat]+event.label+'，行动'+(before?'前':'后'));
  byId('replay-first').disabled=byId('replay-prev').disabled=replayIndex===0;
  byId('replay-last').disabled=byId('replay-next').disabled=replayIndex===round.events.length-1;
  byId('replay-auto').disabled=round.events.length<2;
  const felt=byId('replay-felt');felt.replaceChildren();
  for(const seat of [2,3,1,0]){
    const panel=el('section','replay-seat '+seatStyle(seat,round)+(event.seat===seat?' is-acting':''));panel.setAttribute('aria-label',round.names[seat]+'的区域');
    const meta=el('div','replay-seat-meta'),copy=el('div');copy.append(el('strong','',round.names[seat]),el('span','','剩 '+counts[seat]+' 张'));meta.append(avatarFor(seat),copy);panel.append(meta);
    if(table?.owner===seat){
      const cards=el('div','replay-played');for(const card of table.play.cards)cards.append(imageFor(card.face,card.label));
      panel.append(cards,el('span','replay-last-action','桌面 · '+table.play.label));
    }else{
      const latest=history.findLast(item=>item.seat===seat);
      panel.append(el('span','replay-last-action',counts[seat]===0?'已出完':latest?'上次：'+latest.label:'尚未行动'));
    }
    if(event.seat===seat)panel.append(el('span','acting-label',before?'即将行动':'当前行动'));
    felt.append(panel);
  }
  byId('replay-hand-title').textContent='行动'+(before?'前':'后')+'的我的手牌 · '+hand.length+'张';
  byId('replay-hand-cards').replaceChildren(...hand.map(card=>imageFor(card.face,card.label)));
  if(!hand.length)byId('replay-hand-cards').append(el('p','','手牌已出完。'));
  syncTimeline();
}
function seekReplay(index,{automatic=false}={}){
  if(!automatic)stopReplay();
  replayIndex=Math.max(0,Math.min(reviewRound.events.length-1,index));renderReplay();
  if(replayIndex===reviewRound.events.length-1)stopReplay();
}
function toggleReplay(){
  if(replayTimer){stopReplay();return;}
  if(reviewRound.events.length<2)return;
  if(replayIndex===reviewRound.events.length-1)seekReplay(0);
  byId('replay-auto').textContent='暂停';replayTimer=setInterval(()=>seekReplay(replayIndex+1,{automatic:true}),1300);
}
function reviewText(){
  const round=reviewRound;
  const lines=['掼蛋研习社 · 第'+round.round+'副复盘 · 打'+round.level,round.source,''];
  if(round.completed&&round.ruleMode==='tuo3'){
    lines.push('拖 3 · 固定打 2；本副积分：');
    for(const row of round.settlement.rows)lines.push(row.name+'：名次 '+signed(row.placement)+'，拖三 '+signed(row.drag)+'，余牌 '+signed(row.remainder)+'；本副 '+signed(row.delta)+'，累计 '+signed(row.total));
    for(const detail of round.settlement.details)lines.push(detail.label+' '+signed(detail.value)+' 分'+(detail.cards.length?'：'+detail.cards.map(GuandanCore.cardLabel).join('、'):''));
    lines.push('本副每项加减由两名搭档共同承担，另一队反向记分。');
  }else if(round.completed)lines.push((round.winnerTeam===0?'我方':'对方')+'升'+round.levelDelta+'级；我方名次：'+round.placement+'。');
  else lines.push('本局进行中，以下为已经发生的行动。');
  lines.push('全局'+round.stats.actions+'次行动；我的出牌'+round.stats.myPlays+'次，不出'+round.stats.myPasses+'次。','');
  if(round.completed&&round.finalPlay){
    const last=round.finalPlay;
    lines.push('最后打出的牌',round.names[last.seat]+'：'+last.label+(last.place?'；第'+last.place+'名 · 已出完':''),'牌面：'+last.cards.map(card=>card.label).join('、'),'');
  }
  if(round.completed&&round.revealedHands?.length){
    lines.push('终局明牌');
    for(const {seat,cards} of round.revealedHands)lines.push(round.names[seat]+'剩'+cards.length+'张：'+cards.map(card=>card.label).join('、'));
    lines.push('');
  }
  lines.push('关键选择');
  for(const key of round.keyDecisions)lines.push('第'+(key.eventIndex+1)+'次：'+key.title,'当时：'+key.actual+'；对照：'+key.alternative,key.body,'');
  lines.push('完整行动记录');
  for(const event of round.events){
    lines.push((event.index+1)+'. '+round.names[event.seat]+'：'+event.label+(event.engine?'（'+event.engine+'）':'')+'；余牌 '+event.remaining.map((count,seat)=>round.names[seat]+count).join(' / '));
    if(event.cards.length)lines.push('   牌面：'+event.cards.map(card=>card.label).join('、'));
    if(event.seat===0)lines.push('   行动前手牌：'+event.ownBefore.map(card=>card.label).join('、'),'   行动后手牌：'+(event.ownAfter.map(card=>card.label).join('、')||'已出完'));
  }
  return lines.join('\n');
}
function decisionBody(key,round){
  if(GuandanI18n.locale!=='en')return key.body;
  const event=round.events[key.eventIndex],t=GuandanI18n.t;
  return `Before this move you held ${event.ownBefore.length} cards. `+(event.tableBefore?`${t(round.names[event.tableBefore.owner])} led with ${t(event.tableBefore.play.label)}. `:'You were leading. ')+`You chose ${t(event.label)}, leaving ${event.ownAfter.length} cards. `+(event.teaching?`Advice requested at the time: ${t(event.teaching.label)}. `:'No model advice was requested at the time. ')+ 'The final result alone does not determine the quality of this decision.';
}
function englishReviewText(){
 const r=reviewRound,t=GuandanI18n.t;
 const lines=[`Guandan Study · Round ${r.round} · Level ${r.level}`,t(r.source),r.completed?(r.winnerTeam===0?'Our team':'Opponents')+(r.ruleMode==='tuo3'?' finished first':` won · +${r.levelDelta} levels`):'Round in progress',`Actions: ${r.stats.actions} · My plays: ${r.stats.myPlays} · My passes: ${r.stats.myPasses}`,''];
 if(r.ruleMode==='tuo3'&&r.settlement){lines.push('Tuo 3 · Fixed level 2');for(const row of r.settlement.rows)lines.push(`${t(row.name)}: placement ${signed(row.placement)}, bonus ${signed(row.drag)}, unplayed ${signed(row.remainder)}; round ${signed(row.delta)}, total ${signed(row.total)}`);}
 if(r.finalPlay)lines.push('Final play: '+t(r.names[r.finalPlay.seat])+' · '+t(r.finalPlay.label),r.finalPlay.cards.map(c=>t(c.label)).join(', '));
 for(const h of r.revealedHands||[])lines.push(t(r.names[h.seat])+` · ${h.cards.length} cards left: `+h.cards.map(c=>t(c.label)).join(', '));
 lines.push('','Key decisions');for(const key of r.keyDecisions)lines.push(`Move ${key.eventIndex+1}: ${t(key.title)}`,decisionBody(key,r));
 lines.push('','All actions');for(const e of r.events)lines.push(`${e.index+1}. ${t(r.names[e.seat])}: ${t(e.label)} · Cards left: ${e.remaining.join(' / ')}`+(e.cards.length?' · '+e.cards.map(c=>t(c.label)).join(', '):''));
 return lines.join('\n');
}
window.addEventListener('guandan-language-change',()=>{if(reviewRound&&byId('review-dialog').open){renderOverview();renderReplay();}});
function exportReview(){
  downloadText(GuandanI18n.locale==='en'?'Guandan-Round-'+reviewRound.round+'.txt':'掼蛋-第'+reviewRound.round+'副复盘.txt',GuandanI18n.locale==='en'?englishReviewText():reviewText());
}
byId('open-review').addEventListener('click',event=>window.openCurrentReview(event.currentTarget));
byId('reopen-review').addEventListener('click',event=>window.openCurrentReview(event.currentTarget));
document.querySelectorAll('[data-review-tab]').forEach(button=>{
  button.addEventListener('click',()=>showReviewTab(button.dataset.reviewTab));
  button.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
    const tabs=[...document.querySelectorAll('[data-review-tab]')],index=tabs.indexOf(button);
    const next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;
    showReviewTab(tabs[next].dataset.reviewTab);tabs[next].focus();
  });
});
document.querySelectorAll('[data-go-review]').forEach(button=>button.addEventListener('click',()=>{showReviewTab(button.dataset.goReview);document.querySelector('[data-review-tab="'+button.dataset.goReview+'"]').focus({preventScroll:true});}));
byId('replay-first').addEventListener('click',()=>seekReplay(0));byId('replay-prev').addEventListener('click',()=>seekReplay(replayIndex-1));
byId('replay-next').addEventListener('click',()=>seekReplay(replayIndex+1));byId('replay-last').addEventListener('click',()=>seekReplay(reviewRound.events.length-1));
byId('replay-auto').addEventListener('click',toggleReplay);
byId('replay-range').addEventListener('input',event=>seekReplay(Number(event.target.value)));
byId('replay-mine').addEventListener('change',syncTimeline);
byId('replay-moment').addEventListener('change',()=>{stopReplay();renderReplay();});
byId('export-review').addEventListener('click',exportReview);
byId('review-dialog').addEventListener('close',stopReplay);byId('review-dialog').addEventListener('cancel',stopReplay);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopReplay();});
