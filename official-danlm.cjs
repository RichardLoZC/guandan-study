'use strict';
const path = require('node:path');
const {spawn} = require('node:child_process');
const readline = require('node:readline');
const core = require('./web/app/core.js');
const models = require('./web/app/model-profiles.js');

const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SUITS = ['hearts','spades','clubs','diamonds'];
const TYPES = {single:1,pair:2,triple:3,'full-house':4,'pair-run':5,'triple-run':6,straight:7,bomb:8,'straight-flush':9,'joker-bomb':10};
function cardIndex(card){
  const parts=String(card?.id||'').split('-');
  if(parts.length!==3||!['1','2'].includes(parts[0]))throw new Error('实体牌编号无效');
  if(parts[1]==='joker'&&['SJ','BJ'].includes(parts[2]))return parts[2]==='SJ'?52:53;
  const s=SUITS.indexOf(parts[1]),r=RANKS.indexOf(parts[2]);
  if(s<0||r<0)throw new Error('实体牌编号无效');
  return s*13+r;
}
function nativeRank(play,level){
  if(play.type==='joker-bomb')return null;
  if(play.sequence?.length)return (play.sequence.at(-1)-2+13)%13;
  return play.primaryValue===14.5?RANKS.indexOf(level):play.primaryValue-2;
}
function convert(payload, reply){
  const policy=models.resolve(payload?.policyId);
  if(reply?.policyId!==policy.id||reply?.checkpointSha256!==policy.checkpointSha256)throw new Error('官方核心模型身份不一致');
  const obs=payload?.observation, seat=obs?.seat, state=obs?.state;
  if(!obs||!Number.isInteger(seat)||seat<0||seat>3||!state?.players?.[seat]||!Array.isArray(reply?.candidates))throw new Error('官方模型结果或牌局无效');
  const hand=state.players[seat].hand,byIndex=Array.from({length:54},()=>[]);
  for(const card of hand)byIndex[cardIndex(card)].push(card);
  for(const bucket of byIndex)bucket.sort((a,b)=>a.id.localeCompare(b.id));
  core.setLevel(obs.level);
  const candidates=[],seen=new Set();let skipped=0;
  for(const item of reply.candidates){
    if(!Number.isFinite(item.score)||!Array.isArray(item.cards)||!Number.isInteger(item.type)||item.type<0||item.type>10)throw new Error('官方模型候选无效');
    if(item.type===0){
      if(item.cards.length||item.rank!==null||!state.tablePlay)throw new Error('官方模型不出动作无效');
      if(!seen.has('pass')){seen.add('pass');candidates.push({type:'pass',score:item.score});}
      continue;
    }
    const cards=[],used=new Set();let invalid=false;
    for(const pair of item.cards){
      if(!Array.isArray(pair)||pair.length!==2||!Number.isInteger(pair[0])||pair[0]<0||pair[0]>53||!Number.isInteger(pair[1])||pair[1]<1||pair[1]>2||used.has(pair[0])||byIndex[pair[0]].length<pair[1]){invalid=true;break;}
      used.add(pair[0]);cards.push(...byIndex[pair[0]].slice(0,pair[1]));
    }
    if(invalid||!cards.length)throw new Error('官方模型返回了不属于手牌的牌');
    const plays=core.recognize(cards).filter(play=>TYPES[play.type]===item.type&&nativeRank(play,obs.level)===item.rank&&(!state.tablePlay||core.beats(play,state.tablePlay.play)));
    if(!plays.length){skipped++;continue;}
    const play=plays[0],key=play.key+'|'+play.cards.map(card=>card.id).sort().join(',');
    if(!seen.has(key)){seen.add(key);candidates.push({type:'play',play,score:item.score});}
  }
  if(!candidates.length)throw new Error('官方候选与当前牌桌规则不兼容，已停止出牌');
  return {result:{candidates,engine:policy.id===models.OFFICIAL?'DanLM 官方 Mac 原生核心':'DanLM 新风格 · 官方 Mac 核心',policyId:policy.id,checkpointSha256:policy.checkpointSha256,samples:0,source:'official-native',
    warning:'官方模型使用本人的手牌及公开记录；现有牌桌规则会过滤不兼容的候选。评分不是胜率。',
    officialCandidateCount:reply.candidates.length,filteredCandidateCount:skipped}};
}

