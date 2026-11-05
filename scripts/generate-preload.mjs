import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),web=path.join(root,'web');
const files=[];
function visit(relative){
  const absolute=path.join(web,relative);
  for(const entry of fs.readdirSync(absolute,{withFileTypes:true})){
    const name=path.posix.join(relative,entry.name);
    if(entry.isDirectory())visit(name);
    else if(entry.isFile()&&entry.name.endsWith('.svg'))files.push(name);
  }
}
for(const skin of ['jumbo','accessible','minimal'])visit('assets/'+skin);
files.push('app/danlm-adapter.js','app/card-counts.js','app/play-rules.js','assets/brand/app-icon.png','assets/avatars/historical-figures-v1.png','assets/avatars/ming-scholars-a-v1.png','assets/avatars/ming-scholars-b-v1.png','assets/table/jade-silk-v1.png','app/model-profiles.js','assets/fairWorker-CTCwrT35.js',
  'mobile/context.onnx','mobile/scores.onnx','mobile/expert-scores-v1.onnx','mobile/ort-wasm-simd-threaded.wasm','mobile/ort-wasm-simd-threaded.mjs');
const entries=files.sort().map(file=>({url:'/'+file+(file.startsWith('app/')?'?v=234':file.endsWith('.svg')||file.includes('fairWorker')||file==='assets/brand/app-icon.png'?'?v=234':''),bytes:fs.statSync(path.join(web,file)).size}));
fs.writeFileSync(path.join(web,'assets/preload-manifest.json'),JSON.stringify({version:JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,entries},null,2)+'\n');
console.log('Prepared '+entries.length+' playable resources.');
