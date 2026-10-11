import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {listPackage,extractFile} from '@electron/asar';
import {ignoreRuntimeFile} from './package-options.mjs';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const release=path.join(project,'dist','GuandanStudy-Windows');
const info=JSON.parse(await fs.readFile(path.join(release,'build-info.json'),'utf8'));
const metadata=JSON.parse(await fs.readFile(path.join(project,'package.json'),'utf8'));
const archiveName=`GuandanStudy-Windows-v${metadata.version}-${info.arch}.zip`;
assert.ok(['x64','arm64'].includes(info.arch));
assert.equal(info.version,metadata.version);
const archive=path.join(release,archiveName);
const sha256=data=>createHash('sha256').update(data).digest('hex');
const archiveHash=sha256(await fs.readFile(archive));
assert.equal(archiveHash,info.sha256,'ZIP checksum does not match build metadata');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'guandan-verify-windows-'));

try{
 const extracted=path.join(temporary,'extracted');
 if(process.platform==='win32'){
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','$ErrorActionPreference = "Stop"; Expand-Archive -LiteralPath $env:GUANDAN_VERIFY_ZIP -DestinationPath $env:GUANDAN_VERIFY_DEST'],{env:{...process.env,GUANDAN_VERIFY_ZIP:archive,GUANDAN_VERIFY_DEST:extracted},stdio:'inherit'});
 }else{
  await fs.mkdir(extracted);
  execFileSync('/usr/bin/unzip',['-q',archive,'-d',extracted],{stdio:'inherit'});
 }
 const folder=`GuandanStudy-win32-${info.arch}`;
 assert.deepEqual(await fs.readdir(extracted),[folder],'ZIP must have one portable application folder');
 const appRoot=path.join(extracted,folder);
 for(const file of ['GuandanStudy.exe','resources/app.asar','icudtl.dat','locales/en-US.pak','locales/zh-CN.pak','LICENSE','LICENSES.chromium.html']){
  assert.ok((await fs.stat(path.join(appRoot,file))).size>0,`Missing runtime file: ${file}`);
 }
 const executable=path.join(appRoot,'GuandanStudy.exe');
 const pe=await fs.readFile(executable);
 assert.equal(pe.subarray(0,2).toString(),'MZ');
 const peOffset=pe.readUInt32LE(0x3c);
 assert.equal(pe.subarray(peOffset,peOffset+4).toString(),'PE\0\0');
 assert.equal(pe.readUInt16LE(peOffset+4),info.arch==='x64'?0x8664:0xaa64,'Wrong Windows executable architecture');

 const asar=path.join(appRoot,'resources','app.asar');
 const readBundle=name=>extractFile(asar,path.normalize(name));
 const bundled=JSON.parse(readBundle('package.json'));
 assert.equal(bundled.version,metadata.version);
 assert.equal(bundled.main,'main.cjs');
 const entries=listPackage(asar).map(name=>name.replace(/^[/\\]+/,'').replaceAll('\\','/'));
 assert.ok(entries.every(name=>!ignoreRuntimeFile('/'+name)),'Unexpected file in application archive');
 const expected=new Set();
 let checkedFiles=0;
 async function compare(directory=''){
  for(const entry of await fs.readdir(path.join(project,directory),{withFileTypes:true})){
   const relative=directory?directory+'/'+entry.name:entry.name;
   if(ignoreRuntimeFile('/'+relative))continue;
   expected.add(relative);
   if(entry.isDirectory())await compare(relative);
   else if(relative!=='package.json'){
    assert.equal(sha256(readBundle(relative)),sha256(await fs.readFile(path.join(project,relative))),`Bundled source mismatch: ${relative}`);
    checkedFiles++;
   }
  }
 }
 await compare();
 assert.ok(entries.every(name=>expected.has(name)),'Archive contains a stale runtime entry');
 const modelHashes={};
 for(const name of ['context.onnx','scores.onnx'])modelHashes[name]=sha256(readBundle('web/mobile/'+name));

 let nativeRuntime={tested:false,reason:'Requires matching native Windows architecture'};
 if(process.platform==='win32'&&process.arch===info.arch){
  // Exercise the shipped EXE as a Node CLI, without driving a graphical desktop.
  const probe=path.join(temporary,'probe.cjs');
  await fs.writeFile(probe,`'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=process.env.GUANDAN_VERIFY_RUNTIME;
const metadata=require(path.join(root,'package.json'));
const {Match}=require(path.join(root,'web/app/match.js'));
const english=require(path.join(root,'web/app/locales/en.js'));
const {prepareDataPath}=require(path.join(root,'storage.cjs'));
assert.equal(process.platform,'win32');
const match=new Match(),cards=match.state.game.players.flatMap(player=>player.hand);
assert.equal(cards.length,108);assert.equal(new Set(cards.map(card=>card.id)).size,108);
assert.equal(english.translate('看建议'),'Hint');
const data=prepareDataPath({platform:process.platform,appData:path.join(__dirname,'fallback'),executableDir:path.dirname(process.execPath)});
assert.equal(data.fallback,false);assert.ok(fs.existsSync(data.sessionPath));
assert.equal(process.versions.electron,process.env.GUANDAN_VERIFY_ELECTRON);
console.log(JSON.stringify({tested:true,mode:'electron-node',platform:process.platform,arch:process.arch,electron:process.versions.electron,version:metadata.version,uniqueCards:cards.length,portableStorage:true,english:true}));
`);
  nativeRuntime=JSON.parse(execFileSync(executable,[probe],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',GUANDAN_VERIFY_RUNTIME:asar,GUANDAN_VERIFY_ELECTRON:metadata.devDependencies.electron},encoding:'utf8',timeout:30000}).trim());
 }
 const report={version:metadata.version,archive:archiveName,sha256:archiveHash,sourceCommit:info.sourceCommit??null,checkedFiles,modelHashes,nativeRuntime,guiTested:false,modelInferenceTested:false};
 await fs.writeFile(path.join(release,'verification.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{
 await fs.rm(temporary,{recursive:true,force:true});
}
