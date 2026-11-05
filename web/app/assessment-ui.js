'use strict';
window.GuandanAssessmentUI=(()=>{
  const by=id=>document.getElementById(id),node=(tag,text,className)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;};
  const say=(zh,en)=>GuandanI18n.locale==='en'?en:zh,seenKey='guandan-post-match-seen-v1',seen=new Set();
  let round=null,facts=null,reportTimer=null,reportTarget=null;
  try{const saved=JSON.parse(localStorage.getItem(seenKey)||'[]');if(Array.isArray(saved))for(const id of saved.slice(-16))if(typeof id==='string')seen.add(id);}catch{}
  function remember(id){seen.add(id);try{localStorage.setItem(seenKey,JSON.stringify([...seen].slice(-16)));}catch{}}
  function prepare(snapshot){round=snapshot;render();if(round.completed){remember(round.id);if(reportTarget===round.id){clearTimeout(reportTimer);reportTimer=null;reportTarget=null;}}}
  function row(label,value,title){const item=node('div',null,'match-stat-row');item.append(node('span',label),node('strong',value));if(title)item.title=title;return item;}
  const relative=value=>value?say('强于 '+value.percentile+'%','Above '+value.percentile+'%'):'—';
  function render(){
    if(!round)return;facts=GuandanRoundStatistics.summarize(round);
    const teams=by('assessment-teams'),players=by('assessment-scoreboard');teams.replaceChildren();players.replaceChildren();
    by('assessment-result').textContent=round.completed?say('第 '+round.round+' 副 · 打 '+round.level+' · '+(round.winnerTeam===0?'我方获胜':'对方获胜'),'Round '+round.round+' · Level '+round.level+' · '+(round.winnerTeam===0?'Our team wins':'Opponents win')):say('本副进行中 · 起手资源在结束后揭晓','Round in progress · Starting resources appear after the round');
    for(const t of facts.teams){
      const card=node('article',null,'match-team-card'+(t.won?' is-winner':'')),heading=node('div',null,'match-team-heading');
      heading.append(node('h4',t.team===0?say('我方','Our team'):say('对方','Opponents')));
      if(round.completed)heading.append(node('span',t.won?say('胜方','Winners'):say('负方','Runners-up'),'match-team-result'));card.append(heading);
      card.append(node('p',t.seats.map(s=>round.names[s]).join(' · '),'match-team-names'));
      card.append(row(say('起手牌力','Starting strength'),relative(t.starting?.strength),say('与同级牌的随机队伍起手比较；不是胜率。','Compared with same-level random starting teams; not win probability.')));
      card.append(row(say('最多可组炸','Maximum bombs'),t.starting?.peakBombs??'—',say('两人起手可同时组成的炸弹总数，含同花顺和四王炸；每张牌只用一次。','Disjoint bombs across both starting hands, including straight flushes and four jokers.')));
      const high=t.starting?say(Math.round(100*t.starting.highCards/t.starting.cards)+'% · '+t.starting.highCards+' 张',Math.round(100*t.starting.highCards/t.starting.cards)+'% · '+t.starting.highCards+' cards'):'—';
      card.append(row(say('10 及以上／级牌','10+ / level cards'),high,say('10、J、Q、K、A、级牌和大小王，重叠只计一次。','10, J, Q, K, A, level cards and jokers; each card counted once.')));
      card.append(row(say('保住牌权','Leads retained'),t.retainedLeads+' / '+t.freeLeads,say('本队领出的已结束小轮，下一轮仍由本队先出。','Completed tricks started by this team that retain the next free lead.')));
      teams.append(card);
    }
    for(const p of facts.players){
      const card=node('article',null,'assessment-player-card'),heading=node('div',null,'assessment-player-heading');
      heading.append(avatarFor(p.seat),node('strong',round.names[p.seat]));
      heading.append(node('b',p.place?say('第 '+p.place+' 名','#'+p.place):'—','match-player-place'));card.append(heading);
      card.append(node('p',p.seat%2===0?say('我方','Our team'):say('对方','Opponents'),'assessment-player-place'));
      card.append(row(say('普通丢权','Lost · no bomb'),p.lostWithoutBomb,say('本人先出的一小轮结束后，对方取得牌权，且这轮未遇到对方炸弹。','A trick you led ends with opponents taking the next free lead, without an opponent bomb.')));
      card.append(row(say('遇炸丢权','Lost · bomb faced'),p.lostToBomb,say('本人先出的一小轮中遇到对方炸弹，最后由对方取得牌权。','A trick you led includes an opponent bomb and ends with opponents taking the next free lead.')));
      card.append(row(say('夺回牌权','Lead regained'),p.regainedControl,say('对方先出的一小轮，由本人最后压住，下一轮由本队先出；同一轮只计一次。','You make the last play in an opponent-led trick and your team gains the next free lead; once per trick.')));
      card.append(row(say('领牌轮次','Tricks led'),p.freeLeads,say('已结束且产生下一轮先手的小轮；本副结束的最后一轮不计。','Completed tricks with a next free lead; the round-ending trick is excluded.')));
      card.append(row(say('接风次数','Inherited leads'),p.windsReceived));card.append(row(say('用炸次数','Bombs played'),p.bombsPlayed));players.append(card);
    }
    by('assessment-resource-note').textContent=say('起手以贡还结束为准；牌力与同级随机起手比较，非胜率。','Starting resources are fixed after tribute; strength compares same-level random starts, not win probability.');
  }
  function afterRender(current){
    if(!current?.game.result){clearTimeout(reportTimer);reportTimer=null;reportTarget=null;return;}
    if(seen.has(current.id)||reportTarget===current.id)return;reportTarget=current.id;
    const show=()=>{
      if(seen.has(reportTarget)){reportTimer=null;reportTarget=null;return;}
      if(liveRound?.id!==reportTarget||!liveRound?.game.result){reportTarget=null;return;}
      if(document.hidden||window.GuandanPhone?.blocked()||document.querySelector('dialog[open]')||feedback.active||feedback.queue.length){reportTimer=setTimeout(show,300);return;}
      const id=reportTarget;window.openCurrentReview(by('reopen-review'));showReviewTab('performance');remember(id);reportTarget=null;reportTimer=null;
    };reportTimer=setTimeout(show,350);
  }
  function exportData(){
    try{const reports=[0,1,2,3].map(s=>GuandanAssessment.assess(round,s));
      downloadText('掼军-赛后统计-'+round.id+'.json',JSON.stringify({schema:2,kind:'guandan-match-statistics',round,statistics:facts,reports,feedback:GuandanAssessment.readFeedback(localStorage).filter(r=>r.roundId===round.id),playerFeedback:GuandanAssessmentPilot.read(localStorage).filter(r=>r.roundId===round.id),trainingEligible:false}));
      toast(say('已准备导出，请选择保存位置。','Export prepared; choose a save location.'));
    }catch(error){toast(error.message);}
  }
  by('assessment-export').addEventListener('click',exportData);
  document.addEventListener('DOMContentLoaded',()=>afterRender(liveRound));
  return Object.freeze({prepare,render,exportData,afterRender});
})();
