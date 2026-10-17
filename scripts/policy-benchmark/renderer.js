'use strict';
(async()=>{
  const lane=Number(new URLSearchParams(location.search).get('lane'));
  const client=new DanLMClient();
  let job=null,match=null,actions=[];
  async function post(route,data){
    const response=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(!response.ok)throw Error(route+': '+await response.text());
    return response.json();
  }
  try{
    await client.request({health:true});
    while((job=await(await fetch('/job?lane='+lane)).json())){
      match=new GuandanMatch.Match(job.state);actions=[];
      const started=performance.now();
      while(!match.game.result){
        if(actions.length>=1000)throw Error('1000-action safety limit reached');
        const seat=match.actingSeat,counts=match.game.players.map(p=>p.hand.length);
        const book=job.policies[seat];
        const action={index:actions.length,seat,book,counts,opening:counts.every(n=>n>=18)&&!match.game.finishOrder.length,
          freeLead:!match.game.tablePlay,table:match.game.tablePlay?{owner:match.game.tablePlay.owner,label:match.game.tablePlay.play.label,type:match.game.tablePlay.play.type}:null};
        if(match.mustPass){
          action.forced=true;action.play=null;action.ms=0;match.passForced();
        }else{
          const observation=match.observation(seat);
          if(observation.state.players.some(p=>p.seat!==seat&&p.hand.some(c=>c!==null)))throw Error('Hidden-hand leak');
          const t=performance.now();
          const response=await client.request({observation,provider:'danlm',book,teaching:false});
          action.ms=performance.now()-t;
          if(response.result.source!=='external'||!response.result.engine.includes('DanLM'))throw Error('Not the trained DanLM engine');
          if(Boolean(response.result.book)!==book)throw Error('Strategy switch mismatch');
          const chosen=response.result.candidates[0],policy=response.result.book;
          action.play=chosen.play?{key:chosen.play.key,type:chosen.play.type,label:chosen.play.label,cards:chosen.play.cards.map(c=>c.id),bomb:GuandanCore.isBomb(chosen.play)}:null;
          if(policy)action.policy={version:policy.version,original:policy.original,chosen:policy.chosen,changed:policy.changed,model:policy.model,
            evidence:(policy.rows[0]?.evidence||[]).filter(e=>e.delta!==0).map(e=>({rule:e.rule,delta:e.delta,reason:e.reason,...(e.uncalibratedDelta!==undefined?{uncalibratedDelta:e.uncalibratedDelta}:{})}))};
          match.commitModel(response,match.revision,seat);
        }
        actions.push(action);
        if(actions.length%10===0)await post('/progress',{lane,job:job.id,actions:actions.length,counts:match.game.players.map(p=>p.hand.length)});
      }
      await post('/completed',{lane,id:job.id,pair:job.pair,bookTeam:job.bookTeam,mode:job.mode,arm:job.arm,policies:job.policies,level:job.state.level,starter:job.state.game.starter,
        elapsedMs:performance.now()-started,result:match.game.result,finishOrder:match.game.finishOrder,
        remaining:match.game.players.map(p=>p.hand.length),actions});
    }
  }catch(error){
    await post('/failure',{lane,job:job?.id,error:error.stack,actions,state:match?.state}).catch(()=>{});
  }finally{client.worker?.terminate();}
})();
