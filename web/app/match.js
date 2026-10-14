'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('./tuo3.js'),require('./tribute-strategy.js'),require('./play-choices.js'));
  else root.GuandanMatch=factory(root.GuandanCore,root.Tuo3Rules,root.GuandanTributeStrategy,root.GuandanPlayChoices);
})(typeof globalThis==='object'?globalThis:this,function(core,tuo3,tributeStrategy,playChoices){
  const SAVE_KEY='guandan-trainer-v2', ARCHIVE_KEY='guandan-study-reviews-v1';
  const clone=value=>structuredClone(value);
  const ranks=new Set(['2','3','4','5','6','7','8','9','10','J','Q','K','A','SJ','BJ']);
  const suits=new Set(['hearts','spades','clubs','diamonds','joker']);
  const face=card=>card.suit==='joker'?(card.rank==='BJ'?'redJoker':'blackJoker'):
    ({hearts:'heart',spades:'spade',clubs:'club',diamonds:'diamond'}[card.suit])+({A:'Ace',K:'King',Q:'Queen',J:'Jack'}[card.rank]||card.rank);
  const decorate=card=>({...card,face:face(card),label:core.cardLabel(card)});
  const decoratePlay=play=>play?{...clone(play),cards:play.cards.map(decorate)}:null;
  const decorateTable=table=>table?{owner:table.owner,play:decoratePlay(table.play)}:null;
  function endingPlay(history,finishOrder){
    const index=history.findLastIndex(event=>(event.play?.cards||event.cards)?.length);
    if(index<0)return null;
    const event=history[index],play=event.play||event;
    return {index,seat:event.seat,label:play.label,cards:play.cards.map(decorate),place:finishOrder.indexOf(event.seat)+1||null};
  }
  function validate(state){
    const seat=value=>Number.isInteger(value)&&value>=0&&value<4;
    const seats=value=>Array.isArray(value)&&value.every(seat)&&new Set(value).size===value.length;
    const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
    const fail=message=>{throw new Error(message+'，已保留原始数据。');};
    if(state?.version!==2||!ranks.has(state.level)||state.level==='SJ'||state.level==='BJ'||
      !Array.isArray(state.game?.players)||state.game.players.length!==4||
      !['playing','give','return'].includes(state.phase)||!Array.isArray(state.game.actionHistory)||
      !Array.isArray(state.levels)||state.levels.length!==2||!state.levels.every(rank=>ranks.has(rank)&&!['SJ','BJ'].includes(rank))||
      !Array.isArray(state.wins)||state.wins.length!==2||!state.wins.every(value=>Number.isSafeInteger(value)&&value>=0)||
      !Number.isSafeInteger(state.round)||state.round<1||typeof state.id!=='string'||!state.id||
      !Array.isArray(state.exchanges)||!seat(state.game.currentPlayer)||!seat(state.game.starter))
      throw new Error('存档结构不完整，已保留原始数据。请导出后再重开。');
    const game=state.game,owners=new Map();
    const held=state.game.players.flatMap((player,seat)=>{
      if(!player||player.seat!==seat||!Array.isArray(player.hand)||player.team!==seat%2||
        typeof player.finished!=='boolean'||player.finished!==(player.hand.length===0))fail('存档座位或出完标记无效');
      for(const card of player.hand)if(card)owners.set(card.id,seat);
      return player.hand;
    });
    const played=state.game.actionHistory.flatMap(event=>{
      if(!event||!seat(event.seat)||(event.play!=null&&(!Array.isArray(event.play.cards)||!event.play.cards.length)))fail('存档行动记录无效');
      for(const card of event.play?.cards||[])if(card)owners.set(card.id,event.seat);
      return event.play?.cards||[];
    });
    const cards=[...held,...played];
    const validCard=card=>Boolean(card&&typeof card.id==='string'&&ranks.has(card.rank)&&suits.has(card.suit)&&
      (card.suit==='joker')===['SJ','BJ'].includes(card.rank)&&card.isWild===(card.suit==='hearts'&&card.rank===state.level)&&
      [1,2].some(deck=>card.id===deck+'-'+card.suit+'-'+card.rank&&(card.deck===undefined||card.deck===deck)));
    if(cards.length!==108||cards.some(card=>!validCard(card))||new Set(cards.map(card=>card.id)).size!==108)
      fail('存档中的实体牌不完整、重复或牌面与编号不符');
    const cardById=new Map(cards.map(card=>[card.id,card]));
    const reference=card=>validCard(card)&&cardById.has(card.id);
    const finished=game.players.filter(player=>player.finished).map(player=>player.seat),order=game.finishOrder;
    if(!seats(order)||!seats(game.passedPlayers)||game.passedPlayers.some(value=>game.players[value].finished))fail('存档名次或不出记录无效');
    if(game.result==null){
      if(order.length!==finished.length||order.some(value=>!game.players[value].finished)||order.length>2||
        (order.length===2&&order[0]%2===order[1]%2)||
        (state.phase==='playing'&&game.players[game.currentPlayer].finished))fail('存档名次与剩余手牌不一致');
    }else{
      const count=finished.length,winner=order[0]%2,partnerPlace=order.indexOf((order[0]+2)%4)+1;
      if(!record(game.result)||order.length!==4||![2,3].includes(count)||
        !order.slice(0,count).every(value=>game.players[value].finished)||
        (count===2&&order[0]%2!==order[1]%2)||(count===3&&order[0]%2===order[1]%2)||
        game.result.winnerTeam!==winner||game.result.levelDelta!==(state.ruleMode==='tuo3'?0:5-partnerPlace))
        fail('存档终局结果与名次不一致');
    }
    if(game.winnerTeam!=null&&game.winnerTeam!==game.result?.winnerTeam)fail('存档胜方记录不一致');
    if(game.tablePlay!=null){
      const table=game.tablePlay,play=table.play;
      if(!seat(table.owner)||!play||!Array.isArray(play.cards)||!play.cards.length||
        play.cards.some(card=>!reference(card)||owners.get(card.id)!==table.owner||held.some(heldCard=>heldCard.id===card.id))||
        game.passedPlayers.includes(table.owner)||(game.result==null&&table.owner===game.currentPlayer))fail('存档桌面牌引用无效');
      core.setLevel(state.level);
      if(!core.recognizeRecorded(play.cards).some(legal=>legal.key===play.key&&legal.type===play.type&&legal.primaryValue===play.primaryValue&&legal.size===play.size))
        fail('存档桌面牌型与牌面不一致');
    }else if(game.passedPlayers.length)fail('存档无桌面牌但仍有不出记录');
    if(!Number.isInteger(state.returnIndex)||state.returnIndex<0||state.returnIndex>state.exchanges.length||state.exchanges.length>2)
      fail('还贡进度无效');
    const tribute=state.tribute;
    if(tribute){
      if(!seats(tribute.donors)||![1,2].includes(tribute.donors.length)||!seats(tribute.winners)||
        tribute.winners.length!==tribute.donors.length||tribute.donors.some(value=>tribute.winners.includes(value))||
        !Array.isArray(tribute.offers)||tribute.offers.length>tribute.donors.length||
        tribute.offers.some((offer,index)=>!offer||(state.phase==='give'&&offer.from!==tribute.donors[index])||!tribute.donors.includes(offer.from)||!reference(offer.card))||
        new Set(tribute.offers.map(offer=>offer.from)).size!==tribute.offers.length)fail('贡牌记录不完整或引用无效');
    }
    if(state.phase==='give'){
      if(!tribute||tribute.offers.length>=tribute.donors.length||state.exchanges.length||
        tribute.offers.some(offer=>owners.get(offer.card.id)!==offer.from))fail('待进贡记录无效');
    }else if(tribute&&(tribute.offers.length!==tribute.donors.length||state.exchanges.length!==tribute.donors.length||
      tribute.offers.some(offer=>!state.exchanges.some(exchange=>exchange?.from===offer.from&&exchange.given?.id===offer.card.id)))){
      fail('贡牌尚未收齐却已进入下一阶段');
    }
    const from=new Set(),to=new Set();
    for(const [index,exchange] of state.exchanges.entries()){
      if(!exchange||!seat(exchange.from)||!seat(exchange.to)||exchange.from===exchange.to||from.has(exchange.from)||to.has(exchange.to)||
        !reference(exchange.given)||(exchange.returned!=null&&!reference(exchange.returned))||
        Boolean(exchange.returned)!==(index<state.returnIndex)||
        (tribute&&(!tribute.donors.includes(exchange.from)||!tribute.winners.includes(exchange.to))))fail('贡还交换记录无效');
      from.add(exchange.from);to.add(exchange.to);
      const givenOwner=exchange.returned?.id===exchange.given.id?exchange.from:exchange.to;
      if(owners.get(exchange.given.id)!==givenOwner||exchange.returned&&owners.get(exchange.returned.id)!==exchange.from)
        fail('贡还牌持有人与交换记录不一致');
    }
    if(state.phase==='return'&&(!state.exchanges[state.returnIndex]||!tribute||tribute.offers.length!==state.exchanges.length))fail('还贡存档不完整');
    if(state.phase==='playing'&&state.returnIndex!==state.exchanges.length)fail('贡还未完成却已进入出牌阶段');
    if(state.phase!=='playing'&&(game.actionHistory.length||game.result||game.tablePlay||order.length))fail('贡还阶段混入出牌记录');
    if(state.antiTribute!=null){
      if(!Array.isArray(state.antiTribute)||state.antiTribute.length!==2||state.phase!=='playing'||state.exchanges.length||tribute||
        new Set(state.antiTribute.map(item=>item?.cardId)).size!==2||state.antiTribute.some(item=>!item||!seat(item.seat)||
          cardById.get(item.cardId)?.rank!=='BJ'||owners.get(item.cardId)!==item.seat))fail('抗贡明牌引用无效');
    }
    if(!Array.isArray(state.known)||state.known.some(item=>!item||!seat(item.seat)||!reference(item.card)))fail('公开贡还牌记录无效');
    if(state.study!=null&&(!record(state.study)||(state.study.choices!=null&&!record(state.study.choices))))fail('复盘记录结构无效');
    if(state.ruleMode&&!['classic','tuo3'].includes(state.ruleMode))throw new Error('不支持此存档的玩法');
    tuo3.validate(state);
    return state;
  }
  function read(storage){
    const raw=storage.getItem(SAVE_KEY);
    if(!raw)return new Match(core.newMatch());
    let state;
    try{state=JSON.parse(raw);validate(state);}catch(error){throw new Error('无法恢复牌局：'+error.message);}
    const match=new Match(state);
    try{if(!storage.getItem(SAVE_KEY+'-before-1.1'))storage.setItem(SAVE_KEY+'-before-1.1',raw);}
    catch{match.loadWarning='原牌局已恢复，但旧版备份未能写入；建议导出存档备份。';}
    return match;
  }
  class Match{
    constructor(state=core.newMatch()){
      this.state=clone(validate(state));
      this.state.study??={version:1,choices:{}};
      this.state.study.choices??={};
      this.revision=0;
    }
    get id(){return this.state.id;}
    get isTuo3(){return this.state.ruleMode==='tuo3';}
    get playerIds(){return this.state.tuo3?.playerIds||[0,1,2,3];}
    get level(){return this.state.level;}
    get game(){return this.state.game;}
    get phase(){return this.state.phase;}
    get names(){return this.playerIds.map(id=>core.names[id]);}
    get actingSeat(){return this.phase==='give'?core.donor(this.state):this.phase==='return'?this.state.exchanges[this.state.returnIndex]?.to:this.game.currentPlayer;}
    get needsTributeConfirmation(){
      return !this.game.result&&this.phase==='playing'&&!this.game.actionHistory.length&&
        Boolean(this.isTuo3||this.state.exchanges.length||this.state.antiTribute?.length)&&this.state.study.tributeAcknowledged!==true;
    }
    acknowledgeTribute(expectedRevision=this.revision){
      if(expectedRevision!==this.revision)throw new Error('牌局已变化，请重新确认');
      if(!this.needsTributeConfirmation)throw new Error('当前无需确认贡还');
      this.state={...this.state,study:{...this.state.study,tributeAcknowledged:true}};
      this.revision++;
    }
    get canAct(){return !this.game.result&&!this.needsTributeConfirmation&&this.actingSeat===0;}
    get tributeChoices(){return (this.phase==='give'?core.giveChoices(this.state):this.phase==='return'?core.returnChoices(this.state):[]).map(decorate);}
    chooseTribute(){
      const choices=this.tributeChoices;
      if(!choices.length)throw new Error('当前没有合法的贡还牌');
      if(this.phase==='give')return {card:choices[0],reason:'按规则进贡最大的非逢人配牌。',assessment:null,candidates:choices.map(card=>({card})),method:'maximum-tribute'};
      return tributeStrategy.choose({hand:this.game.players[this.actingSeat].hand,level:this.level,choices});
    }
    get tributeDisplay(){
      const state=this.state;
      const complete=this.phase==='playing',awaitingConfirmation=this.needsTributeConfirmation;
      const common={complete,awaitingConfirmation,starter:complete?this.game.starter:null};
      if(this.isTuo3){
        const t=state.tuo3;
        return {...common,mode:'拖 3',title:'翻牌定搭档 · 本副打 2',
          reason:core.names[t.flipper]+'翻出 '+core.cardLabel(t.flipped)+'；'+(t.sameHolder?'两张同牌在一家，保留原搭档。':'两张同花同点牌的持有者配对，已安排对坐。'),
          message:'你与'+this.names[2]+'搭档；'+this.names[1]+'与'+this.names[3]+'搭档。'+this.names[this.game.starter]+'先出，首手禁 3。',
          rows:[{kind:'翻牌',from:t.holder,to:null,card:decorate(t.flipped),status:'先手',active:false},
            {kind:'同牌',from:t.other,to:null,card:decorate(t.twin),status:t.sameHolder?'两牌同家':'同牌配对',active:false}]};
      }
      if(state.antiTribute?.length){
        const cards=[...this.game.players.flatMap(player=>player.hand),...this.game.actionHistory.flatMap(event=>event.play?.cards||[])];
        const holders=[...new Set(state.antiTribute.map(record=>record.seat))];
        const reason=holders.map(seat=>this.names[seat]).join('、')+(holders.length===1?'持有两张大王':'合计持有两张大王')+'，满足抗贡条件。';
        return {...common,title:'抗贡 · 无需贡还',mode:'抗贡',reason,
          message:'两张大王已亮明，不进贡、不还贡；'+this.names[this.game.starter]+'先手。',rows:state.antiTribute.map(record=>({
          kind:'抗贡',from:record.seat,to:null,card:decorate(cards.find(card=>card.id===record.cardId)),status:'抗贡亮明',active:false
        }))};
      }
      if(!state.tribute?.donors?.length&&!state.exchanges.length)return null;
      const donors=state.tribute?.donors||state.exchanges.map(exchange=>exchange.from),double=donors.length===2;
      const mode=double?'双贡':'单贡';
      const reason=donors.map(seat=>this.names[seat]).join('、')+(double?'上副双下':'上副末游')+'；未满足两张大王的抗贡条件，需'+mode+'。';
      const actor=this.names[this.actingSeat];
      if(this.phase==='give')return {...common,mode,reason,
        title:mode+' · 等待'+actor+'进贡',
        message:(this.actingSeat===0?'请选一张标记的最大非逢人配牌，点击「确认进贡」。':'正在等待'+actor+'选贡牌。')+(double?'两家亮贡后按牌点确定收贡对象。':''),
        rows:state.tribute.donors.map(from=>{const offer=state.tribute.offers.find(offer=>offer.from===from);return {
          kind:'进贡',from,to:state.tribute.donors.length===1?state.tribute.winners[0]:null,
          card:offer?decorate(offer.card):null,status:offer?'已亮贡 · 待分配':'尚未亮贡',active:from===this.actingSeat
        };})
      };
      return {...common,mode,reason,title:this.phase==='return'?mode+' · 等待'+actor+'还贡':'贡还完成',
        message:this.phase==='return'?(this.actingSeat===0?'请从标记的手牌中选一张，点击「确认还贡」。':'正在等待'+actor+'还贡，你暂时无需操作。'):this.names[this.game.starter]+'先手；贡还牌面与流向会在本副牌桌上保留。',
        rows:state.exchanges.flatMap((exchange,index)=>[
          {kind:'进贡',from:exchange.from,to:exchange.to,card:decorate(exchange.given),status:'已收到',active:false},
          {kind:'还贡',from:exchange.to,to:exchange.from,card:exchange.returned?decorate(exchange.returned):null,
            status:exchange.returned?'已还贡':'等待选牌',active:this.phase==='return'&&index===state.returnIndex}
        ])};
    }
    get hand(){core.setLevel(this.level);return core.sortCards(this.game.players[0].hand).map(decorate);}
    get finalPlay(){return this.game.result?endingPlay(this.game.actionHistory,this.game.finishOrder):null;}
    get revealedHands(){
      if(!this.game.result)return [];
      core.setLevel(this.level);
      return this.game.finishOrder.filter(seat=>this.game.players[seat].hand.length).map(seat=>({
        seat,cards:core.sortCards(this.game.players[seat].hand).map(decorate)
      }));
    }
    selection(ids,seat=this.actingSeat,key){
      if(this.needsTributeConfirmation)return {error:this.isTuo3?'请先看清翻牌与搭档，再点击「开始出牌」':'请先看清贡还结果，再点击「开始出牌」'};
      if(this.game.result||seat!==this.actingSeat)return {error:'现在尚未轮到此玩家'};
      if(!ids.length)return {error:'请选择手牌'};
      if(new Set(ids).size!==ids.length)return {error:'同一张实体牌不能重复使用'};
      const cards=ids.map(id=>this.game.players[seat].hand.find(card=>card.id===id));
      if(cards.some(card=>!card))return {error:'所选牌已不在手中，请重新选择'};
      if(this.phase!=='playing'){
        const choices=this.tributeChoices;
        return ids.length===1&&choices.some(card=>card.id===ids[0])?{tribute:cards[0]}:{error:this.phase==='give'?'请选择最大的非逢人配牌进贡':'请选择允许还贡的一张牌'};
      }
      core.setLevel(this.level);
      const recognized=core.recognize(cards),beating=core.filterPlays(recognized,this.game.tablePlay?.play);
      const plays=playChoices.strongestFirst(this.isTuo3?beating.filter(play=>!tuo3.restriction(this.state,play,seat)):beating);
      if(beating.length&&!plays.length)return {error:tuo3.restriction(this.state,beating[0],seat)};
      if(!plays.length)return {error:recognized.length?'所选牌压不过桌面上的'+this.game.tablePlay.play.label:'这些牌不能组成合法牌型'};
      const play=key?plays.find(play=>play.key===key):plays[0];
      return play?{play,plays}:{error:'所选牌型已失效，请重新选择'};
    }
    commit(seat,ids,{expectedRevision=this.revision,key,engine=null,teaching=null,automatic=false}={}){
      if(expectedRevision!==this.revision)throw new Error('牌局已变化，请重新选择');
      if(this.needsTributeConfirmation)throw new Error(this.isTuo3?'请先看清翻牌与搭档，再点击「开始出牌」':'请先看清贡还结果，再点击「开始出牌」');
      if(this.game.result||seat!==this.actingSeat)throw new Error('现在不能由此玩家行动');
      core.setLevel(this.level);
      let checked;
      if(ids.length){
        checked=this.selection(ids,seat,key);if(checked.error)throw new Error(checked.error);
        if(checked.plays?.length>1&&!key)throw new Error('这组牌有多种解释，请先声明牌型');
      }
      let next;
      if(this.phase==='give'||this.phase==='return'){
        if(!checked?.tribute)throw new Error('请选择一张贡还牌');
        next=this.phase==='give'?core.give(this.state,ids[0]):core.returnCard(this.state,ids[0]);
      }else{
        if(!ids.length&&!this.game.tablePlay)throw new Error('领出时不能不出');
        const game=ids.length?core.applyPlay(this.game,seat,checked.play):core.applyPass(this.game,seat);
        const study=clone(this.state.study);
        study.choices[this.game.actionHistory.length]={automatic,engine,teaching:seat===0?clone(teaching):null};
        next=this.isTuo3?(ids.length?tuo3.afterPlay(this.state,game,seat,checked.play):tuo3.afterPass(this.state,game)):{...this.state,game};
        next.study=study;
      }
      this.state=validate(next);this.revision++;
    }
    commitModel(response,revision,seat){
      const candidate=response?.result?.candidates?.[0];
      if(!candidate||!['pass','play'].includes(candidate.type))throw new Error('模型未返回有效打法，请重试');
      this.commit(seat,candidate.type==='play'?candidate.play.cards.map(card=>card.id):[],{
        expectedRevision:revision,key:candidate.play?.key,engine:response.result.engine,automatic:true});
    }
    adaptModel(response,seat=this.actingSeat){
      if(!this.isTuo3)return response;
      const legal=candidate=>candidate.type==='pass'?Boolean(this.game.tablePlay):candidate.type==='play'&&!this.selection(candidate.play.cards.map(card=>card.id),seat,candidate.play.key).error;
      const candidates=(response.result?.candidates||[]).filter(legal);
      let chosen=candidates[0],reason='已按本副搭档和拖 3 出牌限制筛选 DanLM 候选。';
      const hand=this.game.players[seat].hand;
      if(tuo3.canDrag(this.state,seat,hand)){
        const play=core.recognize(hand).find(play=>!tuo3.restriction(this.state,play,seat));
        if(play){chosen={type:'play',play,score:0};reason='上一轮已收回牌权（或正在硬接风），手中仅剩纯三；本手可拖三，给本副两位搭档各加 '+tuo3.points(hand)+' 分。';}
      }
      if(!chosen){
        const alternatives=(response.allPlays||[]).map(play=>({type:'play',play,score:0})).filter(legal);
        alternatives.sort((a,b)=>b.play.cards.length-a.play.cards.length||a.play.primaryValue-b.play.primaryValue);
        chosen=alternatives[0]||(this.game.tablePlay?{type:'pass',score:0}:null);
        reason='原模型候选不符合拖 3 限制，改用合法牌型备选。';
      }
      if(!chosen)throw new Error('没有找到合法的拖 3 打法');
      return {...response,result:{...response.result,candidates:[chosen,...candidates.filter(candidate=>candidate!==chosen)],engine:'DanLM + 拖3规则筛选'},
        advanced:null,selectedNotes:null,notes:[reason,'本副搭档：'+this.names[(seat+2)%4]+'。'+tuo3.hint(this.state),
          '基础模型仍是掼蛋 DanLM；禁出、拖三和计分由规则层处理，模型权重没有针对拖 3 重新训练。']};
    }
    observation(seat=this.actingSeat){
      if(this.phase!=='playing')throw new Error('贡还阶段不进行模型出牌');
      return core.observation(this.game,seat,this.level,this.state.known,this.state.levels,core.tributeRecords(this.state));
    }
    persist(storage){storage.setItem(SAVE_KEY,JSON.stringify(this.state));}
    next(){if(!this.game.result)throw new Error('本局尚未结束');return new Match(this.isTuo3?tuo3.create(this.state):core.newMatch(this.state));}
    get events(){
      core.setLevel(this.level);
      const history=this.game.actionHistory;
      let own=core.sortCards([...this.game.players[0].hand,...history.filter(event=>event.seat===0).flatMap(event=>event.play?.cards||[])]).map(decorate);
      let counts=this.game.players.map((player,seat)=>player.hand.length+history.filter(event=>event.seat===seat).reduce((n,event)=>n+(event.play?.cards.length||0),0));
      let table=null,trick=1;
      return history.map((entry,index)=>{
        const before=clone(own),remainingBefore=[...counts],tableBefore=clone(table),cards=(entry.play?.cards||[]).map(decorate);
        if(entry.seat===0){const ids=new Set(cards.map(card=>card.id));own=own.filter(card=>!ids.has(card.id));}
        counts=[...counts];counts[entry.seat]-=cards.length;
        table=entry.tablePlayAfter?{owner:entry.tableOwnerAfter,play:decoratePlay(entry.tablePlayAfter)}:null;
        const metadata=this.state.study.choices[index]||{};
        const event={index,seat:entry.seat,label:entry.play?.label||'不出',cards,kind:entry.play?(core.isBomb(entry.play)?'bomb':entry.play.type):'pass',
          remainingBefore,remaining:[...counts],ownBefore:before,ownAfter:clone(own),tableBefore,tableAfter:clone(table),
          automatic:metadata.automatic??entry.seat!==0,engine:metadata.engine||null,teaching:metadata.teaching||null,
          previousOwner:tableBefore?.owner??null,finished:counts[entry.seat]===0,trick};
        if(!table)trick++;return event;
      });
    }
    snapshot(){
      const events=this.events,my=events.filter(event=>event.seat===0),result=this.game.result;
      const finished=events.filter(event=>event.finished&&event.cards.length).map(event=>event.seat);
      const keys=[];const add=event=>{if(event&&!keys.includes(event))keys.push(event);};
      add(my.find(event=>event.teaching));add(my.find(event=>event.kind==='bomb'));add(my.findLast(event=>event.finished));
      for(const event of my){if(keys.length>=3)break;add(event);}
      return {id:this.id,round:this.state.round,level:this.level,names:[...this.names],playerIds:[...this.playerIds],ruleMode:this.isTuo3?'tuo3':'classic',
        settlement:clone(this.state.tuo3?.settlement||null),totals:clone(this.state.tuo3?.totals||null),
        source:'本机实际对局 · DanLM 与规则解读',
        events,initialOwnHand:events[0]?.ownBefore||this.hand,completed:Boolean(result),winnerTeam:result?.winnerTeam??null,
        levelDelta:result?.levelDelta??0,placement:result?.placementKey??null,actuallyFinished:finished,
        finishOrder:result?[...this.game.finishOrder]:[...finished,...[0,1,2,3].filter(seat=>!finished.includes(seat))],
        remaining:this.game.players.map(player=>player.hand.length),revealedHands:this.revealedHands,finalPlay:this.finalPlay,
        stats:{actions:events.length,myPlays:my.filter(event=>event.cards.length).length,myPasses:my.filter(event=>!event.cards.length).length,myBombs:my.filter(event=>event.kind==='bomb').length},
        keyDecisions:keys.slice(0,3).map(event=>({eventIndex:event.index,title:event.finished?'最后一手怎样出完':event.kind==='bomb'?'回看这次炸弹':event.teaching?'对照当时的模型建议':'回看这次选择',
          tag:event.teaching?'当时的模型建议':'实际行动',actual:event.label,alternative:event.teaching?.label||'当时没有请求模型建议',
          body:'行动前你有'+event.ownBefore.length+'张牌，'+(event.tableBefore?'桌面是'+this.names[event.tableBefore.owner]+'的'+event.tableBefore.play.label:'由你领出')+'。本手'+event.label+'，之后剩'+event.ownAfter.length+'张。'+(event.teaching?.reason||'可回到行动前查看手牌和公开桌面。')+' 复盘不以最终胜负判断这一步优劣。'}))};
    }
  }
  function archiveRecords(storage){const raw=storage.getItem(ARCHIVE_KEY);if(!raw)return[];const list=JSON.parse(raw);if(!Array.isArray(list))throw new Error('历史复盘数据损坏，请先导出存档');return list;}
  function archives(storage){return archiveRecords(storage).map(record=>{
    if(!record.state)return {...record,finalPlay:record.completed?endingPlay(record.events||[],record.finishOrder||[]):null};
    const match=new Match(record.state);
    // LAN seats are relative to this device; restore the names and identities
    // alongside the compact state instead of falling back to the solo bots.
    for(const key of ['names','playerIds'])if(Array.isArray(record[key])&&record[key].length===4)
      Object.defineProperty(match,key,{value:clone(record[key])});
    const snapshot=match.snapshot();
    if(typeof record.source==='string')snapshot.source=record.source;
    return snapshot;
  });}
  function archive(storage,match,{source}={}){
    if(!match.game.result)return;
    // Store each actual card and action once. Replay snapshots are reconstructed on read.
    // Evict the oldest archived rounds before allowing quota pressure to block the next deal.
    const record={id:match.id,state:clone(match.state),names:[...match.names],playerIds:[...match.playerIds]};
    if(typeof source==='string')record.source=source;
    const list=[record,...archiveRecords(storage).filter(item=>item.id!==match.id)].slice(0,8);
    while(list.length>1&&JSON.stringify(list).length>1000000)list.pop();
    for(;;){try{storage.setItem(ARCHIVE_KEY,JSON.stringify(list));return;}catch(error){if(list.length<=1)throw error;list.pop();}}
  }
  function create(mode='classic'){if(!['classic','tuo3'].includes(mode))throw new Error('请选择支持的玩法');return new Match(mode==='tuo3'?tuo3.create():core.newMatch());}
  return {Match,create,read,validate,archive,archives,decorate,decoratePlay,decorateTable,SAVE_KEY,ARCHIVE_KEY};
});
