/* Android owns the sockets; this controller uses the same authoritative Room as desktop. */
(function(scope,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else if(scope.GuandanPadNative?.hostStart){
    scope.GuandanAndroidHost=factory().create({native:scope.GuandanPadNative,storage:localStorage,Room:scope.GuandanRoom.Room,makeModel:()=>new DanLMClient()});
  }
})(globalThis,function(){
  const KEY='guandan.lan.host.v1';
  function create({native,storage,Room,makeModel,setTimer=setInterval,clearTimer=clearInterval}){
    let room=null,client=null,timer=null,suspended=false;
    const persist=value=>storage.setItem(KEY,JSON.stringify(value));
    function publish(){
      if(!room||room.closed||suspended)return;
      const host=room.members.find(m=>m.host);
      native.hostAnnounce(JSON.stringify({id:room.id,name:host.name,count:room.members.length,started:Boolean(room.match),connected:room.connected(host)}));
    }
    function disposeModel(){client?.cancel();client?.worker?.terminate();client=null;}
    function stop(){
      if(timer!==null)clearTimer(timer);timer=null;
      if(room){room.closed=true;room.botWait?.cancel();}disposeModel();native.hostStop();
    }
    function parse(raw){
      if(!raw)return null;const saved=JSON.parse(raw);
      if(!/^[a-f0-9]{48}$/.test(saved?.id||'')||![1,2,3].includes(saved.protocol))throw new Error('房间存档版本不兼容');
      return saved;
    }
    async function host(payload={}){
      if(suspended)throw new Error('请先回到游戏再开桌');
      const requested=payload.roomId;
      if(requested!==undefined&&(typeof requested!=='string'||!/^[a-f0-9]{48}$/.test(requested)||payload.fresh))throw new Error('局域网牌桌身份无效。');
      if(payload.fresh||!room||room.closed||(requested&&room.id!==requested)){
        const raw=storage.getItem(KEY),current=parse(raw);let restored=payload.fresh?null:current;
        if(requested&&current?.id!==requested){
          restored=parse(storage.getItem(KEY+'.room.'+requested));
          if(!restored){const legacy=parse(storage.getItem(KEY+'.before-new'));if(legacy?.id===requested)restored=legacy;}
          if(!restored||restored.id!==requested)throw new Error('未找到原来的局域网牌桌，请重新开桌。');
        }
        // Archive the previous host table before a new table can replace it.
        if(raw&&(payload.fresh||(requested&&current?.id!==requested)))storage.setItem(KEY+'.room.'+current.id,raw);
        if(payload.fresh&&raw){
          const legacyRaw=storage.getItem(KEY+'.before-new'),legacy=parse(legacyRaw);
          if(legacy){
            const archive=KEY+'.room.'+legacy.id,existing=storage.getItem(archive);
            if(!existing)storage.setItem(archive,legacyRaw);
            else if(existing!==legacyRaw)storage.setItem(KEY+'.legacy.'+legacy.id+'.'+crypto.randomUUID(),legacyRaw);
          }
          storage.setItem(KEY+'.before-new',raw);
        }
        stop();room=null;
        room=new Room({persist,restored,runModel:args=>{
          if(!client)client=makeModel();return client.request(args);
        }});
        // A restored room never resumes play before everyone sees the table again.
        if(restored)room.paused=true;
      }
      if(requested&&room.id!==requested)throw new Error('未找到原来的局域网牌桌，请重新开桌。');
      const identity=room.host(payload.name||'安卓玩家');
      const endpoint=JSON.parse(native.hostStart());
      if(endpoint.error){stop();throw new Error(endpoint.error);}
      if(timer===null)timer=setTimer(()=>{
        const current=room;if(suspended||!current||current.closed)return;
        const work=current.tick().catch(error=>{if(room===current&&!current.closed){current.error=error.message;current.version++;}}).finally(()=>{if(room===current)publish();});
        publish();return work;
      },700);
      publish();return {...identity,...endpoint};
    }
    async function dispatch(id,raw){
      const current=room;let response;
      try{
        if(!current||current.closed||suspended)throw new Error('房主暂不可用，请等待房主返回游戏');
        const request=JSON.parse(raw),body=request.body;
        if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('请求无效');
        response=body.op==='join'?current.join(body):await current.request(request.token,body);
        if(room!==current||current.closed)throw new Error('房间已更换，请重新加入');
      }catch(error){response={error:error.message};}
      native.hostReply(id,JSON.stringify(response));publish();
    }
    function suspend(){
      if(suspended)return;suspended=true;
      if(room&&!room.closed){
        try{if(!room.paused)room.change(()=>{room.paused=true;});}
        catch(error){room.paused=true;room.error='暂停存档失败：'+error.message;room.version++;}
        room.botWait?.cancel();disposeModel();
      }
    }
    function resume(){suspended=false;publish();}
    function park(){stop();room=null;}
    return Object.freeze({host,dispatch,suspend,resume,park});
  }
  return {create,KEY};
});
