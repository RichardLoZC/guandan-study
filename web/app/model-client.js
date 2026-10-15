'use strict';
class DanLMClient{
  constructor(){this.worker=null;this.pending=null;this.sequence=0;this.ready=false;}
  request(payload,{timeout=90000}={}){
    if(this.pending)return Promise.reject(new Error('模型正在计算，请稍候'));
    if(!this.worker)this.worker=new Worker('/assets/fairWorker-CTCwrT35.js?v=202',{type:'module'});
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>this.cancel('模型计算超时，请重试'),timeout);
      this.pending={id,reject,timer};
      this.worker.onmessage=event=>{
        if(this.pending?.id!==id||event.data.id!==id)return;
        clearTimeout(timer);this.pending=null;
        if(event.data.error){reject(new Error(event.data.error));return;}
        this.ready=true;resolve(event.data);
      };
      this.worker.onerror=()=>this.cancel('模型线程加载失败，请重试');
      try{this.worker.postMessage({...payload,id});}catch(error){this.cancel(error.message);}
    });
  }
  cancel(message='计算已取消'){
    const pending=this.pending;this.pending=null;
    if(pending){clearTimeout(pending.timer);pending.reject(new Error(message));this.worker?.terminate();this.worker=null;this.ready=false;}
  }
}
