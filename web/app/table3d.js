import * as THREE from '../vendor/three/build/three.module.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';

const clamp=THREE.MathUtils.clamp;
function disposeTree(root){
  const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
  root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.skeleton)skeletons.add(object.skeleton);
    for(const material of [object.material].flat().filter(Boolean)){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
  textures.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());geometries.forEach(item=>item.dispose());skeletons.forEach(item=>item.dispose());
}
function roundedShape(w,h,r){const s=new THREE.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
function feltTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#5c8070';ctx.fillRect(0,0,256,256);
  for(let y=0;y<256;y+=4)for(let x=0;x<256;x+=4){ctx.fillStyle=(x+y)%8?'#658877':'#557965';ctx.fillRect(x,y,1,2);}
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(10,8);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function addLight(scene){scene.add(new THREE.HemisphereLight(0xfff6de,0x324e44,2.2));const key=new THREE.DirectionalLight(0xffe2bf,3);key.position.set(-200,500,650);scene.add(key);const fill=new THREE.DirectionalLight(0xc9e7fa,.8);fill.position.set(400,130,300);scene.add(fill);}
function prepareHand(scene){
  // Anatomical grip is baked in the asset; do not stretch individual fingers.
  scene.traverse(object=>{if(object.isMesh){object.frustumCulled=false;object.material.roughness=.64;}});
}
function addHandLight(scene){
  scene.add(new THREE.HemisphereLight(0xfff7ed,0x665047,1.3));
  const key=new THREE.DirectionalLight(0xfff4e5,2.0);key.position.set(-300,450,550);scene.add(key);
  const fill=new THREE.DirectionalLight(0xddeaff,.4);fill.position.set(400,80,220);scene.add(fill);
}
export async function createTableView({host,zone,onFailure,onSelect,onArrangeStart,signal}){
  let failure=null,disposed=false,visible=!document.hidden,raf=0,dirty=true,lastTime=0,hovered=null,state=null,buttons=new Map(),width=1,height=1;
  let outgoing=null,skinToken=0,skin='',loadingTextures='',loadingFaces=new Set(),activeTextures=new Map();const pendingImages=new Set(),cards=new Map(),hands=[],publicCards=new Map();let tableKey='';
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.autoClear=false;renderer.domElement.setAttribute('aria-hidden','true');host.append(renderer.domElement);
  const room=new THREE.Scene();room.background=new THREE.Color('#142e27');room.fog=new THREE.Fog('#142e27',12,27);
  const camera=new THREE.PerspectiveCamera(42,1,.1,60);camera.position.set(0,6.5,9.4);camera.lookAt(0,0,-.6);addLight(room);
  const foreground=new THREE.Scene(),handCamera=new THREE.OrthographicCamera(0,1,1,0,-2000,2000);handCamera.position.z=1000;addHandLight(foreground);
  const cardLayer=new THREE.Group();foreground.add(cardLayer);const tableLayer=new THREE.Group();room.add(tableLayer);
  const table=new THREE.Mesh(new THREE.ExtrudeGeometry(roundedShape(11,8,2.7),{depth:.28,bevelEnabled:true,bevelThickness:.16,bevelSize:.16,bevelSegments:4,steps:1}),new THREE.MeshStandardMaterial({color:'#503629',roughness:.45}));table.rotation.x=-Math.PI/2;table.position.y=-.22;room.add(table);
  const rail=new THREE.Mesh(new THREE.ExtrudeGeometry(roundedShape(10.8,7.8,2.6),{depth:.08,bevelEnabled:true,bevelThickness:.15,bevelSize:.15,bevelSegments:5,steps:1}),new THREE.MeshStandardMaterial({color:'#1d2924',roughness:.62}));rail.rotation.x=-Math.PI/2;rail.position.y=.1;room.add(rail);
  const surface=new THREE.Mesh(new THREE.ShapeGeometry(roundedShape(10.05,7.05,2.28),32),new THREE.MeshStandardMaterial({color:'#67b993',map:feltTexture(),roughness:1}));surface.rotation.x=-Math.PI/2;surface.position.y=.35;room.add(surface);
  const pool=new THREE.PointLight('#fff0c4',35,16,2);pool.position.set(0,4,-1);room.add(pool);
  const boundary=new THREE.EdgesGeometry(new THREE.ShapeGeometry(roundedShape(9.48,6.48,2.08),48));const line=new THREE.LineSegments(boundary,new THREE.LineBasicMaterial({color:'#b7aa76',transparent:true,opacity:.32}));line.rotation.x=-Math.PI/2;line.position.y=.356;room.add(line);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(70,70),new THREE.MeshStandardMaterial({color:'#172c24',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.2;room.add(floor);
  for(const [x,z,angle] of [[0,-5,0],[-6,0,Math.PI/2],[6,0,-Math.PI/2]]){const chair=new THREE.Mesh(new THREE.BoxGeometry(1.8,1.4,.3),new THREE.MeshStandardMaterial({color:'#314c3f',roughness:.8}));chair.position.set(x,.3,z);chair.rotation.y=angle;room.add(chair);}
  const faceGeometry=new THREE.ShapeGeometry(roundedShape(104,156,5),8),edgeGeometry=new THREE.ExtrudeGeometry(roundedShape(104,156,5),{depth:1.1,bevelEnabled:false}),ringGeometry=new THREE.ShapeGeometry(roundedShape(110,162,7),8);
  // ShapeGeometry uses local XY for UVs; map the whole SVG to the card.
  const uv=faceGeometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/104+.5,uv.getY(i)/156+.5);uv.needsUpdate=true;
  const paper=new THREE.MeshStandardMaterial({color:'#e6e3d4',roughness:.9}),gold=new THREE.MeshBasicMaterial({color:'#f2ca71'}),fallbackFace=new THREE.MeshBasicMaterial({color:'#fffced'});
  const markCanvas=document.createElement('canvas');markCanvas.width=markCanvas.height=64;const markCtx=markCanvas.getContext('2d');markCtx.fillStyle='#a47b2c';markCtx.beginPath();markCtx.arc(32,32,29,0,Math.PI*2);markCtx.fill();markCtx.fillStyle='#fff8dc';markCtx.font='bold 45px sans-serif';markCtx.textAlign='center';markCtx.fillText('✓',32,48);
  const markTexture=new THREE.CanvasTexture(markCanvas);markTexture.colorSpace=THREE.SRGBColorSpace;const markMaterial=new THREE.MeshBasicMaterial({map:markTexture,transparent:true,depthWrite:false,toneMapped:false}),markGeometry=new THREE.PlaneGeometry(19,19);
  const resources=[faceGeometry,edgeGeometry,ringGeometry,paper,gold,fallbackFace,markTexture,markMaterial,markGeometry];
  const groupMaterials=['#f0ce79','#82cbde','#dfa3ce','#aace8c','#efa48f'].map(color=>{const material=new THREE.MeshBasicMaterial({color});resources.push(material);return material;});
  function fail(error){failure=error;if(!disposed)onFailure(error);}
  const contextLost=event=>{event.preventDefault();fail(new Error('图形连接已中断，可再次点击 3D 重试'));};renderer.domElement.addEventListener('webglcontextlost',contextLost);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerDown=null;
  function hit(event){
    if(!cardLayer.visible||!state)return null;
    const box=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);
    foreground.updateMatrixWorld(true);raycaster.setFromCamera(pointer,handCamera);
    const found=raycaster.intersectObjects([...cards.values()].map(entry=>entry.faceMesh),false)[0];
    return found?.object.userData.cardId??null;
  }
  function pointMove(event){hovered=hit(event);renderer.domElement.style.cursor=cards.get(hovered)?.selectable?(state?.arranging?'grab':'pointer'):'default';request();}
  function pointLeave(){hovered=null;pointerDown=null;request();}
  function pointDown(event){if(event.button===0){const id=hit(event);if(state?.arranging){pointerDown=null;if(id)onArrangeStart(event,id);}else pointerDown=id;}}
  function pointUp(event){const id=hit(event);if(!state?.arranging&&event.button===0&&id&&id===pointerDown&&cards.get(id)?.selectable)onSelect(id);pointerDown=null;}
  const pointerListeners={pointermove:pointMove,pointerleave:pointLeave,pointerdown:pointDown,pointerup:pointUp};
  for(const [type,listener] of Object.entries(pointerListeners))renderer.domElement.addEventListener(type,listener);
  function request(){dirty=true;if(!raf&&!disposed&&visible)raf=requestAnimationFrame(frame);}
  function frame(time){
    raf=0;if(disposed||!visible)return;
    const dt=Math.min((time-lastTime)/1000,.04)||.016;lastTime=time;let moving=false;
    for(const entry of cards.values()){
      const goal=entry.selected?22:String(entry.id)===hovered&&entry.selectable?10:0;
      const distance=goal-entry.lift;entry.lift=state?.reduceMotion?goal:entry.lift+distance*Math.min(1,dt*18);if(Math.abs(distance)>.15)moving=true;
      entry.group.position.y=entry.baseY+entry.lift;entry.ring.visible=entry.selected;entry.band.visible=entry.arrangementGroup>=0;entry.band.material=groupMaterials[Math.max(0,entry.arrangementGroup)%groupMaterials.length];entry.mark.visible=entry.selected;
    }
    if(outgoing){
      if(outgoing.entries.every(entry=>entry.material.map)){
        outgoing.started??=time;
        const t=clamp((time-outgoing.started)/outgoing.duration,0,1),ease=1-Math.pow(1-t,3);
        for(const entry of outgoing.entries){
          entry.group.visible=true;entry.group.position.lerpVectors(entry.start,entry.target,ease);
          entry.group.position.y+=Math.sin(Math.PI*t)*.9;
          entry.group.quaternion.slerpQuaternions(entry.startRotation,entry.targetRotation,ease);
          entry.group.scale.setScalar(THREE.MathUtils.lerp(entry.startScale,.0076,ease));
          entry.shadow.visible=t>.7;entry.shadow.material.opacity=.14*clamp((t-.7)/.3,0,1);
        }
        if(outgoing.own&&hands[1]?.userData.base){hands[1].position.copy(hands[1].userData.base);hands[1].position.x-=Math.sin(t*Math.PI)*55;hands[1].position.y+=Math.sin(t*Math.PI)*50;}
        if(t===1)finishOutgoing();else moving=true;
      }
    }
    try{renderer.clear();renderer.render(room,camera);renderer.clearDepth();renderer.render(foreground,handCamera);}catch(error){fail(error);return;}
    if(moving)request();dirty=false;
  }
  function finishOutgoing(){
    outgoing=null;
    for(const entry of publicCards.values()){
      entry.group.position.copy(entry.target);entry.group.quaternion.copy(entry.targetRotation);entry.group.scale.setScalar(.0076);
      entry.group.visible=Boolean(entry.material.map);entry.shadow.visible=true;entry.shadow.material.opacity=.14;
    }
    if(hands[1]?.userData.base)hands[1].position.copy(hands[1].userData.base);
  }
  function clearTable(){
    finishOutgoing();for(const entry of publicCards.values()){tableLayer.remove(entry.group,entry.shadow);entry.material.dispose();entry.shadow.material.dispose();}publicCards.clear();
  }
  function placeTable(next,animate){
    const actions=next.ended||next.dealing?[]:next.tableActions||[next.table],plays=actions.filter(action=>action?.cards.length);
    const key=next.id+'|'+plays.map(play=>play.owner+':'+play.ids.join(',')).join(';');
    if(key===tableKey)return;tableKey=key;finishOutgoing();
    if(state&&state.id!==next.id)clearTable();
    const retained=new Set(plays.flatMap(play=>play.ids));
    for(const [id,entry] of publicCards)if(!retained.has(id)){tableLayer.remove(entry.group,entry.shadow);entry.material.dispose();entry.shadow.material.dispose();publicCards.delete(id);}
    const animated=[];
    camera.updateMatrixWorld(true);
    for(const play of plays){
      const own=play.owner===0,throwing=animate&&play.owner===next.table?.owner,slots=GuandanPresentation.tableLayout(play.owner,play.cards.length);
      play.cards.forEach((card,index)=>{
      if(publicCards.has(card.id))return;
      const slot=slots[index],target=new THREE.Vector3(slot.x,slot.y,slot.z),targetRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,slot.angle));
      const material=new THREE.MeshBasicMaterial({map:activeTextures.get(card.face)||null,toneMapped:false});
      const group=new THREE.Group(),face=new THREE.Mesh(faceGeometry,material),edge=new THREE.Mesh(edgeGeometry,paper);edge.position.z=-1.3;group.add(face,edge);tableLayer.add(group);
      const shadow=new THREE.Mesh(ringGeometry,new THREE.MeshBasicMaterial({color:'#081b12',transparent:true,opacity:.14,depthWrite:false}));shadow.rotation.set(-Math.PI/2,0,slot.angle);shadow.position.set(slot.x,.362,slot.z+.02);shadow.scale.setScalar(.0081);tableLayer.add(shadow);
      let start,startScale=.009,startRotation=targetRotation.clone();
      const held=own?cards.get(card.id):null;
      if(held){
        const ndc=new THREE.Vector2(held.group.position.x/width*2-1,held.group.position.y/height*2-1),ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);
        start=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-1.3),new THREE.Vector3())||target.clone();
        const depth=-start.clone().applyMatrix4(camera.matrixWorldInverse).z;
        startScale=120*2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height/104;
        startRotation=camera.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),held.group.rotation.z));
      }else{
        const from=[[1.1,1.3,5.2],[4.8,1.1,-1.5],[0,1.1,-4.5],[-4.8,1.1,-1.5]][play.owner];start=new THREE.Vector3(...from);startRotation.setFromEuler(new THREE.Euler(-.45,0,slot.angle));
      }
      const entry={id:card.id,owner:play.owner,face:card.face,material,group,shadow,target,targetRotation,start,startRotation,startScale};publicCards.set(card.id,entry);
      group.position.copy(throwing?start:target);group.quaternion.copy(throwing?startRotation:targetRotation);group.scale.setScalar(throwing?startScale:.0076);group.visible=Boolean(material.map);shadow.visible=!throwing;
      if(throwing)animated.push(entry);
      });
    }
    if(animated.length)outgoing={own:next.table.owner===0,entries:animated,started:null,duration:next.table.owner===0?620:520};
  }
  async function loadFace(card,currentSkin,token){
    const canvas=document.createElement('canvas');canvas.width=420;canvas.height=630;const ctx=canvas.getContext('2d');
    const img=new Image();pendingImages.add(img);
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('牌面素材加载失败'));img.src=new URL('../assets/'+currentSkin+'/'+card.face+'.svg',import.meta.url).href;}).finally(()=>pendingImages.delete(img));
    if(disposed||token!==skinToken)return null;
    ctx.drawImage(img,0,0,420,630);
    if(card.joker){ctx.fillStyle='#fffff2';ctx.fillRect(8,6,82,210);ctx.fillStyle=card.label.includes('大')?'#bc161b':'#25352d';ctx.font=(globalThis.GuandanI18n?.locale==='en'?'bold 34px':'bold 57px')+' sans-serif';ctx.textAlign='center';(globalThis.GuandanI18n?.locale==='en'?['J','O','K','E','R']:Array.from(card.label)).forEach((c,i)=>ctx.fillText(c,48,44+i*(globalThis.GuandanI18n?.locale==='en'?37:67)));}
    if(card.isWild){ctx.fillStyle='#ecd08a';ctx.fillRect(5,222,125,46);ctx.fillStyle='#523816';ctx.font=(globalThis.GuandanI18n?.locale==='en'?'bold 27px':'bold 35px')+' sans-serif';ctx.textAlign='center';ctx.fillText(globalThis.GuandanI18n?.locale==='en'?'WILD':'百搭',67,258);}
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return texture;
  }
  async function updateTextures(snapshot){
    const visibleCards=[...snapshot.hand,...GuandanPresentation.tableCards(snapshot)];
    const token=++skinToken,key=snapshot.skin+'|'+snapshot.level+'|'+(globalThis.GuandanI18n?.locale||'zh-CN');if(skin!==key)finishOutgoing();skin=key;loadingTextures=key;loadingFaces=new Set(visibleCards.map(c=>c.face));
    const unique=new Map(visibleCards.map(card=>[card.face,card])),loaded=new Map();
    try{
      await Promise.all([...unique].map(async([face,card])=>{const texture=await loadFace(card,snapshot.skin,token);if(texture)loaded.set(face,texture);}));
      if(disposed||token!==skinToken){loaded.forEach(t=>t.dispose());return;}
      const old=activeTextures;activeTextures=loaded;loadingTextures='';loadingFaces.clear();
      for(const entry of [...cards.values(),...publicCards.values()]){entry.material.map=loaded.get(entry.face)||null;entry.material.needsUpdate=true;if(publicCards.has(entry.id)||entry.target)entry.group.visible=Boolean(entry.material.map);}
      old.forEach(t=>t.dispose());request();
    }catch(error){loaded.forEach(t=>t.dispose());if(!disposed&&token===skinToken)fail(error);}
  }
  const bandGeometry=new THREE.PlaneGeometry(14,4);resources.push(bandGeometry);
  function createCard(card){
    const group=new THREE.Group(),material=new THREE.MeshBasicMaterial({map:activeTextures.get(card.face)||null,color:'#ffffff',toneMapped:false});
    const edge=new THREE.Mesh(edgeGeometry,paper);edge.scale.z=.1;edge.position.z=-.13;group.add(edge);
    const ring=new THREE.Mesh(ringGeometry,gold);ring.position.z=-.05;group.add(ring);
    const face=new THREE.Mesh(faceGeometry,material);face.userData.cardId=card.id;group.add(face);const mark=new THREE.Mesh(markGeometry,markMaterial);mark.position.set(-37,10,.025);group.add(mark);cardLayer.add(group);
    const band=new THREE.Mesh(bandGeometry,groupMaterials[0]);band.position.set(-34,45,.025);group.add(band);
    return {id:card.id,face:card.face,faceMesh:face,group,material,ring,mark,band,lift:0,baseY:0,selected:card.selected,selectable:card.selectable};
  }
  function layout(){
    if(!state)return;const items=GuandanPresentation.fanLayout(state.hand,width,height);const scale=GuandanPresentation.gripScale(width,height);zone.style.setProperty('--grip-height',(80+((state.hand.some(card=>card.row===0)?400:300)-80)*scale)+'px');
    const ownCaption=new THREE.Vector3(2.85,.4,2.85).project(camera);
    zone.style.setProperty('--self-pile-x',((ownCaption.x+1)*width/2)+'px');
    zone.style.setProperty('--self-pile-y',Math.min((1-ownCaption.y)*height/2,height-160)+'px');
    for(const [i,card] of state.hand.entries()){
      const entry=cards.get(card.id),p=items[i];entry.baseY=p.y;entry.group.position.set(p.x,p.y+entry.lift,p.z);entry.group.rotation.set(0,0,p.angle);entry.group.scale.setScalar(p.width/104);entry.ring.visible=entry.selected;entry.band.visible=entry.arrangementGroup>=0;entry.band.material=groupMaterials[Math.max(0,entry.arrangementGroup)%groupMaterials.length];entry.mark.visible=entry.selected;
      const button=buttons.get(card.id);if(button){button.style.setProperty('--hit-x',(p.x-p.width/2)+'px');button.style.setProperty('--hit-y',(height-p.y-p.height/2-20)+'px');button.style.setProperty('--hit-w',p.hitWidth+'px');button.style.setProperty('--hit-h',(p.height+22)+'px');}
    }
    // A compact single fan rests in the left hand; the right hand drops out of view.
    const twoTiers=state.hand.some(card=>card.row===0);
    const supportX=85+Math.min(45,(state.hand.length-1)*2);
    const gripX=-40-Math.min(45,(state.hand.length-1)*3);
    hands.forEach((hand,index)=>{
      const grip=index===0;
      hand.position.set(width/2+(grip?gripX:supportX)*scale,80+((grip?72:(!twoTiers?-180:52))-80)*scale,(grip?55:45)*scale);
      hand.rotation.set(-.7,0,grip?-.4:.55,'ZYX');hand.scale.setScalar((grip?1000:900)*scale);
      hand.userData.base=hand.position.clone();hand.visible=!state.ended&&!state.dealing&&state.hand.length>0;
    });
    cardLayer.visible=!state.ended&&!state.dealing;tableLayer.visible=cardLayer.visible&&state.phase==='playing';
    request();
  }
  function setState(next,options){
    if(disposed||!next)return;
    const changedRound=state&&state.id!==next.id;
    if(changedRound||next.ended||next.dealing)finishOutgoing();
    placeTable(next,GuandanPresentation.isNewTablePlay(state,next)&&!next.reduceMotion);
    const held=new Set(next.hand.map(card=>card.id));for(const [id,entry] of cards)if(!held.has(id)){cardLayer.remove(entry.group);entry.material.dispose();cards.delete(id);}
    for(const card of next.hand){const entry=cards.get(card.id)||createCard(card);entry.selected=card.selected;entry.arrangementGroup=card.group??-1;entry.selectable=card.selectable;entry.material.color.set(card.selectable||next.phase==='playing'?'#ffffff':'#88988a');cards.set(card.id,entry);}
    state=next;buttons=options.buttons;
    const nextSkin=next.skin+'|'+next.level+'|'+(globalThis.GuandanI18n?.locale||'zh-CN');if(nextSkin!==skin||[...cards.values(),...publicCards.values()].some(e=>loadingTextures===nextSkin?!loadingFaces.has(e.face):!activeTextures.has(e.face)))updateTextures(next);
    room.background.set(next.theme==='night'?'#091812':'#142e27');room.fog.color.copy(room.background);layout();
  }
  function resize(){
    if(disposed)return;finishOutgoing();const box=zone.getBoundingClientRect();width=Math.max(1,box.width);height=Math.max(1,box.height);
    renderer.setSize(width,height,false);camera.aspect=width/height;
    // Keep the public plays in frame when a tablet or window becomes portrait.
    const verticalHalfFov=THREE.MathUtils.degToRad(21);
    camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(verticalHalfFov)*Math.max(1,1.5/camera.aspect)));
    camera.updateProjectionMatrix();handCamera.right=width;handCamera.top=height;handCamera.updateProjectionMatrix();layout();
  }
  function dispose(){
    if(disposed)return;disposed=true;skinToken++;cancelAnimationFrame(raf);finishOutgoing();
    for(const img of pendingImages){img.onload=null;img.onerror=null;img.src='';}pendingImages.clear();
    renderer.domElement.removeEventListener('webglcontextlost',contextLost);
    for(const [type,listener] of Object.entries(pointerListeners))renderer.domElement.removeEventListener(type,listener);
    disposeTree(room);disposeTree(foreground);activeTextures.forEach(t=>t.dispose());resources.forEach(r=>r.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();cards.clear();
  }
  try{
    const loader=new GLTFLoader();let timer,abort;
    const cancelled=new Promise((_,reject)=>{abort=()=>{dispose();reject(new Error('已取消 3D 载入'));};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});
    await Promise.race([
      Promise.all(['left','right'].map(async side=>{const gltf=await loader.loadAsync(new URL('../assets/3d/'+side+'-hand.glb',import.meta.url).href);if(disposed){disposeTree(gltf.scene);return;}const supporting=side==='left';prepareHand(gltf.scene);hands[supporting?0:1]=gltf.scene;foreground.add(gltf.scene);})),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('手部素材载入超时')),15000);}),cancelled
    ]).finally(()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);});
    if(failure)throw failure;
    // Slots are assigned by role, independent of asset request completion order.
    resize();
    return {setState,resize,dropTarget(x,y){if(!state?.arranging)return null;const box=renderer.domElement.getBoundingClientRect(),p=GuandanPresentation.fanDropTarget(state.hand,width,height,x-box.left,y-box.top);return p?{...p,x:p.x+box.left,y:p.y+box.top}:null;},hover(id){hovered=id;request();},setVisible(value){visible=value;finishOutgoing();if(!visible){cancelAnimationFrame(raf);raf=0;}else request();},dispose};
  }catch(error){dispose();throw error;}
}
