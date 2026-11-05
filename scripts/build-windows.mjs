import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {packager} from '@electron/packager';
import {ignoreRuntimeFile} from './package-options.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const metadata=JSON.parse(await fs.readFile(path.join(project,'package.json'),'utf8'));
const arch=process.env.GUANDAN_BUILD_ARCH||'x64';
if(!['x64','arm64'].includes(arch))throw new Error('Windows supports x64 or arm64.');
const staging=await fs.mkdtemp(path.join(os.tmpdir(),'guandan-windows-'));
const packages=await packager({dir:project, tmpdir:path.join(staging,'packager-temp'),name:'GuandanStudy',executableName:'掼军',platform:'win32',arch,
 electronVersion:metadata.devDependencies.electron,appVersion:metadata.version,buildVersion:metadata.version,
 asar:true,prune:false,icon:path.join(project,'build/icon.ico'),out:staging,overwrite:true,ignore:ignoreRuntimeFile,
 appCopyright:'掼军; third-party licenses included',win32metadata:{ProductName:'掼军',FileDescription:'掼军 · '+metadata.distributionName}});
const release=path.join(project,'dist','GuandanStudy-Windows');await fs.mkdir(release,{recursive:true});
const name=`掼军-${metadata.distributionName}-Windows-v${metadata.version}-${arch}.zip`,zip=path.join(release,name);
const freshZip=path.join(staging,name);
// A portable ZIP avoids unsigned installers and requires no administrator access.
// Always create a fresh archive: updating an existing ZIP can retain removed files.
if(process.platform==='win32'){
 const script='Compress-Archive -LiteralPath $env:GUANDAN_ZIP_INPUT -DestinationPath $env:GUANDAN_ZIP_OUTPUT -Force';
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','$ErrorActionPreference = "Stop"; '+script],{env:{...process.env,GUANDAN_ZIP_INPUT:packages[0],GUANDAN_ZIP_OUTPUT:freshZip},stdio:'inherit'});
}else execFileSync('/usr/bin/zip',['-q','-r',freshZip,path.basename(packages[0])],{cwd:staging,stdio:'inherit'});
await fs.copyFile(freshZip,zip+'.new');await fs.rename(zip+'.new',zip);
const sha256=createHash('sha256').update(await fs.readFile(zip)).digest('hex');
await fs.writeFile(path.join(release,'SHA256.txt'),`${sha256}  ${name}\n`);
let sourceCommit=null;try{sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:project,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
await fs.writeFile(path.join(release,'build-info.json'),JSON.stringify({name:'掼军',distribution:metadata.distributionName,executable:'掼军.exe',version:metadata.version,platform:'win32',arch,electron:metadata.devDependencies.electron,signed:false,archive:name,sourceCommit,builtOn:process.platform,sha256},null,2)+'\n');
console.log(`Windows package: ${zip}\nUnpacked application: ${packages[0]}`);
