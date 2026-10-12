'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const i18n=require('../web/app/i18n.js'),en=require('../web/app/locales/en.js');
const {Match}=require('../web/app/match.js');
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
test('AI, human and disconnected turn labels translate in English',()=>{
 for(const source of ['思考中','正在出牌','正在进贡','正在还贡','正在重连','等待玩家重连','青岚 · 思考中'])assert.ok(!/[\u3400-\u9fff]/u.test(i18n.t(source,'en')),source);
});
test('tribute, reconnect and invalid selections retain their conditions in English',()=>{
 for(const s of ['知秋持有两张大王，满足抗贡条件。','墨白上副末游；未满足两张大王的抗贡条件，需单贡。','所选牌压不过桌面上的对K','等待 Alice 重新连接'])assert.ok(!/[\u3400-\u9fff]/u.test(i18n.t(s,'en')),i18n.t(s,'en'));
});
test('user names are preserved as data and are never converted to HTML',()=>{
 const {api}=fresh('en');api.protectName('王大王');assert.equal(api.t('王大王出了对K'),'王大王 played Pair of K');
 const input='<img src=x onerror=alert(1)>出了对K';assert.equal(api.t(input),'<img src=x onerror=alert(1)> played Pair of K');
});
test('language catalog is loaded before presentation code on all platforms',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8');assert.ok(html.indexOf('/app/locales/en.js')<html.indexOf('/app/i18n.js'));assert.ok(html.indexOf('/app/i18n.js')<html.indexOf('/app/table.js'));assert.equal((html.match(/id="language-toggle"/g)||[]).length,1);
});
test('drag-to-arrange hints explain the gesture and automatic return in both languages',()=>{
 for(const source of ['按住拖动理牌','松手放下 · 自动回到选牌','点选牌面 · 按住拖动理牌','手牌布局','平铺','弧形','弧形双层手牌；点击选牌，按住拖动理牌，空白处左右滚动','双层手牌；按住拖动理牌，空白处左右滚动','双层手牌；点击选牌，按住拖动理牌，空白处左右滚动']){
  assert.equal(i18n.t(source,'zh-CN'),source);assert.ok(!/[\u3400-\u9fff]/u.test(i18n.t(source,'en')),source);
 }
});

test('hand tool priorities, counters and absent combinations translate completely',()=>{
 for(const source of ['手牌操控','理牌优先方式','综合找组合','同花顺优先','炸弹优先','顺连优先','对子优先','按大小','撤销理牌','未找到同花顺 · 组合 1 / 8','未找到炸弹','未找到顺连','未找到对子'])assert.ok(!/[\u3400-\u9fff]/u.test(i18n.t(source,'en')),source);
});
