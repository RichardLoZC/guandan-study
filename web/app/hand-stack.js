/* Phone presentation: one workspace, with short vertical stacks by rank. */
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
  function columns(ids,hand,maxDepth=3){
    const ranks=new Map(hand.map(card=>[card.id,card.rank])),result=[];
    for(const id of ids){
      const previous=result.at(-1),rank=ranks.get(id);
      if(previous&&rank&&ranks.get(previous[0])===rank&&previous.length<maxDepth)previous.push(id);
      else result.push([id]);
    }
    return result;
  }
  function metrics(segments,hand,{width,cardWidth,gap=12,minStep=34}){
    const groups=segments.map(segment=>columns(segment.ids,hand));
    const count=groups.reduce((sum,group)=>sum+group.length,0),joins=Math.max(0,count-groups.length);
    const fixed=groups.length*cardWidth+Math.max(0,groups.length-1)*gap;
    const step=joins?Math.max(minStep,Math.min(cardWidth,(width-fixed)/joins)):cardWidth;
    return {step,width:fixed+joins*step,columns:groups};
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
  return {singleRow,columns,metrics,dropTarget};
});
