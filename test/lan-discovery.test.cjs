'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),dgram=require('node:dgram');
const {Room}=require('../lan-room.cjs'),{advertise,discover}=require('../lan-discovery.cjs');
test('nearby discovery exposes public lobby metadata, without code, tokens or hands',async()=>{
  const room=new Room();room.host('Mac 牌友');
  const beacon=await advertise(room,18765,{discoveryPort:0});
  try{
    const result=await discover({targets:['127.0.0.1'],port:beacon.address().port,duration:100});
    assert.deepEqual(result.rooms,[{id:room.id,address:'127.0.0.1:18765',name:'Mac 牌友',count:1,started:false}]);
    const json=JSON.stringify(result);assert.equal(json.includes(room.code),false);assert.equal(json.includes(room.members[0].token),false);
  }finally{beacon.close();}
});
test('discovery ignores unrelated replies and uses the sender address, not an advertised URL',async()=>{
  const server=dgram.createSocket('udp4');await new Promise(resolve=>server.bind(0,'127.0.0.1',resolve));
  server.on('message',(bytes,peer)=>{
    const query=JSON.parse(bytes),valid={type:'guandan-room',protocol:1,nonce:query.nonce,id:'a'.repeat(48),port:18765,name:'朋友',count:4,started:true,address:'8.8.8.8:9999'};
    for(const reply of [{...valid,nonce:'0'.repeat(24)},{...valid,port:22},{...valid,count:5},{...valid,protocol:9},valid])server.send(JSON.stringify(reply),peer.port,peer.address);
  });
  try{
    const {rooms}=await discover({targets:['127.0.0.1'],port:server.address().port,duration:100});
    assert.equal(rooms.length,1);assert.equal(rooms[0].address,'127.0.0.1:18765');assert.equal(rooms[0].count,4);
  }finally{server.close();}
});
test('an absent or paused-away host is not advertised',async()=>{
  let now=1000;const room=new Room({now:()=>now});room.host('Mac');now+=13000;
  const beacon=await advertise(room,18765,{discoveryPort:0});
  try{assert.deepEqual((await discover({targets:['127.0.0.1'],port:beacon.address().port,duration:100})).rooms,[]);}
  finally{beacon.close();}
});
