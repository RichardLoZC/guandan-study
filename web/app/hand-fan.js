/* Display geometry only. The same physical card buttons and saved rows remain in use. */
(function(scope){
  'use strict';
  function layout(count,{width,cardWidth,cardHeight,step,padding=38,breaks=[],gap=18}){
    if(!Number.isInteger(count)||count<1)return [];
    const boundaries=new Set(breaks.filter(index=>Number.isInteger(index)&&index>0&&index<count));
    const extra=boundaries.size*(cardWidth-step+gap);
    const pitch=Math.min(step,Math.max(24,(width-padding*2-cardWidth-extra)/Math.max(1,count-1)));
    let offset=0;
    const offsets=Array.from({length:count},(_,index)=>{if(index)offset+=boundaries.has(index)?cardWidth+gap:pitch;return offset;});
    const halfSpan=offset/2,maxRise=cardHeight*.18;
    const spread=count>1?Math.min(.28,.035*(count-1),2*Math.atan(maxRise/halfSpan)):0;
    const radius=spread?halfSpan/Math.sin(spread):0;
    return Array.from({length:count},(_,index)=>{
      const angle=halfSpan?(offsets[index]/halfSpan-1)*spread:0;
      return {index,x:width/2+(radius?Math.sin(angle)*radius:0)-cardWidth/2,
        y:radius*(1-Math.cos(angle)),angle:angle*180/Math.PI};
    });
  }
  // Reserve the full rotated face, including the outer bottom corners. Both
  // shelves use this height in flat and fan views, so neither clips its cards.
  function shelfHeight(cardWidth,cardHeight,header=36){
    return Math.ceil(header+cardHeight+cardHeight*.18+cardWidth/2*Math.sin(.28)+8);
  }
  // Recover a rotated card's actual top-left corner from its rendered bounds.
  // This also includes the selected/hover lift, scrolling and desktop page zoom.
  function topCorner(rect,width,height,angle){
    const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
    return {x:(rect.left+rect.right)/2-width*c/2+height*s/2,
      y:(rect.top+rect.bottom)/2-width*s/2-height*c/2};
  }
  function dropTarget(rows,box,x,y){
    if(x<box.left||x>box.right||y<box.top||y>box.bottom)return null;
    const targets=[];
    for(const [row,{bounds,cards}]of rows.entries()){
      if(!cards.length){
        targets.push({row,index:0,x:Math.max(bounds.left+38,Math.min(bounds.right-38,x)),y:bounds.top+12,height:58,angle:0});
        continue;
      }
      cards.forEach((card,index)=>targets.push({row,index,x:card.x-3,y:card.y+5,height:Math.min(card.height*.5,68),angle:card.angle}));
      const last=cards.at(-1),angle=last.angle*Math.PI/180;
      targets.push({row,index:cards.length,x:last.x+last.width*Math.cos(angle),y:last.y+last.width*Math.sin(angle)+5,height:Math.min(last.height*.5,68),angle:last.angle});
    }
    if(!targets.length)return null;
    const distance=p=>Math.hypot(x-p.x,y-p.y-p.height*.35);
    return targets.reduce((best,p)=>distance(p)<distance(best)?p:best);
  }
  const api={layout,shelfHeight,topCorner,dropTarget};
  if(typeof module==='object'&&module.exports)module.exports=api;else scope.GuandanHandFan=Object.freeze(api);
})(globalThis);
