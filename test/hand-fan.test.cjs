'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fan=require('../web/app/hand-fan.js');
test('row fitting keeps readable corners and accounts for every independent group on narrow screens',()=>{
 for(const width of [320,680,1400])for(const cards of [0,1,7,20,27])for(const clusters of cards?[1,cards]:[0]){
  const result=fan.rowMetrics({cards,clusters},{width,cardWidth:72,step:40,gap:18});
  assert.ok(Number.isFinite(result.width));assert.ok(result.step>=30&&result.step<=40);
  assert.equal(result.width,94+clusters*72+Math.max(0,cards-clusters)*result.step+Math.max(0,clusters-1)*18);
  assert.ok(result.width<=width||result.step===30||clusters===cards,'overflow is reserved for readable minimum spacing');
 }
});
function rendered(p,width,height,left=0,top=0,lift=0){
 const angle=p.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const points=[[0,0],[width,0],[width,height],[0,height]].map(([x,y])=>({
  x:left+p.x+width/2+(x-width/2)*c-(y-height+lift)*s,
  y:top+p.y+height+(x-width/2)*s+(y-height+lift)*c
 }));
 return {points,rect:{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))}};
}
test('one to 27 cards keep full card dimensions and a readable exposed corner on phone and desktop shelves',()=>{
 for(const cardWidth of [56,64,84])for(const count of [1,2,5,14,27]){
  const cardHeight=cardWidth*1.5,step=cardWidth===84?40:30,width=Math.max(380,cardWidth+(count-1)*step+94);
  const positions=fan.layout(count,{width,cardWidth,cardHeight,step});assert.equal(positions.length,count);
  for(const p of positions){const {rect}=rendered(p,cardWidth,cardHeight);assert.ok(rect.left>=0&&rect.right<=width);assert.ok(Math.abs(p.angle)<20);assert.ok(p.y<=cardHeight*.3+.001);}
  const corners=positions.map(p=>rendered(p,cardWidth,cardHeight).points[0]);
  for(let i=1;i<count;i++)assert.ok(corners[i].x-corners[i-1].x>=25,'exposed rank corners should not collapse');
 }
 assert.deepEqual(fan.layout(0,{width:1200,cardWidth:84,cardHeight:126,step:40}),[]);
});
test('hit corners follow the rendered rotation, scrolling and selection lift',()=>{
 const positions=fan.layout(14,{width:1200,cardWidth:84,cardHeight:126,step:40});
 for(const p of positions)for(const lift of [0,-10]){
  const {rect,points}=rendered(p,84,126,-180,240,lift),actual=fan.topCorner(rect,84,126,p.angle);
  assert.ok(Math.abs(actual.x-points[0].x)<.00001);assert.ok(Math.abs(actual.y-points[0].y)<.00001);
 }
});
test('both fan endpoints retain their full face above the next shelf, with and without saved groups',()=>{
 for(const cardWidth of [56,64,76,84])for(let count=1;count<=27;count++){
  const cardHeight=cardWidth*1.5,header=32,step=40;
  for(const breaks of [[],[2,7,12,18,23].filter(i=>i<count)]){
   const width=Math.max(400,94+cardWidth+(count-1)*step+breaks.length*(cardWidth-step+18));
   const positions=fan.layout(count,{width,cardWidth,cardHeight,step,breaks});
   const shelf=fan.shelfHeight(cardWidth,cardHeight,header);
   for(const p of positions)for(const lift of [0,-10]){
    const {rect}=rendered(p,cardWidth,cardHeight,0,header,lift);
    assert.ok(rect.left>=0&&rect.right<=width,'rotated face must stay inside the scroll content');
    assert.ok(rect.top>=0,'selection lift must stay inside its shelf');
    assert.ok(rect.bottom+6<=shelf,'lower controls must not cover an upper card');
   }
  }
 }
});
test('every exposed corner selects its own insertion slot, both rows and the empty upper shelf remain reachable',()=>{
 const width=1200,cardWidth=84,cardHeight=126,box={left:0,right:width,top:0,bottom:260};
 const makeRow=(count,row)=>({bounds:{left:0,right:width,top:row*82},cards:fan.layout(count,{width,cardWidth,cardHeight,step:40}).map(p=>{
  const {rect}=rendered(p,cardWidth,cardHeight,0,row*82);return {...fan.topCorner(rect,cardWidth,cardHeight,p.angle),width:cardWidth,height:cardHeight,angle:p.angle};
 })});
 for(const counts of [[0,27],[14,13],[27,0]]){
  const rows=counts.map(makeRow);
  for(let row=0;row<2;row++){
   if(!counts[row]){
    const target=fan.dropTarget(rows,box,400,rows[row].bounds.top+32);assert.equal(target.row,row);assert.equal(target.index,0);continue;
   }
   for(const [index,p]of rows[row].cards.entries()){
    const target=fan.dropTarget(rows,box,p.x-3,p.y+5+Math.min(p.height*.5,68)*.35);assert.equal(target.row,row);assert.equal(target.index,index);
   }
  }
  assert.equal(fan.dropTarget(rows,box,400,280),null,'controls below the hand must not accept a drop');
  assert.equal(fan.dropTarget(rows,box,-1,80),null);
 }
});
