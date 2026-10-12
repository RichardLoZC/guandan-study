'use strict';
const {randomBytes,randomInt}=require('node:crypto');
const fs=require('node:fs');
const {Match}=require('./web/app/match.js');
const TurnTiming=require('./web/app/turn-timing.js');
const core=require('./web/app/core.js');
const copy=value=>structuredClone(value);
const token=()=>randomBytes(24).toString('hex');
const PROTOCOL=1;
const nameOf=value=>String(value||'玩家').trim().replace(/[\x00-\x1f\x7f]/g,'').slice(0,12)||'玩家';

// Build a complete rotated state only inside the host. Mask before serialization.
function perspective(match,seat,names){
  const s=copy(match.state),g=s.game,rot=n=>Number.isInteger(n)?(n-seat+4)%4:n;
  const mapped=object=>Object.fromEntries(Object.entries(object||{}).map(([key,value])=>[rot(Number(key)),value]));
  const text=value=>String(value||'').replace(/你|青岚|知秋|墨白/g,name=>names[['你','青岚','知秋','墨白'].indexOf(name)]);
  g.players=g.players.map(p=>({...p,seat:rot(p.seat),team:rot(p.seat)%2,name:names[p.seat]})).sort((a,b)=>a.seat-b.seat);
  g.currentPlayer=rot(g.currentPlayer);g.starter=rot(g.starter);
  if(g.tablePlay)g.tablePlay.owner=rot(g.tablePlay.owner);
  g.roundTrace=mapped(g.roundTrace);g.lastActions=Object.fromEntries(Object.entries(mapped(g.lastActions)).map(([k,v])=>[k,text(v)]));
  g.passedPlayers=g.passedPlayers.map(rot);g.finishOrder=g.finishOrder.map(rot);
  g.actionHistory=g.actionHistory.map(e=>({...e,seat:rot(e.seat),tableOwnerAfter:rot(e.tableOwnerAfter)}));
  if(g.result){
    g.result.winnerTeam=(g.result.winnerTeam+seat)%2;
    const places=[0,2].map(own=>g.finishOrder.indexOf(own)+1).sort((a,b)=>a-b);
    const team=g.result.winnerTeam===0?'我方':'对方';
    g.result.placementKey=places.join('');
    g.result.badge=team+'升 '+g.result.levelDelta+' 级';
    g.result.summary='你和队友分列 '+places.join('')+'，'+team+'升 '+g.result.levelDelta+' 级。';
  }
  if(g.winnerTeam!=null)g.winnerTeam=(g.winnerTeam+seat)%2;
  g.message=text(g.message);
  if(seat%2){s.levels.reverse();s.wins.reverse();}
  s.notice=(s.notice||[]).map(text);
  s.exchanges=s.exchanges.map(e=>({...e,from:rot(e.from),to:rot(e.to)}));
  if(s.tribute){s.tribute.donors=s.tribute.donors.map(rot);s.tribute.winners=s.tribute.winners.map(rot);s.tribute.offers=s.tribute.offers.map(o=>({...o,from:rot(o.from)}));}
  if(s.antiTribute)s.antiTribute=s.antiTribute.map(e=>({...e,seat:rot(e.seat)}));
  s.known=(s.known||[]).map(e=>({...e,seat:rot(e.seat)}));
  // Private teaching text from another player's analysis is never public.
  s.study.choices=Object.fromEntries(Object.entries(s.study.choices||{}).map(([k,v])=>[k,{automatic:v.automatic,engine:v.engine,teaching:null}]));
  const view=new Match(s);Object.defineProperty(view,'names',{value:[0,1,2,3].map(i=>names[(i+seat)%4])});
  const tributeDisplay=view.tributeDisplay,tributeChoices=view.actingSeat===0?view.tributeChoices:[];
  for(const p of s.game.players)if(p.seat!==0&&!s.game.result)p.hand=Array(p.hand.length).fill(null);
  return {state:s,tributeDisplay,tributeChoices,actingSeat:rot(match.actingSeat)};
}

