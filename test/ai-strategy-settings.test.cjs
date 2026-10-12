const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../web/app/table.js'),'utf8');
const preferenceSource=source.slice(source.indexOf('let prefs='),source.indexOf('let liveRound='));
function readPrefs(saved,legacy){
 const storage=new Map([['prefs',saved&&JSON.stringify(saved)],['guandan-engine-choices',legacy&&JSON.stringify(legacy)]]);
 const context={PREFS_KEY:'prefs',SKIN_KEY:'skin',SKINS:{jumbo:{}},currentSkin:'jumbo',root:{dataset:{}},GuandanArrange:{priorities:{balanced:{}}},localStorage:{getItem:key=>storage.get(key)}};
 vm.createContext(context);vm.runInContext(preferenceSource+'\nresult=prefs;',context);return context.result;
}
test('upgrading preserves the former combined setting, then restores independent choices',()=>{
 assert.equal(readPrefs().aiBook,true);
 assert.equal(readPrefs({book:false}).aiBook,false);
 assert.equal(readPrefs(undefined,{book:false}).aiBook,false);
 for(const aiBook of [true,false]){const prefs=readPrefs({aiBook,book:!aiBook});assert.equal(prefs.aiBook,aiBook);assert.equal(prefs.book,!aiBook);}
});
test('changing solo AI guidance saves only that preference and restarts pending bot work',async()=>{
 const calls=[],prefs={book:true,aiBook:true};
 const context={prefs,window:{},stopBots:()=>calls.push('stop'),savePrefs:()=>calls.push(JSON.stringify(prefs)),renderGame(){},scheduleBots:()=>calls.push('resume')};
 vm.createContext(context);vm.runInContext(source.match(/async function setAiBook\(enabled\)\{[\s\S]*?\n\}/)[0],context);
 await context.setAiBook(false);assert.equal(prefs.aiBook,false);assert.equal(prefs.book,true);
 assert.deepEqual(calls,['stop',JSON.stringify(prefs),'resume']);assert.equal(readPrefs(JSON.parse(calls[1])).aiBook,false);
});
