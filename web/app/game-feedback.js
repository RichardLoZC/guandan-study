'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./series.js'),require('./card-counts.js'));
  else root.GuandanFeedback=factory(root.GuandanSeries,root.GuandanCardCounts);
})(globalThis,function(series,cardCounts){
  const bombTypes=new Set(['bomb','straight-flush','joker-bomb']);
  class Tracker{
    prime(round){
      this.id=round?.id;this.cursor=round?.game.actionHistory.length||0;
      this.places=round?.game.finishOrder.length||0;this.ended=Boolean(round?.game.result);this.phase=round?.phase;
      this.offers=new Set((round?.state?.tribute?.offers||[]).map(offer=>offer.card?.id).filter(Boolean));
      this.returns=new Set((round?.state?.exchanges||[]).map(exchange=>exchange.returned?.id).filter(Boolean));
    }
    collect(round){
      if(this.id!==round.id){this.prime(round);return [];}
      const game=round.game,history=game.actionHistory,events=[];
      if(history.length<this.cursor){this.prime(round);return [];}
      const counts=game.players.map(p=>p.hand.length);
      for(const entry of history)counts[entry.seat]+=entry.play?.cards.length||0;
      let table=null;
      for(const [index,entry] of history.entries()){
        const cards=entry.play?.cards||[],before=counts[entry.seat];counts[entry.seat]-=cards.length;
        if(index>=this.cursor){
          const id=round.id+':'+index;
          events.push({kind:cards.length?'play':'pass',id:id+':sound',seat:entry.seat,play:entry.play,previousOwner:table?.owner??null});
          if(bombTypes.has(entry.play?.type))events.push({kind:'bomb',id:id+':bomb',seat:entry.seat,label:entry.play.label,type:entry.play.type});
          if(cards.length&&counts[entry.seat]>0&&cardCounts.reported(counts[entry.seat])&&(before>cardCounts.THRESHOLD||counts[entry.seat]<=2))
            events.push({kind:'low',id:id+':low',seat:entry.seat,count:counts[entry.seat]});
          if(Number.isInteger(entry.hardWindTo))events.push({kind:'wind',id:id+':wind',seat:entry.hardWindTo,hard:true});
          else if(!cards.length&&table&&!entry.tablePlayAfter&&counts[table.owner]===0&&counts[(table.owner+2)%4]>0)
            events.push({kind:'wind',id:id+':wind',seat:(table.owner+2)%4,hard:false});
        }
        table=entry.tablePlayAfter?{owner:entry.tableOwnerAfter,play:entry.tablePlayAfter}:null;
      }
      if(game.finishOrder.length>this.places){
        const places=game.finishOrder.slice(this.places).map((seat,index)=>({seat,place:this.places+index+1,finished:game.players[seat].hand.length===0}));
        events.push({kind:'rank',id:round.id+':rank:'+game.finishOrder.length,places});
      }
      for(const offer of round.state.tribute?.offers||[]){
        if(offer.card?.id&&!this.offers.has(offer.card.id))events.push({kind:'give',id:round.id+':give:'+offer.card.id,seat:offer.from,card:offer.card});
      }
      for(const exchange of round.state.exchanges||[]){
        if(exchange.returned?.id&&!this.returns.has(exchange.returned.id))events.push({kind:'return',id:round.id+':return:'+exchange.returned.id,seat:exchange.to,to:exchange.from,card:exchange.returned});
      }
      if(this.phase!=='playing'&&round.phase==='playing'&&round.state.exchanges.length)
        events.push({kind:'tribute',id:round.id+':tribute',seat:game.starter});
      if(!this.ended&&game.result){
        const result=series.settlement(round.state);
        events.push({kind:result?.victory?'victory':result?.demotion?'demotion':result?.attempt?'attempt':result?'upgrade':'round',id:round.id+':result',result});
      }
      this.prime(round);return events;
    }
  }
  function words(event,round,english=false){
    const say=(zh,en)=>english?en:zh;
    const name=seat=>{const value=round.names[seat];return english&&typeof GuandanI18n!=='undefined'?GuandanI18n.t(value):value;};
    const result=event.result,team=result?.team===0?say('我方','Our team'):say('对方','Opponents');
    const pair=result?[result.team,result.team+2].map(name).join(say(' ＋ ',' + ')):'';
    if(event.kind==='anti')return {symbol:'♛',title:say('两王抗贡','Tribute resisted'),detail:say('亮明两张大王 · 无需贡还','Two red jokers · No tribute')};
    if(event.kind==='tribute')return {symbol:'⇄',title:say('贡还完成','Tribute complete'),detail:say(name(event.seat)+'先手',name(event.seat)+' leads')};
    if(event.kind==='give')return {symbol:'贡',title:say('进贡','Tribute'),detail:say(name(event.seat)+'亮出贡牌',name(event.seat)+' offers a card')};
    if(event.kind==='return')return {symbol:'还',title:say('还贡','Return tribute'),detail:say(name(event.seat)+' → '+name(event.to),name(event.seat)+' → '+name(event.to))};
    if(event.kind==='wind')return {symbol:'↗',title:say(event.hard?'硬接风':'接风',event.hard?'Immediate partner lead':'Partner takes the lead'),detail:say(name(event.seat)+'获得牌权',name(event.seat)+' leads next')};
    if(event.kind==='low')return {symbol:String(event.count),title:say(event.count===1?'报单':event.count===2?'报双':'报牌 · 剩 '+event.count+' 张',event.count===1?'One card left':event.count===2?'Two cards left':event.count+' cards left'),detail:name(event.seat)};
    if(event.kind==='bomb')return {symbol:event.type==='joker-bomb'?'♛':'✦',title:say(event.type==='joker-bomb'?'四王炸':event.type==='straight-flush'?'同花顺':'炸弹',event.type==='joker-bomb'?'Four jokers':event.type==='straight-flush'?'Straight flush':'Bomb'),detail:name(event.seat)};
    if(event.kind==='rank')return {symbol:String(event.places[0].place),title:event.places.length===1?say('第'+event.places[0].place+'名 · '+['头游','二游','三游','末游'][event.places[0].place-1],'Place '+event.places[0].place):say('本副名次已定','Placements confirmed'),detail:event.places.map(p=>say(name(p.seat)+' 第'+p.place+'名'+(p.finished?'':'（结算）'),name(p.seat)+' #'+p.place+(p.finished?'':' (assigned)'))).join(' · ')};
    if(event.kind==='victory')return {symbol:'♛',title:say(team+'过 A · 整场胜利',team+' cleared A · Match won'),detail:pair+say(' · 第一＋第'+result.partnerPlace+'名',' · 1st + '+(result.partnerPlace===2?'2nd':'3rd'))};
    if(event.kind==='demotion')return {symbol:'A → 2',title:say(team+'退回 2',team+' returns to 2'),detail:say('冲 A 受阻 3/3 · 连续三副第一＋第四','A attempt 3/3 · Three consecutive 1st + 4th finishes')};
    if(event.kind==='attempt')return {symbol:result.attempt+'/3',title:say(team+'冲 A 受阻',team+' has not cleared A'),detail:say('第一＋第四 · 连续第 '+result.attempt+' 次；继续打 A','1st + 4th · Consecutive attempt '+result.attempt+'; stay on A')};
    if(event.kind==='upgrade')return {symbol:result.from+' → '+result.to,title:say(team+'本副获胜',team+' won the deal'),detail:say('下一副打 '+result.to+' · 第一＋第'+result.partnerPlace+'名','Next level '+result.to+' · Partner placed '+result.partnerPlace)};
    return {symbol:'◆',title:say('本副结束','Deal complete'),detail:round.game.result?.summary||''};
  }
  function impact(play={}){
    const count=Math.max(1,Math.min(10,Number(play.cards?.length||play.size)||1));
    const rank=Math.max(0,Math.min(1,((Number(play.primaryValue)||2)-2)/14));
    const bomb=bombTypes.has(play.type)?0.07:0;
    return {count,rank,gain:Math.min(.46,.10+Math.log2(count+1)*.045+rank*.09+bomb),layers:Math.min(5,Math.ceil(count/2)),duration:.07+Math.min(count,8)*.007};
  }
  function expressions(event,english=false){
    const text=(zh,en)=>english?en:zh;
    if(!Number.isInteger(event?.seat))return [];
    if(event.kind==='pass')return [{seat:event.seat,face:'🙃',label:text('先让你','Your turn')}];
    if(event.kind!=='play')return [];
    const bomb=bombTypes.has(event.play?.type),multi=(event.play?.cards?.length||0)>1;
    const result=[{seat:event.seat,face:bomb?'😎':Number.isInteger(event.previousOwner)?'😏':multi?'😼':'🙂',label:bomb?text('炸！','Boom!'):Number.isInteger(event.previousOwner)?text('接招','Gotcha'):text('走起','Here!')}];
    if(Number.isInteger(event.previousOwner)&&event.previousOwner!==event.seat)
      result.push({seat:event.previousOwner,face:bomb?'😱':'😤',label:bomb?text('哇！','Wow!'):text('不服','Oh no!')});
    return result;
  }
  class Sound{
    constructor(preferences){this.preferences=preferences;this.voices=new Set();}
    async unlock(){
      if(this.preferences().sound===false)return;
      try{
        const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
        if(!Context)return;
        this.context??=new Context();
        if(this.context.state==='suspended')await this.context.resume();
      }catch{/* Audio is optional; blocked autoplay must never interrupt play. */}
    }
    stop(){for(const voice of this.voices){try{voice.stop();}catch{}}this.voices.clear();}
    play(kind,event={}){
      const ctx=this.context,prefs=this.preferences();
      if(!ctx||ctx.state!=='running'||prefs.sound===false||globalThis.document?.hidden)return;
      const volume=Math.max(0,Math.min(1,Number(prefs.soundVolume??0.35)));
      if(kind==='play'){this.cardImpact(ctx,event.play,volume);return;}
      const melodies={play:[[500,0,.055]],pass:[[260,0,.045]],deal:[[420,0,.05],[520,.09,.05],[650,.18,.07]],
        bomb:[[90,0,.19],[150,.04,.2],[310,.12,.18]],low:[[660,0,.11],[880,.14,.12]],
        wind:[[392,0,.1],[523,.1,.14]],give:[[440,0,.1],[554,.09,.13]],return:[[554,0,.1],[440,.09,.13]],tribute:[[440,0,.1],[660,.12,.14]],anti:[[523,0,.12],[659,.13,.12],[784,.26,.25]],
        rank:[[523,0,.1],[659,.1,.1],[784,.2,.2]],attempt:[[440,0,.16],[392,.18,.19]],
        demotion:[[523,0,.22],[440,.23,.22],[349,.46,.22],[262,.69,.38]],
        upgrade:[[523,0,.12],[659,.12,.12],[784,.24,.25]],round:[[440,0,.14],[523,.16,.2]],
        victory:[[523,0,.16],[659,.17,.16],[784,.34,.18],[1047,.55,.28],[784,.9,.18],[1047,1.1,.6]]};
      for(const [frequency,delay,duration] of melodies[kind]||[]){
        try{
          const oscillator=ctx.createOscillator(),gain=ctx.createGain(),at=ctx.currentTime+delay;
          oscillator.type=kind==='bomb'?'sine':'triangle';oscillator.frequency.value=frequency;
          gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.10*volume,at+.008);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
          oscillator.connect(gain);gain.connect(ctx.destination);this.voices.add(oscillator);
          oscillator.onended=()=>{this.voices.delete(oscillator);oscillator.disconnect();gain.disconnect();};
          oscillator.start(at);oscillator.stop(at+duration+.015);
        }catch{/* A suspended or unavailable audio device is harmless. */}
      }
    }
    cardImpact(ctx,play,volume){
      const shape=impact(play),at=ctx.currentTime;
      try{
        if(!this.noise||this.noise.sampleRate!==ctx.sampleRate){
          this.noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.18),ctx.sampleRate);
          const samples=this.noise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
        }
        for(let i=0;i<shape.layers;i++){
          const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),start=at+i*.009;
          source.buffer=this.noise;filter.type='highpass';filter.frequency.value=850+shape.rank*400;
          gain.gain.setValueAtTime(shape.gain*volume/(Math.sqrt(shape.layers)*(1+i*.65)),start);gain.gain.exponentialRampToValueAtTime(.0001,start+shape.duration);
          source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);this.voices.add(source);
          source.onended=()=>{this.voices.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};
          source.start(start);source.stop(start+shape.duration+.005);
        }
        const body=ctx.createOscillator(),gain=ctx.createGain();body.type='sine';
        body.frequency.setValueAtTime(150+shape.rank*45,at);body.frequency.exponentialRampToValueAtTime(58,at+.09);
        gain.gain.setValueAtTime(shape.gain*volume*.55,at);gain.gain.exponentialRampToValueAtTime(.0001,at+.12);
        body.connect(gain);gain.connect(ctx.destination);this.voices.add(body);
        body.onended=()=>{this.voices.delete(body);body.disconnect();gain.disconnect();};body.start(at);body.stop(at+.13);
      }catch{/* Audio failure never blocks the card action. */}
    }
  }
  class Player{
    constructor({element,preferences,round}){
      this.element=element;this.preferences=preferences;this.round=round;this.tracker=new Tracker();this.sound=new Sound(preferences);this.queue=[];
      this.reactions=new Map();
      this.element.setAttribute('translate','no');
    }
    prime(round){this.clear();this.tracker.prime(round);}
    collect(round){this.enqueue(this.tracker.collect(round));}
    start(round){
      if(this.startId===round.id)return;this.startId=round.id;
      if(round.state.antiTribute?.length&&!round.game.actionHistory.length)this.enqueue([{kind:'anti',id:round.id+':anti'}]);
    }
    enqueue(events){
      if(typeof document!=='undefined'&&document.hidden)return;
      // A snapshot can contain several automatic passes. One soft card sound
      // suffices; milestones still retain their own visible event and sound.
      const action=events.findLast(e=>e.kind==='play'||e.kind==='pass');
      if(action){this.sound.play(action.kind,action);this.react(action);}
      let visible=events.filter(e=>e.kind!=='play'&&e.kind!=='pass');
      if(visible.some(e=>e.result||e.kind==='round')){
        // A fast partner finish can arrive while the first-place announcement
        // is still queued behind a bomb. Merge pending ranks into the final
        // announcement before discarding superseded low-priority notices.
        const pending=this.queue.filter(e=>e.kind==='rank').flatMap(e=>e.places);
        if(pending.length){
          const places=[...new Map([...pending,...visible.filter(e=>e.kind==='rank').flatMap(e=>e.places)].map(p=>[p.place,p])).values()].sort((a,b)=>a.place-b.place);
          visible=visible.filter(e=>e.kind!=='rank');
          visible.unshift({kind:'rank',id:visible.at(-1).id+':ranks',places});
        }
        this.queue=[];
      }
      this.queue.push(...visible);this.queue=this.queue.slice(-8);
      if(!this.active)this.next();
    }
    react(action){
      if(typeof document==='undefined')return;
      for(const reaction of expressions(action,globalThis.GuandanI18n?.locale==='en')){
        const phone=document.documentElement.dataset.phone==='true';
        const anchor=reaction.seat===0?document.querySelector(phone?'.hand-pane':'.hand-heading h1'):document.querySelector('.player[data-seat="'+reaction.seat+'"]'+(phone&&reaction.seat===2?' .player-info':''));
        if(!anchor)continue;
        const previous=this.reactions.get(reaction.seat);if(previous){clearTimeout(previous.timer);previous.node.remove();}
        const bubble=document.createElement('span');bubble.className='player-reaction';bubble.setAttribute('translate','no');bubble.setAttribute('aria-label',reaction.label);
        bubble.dataset.motion=String(this.preferences().eventAnimation!==false&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
        const face=document.createElement('span');face.textContent=reaction.face;const label=document.createElement('b');label.textContent=reaction.label;bubble.append(face,label);anchor.append(bubble);
        const timer=setTimeout(()=>{bubble.remove();this.reactions.delete(reaction.seat);},1500);this.reactions.set(reaction.seat,{node:bubble,timer});
      }
    }
    next(){
      clearTimeout(this.timer);this.active=this.queue.shift();
      if(!this.active){this.element.hidden=true;return;}
      this.sound.play(this.active.kind);
      this.paint();
      this.timer=setTimeout(()=>this.next(),['victory','demotion'].includes(this.active.kind)?3300:this.active.kind==='rank'?2100:1500);
    }
    paint(){
      if(!this.active)return;
      const data=words(this.active,this.round(),globalThis.GuandanI18n?.locale==='en');
      const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      this.element.dataset.kind=this.active.kind;this.element.dataset.motion=String(this.preferences().eventAnimation!==false&&!reduced);
      this.element.hidden=true;this.element.replaceChildren();
      for(const [tag,key] of [['span','symbol'],['strong','title'],['p','detail']]){const node=document.createElement(tag);node.className='event-'+key;node.textContent=data[key];this.element.append(node);}
      if(['give','return','wind'].includes(this.active.kind)){
        const flow=document.createElement('div');flow.className='event-flow';flow.setAttribute('aria-hidden','true');
        const trail=document.createElement('i');trail.className='event-flow-trail';flow.append(trail);
        const card=document.createElement('i');card.className='event-flow-card';
        if(this.active.card){const suit={hearts:'♥',diamonds:'♦',clubs:'♣',spades:'♠',joker:'★'}[this.active.card.suit]||'';card.textContent=suit+(this.active.card.rank==='BJ'?'大王':this.active.card.rank==='SJ'?'小王':this.active.card.rank);}
        else card.textContent='风';flow.append(card);this.element.append(flow);
      }
      if(this.active.kind==='victory'&&this.element.dataset.motion==='true'){
        const confetti=document.createElement('div');confetti.className='event-confetti';confetti.setAttribute('aria-hidden','true');
        for(let i=0;i<18;i++){const piece=document.createElement('i');piece.style.setProperty('--i',i);confetti.append(piece);}this.element.append(confetti);
      }
      this.element.hidden=false;
    }
    clear(){clearTimeout(this.timer);for(const {node,timer} of this.reactions.values()){clearTimeout(timer);node.remove();}this.reactions.clear();this.queue=[];this.active=null;this.element.hidden=true;this.sound.stop();}
  }
  return Object.freeze({Tracker,words,impact,expressions,Sound,Player});
});