class Room {
  constructor({savePath=null,runModel,now=Date.now,random=randomInt,restored=null,startThinking=TurnTiming.begin,aiBook=true}={}){
    this.savePath=savePath;this.runModel=runModel;this.now=now;this.random=random;
    this.startThinking=startThinking;this.botWait=null;
    this.aiBook=restored?restored.aiBook!==false:aiBook!==false;
    this.members=[];this.match=null;this.seats=[];this.version=1;this.code=String(random(100000,1000000));this.id=token();this.paused=false;this.acks=[];this.error=null;this.modelReady=false;this.busy=false;this.completed=new Map();this.closed=false;
    if(restored){this.id=restored.id;this.code=restored.code;this.members=restored.members.map(m=>({...m,lastSeen:0}));this.seats=restored.seats;this.version=restored.version+1;this.match=restored.state?new Match(restored.state):null;this.paused=restored.paused;this.acks=restored.acks||[];}
    this.members.forEach((m,index)=>m.identity??=index);
    const available=[0,1,2,3].filter(id=>!this.members.some(m=>m.identity===id));
    this.seats=this.seats.map(id=>id||'bot:'+available.shift());
    if(!this.members.length)this.members.push({id:token(),token:token(),name:'Mac 玩家',identity:0,host:true,lastSeen:now()});
  }
  static load(options){
    if(options.savePath&&fs.existsSync(options.savePath)){
      const saved=JSON.parse(fs.readFileSync(options.savePath,'utf8'));if(saved.protocol!==PROTOCOL)throw new Error('房间存档版本不兼容');
      return new Room({...options,restored:saved});
    }
    return new Room(options);
  }
  serialize(){return {protocol:PROTOCOL,id:this.id,code:this.code,members:this.members,seats:this.seats,version:this.version,state:this.match?.state||null,paused:this.paused,acks:this.acks,aiBook:this.aiBook};}
  save(){if(!this.savePath)return;const temporary=this.savePath+'.tmp';fs.writeFileSync(temporary,JSON.stringify(this.serialize()),{mode:0o600});fs.renameSync(temporary,this.savePath);}
  change(action){
    const before=copy(this.serialize()),revision=this.match?.revision;
    try{action();this.version++;this.save();this.botWait?.cancel();}catch(error){this.members=before.members;this.seats=before.seats;this.version=before.version;this.match=before.state?new Match(before.state):null;if(this.match)this.match.revision=revision;this.paused=before.paused;this.acks=before.acks;this.aiBook=before.aiBook;throw error;}
  }
  host(name){const m=this.members.find(m=>m.host);this.change(()=>{m.name=nameOf(name||m.name);m.lastSeen=this.now();});return {token:m.token,roomId:this.id,protocol:PROTOCOL};}
  authenticate(auth){const member=this.members.find(m=>m.token===auth);if(!member)throw new Error('房间身份失效，请重新加入');member.lastSeen=this.now();return member;}
  join({code,name,protocol,clientId}){
    if(protocol!==PROTOCOL)throw new Error('两台设备的联机版本不同，请更新应用');
    if(code!==this.code)throw new Error('房间码不正确');
    if(clientId&&(!/^[a-f0-9-]{36}$/.test(clientId)))throw new Error('设备身份无效');
    const prior=clientId&&this.members.find(m=>m.clientId===clientId);
    if(prior){prior.lastSeen=this.now();return {token:prior.token,roomId:this.id,protocol:PROTOCOL};}
    if(this.match)throw new Error('牌局已经开始；请房主回到大厅后再加入');
    if(this.members.length>=4)throw new Error('房间已满');
    const identity=[0,1,2,3].find(id=>!this.members.some(m=>m.identity===id));
    const m={id:token(),token:token(),name:nameOf(name),identity,clientId,host:false,lastSeen:this.now()};
    this.change(()=>this.members.push(m));return {token:m.token,roomId:this.id,protocol:PROTOCOL};
  }
  connected(m){return this.now()-m.lastSeen<12000;}
  get waiting(){return this.members.filter(m=>!this.connected(m)).map(m=>m.name);}
  identity(id){return this.members.find(m=>m.id===id)?.identity??Number(String(id).split(':')[1]);}
  names(){const bots=['你','青岚','知秋','墨白'];return this.seats.map(id=>this.members.find(m=>m.id===id)?.name||bots[this.identity(id)]);}
  shuffle(){const slots=[...this.members.map(m=>m.id),...[0,1,2,3].filter(id=>!this.members.some(m=>m.identity===id)).map(id=>'bot:'+id)];for(let i=3;i>0;i--){const j=this.random(i+1);[slots[i],slots[j]]=[slots[j],slots[i]];}this.seats=slots;}
  projected(member){
    const seat=this.seats.indexOf(member.id),waiting=this.waiting;
    const info={protocol:PROTOCOL,id:this.id,version:this.version,code:this.code,host:member.host,started:Boolean(this.match),paused:this.paused,waiting,error:this.error,modelReady:this.modelReady,aiBook:this.aiBook,
      members:this.members.map(m=>({id:m.id,name:m.name,identity:m.identity,self:m.id===member.id,host:m.host,connected:this.connected(m),seat:this.seats.indexOf(m.id)}))};
    if(!this.match)return {room:info,round:null};
    if(seat<0)throw new Error('没有此玩家的座位');
    const names=this.names(),round=perspective(this.match,seat,names);
    const needs=this.match.needsTributeConfirmation&&!this.acks.includes(member.id);
    round.revision=this.version;round.playerIds=[0,1,2,3].map(i=>this.identity(this.seats[(i+seat)%4]));
    round.names=[0,1,2,3].map(i=>i===0?'你':names[(i+seat)%4]);
    round.humanSeats=this.members.map(m=>(this.seats.indexOf(m.id)-seat+4)%4);
    round.needsTributeConfirmation=needs;
    if(round.tributeDisplay)round.tributeDisplay.awaitingConfirmation=needs;
    round.canAct=!this.paused&&!waiting.length&&!this.error&&!this.match.needsTributeConfirmation&&!this.match.game.result&&this.match.actingSeat===seat;
    round.confirmWaiting=this.match.needsTributeConfirmation&&!needs;
    return {room:info,round};
  }
  async request(auth,body){
    if(this.closed)throw new Error('房间已关闭');
    const m=this.authenticate(auth),op=body.op;
    if(op==='poll')return this.projected(m);
    if(typeof body.requestId!=='string'||body.requestId.length>80)throw new Error('缺少操作编号');
    const cacheKey=m.id+':'+body.requestId;
    if(this.completed.has(cacheKey))return this.projected(m);
    if(body.version!==this.version)throw new Error('牌局已变化，已同步最新状态，请再操作一次');
    if(['start','new','next','lobby','kick','pause','retry','ai-book'].includes(op)&&!m.host)throw new Error('请由房主操作');
    if(op==='advice'){
      if(!this.match||this.paused||this.waiting.length||this.error||this.match.actingSeat!==this.seats.indexOf(m.id)||this.match.phase!=='playing'||this.match.needsTributeConfirmation)throw new Error('现在不能请求建议');
      if(this.busy)throw new Error('模型正在思考，请稍后再试');
      const version=this.version,seat=this.seats.indexOf(m.id);this.busy=true;
      try{const result=await this.runModel({observation:this.match.observation(seat),teaching:true,provider:'danlm',book:body.book!==false});if(this.version!==version)throw new Error('牌局已变化，请重新计算');return {advice:result};}finally{this.busy=false;}
    }
    this.change(()=>{
      if(['start','new'].includes(op)){
        if(op==='start'&&this.match)throw new Error('牌局已经开始');
        if(this.members.length<2)throw new Error('至少两名玩家加入后开始');
        if(this.waiting.length)throw new Error('请等待所有玩家重新连接');
        this.shuffle();this.match=new Match();this.acks=[];this.paused=false;this.error=null;
      }else if(op==='next'){
        if(!this.match?.game.result)throw new Error('本局尚未结束');
        const prior=this.match.state,next=this.match.next();
        if(next.state.wins.some((v,i)=>v!==prior.wins[i])){this.shuffle();next.state.notice.push('破 A 后重新计分，已重新随机分位。');}
        this.match=next;this.acks=[];this.error=null;
      }else if(op==='lobby'){this.match=null;this.seats=[];this.acks=[];this.error=null;}
      else if(op==='kick'){
        if(this.match)throw new Error('请先回到大厅再移除玩家');
        const target=this.members.find(p=>p.id===body.memberId&&!p.host);if(!target)throw new Error('没有这名玩家');
        this.members=this.members.filter(p=>p!==target);
      }
      else if(op==='leave'){
        if(m.host){this.paused=true;}else{this.members=this.members.filter(p=>p.id!==m.id);this.seats=this.seats.map(id=>id===m.id?'bot:'+m.identity:id);this.acks=this.acks.filter(id=>id!==m.id);}
      }else if(op==='ai-book'){
        if(typeof body.enabled!=='boolean')throw new Error('秘籍开关状态无效');
        this.aiBook=body.enabled;
      }else if(op==='pause')this.paused=!this.paused;
      else if(op==='retry'){this.error=null;this.modelReady=false;}
      else if(op==='ack'){
        if(!this.match?.needsTributeConfirmation)throw new Error('当前无需确认贡还');
        if(!this.acks.includes(m.id))this.acks.push(m.id);
        if(this.members.every(p=>this.acks.includes(p.id)))this.match.acknowledgeTribute();
      }else if(op==='play'){
        if(!this.match||this.paused||this.waiting.length||this.error)throw new Error('牌局暂停，等待房间恢复');
        if(!Array.isArray(body.ids)||body.ids.length>27||body.ids.some(id=>typeof id!=='string'))throw new Error('选牌内容无效');
        this.match.commit(this.seats.indexOf(m.id),body.ids,{key:body.key});
      }else throw new Error('不支持的房间操作');
    });
    this.completed.set(cacheKey,true);if(this.completed.size>256)this.completed.delete(this.completed.keys().next().value);
    return op==='leave'?{left:true}:this.projected(m);
  }
  async tick(){
    if(this.closed||this.error||!this.match||this.paused||this.waiting.length||this.match.game.result){this.botWait?.cancel();return;}
    if(this.busy)return;
    if(this.match.needsTributeConfirmation){
      if(this.members.every(p=>this.acks.includes(p.id)))this.change(()=>this.match.acknowledgeTribute());
      return;
    }
    const seat=this.match.actingSeat;
    if(this.members.some(m=>m.id===this.seats[seat]))return;
    const version=this.version,id=this.match.id,phase=this.match.phase,wait=this.startThinking();this.busy=true;this.botWait=wait;
    try{
      // Inference runs during the visible thinking period, not after it.
      const decision=phase!=='playing'?this.match.chooseTribute():null;
      const [response,ready]=await Promise.all([
        phase==='playing'?this.runModel({observation:this.match.observation(seat),provider:'danlm',book:this.aiBook}):null,
        wait.promise
      ]);
      if(!ready||this.closed||this.version!==version||this.match?.id!==id||this.match.actingSeat!==seat||this.paused||this.waiting.length)return;
      if(decision)this.change(()=>this.match.commit(seat,[decision.card.id],{automatic:true}));
      else{this.change(()=>this.match.commitModel(response,this.match.revision,seat));this.modelReady=true;}
    }catch(error){if(!this.closed&&this.version===version&&this.match?.id===id){this.error='Mac 模型或存档处理失败：'+error.message;this.version++;}}
    finally{wait.cancel();if(this.botWait===wait)this.botWait=null;this.busy=false;}
  }
}
module.exports={Room,perspective,PROTOCOL};
