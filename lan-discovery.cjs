'use strict';
const dgram=require('node:dgram'),os=require('node:os'),net=require('node:net');
const {randomBytes}=require('node:crypto');
const PORT=18766,PROTOCOL=1;
function privateIP(ip){
  if(net.isIP(ip)!==4)return false;
  const [a,b]=ip.split('.').map(Number);
  return a===127||a===10||a===192&&b===168||a===172&&b>=16&&b<=31;
}
function broadcasts(){
  const addresses=new Set(['255.255.255.255']);
  const number=ip=>ip.split('.').reduce((n,octet)=>(n<<8)|Number(octet),0)>>>0;
  for(const nic of Object.values(os.networkInterfaces()).flat()){
    if(nic.internal||nic.family!=='IPv4'||!privateIP(nic.address)||net.isIP(nic.netmask)!==4)continue;
    const value=(number(nic.address)|~number(nic.netmask))>>>0;
    addresses.add([24,16,8,0].map(shift=>(value>>>shift)&255).join('.'));
  }
  return [...addresses].slice(0,16);
}
// Only public lobby metadata is advertised. The room code and player tokens
// remain private; discovery never joins a room or reveals any game state.
async function advertise(room,port,{discoveryPort=PORT}={}){
  const socket=dgram.createSocket({type:'udp4',reuseAddr:true}),seen=new Map();
  socket.on('message',(bytes,peer)=>{
    if(bytes.length>256||!privateIP(peer.address)||room.closed||!room.connected(room.members.find(m=>m.host)))return;
    let query;try{query=JSON.parse(bytes);}catch{return;}
    if(query.type!=='guandan-discover'||query.protocol!==PROTOCOL||!/^[a-f0-9]{24}$/.test(query.nonce))return;
    const now=Date.now();if(now-(seen.get(peer.address)||0)<200)return;
    seen.set(peer.address,now);for(const [ip,time]of seen)if(now-time>5000)seen.delete(ip);
    const answer={type:'guandan-room',protocol:PROTOCOL,nonce:query.nonce,id:room.id,port,
      name:room.members.find(m=>m.host).name,count:room.members.length,started:Boolean(room.match)};
    socket.send(JSON.stringify(answer),peer.port,peer.address,()=>{});
  });
  try{await new Promise((resolve,reject)=>{socket.once('error',reject);socket.bind(discoveryPort,'0.0.0.0',resolve);});}
  catch{try{socket.close();}catch{}return null;}
  socket.removeAllListeners('error');socket.on('error',()=>{});socket.unref();
  return socket;
}
function discover({targets=broadcasts(),port=PORT,duration=1300}={}){
  return new Promise(resolve=>{
    const socket=dgram.createSocket('udp4'),nonce=randomBytes(12).toString('hex'),rooms=new Map();
    let closed=false,timeout,retry;
    const finish=()=>{if(closed)return;closed=true;clearTimeout(timeout);clearTimeout(retry);try{socket.close();}catch{}resolve({rooms:[...rooms.values()]});};
    socket.on('error',finish);
    socket.on('message',(bytes,peer)=>{
      if(bytes.length>1024||!privateIP(peer.address)||rooms.size>=16)return;
      let room;try{room=JSON.parse(bytes);}catch{return;}
      if(room.type!=='guandan-room'||room.protocol!==PROTOCOL||room.nonce!==nonce||!/^[a-f0-9]{48}$/.test(room.id)||
        !Number.isInteger(room.port)||room.port<1024||room.port>65535||!Number.isInteger(room.count)||room.count<1||room.count>4)return;
      const address=peer.address+':'+room.port;
      rooms.set(room.id,{id:room.id,address,name:String(room.name||'朋友').slice(0,12),count:room.count,started:room.started===true});
    });
    socket.bind(0,'0.0.0.0',()=>{
      if(closed)return;
      try{socket.setBroadcast(true);}catch{finish();return;}
      const query=Buffer.from(JSON.stringify({type:'guandan-discover',protocol:PROTOCOL,nonce}));
      const send=()=>{if(closed)return;for(const address of targets)if(net.isIP(address)===4)socket.send(query,port,address,()=>{});};
      send();retry=setTimeout(send,400);timeout=setTimeout(finish,duration);
    });
  });
}
module.exports={PORT,advertise,discover,broadcasts};
