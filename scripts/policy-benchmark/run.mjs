import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const core=require(path.join(root,'web/app/core.js')),{Match}=require(path.join(root,'web/app/match.js'));
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return [arg.slice(2,i),arg.slice(i+1)];}));
const pairs=Number(args.pairs||128),lanes=Number(args.lanes||2),levels=(args.levels||'2,5,9,A').split(','),mode=args.mode||'book-vs-raw';
if(!Number.isInteger(pairs)||pairs<1||pairs>10000||!Number.isInteger(lanes)||lanes<1||lanes>8)throw Error('Invalid pairs/lanes');
if(levels.some(x=>!['2','3','4','5','6','7','8','9','10','J','Q','K','A'].includes(x))||!['raw-control','book-vs-raw','teammate'].includes(mode))throw Error('Invalid levels/mode');
const seed=args.seed||'danlm-vs-book-1.8.22-20261015-main',output=path.resolve(args.output||path.join(root,'test-results/policy-benchmark',new Date().toISOString().replace(/[:.]/g,'-')));
fs.mkdirSync(output,{recursive:true});if(fs.existsSync(path.join(output,'manifest.json')))throw Error('Use an empty output directory');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function randomBelow(seed){
  let block=0,bytes=Buffer.alloc(0),offset=0;
  return bound=>{const limit=Math.floor(2**32/bound)*bound;let value;
    do{if(offset>=bytes.length){bytes=createHash('sha256').update(seed+':'+block++).digest();offset=0;}value=bytes.readUInt32BE(offset);offset+=4;}while(value>=limit);
    return value%bound;
  };
}
function deal(index){
  const state=core.newMatch(),level=levels[index%levels.length],starter=Math.floor(index/levels.length)%4;
  state.level=level;state.levels=[level,level];state.id='benchmark-'+index;core.setLevel(level);
  const cards=core.deck(),random=randomBelow(seed+':deal:'+index);
  for(let i=cards.length-1;i>0;i--){const j=random(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}
  state.game.players.forEach((p,i)=>{p.hand=core.sortCards(cards.slice(i*27,(i+1)*27));p.isHuman=false;});
  state.game.starter=state.game.currentPlayer=starter;
  new Match(state);return state;
}
const jobs=Array.from({length:pairs},(_,pair)=>{
  const state=deal(pair);return [0,1].map(arm=>({id:`${String(pair).padStart(4,'0')}-${arm}`,pair,bookTeam:mode==='teammate'?0:arm,
    ...(mode==='teammate'?{arm:arm===0?'book-partner':'raw-partner'}:{}),
    policies:[0,1,2,3].map(seat=>mode==='teammate'?arm===0&&seat===2:mode==='book-vs-raw'&&seat%2===arm),mode,state}));
}).flat();
const served=new Map(),hashes={};
const runtimeFiles=['app/play-rules.js','app/core.js','app/tuo3.js','app/tribute-strategy.js','app/play-choices.js','app/match.js','app/book-policy.js','app/model-client.js',
  'assets/fairWorker-CTCwrT35.js','mobile/context.onnx','mobile/scores.onnx','mobile/ort-wasm-simd-threaded.mjs','mobile/ort-wasm-simd-threaded.wasm'];
for(const name of runtimeFiles){const file=name==='app/book-policy.js'&&args['book-policy']?path.resolve(args['book-policy']):path.join(root,'web',name);
  const bytes=fs.readFileSync(file);served.set('/'+name,bytes);hashes['web/'+name]=sha(bytes);}
fs.writeFileSync(path.join(output,'book-policy.snapshot.js'),served.get('/app/book-policy.js'));
fs.writeFileSync(path.join(output,'worker.snapshot.js'),served.get('/assets/fairWorker-CTCwrT35.js'));
for(const name of ['run.mjs','electron.cjs','renderer.js'])hashes['scripts/policy-benchmark/'+name]=sha(fs.readFileSync(path.join(here,name)));
served.set('/renderer.js',fs.readFileSync(path.join(here,'renderer.js')));
served.set('/',Buffer.from('<!doctype html><meta charset="utf-8"><title>Policy computation</title>'+runtimeFiles.filter(n=>n.startsWith('app/')).map(n=>'<script src="/'+n+'" defer></script>').join('')+'<script src="/renderer.js" defer></script>'));
const manifest={version:1,createdAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),appVersion:require(path.join(root,'package.json')).version,
  policyVariant:args['book-policy']?path.basename(args['book-policy']):'shipped',
  mode,pairs,games:pairs*2,lanes,levels,seed,shuffle:'SHA-256 counter stream + rejection sampling + Fisher-Yates',hashes,
  host:{platform:process.platform,arch:process.arch,cpus:os.cpus().length,cpu:os.cpus()[0].model},
  protocol:{units:'Independent complete deals; same cards and starting seat replayed after swapping the two policies between teams 0/2 and 1/3.',
    information:'Own hand, public history and counts only; masked Match.observation checked on every inference.',
    presentationDelay:false,forcedPass:'Same shipped <=3-card impossible-response rule for both teams.',
    primary:'Book team wins the first finishing seat; 95% interval resamples whole deal pairs.',
    secondary:['Signed upgrade points (+/-1,2,3)','Double-up wins','Opening bombs and straight flushes per non-pass opening play','Decision changes'],
    opening:'All four players still have >=18 cards, no finishers, measured immediately before an action.',
    stop:'Fixed pair count; any timeout, illegal action or renderer failure aborts, with no heuristic fallback.',
    limitations:'No between-deal tribute, level progression, human opponents or model training. Histories evolve differently after policies choose different moves.'}};
