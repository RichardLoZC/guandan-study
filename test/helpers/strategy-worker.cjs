const fs=require('node:fs'),vm=require('node:vm');
module.exports=function worker(file=require.resolve('../../web/assets/fairWorker-CTCwrT35.js')){
  const source=fs.readFileSync(file,'utf8').replace(/^import "[^"\n]+";\n/gm,'')
    .replaceAll('import.meta.url','"http://localhost/assets/fairWorker-CTCwrT35.js"');
  const context={self:{},performance,TextEncoder,TextDecoder,structuredClone,
    GuandanPlayRules:require('../../web/app/play-rules.js'),GuandanBookPolicy:require('../../web/app/book-policy.js')};
  vm.createContext(context);vm.runInContext(source,context);return context;
};
