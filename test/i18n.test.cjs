'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const i18n=require('../web/app/i18n.js'),en=require('../web/app/locales/en.js');
const {Match}=require('../web/app/match.js');
const presentation=require('../web/app/presentation.js');
const source=fs.readFileSync(path.join(__dirname,'../web/app/i18n.js'),'utf8');
function fresh(stored){const values=new Map(stored?[['guandan.language.v1',stored]]:[]),context={module:{exports:{}},require:()=>en,localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}};vm.runInNewContext(source,context);return {api:context.module.exports,values};}
test('locale persists independently and handles missing or damaged preferences',()=>{
 for(const stored of [undefined,'bad','zh-CN'])assert.equal(fresh(stored).api.locale,'zh-CN');
 const {api,values}=fresh('en');assert.equal(api.t('新游戏'),'New game');assert.equal(api.t('看建议'),'Hint');api.setLocale('zh-CN');assert.equal(api.t('看建议'),'看建议');assert.equal(values.get(api.KEY),'zh-CN');
});
test('UI localization does not mutate model observations, cards, saves or legal actions',()=>{
 const m=new Match(),before=JSON.stringify(m.state),observation=JSON.stringify(m.observation(m.actingSeat));
 const snapshot=m.snapshot();i18n.setLocale('en');snapshot.events.forEach(event=>i18n.t(event.label));i18n.t('第12副');i18n.setLocale('zh-CN');
 assert.equal(JSON.stringify(m.state),before);assert.equal(JSON.stringify(m.observation(m.actingSeat)),observation);
});
test('dynamic counters and legal combination names are translated',()=>{
 for(const [zh,english]of [['第12副','Round 12'],['剩 27 张','27 cards left'],['已选 2 张','2 selected'],['对10','Pair of 10'],['单张 A','Single A'],['三带二 K','Full house K'],['四王炸','Four-joker bomb'],['3 人开局','Start with 3 players']])assert.equal(i18n.t(zh,'en'),english);
});
test('tribute, reconnect and invalid selections retain their conditions in English',()=>{
 for(const s of ['知秋持有两张大王，满足抗贡条件。','墨白上副末游；未满足两张大王的抗贡条件，需单贡。','所选牌压不过桌面上的对K','等待 Alice 重新连接'])assert.ok(!/[\u3400-\u9fff]/u.test(i18n.t(s,'en')),i18n.t(s,'en'));
});
test('user names are preserved as data and are never converted to HTML',()=>{
 const {api}=fresh('en');api.protectName('王大王');assert.equal(api.t('王大王出了对K'),'王大王 played Pair of K');
 const input='<img src=x onerror=alert(1)>出了对K';assert.equal(api.t(input),'<img src=x onerror=alert(1)> played Pair of K');
});
test('phone fan geometry remains within the viewport across hand counts',()=>{
 for(const [w,h]of [[360,580],[390,790],[430,860],[740,310],[844,340]])for(const n of [1,5,14,15,27]){
  const layout=presentation.fanLayout(n,w,h);assert.equal(layout.length,n);
  for(const card of layout){assert.ok(Number.isFinite(card.x)&&Number.isFinite(card.y));assert.ok(card.width>=60);assert.ok(card.x>=0&&card.x<=w);}
 }
 assert.ok(presentation.gripScale(844,340)>.6,'Landscape cards must not fall to the old half-size limit');
});
test('language catalog is loaded before presentation code on all platforms',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8');assert.ok(html.indexOf('/app/locales/en.js')<html.indexOf('/app/i18n.js'));assert.ok(html.indexOf('/app/i18n.js')<html.indexOf('/app/table.js'));assert.equal((html.match(/id="language-toggle"/g)||[]).length,1);
});
