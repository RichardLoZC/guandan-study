'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));
  else root.Tuo3Rules=factory(root.GuandanCore);
})(typeof globalThis==='object'?globalThis:this,function(core){
  const clone=value=>structuredClone(value);
  const isPoint=card=>card.rank==='3'||(card.rank==='2'&&card.suit==='hearts');
  const points=cards=>cards.reduce((sum,card)=>sum+(isPoint(card)?card.suit==='hearts'?2:1:0),0);
  const pure=cards=>cards.length>0&&cards.every(isPoint);
  const containsThree=play=>play.cards.some(card=>card.rank==='3')||play.primaryValue===3||play.sequence?.includes(3);
  function randomIndex(length){
    const buffer=new Uint32Array(1),limit=Math.floor(4294967296/length)*length;
    do{crypto.getRandomValues(buffer);}while(buffer[0]>=limit);
    return buffer[0]%length;
  }
  function create(previous){
    const state=core.newMatch(),dealt=state.game.players;
    const cards=dealt.flatMap(player=>player.hand).filter(card=>card.suit!=='joker');
    const flipped=cards[randomIndex(cards.length)];
    const holder=dealt.findIndex(player=>player.hand.some(card=>card.id===flipped.id));
    const twin=cards.find(card=>card.id!==flipped.id&&card.rank===flipped.rank&&card.suit===flipped.suit);
    const other=dealt.findIndex(player=>player.hand.some(card=>card.id===twin.id));
    const priorIds=previous?.tuo3.playerIds||[0,1,2,3];
    let playerIds=[...priorIds];
    if(holder!==other){
      const pair=[holder,other],partner=pair.includes(0)?pair.find(id=>id!==0):[1,2,3].find(id=>!pair.includes(id));
      const opponents=priorIds.filter(id=>id!==0&&id!==partner);
      playerIds=[0,opponents[0],partner,opponents[1]];
    }
    state.ruleMode='tuo3';state.round=(previous?.round||0)+1;
    state.game.players=playerIds.map((id,seat)=>({...dealt[id],seat,team:seat%2,isHuman:seat===0,name:core.names[id]}));
    const starter=playerIds.indexOf(holder);
    state.game.currentPlayer=state.game.starter=starter;
    state.game.lastActions=Object.fromEntries(playerIds.map((id,seat)=>[seat,seat===starter?'翻牌先手':'等待出牌']));
    const flipper=previous?previous.tuo3.playerIds[previous.game.finishOrder[0]]:randomIndex(4);
    state.tuo3={version:1,playerIds,totals:[...(previous?.tuo3.totals||[0,0,0,0])],
      flipped:clone(flipped),twin:clone(twin),holder:starter,other:playerIds.indexOf(other),flipper,
      sameHolder:holder===other,securedSeat:null,hardLead:null,drags:[],settlement:null};
    state.known=[{card:clone(flipped),seat:starter},{card:clone(twin),seat:playerIds.indexOf(other)}];
    state.notice=[`${core.names[flipper]}翻出 ${core.cardLabel(flipped)}；${core.names[holder]}先出。`,
      holder===other?(previous?'两张同牌在同一家，沿用上副对家。':'两张同牌在同一家，保留初始搭档。'):'按两张同花同点牌重新配对，搭档自动对坐。',
      `本副搭档：你与${core.names[playerIds[2]]}；${core.names[playerIds[1]]}与${core.names[playerIds[3]]}。`];
    state.game.message=state.notice.join(' ');
    return state;
  }
  function validate(state){
    if(state.ruleMode!=='tuo3')return;
    const t=state.tuo3;
    if(state.level!=='2'||state.levels.some(level=>level!=='2')||state.phase!=='playing'||
      !t||t.version!==1||!Array.isArray(t.playerIds)||t.playerIds.length!==4||t.playerIds[0]!==0||
      [...t.playerIds].sort().join()!=='0,1,2,3'||!Array.isArray(t.totals)||t.totals.length!==4||!t.totals.every(Number.isSafeInteger)||
      !Array.isArray(t.drags)||!t.flipped||!t.twin||t.flipped.id===t.twin.id||t.flipped.rank!==t.twin.rank||t.flipped.suit!==t.twin.suit||
      ![t.holder,t.other,t.flipper].every(seat=>Number.isInteger(seat)&&seat>=0&&seat<4)||
      ![t.securedSeat,t.hardLead].every(seat=>seat===null||Number.isInteger(seat)&&seat>=0&&seat<4))
      throw new Error('拖 3 存档不完整，已保留原始数据。');
    if(Boolean(state.game.result)!==Boolean(t.settlement))throw new Error('拖 3 结算记录不完整');
  }
  function restriction(state,play,seat){
    if(play.type==='full-house'&&play.primaryValue!==3&&play.cards.some(card=>card.rank==='3'))return '拖 3 的三带二不能带对 3';
    if(!state.game.actionHistory.length&&containsThree(play))return '本副第一手不能出任何含 3 的牌型';
    if(state.tuo3.hardLead===seat&&containsThree(play)){
      const all=play.cards.length===state.game.players[seat].hand.length;
      if(!(all&&(pure(play.cards)||play.type==='straight-flush')))return '硬接风首手不能带 3；仅剩纯三或含 3 的同花顺时可以整手出完';
    }
    return null;
  }
  function canDrag(state,seat,cards){
    const game=state.game,order=game.finishOrder;
    return pure(cards)&&cards.length===game.players[seat].hand.length&&!game.tablePlay&&
      (state.tuo3.securedSeat===seat||state.tuo3.hardLead===seat)&&
      (order.length===0||(order.length===1&&order[0]%2===seat%2));
  }
  function settlement(state){
    const game=state.game,order=game.finishOrder,winner=order[0]%2,base=game.result.levelDelta;
    const teamComponents=[{placement:0,drag:0,remainder:0},{placement:0,drag:0,remainder:0}],details=[];
    function transfer(team,kind,value,label,cards=[]){
      teamComponents[team][kind]+=value;teamComponents[1-team][kind]-=value;
      details.push({team,kind,value,label,cards:clone(cards)});
    }
    transfer(winner,'placement',base,`头游与搭档分列 1、${order.indexOf((order[0]+2)%4)+1} 名`);
    for(const drag of state.tuo3.drags)transfer(drag.seat%2,'drag',drag.points,game.players[drag.seat].name+'拖三',drag.cards);
    for(const player of game.players){
      const cards=player.hand.filter(isPoint),value=points(cards);
      if(value)transfer(player.seat%2,'remainder',-value,player.name+'剩余分牌',cards);
    }
    const rows=game.players.map(player=>{
      const identity=state.tuo3.playerIds[player.seat],parts=teamComponents[player.team];
      const delta=parts.placement+parts.drag+parts.remainder;
      return {seat:player.seat,identity,name:player.name,...parts,delta,before:state.tuo3.totals[identity],total:state.tuo3.totals[identity]+delta};
    });
    return {rows,details};
  }
  function afterPlay(state,game,seat,play){
    const t=clone(state.tuo3),drag=canDrag(state,seat,play.cards);
    t.securedSeat=null;t.hardLead=null;
    if(drag){
      t.drags.push({seat,points:points(play.cards),cards:clone(play.cards),index:game.actionHistory.length-1});
      const label='拖三 · '+play.cards.map(core.cardLabel).join(' ');
      game={...game,actionHistory:game.actionHistory.map((entry,index)=>index===game.actionHistory.length-1?{...entry,drag:true,action:'拖三成功',play:{...entry.play,label}}:entry),
        lastActions:{...game.lastActions,[seat]:'拖三成功'},message:game.players[seat].name+'拖三成功'};
      if(!game.result){
        const partner=(seat+2)%4;t.hardLead=partner;
        game={...game,tablePlay:null,passedPlayers:[],currentPlayer:partner,
          message:game.players[seat].name+'拖三成功；'+game.players[partner].name+'硬接风，其他玩家不能压。'};
        game.actionHistory[game.actionHistory.length-1]={...game.actionHistory.at(-1),tableOwnerAfter:null,tablePlayAfter:null,hardWindTo:partner};
      }
    }
    let next={...state,game,tuo3:t};
    if(game.result){
      t.settlement=settlement(next);
      for(const row of t.settlement.rows)t.totals[row.identity]=row.total;
      const mine=t.settlement.rows[0].delta,summary=`本副名次已定；你${mine>=0?' +':' '}${mine}分，累计 ${t.totals[0]}分。固定打 2，不升级。`;
      next.game={...game,result:{...game.result,levelDelta:0,summary,badge:(mine>=0?'+':'')+mine+'分'},message:summary};
    }
    return next;
  }
  function afterPass(state,game){
    const t={...state.tuo3};
    if(!game.tablePlay){const owner=state.game.tablePlay.owner;t.securedSeat=game.players[owner].finished?null:owner;}
    return {...state,game,tuo3:t};
  }
  function hint(state){
    if(state.game.result)return '本副已结算，个人积分已累计';
    if(!state.game.actionHistory.length)return '本副首手禁 3 · 三带二全程不能带对 3';
    if(state.tuo3.hardLead!==null)return state.game.players[state.tuo3.hardLead].name+'硬接风：首手禁 3，仅剩纯三／同花顺例外';
    if(state.game.finishOrder.length){
      const head=state.game.finishOrder[0],partner=(head+2)%4;
      return state.game.players[head].name+'头游；'+state.game.players[partner].name+'争二游可拖三，敌家需尽快跑分牌';
    }
    return '拖三需先收回牌权，再以纯 3／红桃 2 收尾';
  }
  return {create,validate,restriction,canDrag,afterPlay,afterPass,hint,points,pure,isPoint};
});
