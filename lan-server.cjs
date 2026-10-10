'use strict';
const http=require('node:http'),os=require('node:os'),net=require('node:net');
const fs=require('node:fs'),path=require('node:path');
const {Room,PROTOCOL}=require('./lan-room.cjs');
const discovery=require('./lan-discovery.cjs');
function privateIP(value){
  const ip=String(value||'').replace(/^::ffff:/,'');if(net.isIP(ip)!==4)return false;
  const [a,b]=ip.split('.').map(Number);return a===127||a===10||a===192&&b===168||a===172&&b>=16&&b<=31;
}
function addressURL(address){
  if(typeof address!=='string'||!/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(address))throw new Error('请输入房主显示的局域网地址和端口');
  const [host,port]=address.split(':');if(!privateIP(host)||Number(port)<1024||Number(port)>65535)throw new Error('只支持局域网 IPv4 地址和端口');
  return new URL('http://'+address+'/api');
}
async function request(address,body,token=''){
  const url=addressURL(address),data=JSON.stringify(body);if(data.length>32768)throw new Error('请求过大');
  return new Promise((resolve,reject)=>{
    const req=http.request(url,{method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(data),'authorization':'Bearer '+token},timeout:100000},res=>{
      let text='',size=0;res.on('data',part=>{size+=part.length;if(size>4000000){req.destroy(new Error('房间响应过大'));return;}text+=part;});
      res.on('end',()=>{try{const result=JSON.parse(text);if(result.error)reject(new Error(result.error));else resolve(result);}catch(error){reject(error);}});
      res.on('error',reject);
    });req.on('error',()=>reject(new Error('无法连接房间，请确认同一 Wi-Fi、地址正确且房主应用已打开')));req.on('timeout',()=>req.destroy(new Error('房间响应超时')));req.end(data);
  });
}
async function start({savePath,runModel,port=18765,webRoot=null,room:existingRoom=null,discoverable=port===18765,fresh=false}={}){
  const room=existingRoom||(fresh?new Room({savePath,runModel}):Room.load({savePath,runModel})),attempts=new Map();
  const server=http.createServer(async(req,res)=>{
    const reply=(status,value)=>{if(!res.headersSent)res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
    try{
      if(!privateIP(req.socket.remoteAddress)||!privateIP((req.headers.host||'').split(':')[0]))return reply(403,{error:'仅允许局域网访问'});
      if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)return reply(403,{error:'跨站请求已拒绝'});
      // Static assets are enabled only in isolated local browser acceptance fixtures.
      if(webRoot&&req.method==='GET'){
        const u=new URL(req.url,'http://localhost'),name=decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname),file=path.resolve(webRoot,'.'+name);
        if(!file.startsWith(webRoot+path.sep)||name.includes('\\')||name.includes('\0'))return reply(403,{error:'Forbidden'});
        const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.json':'application/json','.glb':'model/gltf-binary'};
        const bytes=await fs.promises.readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});return res.end(bytes);
      }
      if(req.url!=='/api'||req.method!=='POST'||!String(req.headers['content-type']).startsWith('application/json'))return reply(405,{error:'请求格式不正确'});
      let data='',length=0;
      for await(const part of req){length+=part.length;if(length>32768)return reply(413,{error:'请求过大'});data+=part;}
      const body=JSON.parse(data);if(!body||Array.isArray(body)||typeof body!=='object')throw new Error('请求无效');
      if(body.op==='join'){
        const ip=req.socket.remoteAddress,now=Date.now(),prior=attempts.get(ip),entry=prior&&now-prior.start<60000?prior:{start:now,count:0};
        attempts.set(ip,entry);if(++entry.count>12)return reply(429,{error:'尝试过于频繁，请一分钟后再试'});
        for(const [key,e]of attempts)if(now-e.start>60000)attempts.delete(key);
        return reply(200,room.join(body));
      }
      const auth=String(req.headers.authorization||'').replace(/^Bearer /,'');
      return reply(200,await room.request(auth,body));
    }catch(error){return reply(400,{error:error.message});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve);});
  const bound=server.address().port,addresses=Object.values(os.networkInterfaces()).flat().filter(i=>i.family==='IPv4'&&!i.internal&&privateIP(i.address)).map(i=>i.address+':'+bound);
  const beacon=discoverable?await discovery.advertise(room,bound):null;
  const timer=setInterval(()=>room.tick().catch(error=>{room.error=error.message;room.version++;}),700);timer.unref();
  let closing;
  return {room,server,address:'127.0.0.1:'+bound,addresses:[...new Set(addresses)],close(){
    if(closing)return closing;
    clearInterval(timer);room.closed=true;beacon?.close();server.closeAllConnections();
    closing=new Promise(resolve=>server.close(resolve));return closing;
  }};
}
module.exports={start,request,discover:discovery.discover,privateIP,addressURL,PROTOCOL};
