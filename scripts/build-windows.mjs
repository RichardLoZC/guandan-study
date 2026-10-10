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
const packages=await packager({dir:project,name:'GuandanStudy',executableName:'GuandanStudy',platform:'win32',arch,
 electronVersion:metadata.devDependencies.electron,appVersion:metadata.version,buildVersion:metadata.version,
 asar:true,prune:false,icon:path.join(project,'build/icon.ico'),out:staging,overwrite:true,ignore:ignoreRuntimeFile,
 appCopyright:'Guandan Study; third-party licenses included',win32metadata:{ProductName:'Guandan Study',FileDescription:'Guandan Study — offline and LAN card game'}});
const release=path.join(project,'dist','GuandanStudy-Windows');await fs.mkdir(release,{recursive:true});
const name=`GuandanStudy-Windows-v${metadata.version}-${arch}.zip`,zip=path.join(release,name);
// A portable ZIP avoids unsigned installers and requires no administrator access.
if(process.platform==='win32'){
 const script='Compress-Archive -LiteralPath $env:GUANDAN_ZIP_INPUT -DestinationPath $env:GUANDAN_ZIP_OUTPUT -Force';
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,GUANDAN_ZIP_INPUT:packages[0],GUANDAN_ZIP_OUTPUT:zip},stdio:'inherit'});
}else execFileSync('/usr/bin/zip',['-q','-r',zip,path.basename(packages[0])],{cwd:staging,stdio:'inherit'});
const sha256=createHash('sha256').update(await fs.readFile(zip)).digest('hex');
await fs.writeFile(path.join(release,'SHA256.txt'),`${sha256}  ${name}\n`);
await fs.writeFile(path.join(release,'build-info.json'),JSON.stringify({version:metadata.version,platform:'win32',arch,electron:metadata.devDependencies.electron,signed:false,sha256},null,2)+'\n');
console.log(`Windows package: ${zip}\nUnpacked application: ${packages[0]}`);
