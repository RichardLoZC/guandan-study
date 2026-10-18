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
    async function host(payload={}){
      if(suspended)throw new Error('请先回到游戏再开桌');
      if(payload.fresh||!room||room.closed){
        const raw=storage.getItem(KEY);
        // Keep the previous room recoverable if creating or saving a new one fails.
        if(payload.fresh&&raw)storage.setItem(KEY+'.before-new',raw);
        stop();room=null;
        const restored=!payload.fresh&&raw?JSON.parse(raw):null;
        if(restored&&restored.protocol!==1)throw new Error('房间存档版本不兼容');
        room=new Room({persist,restored,aiBook:payload.aiBook!==false,runModel:args=>{
          if(!client)client=makeModel();return client.request(args);
        }});
        // A restored room never resumes play before everyone sees the table again.
        if(restored)room.paused=true;
      }
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
