'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const art=require('../web/app/card-art.js'),core=require('../web/app/core.js'),{decorate}=require('../web/app/match.js');
test('every level marks exactly eight physical cards, including both wilds, but never jokers',()=>{
 for(const level of ['2','3','4','5','6','7','8','9','10','J','Q','K','A']){
  core.setLevel(level);const cards=core.deck().map(decorate),marked=cards.filter(card=>art.isLevel(card.face,level));
  assert.equal(marked.length,8);assert.ok(marked.every(card=>card.rank===level));assert.equal(marked.filter(card=>card.isWild).length,2);
 }
 for(const face of ['jokerBlack','jokerRed',null,'', 'spade11'])assert.equal(art.isLevel(face,'2'),false);
});
test('all skins supply complete starred faces without changing the source artwork or its license',()=>{
 for(const skin of ['jumbo','accessible','minimal'])for(const rank of ['Ace','King','Queen','Jack','10','9','8','7','6','5','4','3','2'])for(const suit of ['heart','spade','club','diamond']){
  const face=suit+rank,source=fs.readFileSync(path.join(__dirname,'../web',art.path(skin,face)),'utf8'),marked=fs.readFileSync(path.join(__dirname,'../web',art.path(skin,face,true)),'utf8');
  assert.equal((marked.match(/id="level-star"/g)||[]).length,1);assert.equal(marked.replace(/<g id="level-star"[\s\S]*?<\/g>/,''),source);
 }
});
test('explicit historical levels override live level; switching skin or falling back retains the star',()=>{
 const src=fs.readFileSync(require.resolve('../web/app/table.js'),'utf8'),nodes=[];
 const c={GuandanCardArt:art,liveRound:{level:'Q'},currentSkin:'accessible',requestAnimationFrame:fn=>fn(),document:{createElement(){const node={dataset:{},setAttribute(){},removeAttribute(){}};nodes.push(node);return node;}}};
 vm.createContext(c);vm.runInContext(src.slice(src.indexOf('function loadCardImage('),src.indexOf('function setCardSkin(')),c);
 const old=c.imageFor('spade2','♠2',undefined,'2');assert.equal(old.dataset.levelCard,'true');assert.match(old.src,/accessible\/level\/spade2.svg/);
 c.loadCardImage(old,'minimal','spade2');assert.match(old.src,/minimal\/level\/spade2.svg/);
 c.loadCardImage(old,'accessible','spade2');old.onerror();old.onerror();old.onerror();assert.match(old.src,/minimal\/level\/spade2.svg/);
 const current=c.imageFor('spade2','♠2');assert.equal(current.dataset.levelCard,'false');assert.doesNotMatch(current.src,/\/level\//);
 assert.equal(c.imageFor('heartQueen').dataset.levelCard,'true');assert.equal(c.imageFor('heartQueen','',undefined,null).dataset.levelCard,'false');
});
