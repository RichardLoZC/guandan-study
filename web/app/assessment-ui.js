'use strict';
window.GuandanAssessmentUI=(()=>{
  const api=GuandanAssessment,by=id=>document.getElementById(id),node=(tag,text,className)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;};
  let round=null,report=null,selectedSeat=0,selectedCase=null,exportedFeedbackIds=null,pilotExportedIds=null,pilotSubject=null;
  const pilotDrafts=new Map(),pilotFields=['assessment-pilot-hand','assessment-pilot-performance','assessment-pilot-reason','assessment-pilot-event','assessment-pilot-hand-score','assessment-pilot-performance-score'];
  let reportTimer=null,reportTarget=null;
  const seenKey='guandan-post-match-seen-v1',seen=new Set();
  try{const saved=JSON.parse(localStorage.getItem(seenKey)||'[]');if(Array.isArray(saved))for(const id of saved.slice(-16))if(typeof id==='string')seen.add(id);}catch{}
  const en=()=>GuandanI18n.locale==='en',say=(zh,english)=>en()?english:zh;
  const names=Object.fromEntries(GuandanAssessmentStandard.metrics.map(m=>[m.id,m.name]));
  const englishNames={P01:'Regained free lead',P02:'Team control transfers',P03:'Uncompensated loss of control',P04:'Missed takeover',P05:'Play after regaining control',F01:'Straight-flush usage',F02:'Straight-flush choice with alternatives',F03:'Early control-card use',F04:'Missed interception',T01:'Partner continuation',T02:'Key assists',T03:'Individual/team trade-off',H01:'Starting resources',H02:'Starting-hand adjustment',H03:'Structure usage',I01:'Partner information',R01:'Stage and risk',Q01:'Record integrity'};
  const reasons={no_opportunity:['本局无此类机会','No opportunity'],no_validated_judge:['待评：尚无经过校准的战术评审器','Pending: no calibrated tactical judge'],no_calibrated_reference:['待评：尚无经过校准的起手参考','Pending: no calibrated starting-hand reference'],no_predecision_prediction:['待评：未记录事前信息预测','Pending: no pre-decision prediction'],private_hand_unavailable:['信息缺失：进行中的牌局不读取他人手牌','Unavailable: other hands remain private during play'],tribute_not_completed:['等待贡还结束后确定起手','Starting resources await completed tribute'],unsupported_rule_mode:['此项尚未适配拖 3；其余事实照常统计','This metric is not yet supported for Tuo 3'],invalid_data:['记录存在冲突，不能用于评分或训练','Record conflict: excluded from scoring/training']};
  function fraction(n,d){return d?say(Math.round(n/d*100)+'%（'+n+'/'+d+'）',Math.round(n/d*100)+'% ('+n+'/'+d+')'):say('无机会（0/0）','No opportunity (0/0)');}
  function describe(m){
    if(['private_hand_unavailable','tribute_not_completed','unsupported_rule_mode','invalid_data'].includes(m.missingReason))return reasons[m.missingReason][en()?1:0];
    if(m.id==='P01')return fraction(m.numerator,m.denominator)+say(' · 每人每墩计一次；终局另列 '+m.value.terminalContests.length+' 个，不算再次领牌',' · Once per player/contest; '+m.value.terminalContests.length+' terminal contests listed separately, not free leads');
    if(m.id==='P02')return say('转交对方 ','To opponents ')+fraction(m.numerator,m.denominator)+say('；本队片段内转交队友 ','; partner handoffs within team segments ')+m.value.partnerHandoffs;
    if(m.id==='P05')return m.denominator?say(m.denominator+' 个抢权片段；本人走 '+m.value.cardsShed+' 张，队友走 '+m.value.partnerCardsShed+' 张，后续控制牌 '+m.value.controlPlays+' 手',m.denominator+' regained segments; own cards shed '+m.value.cardsShed+', partner '+m.value.partnerCardsShed+', subsequent control plays '+m.value.controlPlays):say('本局尚无已闭合的本人抢权片段','No completed personal recapture segment');
    if(m.id==='F01'){const v=m.value;return say('共 '+m.denominator+' 手；领出 '+v.lead+'，压普通牌 '+v.overOrdinary+'，压控制牌 '+v.overBomb+'，其中压队友 '+v.overPartner+'（标签可重叠）',m.denominator+' plays; lead '+v.lead+', over ordinary '+v.overOrdinary+', over control '+v.overBomb+', over partner '+v.overPartner+' (overlapping tags)');}
    if(m.id==='F02'&&m.numerator!==null)return fraction(m.numerator,m.denominator)+say(' · 有合法同花顺及替代选择时的使用偏好，不是浪费率',' · Choice frequency with alternatives; not a waste rate');
    if(m.id==='T01')return fraction(m.numerator,m.denominator)+say(' · 跟出 '+m.value.partnerPlay+'，接风 '+m.value.partnerWind+'；是否有效助攻待评，暂不加分',' · Follow-ups '+m.value.partnerPlay+', inherited leads '+m.value.partnerWind+'; usefulness pending, no score bonus');
    if(m.id==='H01'&&m.value){const v=m.value;return say('贡还后 '+v.cards+' 张；逢人配 '+v.wilds+'，王 '+v.jokers+'，天然炸弹点数 '+(v.naturalBombRanks.join('、')||'无')+'，同花顺花色／序列 '+v.straightFlushPatterns+' 种（组合可能重叠）','After tribute: '+v.cards+' cards, '+v.wilds+' wilds, '+v.jokers+' jokers; natural bomb ranks '+(v.naturalBombRanks.join(', ')||'none')+', '+v.straightFlushPatterns+' straight-flush patterns (may overlap)');}
    if(m.id==='Q01')return fraction(m.numerator,m.denominator)+say(' · 字段、张数、实体牌一致性；不等于完成规则回放。该玩家决策归因覆盖 ',' · Field/count/card consistency; not full rules replay. Attribution ')+m.value.provenanceCovered+'/'+m.value.decisions;
    return reasons[m.missingReason]?.[en()?1:0]||say('待评：意见与模拟证据不足','Pending: insufficient review evidence');
  }
  function prepare(snapshot){round=snapshot;selectedSeat=0;render();if(round.completed){seen.add(round.id);if(reportTarget===round.id){clearTimeout(reportTimer);reportTimer=null;reportTarget=null;}try{localStorage.setItem(seenKey,JSON.stringify([...seen].slice(-16)));}catch{}}}
  function render(){
    if(!round)return;
    report=api.assess(round,selectedSeat);
    renderScoreboard();
    const select=by('assessment-seat');select.replaceChildren();
    for(let s=0;s<4;s++){const o=node('option',round.names[s]);o.value=s;o.selected=s===selectedSeat;select.append(o);}
    by('assessment-scope').textContent=say('仅本副牌 · 标准 '+api.STANDARD+' · '+(round.completed?'已结束，可按各家当时视角复核':'进行中，其他玩家手牌保密'),'This round only · Standard '+api.STANDARD+' · '+(round.completed?'Complete; actor-specific review available':'In progress; other hands stay private'));
    by('assessment-result').textContent=say(round.completed?'本副名次：'+round.finishOrder.map((s,i)=>round.names[s]+'第'+(i+1)).join('、')+'。'+(round.seriesOutcome?.victory?'已成功过 A。':'本副结果不等于完整冲 A 胜率。'):'本副进行中，开放窗口不计失败。',round.completed?'Round complete. A round result is not a full-match win rate.':'Round in progress; open windows are not failures.');
    const grid=by('assessment-grid');grid.replaceChildren();
    const groups=[['控制与组织','Control and organization',['P01','P02','P03','P04','P05']],['控制牌使用','Control-card usage',['F01','F02','F03','F04']],['队友接应','Partner support',['T01','T02','T03']],['手牌资源与发挥','Resources and performance',['H01','H02','H03']],['信息理解','Information',['I01']],['阶段与风险','Stage and risk',['R01']]];
    for(const [zh,english,ids]of groups){
      const section=node('section',null,'assessment-dimension');section.append(node('h3',say(zh,english)));
      for(const id of ids){const m=report.metrics.find(m=>m.id===id),row=node('div',null,'assessment-metric');row.append(node('strong',id+' · '+(en()?englishNames[id]:names[id])),node('p',describe(m)));
        if(m.pending)row.append(node('small',say('未闭合／未覆盖 '+m.pending+' 个，单列保留。',m.pending+' open/unavailable items retained separately.')));
        if(m.numerator===null&&m.id!=='H01'&&m.id!=='P05')row.append(node('small',say('战术评审覆盖 0；不补造 0 分或 3 分。','Tactical review coverage 0; no default grade.')));
        section.append(row);
      }grid.append(section);
    }
    by('assessment-quality').textContent='Q01 · '+describe(report.metrics.find(m=>m.id==='Q01'));
    renderCases();renderPlan();renderPilot();renderTeamReference();
  }
  function renderScoreboard(){
    const board=by('assessment-scoreboard'),details=by('assessment-rating-components');board.replaceChildren();details.replaceChildren();
    const all=[0,1,2,3].map(s=>{const stats=api.assess(round,s);return {seat:s,stats,rating:GuandanAssessmentRating.rate(round,stats)};});
    const maximum=Math.max(...all.map(r=>r.rating.score??-1));
    for(const {seat,stats,rating}of all){
      const e=round.events.filter(e=>e.seat===seat),card=node('button',null,'assessment-player-card'+(seat===selectedSeat?' is-selected':''));card.type='button';card.setAttribute('aria-pressed',String(seat===selectedSeat));
      const header=node('div',null,'assessment-player-heading');header.append(avatarFor(seat),node('strong',round.names[seat]));
      const score=node('b',rating.score===null?'—':rating.score.toFixed(1),'assessment-player-score');score.setAttribute('aria-label',say('自动试行评分 ','Pilot statistics rating ')+(rating.score??say('待结束','Pending')));
      const scoreValue=node('div',null,'assessment-score-value');scoreValue.append(score,node('small',say('表现 / 10','Performance / 10')));header.append(scoreValue);card.append(header);
      const place=round.completed?round.finishOrder.indexOf(seat)+1:null;
      card.append(node('span',say((place?'第 '+place+' 名':'进行中')+' · '+(seat%2===0?'我方':'对方'),(place?'#'+place:'In progress')+' · '+(seat%2===0?'Our team':'Opponents')),'assessment-player-place'));
      card.append(node('p',say('手牌结构 '+(round.completed?(stats.handAssessment.score??'—'):'—')+' / 100 · 试行','Hand structure '+(round.completed?(stats.handAssessment.score??'—'):'—')+' / 100 · Pilot'),'assessment-hand-score'));
      const lead=stats.metrics.find(m=>m.id==='P01'),support=stats.metrics.find(m=>m.id==='T01'),flush=stats.metrics.find(m=>m.id==='F01');
      card.append(node('p',say('走牌 '+e.reduce((n,e)=>n+e.cards.length,0)+' 张 · 不出 '+e.filter(e=>!e.cards.length).length+' 次','Cards played '+e.reduce((n,e)=>n+e.cards.length,0)+' · Passes '+e.filter(e=>!e.cards.length).length)));
      card.append(node('p',say('夺回领牌 '+lead.numerator+'/'+lead.denominator+' · 队友接续 '+support.numerator+'/'+support.denominator,'Regained lead '+lead.numerator+'/'+lead.denominator+' · Partner continuation '+support.numerator+'/'+support.denominator)));
      card.append(node('p',say('同花顺 '+flush.numerator+' 手 · ', 'Straight flushes '+flush.numerator+' · ')+(rating.score!==null&&rating.score===maximum?say('本副统计之星（试行）','Statistics star (pilot)'):say('自动统计试行分','Pilot statistics rating'))));
      card.addEventListener('click',()=>{selectedSeat=seat;render();});board.append(card);
      if(seat===selectedSeat){
        details.append(node('p',say('表现分公式版本：','Performance formula: ')+rating.version));
        for(const c of rating.components)details.append(node('p',(en()?GuandanI18n.t(c.formula,'en'):c.formula)+' → '+(c.value>=0?'+':'')+c.value.toFixed(3)));
        renderHand(stats.handAssessment);
      }
    }
  }
  function renderHand(hand){
    const target=by('assessment-hand-detail');target.replaceChildren();
    if(!round.completed||hand.score===null){target.append(node('p',say(round.completed?'此模式或记录暂不能评估手牌结构。':'本副结束后显示手牌结构试行分。',round.completed?'Hand structure unavailable for this mode or record.':'Hand structure is shown after the round.')));return;}
    target.append(node('p',say(round.names[selectedSeat]+' · 结构分 '+hand.score+'/100 · '+hand.groupCount+' 组拆分示例',round.names[selectedSeat]+' · Structure '+hand.score+'/100 · '+hand.groupCount+' example groups')));
    for(const c of hand.components)target.append(node('p',c.formula+' → '+c.value+' / '+c.maximum));
    const labels={single:'单张',pair:'对子',triple:'三张','full-house':'三带二',straight:'顺子','pair-run':'连对','triple-run':'钢板',bomb:'炸弹','straight-flush':'同花顺','joker-bomb':'四王炸'};
    const cards=new Map(api.visibleHand(round,0,selectedSeat).map(c=>[c.id,c]));
    const list=node('ol',null,'assessment-partitions');
    for(const group of hand.groups)list.append(node('li',(en()?group.type:labels[group.type])+' · '+group.cardIds.map(id=>GuandanCore.cardLabel(cards.get(id))).join(' ')));
    target.append(list,node('small',hand.version+say(' · 未校准；不是胜率、百分位或出牌建议。',' · Uncalibrated; not win probability, percentile or move advice.')));
  }
  function renderTeamReference(){
    const target=by('assessment-team-reference'),reference=report.teamReference;target.replaceChildren();
    if(!reference?.available){target.append(node('p',say(round.completed?'本模式或记录暂不能计算队伍起手参考。':'本副结束后才计算，进行中不读取其他玩家的手牌。',round.completed?'Team starting reference is unavailable for this mode or record.':'Calculated after the round; other hands remain private during play.')));return;}
    target.append(node('p',say('我方结构总分 '+reference.teamScores[0]+'，对方 '+reference.teamScores[1]+'。旧版移植 DanLM 起手参考：我方 '+(reference.probabilities[0]*100).toFixed(1)+'%，对方 '+(reference.probabilities[1]*100).toFixed(1)+'%。',
      'Team structure sums: us '+reference.teamScores[0]+', opponents '+reference.teamScores[1]+'. Earlier adapted DanLM starting reference: us '+(reference.probabilities[0]*100).toFixed(1)+'%, opponents '+(reference.probabilities[1]*100).toFixed(1)+'%.')));
    target.append(node('p',say('我方本副结果减起手参考：'+(reference.outcomeResiduals[0]>=0?'+':'')+reference.outcomeResiduals[0].toFixed(3)+'。这是队伍层的试行参考，不计入个人分。',
      'Our round result minus starting reference: '+(reference.outcomeResiduals[0]>=0?'+':'')+reference.outcomeResiduals[0].toFixed(3)+'. A trial team-level reference, excluded from personal ratings.')));
    target.append(node('p',say('公开公式：p = 1 / (1 + exp(−z))；z = 1.163022 × (我方结构总分 − 对方结构总分) / 20 + 0.325934 × 先手队符号。用旧 1,000 副拟合、新 1,000 副验证；仍未针对真人校准。',
      'Formula: p = 1 / (1 + exp(−z)); z = 1.163022 × (our structure sum − opponent sum) / 20 + 0.325934 × starting-team sign. Fit on 1,000 development deals, checked on 1,000 new deals; not calibrated for human play.')));
    target.append(node('small',say('参考版本：','Reference version: ')+reference.version));
  }
  function renderPilot(){
    const subject=round.id+':'+(round.playerIds?.[selectedSeat]??selectedSeat);let previous=by('assessment-pilot-event').value;
    if(pilotSubject!==subject){
      if(pilotSubject)pilotDrafts.set(pilotSubject,Object.fromEntries(pilotFields.map(id=>[id,by(id).value])));
      const draft=pilotDrafts.get(subject);by('assessment-pilot-form').reset();
      if(draft)for(const id of pilotFields)if(id!=='assessment-pilot-event')by(id).value=draft[id];
      previous=draft?.['assessment-pilot-event']||'';by('assessment-pilot-status').textContent='';pilotSubject=subject;
      if(pilotDrafts.size>32)pilotDrafts.delete(pilotDrafts.keys().next().value);
    }
    const hand=report.handAssessment,ready=round.completed&&GuandanAssessmentRating.rate(round,report).score!==null;
    by('assessment-pilot-fields').disabled=!ready;
    by('assessment-pilot-hand').disabled=hand.score===null;by('assessment-pilot-hand-score').disabled=hand.score===null;
    if(hand.score===null){by('assessment-pilot-hand').value='unsure';by('assessment-pilot-hand-score').value='';}
    by('assessment-pilot-subject').textContent=say('正在评价：'+round.names[selectedSeat]+'。点击上方玩家卡片可切换；本副结束后可提交。','Reviewing '+round.names[selectedSeat]+'. Select a player card to switch. Submit after the round.');
    const select=by('assessment-pilot-event');select.replaceChildren();const empty=node('option',say('整副牌／没有特定一手','Whole round / no specific move'));empty.value='';select.append(empty);
    for(const e of round.events.filter(e=>e.seat===selectedSeat)){const option=node('option',say('第 '+(e.index+1)+' 手 · ','Move '+(e.index+1)+' · ')+e.label);option.value=String(e.index);select.append(option);}select.value=previous;
    try{const all=GuandanAssessmentPilot.read(localStorage),summary=GuandanAssessmentPilot.summarize(all);by('assessment-pilot-count').textContent=say('本机已保存 '+all.length+' 条（含修订）；'+summary.groups.reduce((n,g)=>n+g.responses,0)+' 份当前意见。',all.length+' local records including revisions; '+summary.groups.reduce((n,g)=>n+g.responses,0)+' current opinions.');}catch(error){by('assessment-pilot-count').textContent=error.message;}
  }
  function afterRender(current){
    if(!current?.game.result){clearTimeout(reportTimer);reportTimer=null;reportTarget=null;return;}
    if(seen.has(current.id)||reportTarget===current.id)return;
    reportTarget=current.id;
    const show=()=>{
      if(seen.has(reportTarget)){reportTimer=null;reportTarget=null;return;}
      if(liveRound?.id!==reportTarget||!liveRound?.game.result){reportTarget=null;return;}
      if(document.hidden||window.GuandanPhone?.blocked()||document.querySelector('dialog[open]')||feedback.active||feedback.queue.length){reportTimer=setTimeout(show,300);return;}
      const id=reportTarget;window.openCurrentReview(by('reopen-review'));showReviewTab('performance');
      seen.add(id);try{localStorage.setItem(seenKey,JSON.stringify([...seen].slice(-16)));}catch{}
      reportTarget=null;reportTimer=null;
    };
    reportTimer=setTimeout(show,350);
  }
  function renderCases(){
    const list=by('assessment-cases'),filter=by('assessment-filter').value;list.replaceChildren();
    const cases=report.cases.filter(c=>filter==='all'||filter==='flush'&&c.tags.some(t=>t.includes('同花顺'))||filter==='pass'&&c.tags.includes('过牌待评')||filter==='partner'&&c.tags.includes('压队友'));
    for(const c of cases.slice(0,60)){
      const e=round.events[c.eventIndex],row=node('article',null,'assessment-case');row.append(node('strong',say('第 '+(e.index+1)+' 手 · ', 'Move '+(e.index+1)+' · ')+e.label),node('p',say(c.tags.join(' · ')+' · 复核候选，未判错','Review candidate; no error judgment')),node('small',c.indexIds.join(' · ')+say(' · 奖惩待验证',' · Reward/penalty unvalidated')));
      if(c.notDecisionReason==='rule-forced-pass')row.append(node('p',say('规则强制不出：保留事实，不作为有选择的失误节点。','Rule-forced pass: an observation, not a discretionary error.')));
      else if(c.notDecisionReason==='no-reported-alternative')row.append(node('p',say('模型只报告一个候选：不自动认定有其他出法，可人工补充合法替代意见。','One reported candidate: alternatives are unverified; reviewers may suggest a legal option.')));
      const jump=node('button',say('看这一手','View move'),'secondary-button');jump.addEventListener('click',()=>{replayIndex=c.eventIndex;by('replay-moment').value='before';showReviewTab('replay');});
      const review=node('button',say('按当时信息复核','Review actor information'),'secondary-button');review.disabled=!c.observationAvailable;review.addEventListener('click',()=>openCase(c));row.append(jump,review);list.append(row);
    }
    if(!cases.length)list.append(node('p',say('本副暂无符合筛选条件的复核候选；不表示没有战术失误。','No matching review candidates; this does not establish error-free play.')));
    if(cases.length>60)list.append(node('p',say('界面显示前 60 项，导出包含全部记录。','First 60 displayed; export includes all records.')));
  }
  function renderPlan(){
    const list=by('assessment-stages');list.replaceChildren();
    for(const stage of GuandanEvaluationProtocol.stages){const item=node('li');item.append(node('strong',stage.id+' · '+stage.name),node('p',stage.target),node('small',say('出口条件：','Exit: ')+stage.exit));list.append(item);}
    by('assessment-training-status').textContent=say('当前阶段：优化评分的玩家体感试评。手牌等价花色同分，非终局争墩去重并平滑；接续暂不加分。队伍起手参考赛后单列，不并入个人分。先收集偏高／合理／偏低反馈，训练奖惩保持关闭，DanLM 权重未改变。','Current stage: human pilot of optimized scoring. Equivalent suits score equally; nonterminal contests are deduplicated and regularized. Continuation earns no bonus. The post-round team starting reference stays separate. Collect feedback; training rewards remain disabled and DanLM weights are unchanged.');
  }
  function openCase(c){
    selectedCase=c;const obs=api.observation(round,c.eventIndex,c.seat);
    by('assessment-case-title').textContent=say('第 '+(c.eventIndex+1)+' 手 · 当时视角','Move '+(c.eventIndex+1)+' · Acting-player view');
    by('assessment-case-context').textContent=say('行动者：','Actor: ')+round.names[c.seat]+say('；打 ','; level ')+obs.level+say('；各家余牌 ','; remaining ')+obs.remaining.map((count,seat)=>GuandanCardCounts.label(count,{seat,completed:round.completed,english:en()})).join(' / ')+say('；桌面：','; table: ')+(obs.table?.play?.label||say('自由领牌','Free lead'));
    if(obs.tributeRecords.length)by('assessment-case-context').textContent+=say('；公开贡还／抗贡：','; public tribute/exemption: ')+obs.tributeRecords.map(r=>round.names[r.from]+' → '+(r.to===null?'?':round.names[r.to])+' · '+r.cardId).join('；');
    by('assessment-case-hand').replaceChildren(...obs.hand.map(c=>imageFor(c.face,c.label||GuandanCore.cardLabel(c),undefined,round.level)));
    by('assessment-case-action').textContent=say('实际选择：','Actual: ')+round.events[c.eventIndex].label;
    const history=by('assessment-case-history');history.replaceChildren();
    for(const e of round.events.slice(0,c.eventIndex)){const p=node('p',round.names[e.seat]+' · '+e.label+(e.cards.length?' · '+e.cards.map(c=>c.label||GuandanCore.cardLabel(c)).join('、'):''));history.append(p);}
    by('assessment-rating').value='';by('assessment-reason').value='';by('assessment-alternative').value='';by('assessment-feedback-status').textContent='';
    openDialog(by('assessment-case-dialog'),by('assessment-cases'));
  }
  function exportData(){
    try{
      const reports=[0,1,2,3].map(s=>{const report=api.assess(round,s);return {...report,statisticsRating:GuandanAssessmentRating.rate(round,report)};});
      const feedback=api.readFeedback(localStorage).filter(r=>r.roundId===round.id);
      downloadText('掼军-技术统计-'+round.id+'.json',JSON.stringify({schema:1,kind:'guandan-performance',exportedAt:new Date().toISOString(),standardVersion:api.STANDARD,
        provenance:globalThis.GuandanAssessmentProvenance||null,round,reports,feedback,playerFeedback:GuandanAssessmentPilot.read(localStorage).filter(r=>r.roundId===round.id),trainingEligible:false}));
      toast(say('已准备导出，请选择保存位置。','Export prepared; choose a save location.'));
    }catch(error){toast(error.message);}
  }
  by('assessment-seat').addEventListener('change',e=>{selectedSeat=Number(e.target.value);render();});
  by('assessment-filter').addEventListener('change',renderCases);
  by('assessment-export').addEventListener('click',exportData);
  by('assessment-pilot-form').addEventListener('submit',async e=>{
    e.preventDefault();const current=round,seat=selectedSeat,subject=pilotSubject,submit=e.submitter;submit.disabled=true;
    try{
      const saved=await GuandanAssessmentPilot.save(localStorage,current,seat,{handVerdict:by('assessment-pilot-hand').value,performanceVerdict:by('assessment-pilot-performance').value,
        reason:by('assessment-pilot-reason').value,eventIndex:by('assessment-pilot-event').value,suggestedHand:by('assessment-pilot-hand-score').value,suggestedPerformance:by('assessment-pilot-performance-score').value});
      if(subject===pilotSubject)by('assessment-pilot-status').textContent=say(saved.revisionOf?'已保存修订，原意见保留。':'已保存到本机。可导出反馈交给试评组织者。','Saved locally; previous revisions are retained. Export to share with the pilot organizer.');renderPilot();
    }catch(error){if(subject===pilotSubject)by('assessment-pilot-status').textContent=error.message;}finally{submit.disabled=false;}
  });
  by('assessment-pilot-export').addEventListener('click',()=>{
    try{const records=GuandanAssessmentPilot.read(localStorage);downloadText('掼军-玩家试评反馈.json',JSON.stringify({schema:1,kind:'guandan-player-pilot',version:GuandanAssessmentPilot.VERSION,records,summary:GuandanAssessmentPilot.summarize(records),includedRound:round.completed?round:null,trainingEligible:false}));
      pilotExportedIds=records.map(r=>r.id);by('assessment-pilot-status').textContent=say('导出已准备。请完成保存；当前完整牌局随附，其他牌局需另存本副评测数据。','Export prepared. Finish saving; only the current full round is attached. Export other rounds separately.');
    }catch(error){by('assessment-pilot-status').textContent=error.message;}
  });
  by('assessment-pilot-new-batch').addEventListener('click',async()=>{
    try{if(!pilotExportedIds)throw new Error('请先导出试评反馈');await GuandanAssessmentPilot.startBatch(localStorage,{acknowledged:by('assessment-pilot-ack').value==='已备份',expectedIds:pilotExportedIds});pilotExportedIds=null;by('assessment-pilot-ack').value='';renderPilot();by('assessment-pilot-status').textContent=say('已开始新试评批次，原意见请从已保存的导出文件读取。','New pilot batch started. Earlier feedback is in your saved export.');}catch(error){by('assessment-pilot-status').textContent=error.message;}
  });
  by('assessment-export-plan').addEventListener('click',()=>downloadText('掼军-评测训练方案.json',JSON.stringify({...GuandanEvaluationProtocol.proposal(),provenance:globalThis.GuandanAssessmentProvenance||null},null,2)));
  by('assessment-export-feedback').addEventListener('click',()=>{try{const feedback=api.readFeedback(localStorage);downloadText('掼军-全部复核意见.json',JSON.stringify({schema:1,kind:'expert-opinions',feedback}));exportedFeedbackIds=feedback.map(r=>r.id);by('assessment-batch-status').textContent=say('导出已准备；请完成保存后再确认开始新批次。','Export prepared; finish saving before starting a new batch.');}catch(error){toast(error.message);}});
  by('assessment-new-batch').addEventListener('click',async()=>{
    try{if(!exportedFeedbackIds)throw new Error('请先导出全部复核意见');const count=await api.startFeedbackBatch(localStorage,{acknowledged:by('assessment-backup-ack').value==='已备份',expectedIds:exportedFeedbackIds});exportedFeedbackIds=null;by('assessment-backup-ack').value='';by('assessment-batch-status').textContent=say('已开始新批次；'+count+' 条旧意见请从你保存的导出文件读取。','New batch started. Previous '+count+' opinions are in your saved export.');}catch(error){by('assessment-batch-status').textContent=error.message;}
  });
  by('assessment-feedback-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!selectedCase)return;
    const current=selectedCase,submit=e.submitter||by('assessment-feedback-form').querySelector('button[type="submit"]');submit.disabled=true;
    try{const saved=await api.saveFeedback(localStorage,round,current.eventIndex,current.seat,{reviewer:by('assessment-reviewer').value,rating:Number(by('assessment-rating').value),reason:by('assessment-reason').value,alternative:by('assessment-alternative').value});
      if(selectedCase!==current)return;
      by('assessment-feedback-status').textContent=say(saved.revisionOf?'已另存修订，初评保留；个人意见不计作已确认战术结论。':'已保存个人意见；不计作独立盲评或已确认战术结论。','Opinion saved; not a verified blind review or confirmed tactical finding.');
    }catch(error){by('assessment-feedback-status').textContent=error.message;}finally{submit.disabled=false;}
  });
  document.addEventListener('DOMContentLoaded',()=>afterRender(liveRound));
  return Object.freeze({prepare,render,exportData,afterRender});
})();
