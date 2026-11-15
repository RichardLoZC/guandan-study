'use strict';
window.GuandanAssessmentUI=(()=>{
  const by=id=>document.getElementById(id),node=(tag,text,className)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;};
  const say=(zh,en)=>GuandanI18n.locale==='en'?en:zh,seenKey='guandan-post-match-seen-v1',seen=new Set();
  let round=null,facts=null,reportTimer=null,reportTarget=null;
  try{const saved=JSON.parse(localStorage.getItem(seenKey)||'[]');if(Array.isArray(saved))for(const id of saved.slice(-16))if(typeof id==='string')seen.add(id);}catch{}
  function remember(id){seen.add(id);try{localStorage.setItem(seenKey,JSON.stringify([...seen].slice(-16)));}catch{}}
  function prepare(snapshot){round=snapshot;render();if(round.completed){remember(round.id);if(reportTarget===round.id){clearTimeout(reportTimer);reportTimer=null;reportTarget=null;}}}
  const points=(n,decimal=false)=>Number.isFinite(n)?decimal?n.toFixed(1):String(n):'—';
  function stat(label,value,title){const n=node('div',null,'match-summary-stat');n.append(node('span',label),node('b',value));if(title)n.title=title;return n;}
  function render(){
    if(!round)return;facts=GuandanRoundStatistics.summarize(round);
    const teams=by('assessment-teams'),players=by('assessment-scoreboard');teams.replaceChildren();players.replaceChildren();
    by('assessment-result').textContent=round.completed?say('第 '+round.round+' 副 · 打 '+round.level+' · '+(round.winnerTeam===0?'我方胜':'对方胜'),'Round '+round.round+' · Level '+round.level+' · '+(round.winnerTeam===0?'Our team wins':'Opponents win')):say('本副进行中 · 结束后公开评分和起手资源','In progress · Scores and starting resources appear after this round');
    for(const t of facts.teams){
      const card=node('article',null,'match-team-card'+(t.won?' is-winner':'')),heading=node('div',null,'match-team-heading');
      heading.append(node('h4',t.team===0?say('我方','Our team'):say('对方','Opponents')));
      if(round.completed)heading.append(node('span',t.won?say('胜方','Winners'):say('负方','Runners-up'),'match-team-result'));card.append(heading);
      const names=node('p',t.seats.map(s=>round.names[s]).join(' · '),'match-team-names');names.title=names.textContent;card.append(names);
      const resources=node('div',null,'match-team-resources');
      resources.append(stat(say('起手均分','Avg. hand'),points(t.starting?.score),say('两名队员各自起手牌力的平均分，满分100。','Mean of the two individual starting-hand scores, out of 100.')));
      resources.append(stat(say('最多炸弹','Max bombs'),t.starting?.peakBombs??'—',say('起手可同时组成的炸弹总数，含同花顺及四王；每张牌只用一次。','Disjoint starting bombs, including straight flushes and four jokers.')));
      resources.append(stat(say('高牌比例','High cards'),t.starting?Math.round(100*t.starting.highCards/t.starting.cards)+'%':'—',say('10、J、Q、K、A、级牌和大小王，重叠只计一次。','10, J, Q, K, A, level cards and jokers, counted once.')));
      resources.append(stat(say('保住先手','Leads kept'),t.retainedLeads+'/'+t.freeLeads));card.append(resources);teams.append(card);
    }
    const table=node('table',null,'match-player-table');table.setAttribute('aria-label',say('个人赛后表现与技术统计','Individual post-match scores and statistics'));
    const headers=[['玩家','Player'],['起手','Hand'],['表现','Rating'],['普通丢权','No-bomb loss'],['遇炸丢权','Bomb loss'],['夺回','Regained'],['接风','Inherited'],['用炸','Bombs']];
    const tr=node('tr'),thead=node('thead');
    for(const [zh,en]of headers){const th=node('th',say(zh,en));th.scope='col';tr.append(th);}thead.append(tr);table.append(thead);
    const body=node('tbody');
    for(const seat of [0,2,1,3]){
      const p=facts.players[seat],row=node('tr',null,'assessment-player-card');row.dataset.team=String(seat%2);row.dataset.seat=String(seat);
      const nameCell=node('th');nameCell.scope='row';const identity=node('div',null,'assessment-player-heading'),text=node('div',null,'match-player-identity');
      const name=node('strong',round.names[seat]);name.title=round.names[seat];text.append(name);
      const ending=p.remaining===null?'':p.remaining===0?say('出完','Finished'):say('余'+p.remaining+'张',p.remaining+' left');
      text.append(node('small',(seat%2===0?say('我方','Us'):say('对方','Them'))+(p.place?' · #'+p.place:'')+(ending?' · '+ending:'')));
      identity.append(avatarFor(seat),text);nameCell.append(identity);row.append(nameCell);
      const hand=node('td',points(p.starting?.score),'match-hand-points');hand.title=say('本人贡还后的起手牌力，满分100。','Individual starting-hand score after tribute, out of 100.');row.append(hand);
      const rating=node('td',points(p.rating?.score,true),'match-performance-points');rating.title=say('本副终局表现，10分制试评；不是每步打法的正确率。','Trial round-outcome score out of 10, not tactical accuracy.');row.append(rating);
      for(const [value,title]of [[p.lostWithoutBomb,say('本人领出、未遇对方炸弹、结束后由对方获得先手。','Your lead ends with opponents taking the next lead without an opponent bomb.')],[p.lostToBomb,say('本人领出的小轮遇到对方炸弹后丢权；不直接判为打错。','Your led trick faces an opponent bomb and loses the next lead; not automatically a mistake.')],[p.regainedControl,say('对方领出，本人最后压住并夺回下一轮先手。','Your last play wins your team the next lead from an opponent-led trick.')],[p.windsReceived,say('接到队友出完后留下的先手。','Inherited the lead after your partner finished.')],[p.bombsPlayed,say('本人打出的炸弹，含同花顺及四王。','Bombs played, including straight flushes and four jokers.')]]){const cell=node('td',value);cell.title=title;row.append(cell);}
      body.append(row);
    }
    table.append(body);players.append(table);
    by('assessment-resource-note').textContent=round.completed?say('起手分 /100 · 表现分 /10（试评）','Hand /100 · Rating /10 (trial)'):say('其他玩家的起手和评分在本副结束后公开。','Other players’ starting scores remain hidden until this round ends.');
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
      downloadText('掼军-赛后统计-'+round.id+'.json',JSON.stringify({schema:3,kind:'guandan-match-statistics',round,statistics:facts,reports,feedback:GuandanAssessment.readFeedback(localStorage).filter(r=>r.roundId===round.id),playerFeedback:GuandanAssessmentPilot.read(localStorage).filter(r=>r.roundId===round.id),trainingEligible:false}));
      toast(say('已准备导出，请选择保存位置。','Export prepared; choose a save location.'));
    }catch(error){toast(error.message);}
  }
  by('assessment-export').addEventListener('click',exportData);
  document.addEventListener('DOMContentLoaded',()=>afterRender(liveRound));
  return Object.freeze({prepare,render,exportData,afterRender});
})();