class OfficialDanLM {
  constructor(directory,log=()=>{}){this.directory=directory;this.log=log;this.child=null;this.pending=new Map();this.sequence=0;}
  start(){
    if(this.child)return;
    const executable=path.join(this.directory,'runtime/bin/python3.12'),worker=path.join(this.directory,'worker.py');
    const env={...process.env,PYTHONNOUSERSITE:'1',OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'2'};
    delete env.PYTHONPATH;delete env.PYTHONHOME;delete env.DYLD_INSERT_LIBRARIES;
    const child=spawn(executable,['-I','-B','-u',worker],{cwd:this.directory,env,stdio:['pipe','pipe','pipe']});
    this.child=child;
    const fail=error=>{
      if(this.child!==child)return;
      this.child=null;
      for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}
      this.pending.clear();
      if(!child.killed)child.kill();
    };
    child.on('error',error=>fail(new Error('官方模型启动失败：'+error.message)));
    child.on('exit',(code,signal)=>fail(new Error('官方模型进程已停止（'+(signal||code)+'）')));
    child.stdin.on('error',error=>fail(new Error('官方模型通信失败：'+error.message)));
    child.stderr.on('data',chunk=>this.log('official DanLM: '+String(chunk).slice(0,3000)));
    readline.createInterface({input:child.stdout,crlfDelay:Infinity}).on('line',line=>{
      let msg;try{msg=JSON.parse(line);}catch{fail(new Error('官方模型返回了无效数据'));return;}
      const pending=this.pending.get(msg.id);if(!pending)return;
      this.pending.delete(msg.id);clearTimeout(pending.timer);
      if(msg.error){pending.reject(new Error(msg.error));return;}
      try{
        if(pending.payload.health)pending.resolve(msg.value);
        else if(pending.payload.tribute){
          const policy=models.resolve();
          if(msg.value?.policyId!==policy.id||msg.value?.checkpointSha256!==policy.checkpointSha256)throw new Error('贡还模型身份不一致');
          const choices=pending.payload.tribute.choices;
          if(!Array.isArray(choices)||!Number.isInteger(msg.value?.cardIndex)||!Number.isFinite(msg.value?.score))throw new Error('官方贡还结果无效');
          const card=choices.filter(choice=>cardIndex(choice)===msg.value.cardIndex).sort((a,b)=>a.id.localeCompare(b.id))[0];
          if(!card)throw new Error('官方贡还牌不在本桌合法候选中');
          pending.resolve({cardId:card.id,score:msg.value.score,engine:'DanLM 官方 Mac 原生核心',policyId:policy.id,checkpointSha256:policy.checkpointSha256});
        }else pending.resolve(convert(pending.payload,msg.value));
      }catch(error){pending.reject(error);}
    });
  }
  request(payload){
    if(!payload||typeof payload!=='object')return Promise.reject(new Error('官方模型请求无效'));
    try{models.resolve(payload.policyId);}catch(error){return Promise.reject(error);}
    this.start();const child=this.child,id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        if(!this.pending.has(id))return;
        this.pending.delete(id);reject(new Error('官方模型计算超时，请重试'));
        if(this.child===child)child.kill();
      },90000);
      this.pending.set(id,{resolve,reject,timer,payload});
      try{
        const line=JSON.stringify({id,payload});
        if(line.length>4000000)throw new Error('模型请求过大');
        child.stdin.write(line+'\n');
      }catch(error){this.pending.delete(id);clearTimeout(timer);reject(error);}
    });
  }
  close(){if(this.child)this.child.kill();}
}
module.exports={OfficialDanLM,convert,cardIndex,nativeRank};
