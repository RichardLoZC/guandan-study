'use strict';
// The authoritative room is shared with Android. Only desktop persistence is Node-specific.
const fs=require('node:fs');
const shared=require('./web/app/lan-room.js');
class Room extends shared.Room {
  constructor(options={}){
    const {savePath=null}=options;
    super(options);
    this.savePath=savePath;
  }
  save(){
    if(!this.savePath)return;
    const temporary=this.savePath+'.tmp';fs.writeFileSync(temporary,JSON.stringify(this.serialize()),{mode:0o600});fs.renameSync(temporary,this.savePath);
  }
  static load(options){
    if(options.savePath&&fs.existsSync(options.savePath)){
      const saved=JSON.parse(fs.readFileSync(options.savePath,'utf8'));
      if(saved.protocol!==shared.PROTOCOL)throw new Error('房间存档版本不兼容');
      return new Room({...options,restored:saved});
    }
    return new Room(options);
  }
}
module.exports={...shared,Room};
