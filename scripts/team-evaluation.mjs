import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),assessment=require('../web/app/assessment.js'),protocol=require('../web/app/evaluation-protocol.js');
const core=require('../web/app/core.js'),root=path.resolve(import.meta.dirname,'..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const digest=file=>hash(fs.readFileSync(file));
const args=process.argv.slice(2),command=args.shift();
function option(name,fallback){const index=args.indexOf('--'+name);if(index<0)return fallback;if(!args[index+1]||args[index+1].startsWith('--'))throw new Error('缺少 --'+name+' 参数');return args[index+1];}
function required(name){const v=option(name);if(!v)throw new Error('必须指定 --'+name);return v;}
function write(file,data){
  const bytes=JSON.stringify(data,null,2)+'\n';
  fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
  // Never silently replace a preregistration, review packet or completed result.
  fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({output:path.resolve(file),sha256:hash(bytes)}));
}
function baseline(){
  const files=['web/app/core.js','web/app/card-counts.js','web/app/play-rules.js','web/app/series.js','web/app/tuo3.js','web/app/match.js','web/app/hand-assessment.js','web/app/private-hand-score.js','web/app/hand-assessment-legacy.js','web/app/assessment-legacy.js','web/app/assessment-rating-legacy.js','web/app/judge-v2.js','web/app/starting-reference.js','web/app/assessment-pilot.js','web/app/assessment.js','web/app/assessment-rating.js','web/app/evaluation-protocol.js','web/assets/fairWorker-CTCwrT35.js','web/mobile/context.onnx','web/mobile/scores.onnx'];
  const hashes=Object.fromEntries(files.map(f=>[f,digest(path.join(root,f))]));
  const select=keys=>hash(JSON.stringify(Object.fromEntries(keys.map(k=>[k,hashes[k]]))));
  return {schema:1,version:json(path.join(root,'package.json')).version,hashes,
    modelHash:select(['web/mobile/context.onnx','web/mobile/scores.onnx']),
    rulesHash:select(['web/app/core.js','web/app/play-rules.js','web/app/series.js','web/app/tuo3.js']),
    policy:'raw DanLM, book removed',createdAt:new Date().toISOString()};
}
export function verifyReplay(round){
  if(!round.completed)return {status:'unavailable',reason:'incomplete_round'};
  if(round.ruleMode!=='classic')return {status:'unavailable',reason:'Tuo3_requires_full_rule_state'};
  if(!round.events.length)throw new Error('完整小局缺少行动');
  const hands=[0,1,2,3].map(s=>assessment.visibleHand(round,0,s));
  if(hands.some(h=>!h||h.length!==27)||new Set(hands.flat().map(c=>c.id)).size!==108)throw new Error('回放初始实体牌不完整或重复');
  let game=core.newMatch().game;core.setLevel(round.level);
  const deck=new Map(core.deck().map(c=>[c.id,c]));
  for(const c of hands.flat()){const d=deck.get(c.id);if(!d||c.rank!==d.rank||c.suit!==d.suit||c.isWild!==d.isWild)throw new Error('实体牌编号、牌面或级牌不一致');}
  game={...game,players:game.players.map((p,s)=>({...p,hand:hands[s],finished:false})),starter:round.starter??round.events[0].seat,currentPlayer:round.starter??round.events[0].seat};
  const cardFacts=cards=>Array.isArray(cards)?cards.map(c=>[c.id,c.rank,c.suit,c.isWild]).sort((a,b)=>a[0].localeCompare(b[0])):null;
  const equalCards=(a,b)=>JSON.stringify(cardFacts(a))===JSON.stringify(cardFacts(b));
  const playFields=['key','type','size','primaryValue','label','usesWild','wildCount','bombSize','suit','sequence'];
  const equalTable=(a,b)=>(a?.owner??null)===(b?.owner??null)&&(!a&&!b||a&&b&&playFields.every(k=>JSON.stringify(a.play[k])===JSON.stringify(b.play[k]))&&equalCards(a.play.cards,b.play.cards));
  if(!equalCards(round.initialOwnHand,hands[0]))throw new Error('起手观察与回放不一致');
  let trick=1;
  for(const e of round.events){
    if(e.seat!==game.currentPlayer||game.players.some((p,s)=>p.hand.length!==e.remainingBefore[s]))throw new Error('回放回合或行动前张数不一致：'+e.index);
    if(!equalTable(game.tablePlay,e.tableBefore)||!equalCards(e.ownBefore,game.players[0].hand))throw new Error('回放桌面或行动前本人手牌不一致：'+e.index);
    let expectedType='pass',expectedLabel='不出',expectedKind='pass';
    if(e.cards.length){
      const plays=core.recognize(e.cards),play=plays.find(p=>p.key===e.playKey)||(!e.playKey?plays.find(p=>p.label===e.label):null);
      if(!play)throw new Error('没有匹配的合法声明：'+e.index);
      expectedType=play.type;expectedKind=core.isBomb(play)?'bomb':play.type;expectedLabel=play.label;
      game=core.applyPlay(game,e.seat,play);
    }else game=core.applyPass(game,e.seat);
    if(game.players.some((p,s)=>p.hand.length!==e.remaining[s]))throw new Error('回放行动后张数不一致：'+e.index);
    if(!equalCards(e.ownAfter,game.players[0].hand)||!equalTable(e.tableAfter,game.tablePlay)||
      (e.playType??'pass')!==expectedType||e.kind!==expectedKind||e.label!==expectedLabel||
      e.finished!==(game.players[e.seat].hand.length===0)||e.trick!==trick||
      e.nextLeader!==(!game.tablePlay&&!game.result?game.currentPlayer:null))throw new Error('回放派生统计字段或行动后本人手牌不一致：'+e.index);
    if(!game.tablePlay)trick++;
  }
  if(!game.result||JSON.stringify(game.finishOrder)!==JSON.stringify(round.finishOrder)||game.result.winnerTeam!==round.winnerTeam||
    JSON.stringify(round.remaining)!==JSON.stringify(game.players.map(p=>p.hand.length)))throw new Error('规则回放终局或最终余牌不一致');
  return {status:'passed',decisions:round.events.length,roundSha256:hash(JSON.stringify(round)),rulesHash:baseline().rulesHash};
}
function readDataset(file){const d=json(file);if(d.kind!=='guandan-performance'||!d.round?.id||!Array.isArray(d.round.events))throw new Error('不是掼军技术统计导出文件');return d;}
function verifyEvidence(experiment,evidenceFile){
  const data=json(evidenceFile),verified={};
  for(const key of ['rulesReplay','engineering','exportParity','opponentMatrix']){
    const entry=data[key];if(!entry?.file||entry.status!=='passed')throw new Error('缺少通过的证据：'+key);
    const file=path.resolve(path.dirname(evidenceFile),entry.file);
    if(digest(file)!==entry.artifactSha256)throw new Error('证据文件哈希不一致：'+key);
    const artifact=json(file);
    for(const binding of ['candidateHash','baselineHash','rulesHash','heldOutSeedManifestHash'])if(artifact[binding]!==experiment[binding])throw new Error('证据未绑定本实验：'+key+'/'+binding);
    if(artifact.status!=='passed'||artifact.check!==key)throw new Error('证据内容未通过对应检查：'+key);
    verified[key]={status:'passed',artifactSha256:entry.artifactSha256};
  }
  return verified;
}
function seedManifest(file,pairs){
  const seeds=json(file);
  if(!Array.isArray(seeds)||seeds.length!==pairs||new Set(seeds.map(s=>s.id)).size!==pairs||new Set(seeds.map(s=>s.seed)).size!==pairs||seeds.some(s=>typeof s.id!=='string'||!s.id||!Number.isSafeInteger(s.seed)||!Number.isInteger(s.startingSeat)||s.startingSeat<0||s.startingSeat>3))throw new Error('种子清单需与配对数量一致，ID/种子唯一且起手座位有效');
  const counts=[0,1,2,3].map(s=>seeds.filter(v=>v.startingSeat===s).length);
  if(Math.max(...counts)-Math.min(...counts)>1)throw new Error('起手座位必须均衡');return seeds;
}
async function main(){
  if(command==='baseline'){write(required('output'),baseline());return;}
  if(command==='verify'){
    const data=readDataset(required('input')),reports=[0,1,2,3].map(s=>assessment.assess(data.round,s));
    const replay=verifyReplay(data.round);
    if(reports.some(r=>r.metrics.find(m=>m.id==='Q01').status==='invalid'))throw new Error('记录一致性检查失败');
    write(required('output'),{schema:1,kind:'recomputed-metrics',inputSha256:digest(required('input')),reports,replay});return;
  }
  if(command==='packet'){
    const data=readDataset(required('input')),round=data.round,packet=[],mapping=[];
    if(verifyReplay(round).status!=='passed')throw new Error('题包要求完整经典小局通过规则与观察回放校验');
    const seat=Number(required('seat')),eventIndex=Number(required('event'));
    const e=round.events[eventIndex];
    if(!Number.isInteger(eventIndex)||!e||e.seat!==seat)throw new Error('必须选择该玩家实际行动的单个事件');
    {
      const observation=assessment.observation(round,e.index,seat),id=hash(JSON.stringify(observation));
      packet.push({id,standardVersion:assessment.STANDARD,observation});mapping.push({id,roundId:round.id,eventIndex:e.index,seat});
    }
    const output=required('output');if(fs.existsSync(output)||fs.existsSync(output+'.private-map.json'))throw new Error('题包或私有映射已存在，不覆盖');
    write(output,{schema:1,kind:'actor-information-review-packet',groupId:hash(round.id),sourceSha256:digest(required('input')),blinding:'single-position; outcomes-and-identities-removed; assignment-independence-not-verified',assignmentRule:'同一位评审在同一原始小局只能收到一个节点；不得交付私有映射或其他节点题包。',positions:packet});
    write(output+'.private-map.json',{schema:1,groupId:hash(round.id),mapping});return;
  }
  if(command==='freeze'){
    const stage=option('stage','T6'),targetPairs=Number(option('pairs','5000'));
    if(!['T0','T1','T2','T3','T4','T5','T6'].includes(stage)||!Number.isSafeInteger(targetPairs)||targetPairs<80||targetPairs>100000)throw new Error('阶段或固定配对数无效');
    const seeds=required('seeds');seedManifest(seeds,targetPairs);const base=baseline(),candidate=required('candidate');
    const spec={...protocol.proposal(),status:'frozen',stage,targetPairs,minimumRate:0.51,baselineHash:base.modelHash,rulesHash:base.rulesHash,
      candidateHash:digest(candidate),heldOutSeedManifestHash:digest(seeds),hypothesis:required('hypothesis'),baseline:base,createdAt:new Date().toISOString(),releaseMeaning:'数值门槛和证据文件完整性检查；不自动替换游戏模型。'};
    write(required('output'),spec);return;
  }
  if(command==='paired'){
    const data=json(required('input'));write(required('output'),{...protocol.pairedSummary(data.pairs),status:'descriptive_only; unverified outcomes'});return;
  }
  if(command==='gate'){
    const file=required('experiment'),experiment=json(file),seedsFile=required('seeds');
    for(const binding of ['candidateHash','baselineHash','rulesHash','heldOutSeedManifestHash'])if(!/^[a-f0-9]{64}$/.test(experiment[binding]||''))throw new Error('冻结清单缺少有效哈希：'+binding);
    const current=baseline();
    if(digest(required('candidate'))!==experiment.candidateHash||digest(seedsFile)!==experiment.heldOutSeedManifestHash||current.modelHash!==experiment.baselineHash||current.rulesHash!==experiment.rulesHash||JSON.stringify(current.hashes)!==JSON.stringify(experiment.baseline?.hashes))throw new Error('候选、基线、规则、编码／动作实现或种子与冻结实验不一致');
    const seeds=seedManifest(seedsFile,experiment.targetPairs),data=json(required('input'));
    if(data.experimentSha256!==digest(file)||!Array.isArray(data.pairs)||data.pairs.length!==experiment.targetPairs)throw new Error('结果未绑定冻结实验或固定样本不完整');
    const byId=new Map(seeds.map(s=>[s.id,s]));
    const pairs=data.pairs.map(p=>{
      const seed=byId.get(p.id);
      if(!seed||p.seedSha256!==hash(JSON.stringify(seed))||p.startingSeat!==seed.startingSeat||!Array.isArray(p.games)||p.games.length!==2)throw new Error('配对与封存种子不一致或缺少交换队伍场次');
      if(new Set(p.games.map(g=>g.candidateTeam)).size!==2||p.games.some(g=>![0,1].includes(g.candidateTeam)||g.complete!==true||g.fromLevel!=='2'||g.finishReason!=='cleared-A'||![0,1].includes(g.candidateWon)))throw new Error('不是两场交换队伍的完整冲 A 比赛');
      return {id:p.id,startingSeat:p.startingSeat,wins:p.games.map(g=>g.candidateWon)};
    });
    const summary=protocol.pairedSummary(pairs,experiment.bootstrap),evidence=verifyEvidence(experiment,required('evidence'));
    const result=protocol.releaseGate(experiment,summary,evidence);
    write(required('output'),{schema:1,experimentSha256:digest(file),summary,...result,note:'检验文件绑定与预登记数值条件；证据的科学有效性仍需独立审查，不自动部署。'});
    if(!result.eligible)process.exitCode=2;return;
  }
  console.log('Commands: baseline, verify, packet, freeze, paired, gate. See docs/TEAM-EVALUATION.md for required inputs and acceptance conditions.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename)main().catch(e=>{console.error(e.message);process.exitCode=1;});
