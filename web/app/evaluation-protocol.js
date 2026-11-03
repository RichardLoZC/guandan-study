'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GuandanEvaluationProtocol=factory();})(globalThis,function(){
  const VERSION='1.0.0';
  const stages=[
    {id:'T0',name:'可信基线',target:'冻结规则、模型和编码哈希；规则回放一致，错误可复现。',exit:'无未解释规则差异，保存可重现的吞吐与基线收据。'},
    {id:'T1',name:'技术统计',target:'起点：500 个控制牌节点、500 个助攻候选、500 个随机普通节点。',exit:'按整场分组去重，事件可重算；数量不代表评审已通过。'},
    {id:'T2',name:'校准评审器',target:'约 20 小局试点，120 节点校准、60 节点封存验证，每题至少 3 位独立评审。',exit:'预先冻结标准；初拟相邻一档内 ≥80%，严重相反 ≤5%，附区间与覆盖。'},
    {id:'T3',name:'监督学习',target:'只使用可靠动作偏好；混入普通牌局，至少 3 个训练随机种子。',exit:'权重与实际动作改变，且未见局面改善；无法判定的样本不当标签。'},
    {id:'T4',name:'团队强化学习',target:'完整冲 A 胜 +1、负 −1，同队共享；固定、历史、多风格对手池。',exit:'独立新牌局收益稳定；过程指标上涨而胜率退步时停止该支线。'},
    {id:'T5',name:'信息协作实验',target:'从有效基线分别测队友预测和公开行动信号；保留各自对照。',exit:'预测校准、实际团队收益及适应型对手检验均通过。'},
    {id:'T6',name:'独立验收与部署',target:'开发 512 对、比较 2,048 对；最终新种子 5,000 对交换队伍，共 10,000 场。',exit:'95% 配对区间下界 >50%，点估计 ≥51%；规则、可靠性与导出一致性通过。'}
  ];
  function random(seed){let s=seed>>>0;return()=>{s+=0x6d2b79f5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
  function pairedSummary(pairs,{seed=42,repetitions=2000}={}){
    if(!Array.isArray(pairs)||repetitions<100||repetitions>10000)throw new Error('无效配对数据或重抽样次数');
    const ids=new Set(),groups=new Map();let wins=0;
    for(const p of pairs){
      if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id)||!Number.isInteger(p.startingSeat)||p.startingSeat<0||p.startingSeat>3||
        !Array.isArray(p.wins)||p.wins.length!==2||p.wins.some(v=>v!==0&&v!==1))throw new Error('配对必须唯一、座位有效，并完整包含两场 0/1 结果');
      ids.add(p.id);const value=(p.wins[0]+p.wins[1])/2;wins+=value;
      if(!groups.has(p.startingSeat))groups.set(p.startingSeat,[]);groups.get(p.startingSeat).push(value);
    }
    if(!pairs.length)return {pairs:0,games:0,rate:null,interval:null,reason:'no_samples'};
    let interval=null;
    if(groups.size===4&&[...groups.values()].every(g=>g.length>=20)){
      const rng=random(seed),samples=[];
      for(let b=0;b<repetitions;b++){let sum=0;for(const g of groups.values())for(let i=0;i<g.length;i++)sum+=g[Math.floor(rng()*g.length)];samples.push(sum/pairs.length);}
      samples.sort((a,b)=>a-b);interval=[samples[Math.floor(repetitions*0.025)],samples[Math.ceil(repetitions*0.975)-1]];
    }
    return {pairs:pairs.length,games:pairs.length*2,rate:wins/pairs.length,interval,
      intervalMethod:'95% percentile bootstrap; whole pairs, stratified by starting seat',
      seatPairs:Object.fromEntries([...groups].map(([s,g])=>[s,g.length])),reason:interval?null:'insufficient_seat_strata'};
  }
  function releaseGate(experiment,summary,evidence){
    const reasons=[];
    if(experiment?.stage!=='T6'||experiment?.status!=='frozen')reasons.push('not_frozen_final_experiment');
    if(!Number.isInteger(experiment?.targetPairs)||experiment.targetPairs<80||summary.pairs!==experiment.targetPairs)reasons.push('fixed_sample_incomplete_or_exceeded');
    if(!summary.interval||summary.interval[0]<=0.5)reasons.push('win_rate_lower_bound_not_above_50_percent');
    if(!Number.isFinite(experiment?.minimumRate)||experiment.minimumRate<0.51||!Number.isFinite(summary.rate)||summary.rate<experiment.minimumRate)reasons.push('preregistered_practical_gain_not_met');
    for(const key of ['rulesReplay','engineering','exportParity','opponentMatrix'])if(evidence?.[key]?.status!=='passed'||!evidence[key].artifactSha256?.match(/^[a-f0-9]{64}$/))reasons.push('missing_verified_'+key);
    return {eligible:reasons.length===0,reasons,action:reasons.length?'保留稳定模型；另立实验，不追加样本寻找显著。':'通过数值门槛；按发布流程核对部署哈希并保留回退模型。'};
  }
  function proposal(){return {schema:1,protocolVersion:VERSION,status:'draft',primaryMetric:'固定两名 AI 从 2 到成功过 A 的完整比赛胜率',
    stage:'T0',targetPairs:5000,minimumRate:0.51,bootstrap:{seed:42,repetitions:2000,unit:'whole-pair',strata:'starting-seat'},
    splitUnit:'complete-match-and-all-derived-samples',trainingSeeds:3,referenceVersion:null,
    candidateHash:null,baselineHash:null,rulesHash:null,heldOutSeedManifestHash:null,stages,
    stopPolicy:'固定样本；连续两次开发评测无实用收益则停止该支线；确定性错误不无限重试。',
    automation:'实验结果先原子保存并生成哈希收据，再按唯一事件推进；本 App 不宣称已运行远程训练或自动发布模型。'};}
  return Object.freeze({VERSION,stages,random,pairedSummary,releaseGate,proposal});
});
