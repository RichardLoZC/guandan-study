/* DanLM v1 input/action adapter. Model weights are unchanged.
 * The reference is the pinned macOS engine, not the legacy UI candidate picker.
 * Semantic identity is54 face counts +11 type flags +15 declared rank flags.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.GuandanDanLMAdapter=factory();
})(globalThis,function(){
  'use strict';
  const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const suits=['hearts','spades','clubs','diamonds'];
  const types=['pass','single','pair','triple','full-house','pair-run','triple-run','straight','bomb','straight-flush','joker-bomb'];
  const typeId=Object.fromEntries(types.map((name,i)=>[name,i]));
  function face(card){
    const id=typeof card==='string'?card:card?.id;
    if(typeof id!=='string')throw Error('牌编码无效');
    const [copy,suit,rank,...rest]=id.split('-');
    if(!['1','2'].includes(copy)||rest.length)throw Error('实体牌编号无效');
    if(suit==='joker'&&['SJ','BJ'].includes(rank))return rank==='SJ'?52:53;
    const s=suits.indexOf(suit),r=ranks.indexOf(rank);
    if(s<0||r<0)throw Error('牌编码无效');
    return s*13+r;
  }
  function levelIndex(level){const i=ranks.indexOf(level);if(i<0)throw Error('级牌无效');return i;}
  function counts(cards){
    if(!Array.isArray(cards)||cards.length>28)throw Error('手牌数量无效');
    const out=Array(54).fill(0),ids=new Set();
    for(const c of cards){const id=typeof c==='string'?c:c?.id;if(ids.has(id))throw Error('实体牌重复');ids.add(id);if(++out[face(c)]>2)throw Error('手牌数量无效');}
    return out;
  }
  function declaredRank(play,level){
    if(play.type==='joker-bomb')return null;
    if(play.sequence?.length)return (play.sequence.at(-1)-2+13)%13;
    const r=play.primaryValue===14.5?levelIndex(level):play.primaryValue-2;
    if(!Number.isInteger(r)||r<0||r>14)throw Error('宣告点数无效');return r;
  }
  function vector(play,level){
    const a=Array(80).fill(0);if(!play){a[54]=1;return a;}
    const type=typeId[play.type];if(!type)throw Error('牌型无效');
    const ids=play.cardIds||play.cards;a.splice(0,54,...counts(ids));a[54+type]=1;
    const r=declaredRank(play,level);if(r!==null)a[65+r]=1;return a;
  }
  function key(a){return a.join(',');}
  function beats(a,b,level){
    const ta=a.slice(54,65).indexOf(1),tb=b.slice(54,65).indexOf(1),ra=a.slice(65).indexOf(1),rb=b.slice(65).indexOf(1),la=levelIndex(level);
    if(ta===0)return false;if(tb===0)return true;
    const n=a.slice(0,54).reduce((x,y)=>x+y,0),m=b.slice(0,54).reduce((x,y)=>x+y,0);
    const rank=(r,t)=>t>=1&&t<=4||t===8?(r>=13?r+1:r===la?13:r):r;
    if(ta===tb){if(ta===10)return false;if(ta===8&&n!==m)return n>m;return rank(ra,ta)>rank(rb,tb);}
    if(ta===10)return true;if(tb===10)return false;
    if(ta===9)return tb!==8||m<=5;
    if(ta===8)return tb===9?n>=6:tb<8;
    return false;
  }
  // Multisets of natural faces in lexicographic face order, duplicates folded.
  function combinations(available,faces,n){
    const out=[],chosen=[];
    function visit(start,left){
      if(left===0){out.push(chosen.slice());return;}
      for(let j=start;j<faces.length;j++){
        const f=faces[j],used=chosen.reduce((v,x)=>v+(x===f),0);
        if(used>=available[f])continue;
        chosen.push(f);visit(j,left-1);chosen.pop();
      }
    }
    visit(0,n);return out;
  }
  function windows(length){return Array.from({length:15-length},(_,i)=>Array.from({length},(_,j)=>(i+j+12)%13));}
  function enumerate(cards,level,lead=null){
    const held=counts(cards),wild=levelIndex(level),wildCount=held[wild],byFace=Array.from({length:54},()=>[]);
    for(const c of cards)byFace[face(c)].push(c);
    for(const bucket of byFace)bucket.sort((a,b)=>(typeof a==='string'?a:a.id).localeCompare(typeof b==='string'?b:b.id));
    const rankFaces=Array.from({length:15},(_,r)=>r<13?suits.map((_,s)=>s*13+r).filter(f=>f!==wild&&held[f]>0):held[r+39]?[r+39]:[]);
    const cache=new Map();
    function group(r,n,w){
      if(w>wildCount||w>n||r>=13&&w)return [];
      const k=r+':'+n+':'+w;if(!cache.has(k))cache.set(k,combinations(held,rankFaces[r],n-w).map(v=>v.concat(Array(w).fill(wild))));return cache.get(k);
    }
    const result=[],seen=new Set();
    function add(type,r,indices,sequence=null,suit=null){
      if(type===4&&indices.every(f=>f<52&&f%13===r))return;
      const v=Array(80).fill(0);for(const f of indices)v[f]++;v[54+type]=1;if(r!==null)v[65+r]=1;
      const identity=key(v);if(seen.has(identity))return;seen.add(identity);
      if(lead&&!beats(v,Array.isArray(lead)?lead:vector(lead,level),level))return;
      const use=Array(54).fill(0),physical=indices.map(f=>byFace[f][use[f]++]);
      const value=r===null?1000000:type<=4||type===8?(r===wild?14.5:r+2):r+2;
      result.push({vector:v,type:types[type],rank:r,cardIds:physical.map(c=>typeof c==='string'?c:c.id),primaryValue:value,
        sequence:sequence?sequence.map(x=>x===12?14:x+2):[],suit:suit===null?null:suits[suit],bombSize:type===8?indices.length:undefined});
    }
    for(const [type,n,maxRank] of [[1,1,15],[2,2,15],[3,3,13]])for(let r=0;r<maxRank;r++)for(let w=0;w<=Math.min(n,wildCount);w++)for(const g of group(r,n,w))add(type,r,g);
    for(let r=0;r<13;r++)for(let pair=0;pair<15;pair++){
      if(pair===r)continue;
      for(let wp=0;wp<=wildCount;wp++)for(const p of group(pair,2,wp))for(let wt=0;wt<=wildCount-wp;wt++)for(const triple of group(r,3,wt))add(4,r,triple.concat(p));
    }
    for(const [type,length,multiple] of [[5,3,2],[6,2,3],[7,5,1]])for(const seq of windows(length)){
      const chosen=[];
      function visit(i,w){
        if(i===seq.length){
          // Only a fully natural same-suit five-card run is exclusively a flush.
          if(type===7&&w===0&&chosen.every(f=>Math.floor(f/13)===Math.floor(chosen[0]/13)))return;
          add(type,seq.at(-1),chosen,seq);return;
        }
        for(let use=0;use<=Math.min(multiple,wildCount-w);use++)for(const g of group(seq[i],multiple,use)){
          chosen.push(...g);visit(i+1,w+use);chosen.length-=g.length;
        }
      }
      visit(0,0);
    }
    for(let r=0;r<13;r++)for(let w=0;w<=wildCount;w++){
      for(let n=4-w;n<4;n++)for(const g of group(r,n+w,w))add(8,r,g);
      const chosen=[],faces=rankFaces[r];
      function visit(start){
        if(chosen.length>=4)add(8,r,chosen.concat(Array(w).fill(wild)));
        if(chosen.length+w>=10)return;
        for(let j=start;j<faces.length;j++){
          const f=faces[j],used=chosen.reduce((v,x)=>v+(x===f),0);
          if(used>=held[f])continue;chosen.push(f);visit(j);chosen.pop();
        }
      }
      visit(0);
    }
    for(let suit=0;suit<4;suit++)for(const seq of windows(5)){
      const chosen=[];
      function visit(i,w){
        if(i===5){add(9,seq.at(-1),chosen,seq,suit);return;}
        const f=suit*13+seq[i];
        if(f!==wild&&held[f]){chosen.push(f);visit(i+1,w);chosen.pop();}
        if(w<wildCount){chosen.push(wild);visit(i+1,w+1);chosen.pop();}
      }
      visit(0,0);
    }
    if(held[52]===2&&held[53]===2)add(10,null,[52,52,53,53]);
    if(lead){const v=Array(80).fill(0);v[54]=1;result.unshift({vector:v,type:'pass',rank:null,cardIds:[]});}
    return result;
  }
  function historyCards(play,level){
    const c=(play.cardIds||play.cards).map(face).sort((a,b)=>a-b),wild=levelIndex(level),natural=c.filter(f=>f!==wild),wilds=c.filter(f=>f===wild);
    if(play.type==='full-house'){
      const r=declaredRank(play,level),triple=natural.filter(f=>f<52&&f%13===r),needed=3-triple.length;
      if(needed<0||needed>wilds.length)throw Error('三带二历史无效');
      return triple.concat(wilds.slice(0,needed),natural.filter(f=>!triple.includes(f)),wilds.slice(needed));
    }
    if(['straight','straight-flush','pair-run','triple-run'].includes(play.type)){
      const k=play.type==='pair-run'?2:play.type==='triple-run'?3:1,out=[];let used=0;
      for(const x of play.sequence){const r=(x-2+13)%13,part=natural.filter(f=>f<52&&f%13===r),n=k-part.length;if(n<0)throw Error('连牌历史无效');out.push(...part,...wilds.slice(used,used+n));used+=n;}
      if(out.length!==c.length||used!==wilds.length)throw Error('连牌历史丢失实体牌');return out;
    }
    return c;
  }
  function tokenize(payload){
    const out=[71+levelIndex(payload.level)];
    for(const e of payload.tributeRecords||[])out.push(e.kind==='give'?86:87,e.to===null?88:e.to+1,e.from+1,5+face(e.cardId));
    const finished=new Set();let passes=0,owner=null;
    for(const e of payload.history||[]){
      const play=e.play;out.push(e.seat+1,59+(play?typeId[play.type]:0));
      if(play){
        const r=declaredRank(play,payload.level);if(r!==null)out.push(71+r);
        out.push(...historyCards(play,payload.level).map(f=>5+f));owner=e.seat;passes=0;
        if(e.countAfter===0){finished.add(e.seat);out.push(e.seat+1,70);}
        if(e.hardWindTo!==undefined&&e.hardWindTo!==null&&e.tableCleared){out.push(90);owner=null;passes=0;}
      }else{
        passes++;
        if(owner!==null&&(e.tableCleared===true||passes>=4-finished.size-(finished.has(owner)?0:1))){out.push(finished.has(owner)?90:89);owner=null;passes=0;}
      }
    }
    out.push(payload.seat+1);if(out.length>1280)throw Error('牌局记录超出模型长度，未截断或改用其他引擎');return out;
  }
  function tribute(data){
    const level=levelIndex(data.level),seat=data.seat;
    if(!Number.isInteger(seat)||seat<0||seat>3||!['give','return'].includes(data.phase))throw Error('贡还局面无效');
    const hand=counts(data.hand),own=new Set(data.hand.map(c=>typeof c==='string'?c:c.id)),choices=[...data.choices].sort((a,b)=>face(a)-face(b)||(a.id||a).localeCompare(b.id||b)),unique=[];
    for(const c of choices){if(!own.has(c.id||c))throw Error('贡还候选不在手中');if(!unique.some(p=>face(p)===face(c)))unique.push(c);}
    if(!unique.length)throw Error('没有合法贡还候选');
    const target=data.receiver===null?88:data.receiver+1;let tokens=[71+level];
    if(data.phase==='return')for(const r of data.giveRecords||[])tokens.push(86,data.giveRecords.length===2?88:r.to+1,r.from+1,5+face(r.cardId));
    tokens.push(data.phase==='give'?86:87,target,seat+1);
    const actions=unique.map(c=>{const a=Array(80).fill(0),f=face(c);a[f]=1;a[55]=1;a[65+(f<52?f%13:f-39)]=1;return a;});
    return {seat,hand,tokens,actions,choices:unique};
  }
  return Object.freeze({version:'danlm-v1-official-alignment-1',ranks,suits,types,typeId,face,levelIndex,counts,declaredRank,vector,key,beats,enumerate,historyCards,tokenize,tribute});
});
