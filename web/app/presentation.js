/* Public, read-only presentation data. Never hand the renderer a Match object. */
(function(scope){
  'use strict';
  function publicCard(card,level){
    const suit={hearts:'heart',spades:'spade',clubs:'club',diamonds:'diamond'},rank={A:'Ace',K:'King',Q:'Queen',J:'Jack'};
    return {id:card.id,face:card.face||(card.suit==='joker'?(card.rank==='BJ'?'redJoker':'blackJoker'):suit[card.suit]+(rank[card.rank]||card.rank)),
      rank:card.rank,label:card.label||(card.suit==='joker'?(card.rank==='BJ'?'大王':'小王'):({hearts:'♥',spades:'♠',clubs:'♣',diamonds:'♦'}[card.suit]||'')+card.rank),joker:card.suit==='joker',isWild:card.suit==='hearts'&&card.rank===level};
  }
  function tableActions(game,level){
    const actions=Array(4).fill(null);let closed=false;
    // Keep the completed trick visible until the next lead. roundTrace resets
    // on seat 0's turn, so reconstruct trick boundaries from public history.
    for(const event of game.actionHistory||[]){
      if(closed&&event.play)actions.fill(null);
      const cards=(event.play?.cards||[]).map(card=>publicCard(card,level));
      actions[event.seat]={owner:event.seat,type:event.play?'play':'pass',label:event.play?.label||'PASS',ids:cards.map(card=>card.id),cards};
      closed=event.tablePlayAfter===null;
    }
    // Also support snapshots without history (e.g. a presentation preview).
    if(!game.actionHistory?.length&&game.tablePlay){
      const {owner,play}=game.tablePlay,cards=play.cards.map(card=>publicCard(card,level));
      actions[owner]={owner,type:'play',label:play.label,ids:cards.map(card=>card.id),cards};
    }
    return actions;
  }
  function tableCards(snapshot){
    return snapshot.tableActions?snapshot.tableActions.flatMap(action=>action?.cards||[]):snapshot.table?.cards||[];
  }
  function project(round,{hand=null,groups=null,rows=null,arranging=false,skin='jumbo',theme='day',selected=new Set(),enabled=false,allowed=null,dealing=false,large=false,reduceMotion=false}={}){
    if(!round)return null;
    hand=hand||round.hand;const counts=new Map(),ordinals=new Map();
    hand.forEach(card=>counts.set(card.face,(counts.get(card.face)||0)+1));
    return {
      id:round.id,revision:round.revision,classic:!round.isTuo3,phase:round.phase,
      ended:Boolean(round.game.result),dealing,skin,theme,large,reduceMotion,arranging,level:round.state.level,
      hand:hand.map(card=>{
        const ordinal=(ordinals.get(card.face)||0)+1;ordinals.set(card.face,ordinal);
        return {id:card.id,face:card.face,rank:card.rank,label:card.label,isWild:Boolean(card.isWild),
          joker:card.suit==='joker',ordinal,duplicates:counts.get(card.face),row:rows?.findIndex(row=>row.includes(card.id)),
          group:groups?.findIndex(g=>g.ids.length>1&&g.ids.includes(card.id))??-1,arranged:Boolean(groups),selected:selected.has(card.id),selectable:enabled&&(!allowed||allowed.has(card.id))};
      }),
      seats:round.game.players.map((player,seat)=>({seat,count:player.hand.length,finished:Boolean(player.finished)})),
      tableActions:round.phase==='playing'?tableActions(round.game,round.state.level):Array(4).fill(null),
      table:round.game.tablePlay?{owner:round.game.tablePlay.owner,label:round.game.tablePlay.play.label,
        ids:round.game.tablePlay.play.cards.map(card=>card.id),cards:round.game.tablePlay.play.cards.map(card=>publicCard(card,round.state.level))}:null,
    };
  }
  // Two compact tiers share a lower grip, following the user's hand-holding reference.
  // Upper tier carries high/level cards; bound each tier to keep every corner legible.
  function gripScale(width,height){return Math.max(.5,Math.min(1,(width-24)/520,(height-(height<500?66:200))/430));}
  function fanLayout(hand,width,height){
    const cards=Array.isArray(hand)?hand:Array.from({length:hand},(_,id)=>({id}));
    const count=cards.length,cardWidth=120,cardHeight=180,result=Array(count);
    let tiers=[cards.map((card,index)=>({card,index}))];
    if(cards.length&&cards.every(card=>card.row===0||card.row===1)){
      tiers=[[],[]];cards.forEach((card,index)=>tiers[card.row].push({card,index}));
    }else if(count>14){
      const high=[],low=[];
      cards.forEach((card,index)=>(card.joker||card.isWild||['10','J','Q','K','A'].includes(card.rank)?high:low).push({card,index}));
      tiers=!cards.some(c=>c.arranged)&&high.length>=4&&low.length>=4&&high.length<=16&&low.length<=16?[high,low]:[tiers[0].slice(0,Math.ceil(count/2)),tiers[0].slice(Math.ceil(count/2))];
    }
    tiers.forEach((tier,row)=>{
      const spread=Math.min(1.08,.075*(tier.length-1)),base=95+(tiers.length===2&&row===0?98:0);
      tier.forEach(({index},i)=>{
        const angle=tier.length>1?-spread+2*spread*i/(tier.length-1):0;
        result[index]={x:width/2+Math.sin(angle)*100,y:base+Math.cos(angle)*100,angle:-angle,
          // Keep the two fans close enough to hold between fingers.
          width:cardWidth,height:cardHeight,hitWidth:32,index,z:row*3+i*.12,tier:row};
      });
    });
    const scale=gripScale(width,height);
    for(const p of result){p.x=width/2+(p.x-width/2)*scale;p.y=80+(p.y-80)*scale;p.width*=scale;p.height*=scale;p.hitWidth*=scale;p.z*=scale;}
    return result;
  }
  // Insertion targets follow the exposed top corners, rather than overlapping
  // rectangular hit boxes. Empty tiers remain usable while editing.
  function fanDropTarget(hand,width,height,x,y){
    const scale=gripScale(width,height),items=fanLayout(hand,width,height),targets=[];
    if(x<width/2-245*scale||x>width/2+245*scale)return null;
    for(let row=0;row<2;row++){
      const tier=items.filter(item=>item.tier===row);
      if(!tier.length){targets.push({row,index:0,x:width/2-35*scale,y:height-(80+((row===0?383:285)-80)*scale),height:65*scale});continue;}
      const corners=tier.map(p=>({x:p.x-p.width/2*Math.cos(p.angle)-p.height/2*Math.sin(p.angle),y:height-p.y+p.width/2*Math.sin(p.angle)-p.height/2*Math.cos(p.angle)}));
      corners.forEach((p,index)=>targets.push({row,index,x:p.x,y:p.y,height:65*scale}));
      const last=corners.at(-1);targets.push({row,index:tier.length,x:last.x+35*scale,y:last.y+18*scale,height:65*scale});
    }
    const target=targets.reduce((best,p)=>Math.hypot(x-p.x,y-p.y-25*scale)<Math.hypot(x-best.x,y-best.y-25*scale)?p:best);
    return Math.hypot(x-target.x,y-target.y-25*scale)>110*scale?null:target;
  }
  function departing(previous,next){
    if(!previous||!next||previous.id!==next.id||next.revision<=previous.revision||next.ended||next.dealing||next.table?.owner!==0)return [];
    const held=new Set(next.hand.map(card=>card.id)),played=new Set(next.table.ids);
    return previous.hand.filter(card=>!held.has(card.id)&&played.has(card.id)).map(card=>card.id);
  }
  function tableLayout(owner,count){
    // Your pile sits to the right of the held fan; other piles stay near their seat.
    const [x,z]=[[2.95,1.95],[3.05,-.8],[0,-2.65],[-3.05,-.8]][owner]||[0,0];
    const step=count>1?Math.min(.45,2.05/(count-1)):0;
    return Array.from({length:count},(_,i)=>({x:x+(i-(count-1)/2)*step,y:.39+i*.004,z:z+(i%2)*.025,angle:(i-(count-1)/2)*.024}));
  }
  function isNewTablePlay(previous,next){
    return Boolean(previous&&next&&previous.id===next.id&&next.revision>previous.revision&&!next.ended&&!next.dealing&&next.table?.ids.length&&
      (previous.table?.owner!==next.table.owner||previous.table?.ids.join('|')!==next.table.ids.join('|')));
  }
  const api={gripScale,project,tableActions,tableCards,fanLayout,fanDropTarget,departing,tableLayout,isNewTablePlay};
  if(typeof module==='object'&&module.exports)module.exports=api;else scope.GuandanPresentation=Object.freeze(api);
})(globalThis);
