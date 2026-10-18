/* Phone presentation: one complete column per rank, independent of saved shelves. */
(function(scope,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else scope.GuandanHandStack=Object.freeze(factory());
})(globalThis,function(){
  'use strict';
  function singleRow(layout){
    if(!layout.rows[0].length)return layout;
    // Keep physical IDs, group boundaries and the player's order on upgrade.
    return {...layout,rows:[[],layout.rows.flat()],groups:layout.groups.map(group=>({...group,ids:[...group.ids]}))};
  }
  function columns(ids,hand){
    const ranks=new Map(hand.map(card=>[card.id,card.rank])),byRank=new Map(),result=[];
    for(const id of ids){
      const rank=ranks.get(id)||id;
      if(!byRank.has(rank)){const column=[];byRank.set(rank,column);result.push(column);}
      byRank.get(rank).push(id);
    }
    return result;
  }
  function metrics(segments,hand,{width,cardWidth,gap=12,minStep=34}){
    const groups=segments.map(segment=>columns(segment.ids,hand));
    const count=groups.reduce((sum,group)=>sum+group.length,0),joins=Math.max(0,count-groups.length);
    const fixed=groups.length*cardWidth+Math.max(0,groups.length-1)*gap;
    const step=joins?Math.max(minStep,Math.min(cardWidth,(width-fixed)/joins)):cardWidth;
    return {step,width:fixed+joins*step,columns:groups,depth:Math.max(1,...groups.flat().map(column=>column.length))};
  }
  // Keep exposed rank headers touchable. On unusually short windows the hand
  // scrolls vertically rather than splitting a bomb or clipping hidden cards.
  function verticalMetrics(depth,height){
    const layers=Math.max(0,depth-1),overhead=90;
    const cardWidth=Math.max(40,Math.min(54,Math.floor((height-overhead-layers*20)/3)));
    const rise=layers?Math.max(20,Math.min(24,Math.floor((height-overhead-cardWidth*3)/layers))):24;
    return {cardWidth,cardHeight:cardWidth*1.5,rise,handHeight:cardWidth*1.5+layers*rise+8};
  }
  // Use the exposed headers for insertion, rather than the hidden full-card
  // bounds. Every target stays in the phone's single logical row.
  function dropTarget(columns,bounds,x,y){
    if(x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom||!columns.length)return null;
    const column=columns.reduce((best,item)=>{
      const distance=x<item.left?item.left-x:x>item.right?x-item.right:0;
      return !best||distance<best.distance?{item,distance}:best;
    },null).item;
    const cards=column.cards;
    let index=cards.findIndex((card,i)=>y<(card.top+(cards[i+1]?.top??card.bottom))/2);
    if(index<0)index=cards.length;
    const card=cards[Math.min(index,cards.length-1)];
    return {row:1,index:index<cards.length?card.index:card.index+1,x:column.left-3,y:index<cards.length?card.top:card.bottom-3,height:Math.min(28,card.bottom-card.top)};
  }
  return {singleRow,columns,metrics,verticalMetrics,dropTarget};
});
