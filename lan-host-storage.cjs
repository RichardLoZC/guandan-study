'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
class LanHostStorage{
  constructor(directory){this.current=path.join(directory,'局域网房间.json');this.archive=path.join(directory,'局域网牌桌备份');}
  parse(file){
    if(!fs.existsSync(file))return null;
    const bytes=fs.readFileSync(file),state=JSON.parse(bytes);
    if(!/^[a-f0-9]{48}$/.test(state?.id||'')||![1,2,3].includes(state.protocol))throw new Error('局域网牌桌存档无效，请先导出备份。');
    return {bytes,state};
  }
  write(file,bytes){
    fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    const temp=file+'.tmp-'+process.pid;try{fs.writeFileSync(temp,bytes,{mode:0o600});fs.renameSync(temp,file);}finally{try{fs.unlinkSync(temp);}catch{}}
  }
  checkpoint(){
    const current=this.parse(this.current);if(!current)return;
    this.write(path.join(this.archive,current.state.id+'.json'),current.bytes);
  }
  beforeNew(){
    const current=this.parse(this.current);if(!current)return;
    const legacy=this.parse(this.current+'.before-new');
    if(legacy){
      const file=path.join(this.archive,legacy.state.id+'.json'),existing=this.parse(file);
      if(legacy.state.id===current.state.id&&!legacy.bytes.equals(current.bytes))this.write(path.join(this.archive,legacy.state.id+'.legacy-'+crypto.randomUUID()+'.json'),legacy.bytes);
      else if(!existing)this.write(file,legacy.bytes);
      else if(!existing.bytes.equals(legacy.bytes))this.write(path.join(this.archive,legacy.state.id+'.legacy-'+crypto.randomUUID()+'.json'),legacy.bytes);
    }
    this.checkpoint();this.write(this.current+'.before-new',current.bytes);
  }
  restore(roomId){
    if(!/^[a-f0-9]{48}$/.test(roomId||''))throw new Error('局域网牌桌身份无效。');
    const current=this.parse(this.current);if(current?.state.id===roomId)return;
    let saved=this.parse(path.join(this.archive,roomId+'.json'));
    if(!saved){const legacy=this.parse(this.current+'.before-new');if(legacy?.state.id===roomId)saved=legacy;}
    if(!saved||saved.state.id!==roomId)throw new Error('未找到原来的局域网牌桌，请重新开桌。');
    if(current)this.checkpoint();
    this.write(this.current,saved.bytes);
  }
}
module.exports={LanHostStorage};
