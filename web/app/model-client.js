'use strict';
class DanLMClient{
  constructor(){this.worker=null;this.pending=null;this.sequence=0;this.ready=false;}
  request(payload,{timeout=90000}={}){
    if(this.pending)return Promise.reject(new Error('模型正在计算，请稍候'));
    const native=globalThis.GuandanNativeDanLM;
    if(!native&&globalThis.GuandanDesktop?.nativeDanLM===true)return Promise.reject(new Error('官方 Mac 模型连接不可用'));
    const id=++this.sequence,now=()=>globalThis.performance?.now?.()??Date.now(),started=now();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>this.cancel('模型计算超时，请重试'),timeout);
      this.pending={id,reject,timer};
      const finish=data=>{
        if(this.pending?.id!==id)return;
        clearTimeout(timer);this.pending=null;
        if(data.error){reject(new Error(data.error));return;}
        this.ready=true;resolve({...data,elapsedMs:Math.round(now()-started)});
      };
      const request={...payload,id};delete request.book;delete request.aiBook;
      if(native){
        native.request(request).then(data=>{
          if(this.pending?.id!==id)return;
          if(!payload.teaching&&payload.variant!=='tuo3'){finish(data);return;}
          if(!this.worker)this.worker=new Worker('/assets/native-explain-worker.js?v=1',{type:'module'});
          this.worker.onmessage=event=>{if(event.data.id===id)finish({...data,...event.data});};
          this.worker.onerror=()=>this.cancel('教学分析线程加载失败，请重试');
          this.worker.postMessage({id,observation:payload.observation,result:data.result,selected:payload.selected,teaching:payload.teaching,variant:payload.variant});
        }).catch(error=>finish({error:error.message}));
        return;
      }
      if(!this.worker)this.worker=new Worker('/assets/fairWorker-CTCwrT35.js?v=225',{type:'module'});
      this.worker.onmessage=event=>{if(event.data.id===id)finish(event.data);};
      this.worker.onerror=()=>this.cancel('模型线程加载失败，请重试');
      try{this.worker.postMessage(request);}catch(error){this.cancel(error.message);}
    });
  }
  cancel(message='计算已取消'){
    const pending=this.pending;this.pending=null;
    if(pending){clearTimeout(pending.timer);pending.reject(new Error(message));this.worker?.terminate();this.worker=null;this.ready=false;}
  }
  reset(message='计算已取消'){
    this.cancel(message);this.worker?.terminate();this.worker=null;this.ready=false;
  }
}