if(mode==='teammate'){
  manifest.protocol.units='Paired independent deals. Keep the focal player at seat 0 and both opponents on raw DanLM; change only partner seat 2 between book and raw.';
  manifest.protocol.primary='Paired difference in team 0 win rate (book partner minus raw partner); bootstrap complete deal pair differences stratified by level.';
  manifest.protocol.secondary=['Difference in signed upgrade points','Partner overcalls of focal-player leads','Double-up wins'];
  manifest.protocol.limitations+=' The focal player is raw DanLM, not a human; its actions adapt to the resulting state.';
}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(output,'deals.json'),JSON.stringify(jobs.filter((j,index)=>index%2===0).map(j=>({pair:j.pair,state:j.state})))+'\n');
const completed=[],active={},assigned=new Set();let next=0,child,stopping=false;
function status(){fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify({completed:completed.length,total:jobs.length,active,updatedAt:new Date().toISOString()},null,2));}
function stop(code){if(stopping)return;stopping=true;child?.kill('SIGTERM');server.close();setTimeout(()=>process.exit(code),100).unref();}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-store');
    const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
    if(req.method==='GET'&&url.pathname==='/job'){
      const job=jobs[next++];if(job){assigned.add(job.id);active[url.searchParams.get('lane')]={job:job.id,actions:0};status();}json(job||null);return;
    }
    if(req.method==='POST'){
      const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>32*1024*1024)throw Error('Oversized result');chunks.push(chunk);}
      const data=JSON.parse(Buffer.concat(chunks));
      if(url.pathname==='/progress'){active[data.lane]=data;status();json({ok:true});return;}
      if(url.pathname==='/failure'){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify(data,null,2));json({ok:true});console.error(data.error);stop(1);return;}
      if(url.pathname==='/completed'){
        if(!assigned.has(data.id)||completed.some(g=>g.id===data.id))throw Error('Unknown or duplicate result');
        fs.writeFileSync(path.join(output,data.id+'.json'),JSON.stringify(data)+'\n');
        const {actions,...summary}=data;
        summary.won=data.result.winnerTeam===data.bookTeam;
        summary.signedPoints=(summary.won?1:-1)*data.result.levelDelta;
        summary.actionHash=sha(JSON.stringify(actions.map(a=>[a.seat,a.play?.key||'pass',a.play?.cards||[]])));
        summary.actionCount=actions.length;completed.push(summary);delete active[data.lane];
        fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(completed,null,2)+'\n');status();
        console.log(JSON.stringify({completed:completed.length,total:jobs.length,id:data.id,level:data.level,bookWon:summary.won,points:summary.signedPoints,actions:actions.length,seconds:Math.round(data.elapsedMs/1000)}));json({ok:true});
        if(completed.length===jobs.length)stop(0);return;
      }
    }
    const bytes=served.get(url.pathname);if(!bytes){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',url.pathname.endsWith('.wasm')?'application/wasm':/\.(m?js)$/.test(url.pathname)?'text/javascript':url.pathname==='/'?'text/html':'application/octet-stream');res.end(bytes);
  }catch(error){res.statusCode=500;res.end(error.message);console.error(error);stop(1);}
});
server.listen(0,'127.0.0.1',()=>{
  const url='http://127.0.0.1:'+server.address().port;
  console.log(JSON.stringify({output,url,games:jobs.length,mode}));status();
  if(!args.electron)throw Error('--electron=/path/to/Electron is required');
  child=spawn(args.electron,[path.join(here,'electron.cjs')],{env:{...process.env,GUANDAN_BENCH_URL:url,GUANDAN_BENCH_LANES:String(lanes)},stdio:['ignore','pipe','pipe']});
  const log=fs.createWriteStream(path.join(output,'runtime.log'));child.stdout.pipe(log);child.stderr.pipe(log);
  child.on('error',error=>{console.error(error);stop(1);});child.on('exit',code=>{if(!stopping){console.error('Runtime exited',code);stop(1);}});
});
process.on('SIGINT',()=>stop(130));process.on('SIGTERM',()=>stop(143));
