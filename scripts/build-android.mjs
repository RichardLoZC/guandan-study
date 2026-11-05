import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {verifyRuntime} from './public-runtime.mjs';
verifyRuntime();

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Android releases may advance independently of the desktop/web version.
const gradleConfig=fs.readFileSync(path.join(root,'android/app/build.gradle'),'utf8');
const androidVersion=gradleConfig.match(/^\s*versionName '([0-9]+\.[0-9]+\.[0-9]+)'/m)?.[1];
const androidBuild=Number(gradleConfig.match(/^\s*versionCode ([0-9]+)/m)?.[1]);
if(!androidVersion||!Number.isSafeInteger(androidBuild)||androidBuild<1)throw new Error('Android 版本信息无效。');
const mode=process.argv.includes('--debug')?'debug':'release';
const sdk=process.env.ANDROID_HOME||path.join(os.homedir(),'Library/Android/sdk');
const java=process.env.JAVA_HOME||'/opt/homebrew/opt/openjdk@17';
let gradle=process.env.GUANDAN_GRADLE;
if(!gradle){
  const cache=path.join(os.homedir(),'.gradle/wrapper/dists/gradle-8.13-bin');
  if(fs.existsSync(cache))for(const folder of fs.readdirSync(cache)){
    const candidate=path.join(cache,folder,'gradle-8.13/bin/gradle');
    if(fs.existsSync(candidate)){gradle=candidate;break;}
  }
}
if(!gradle)throw new Error('需要 Gradle 8.13；请设置 GUANDAN_GRADLE 为 gradle 可执行文件的绝对路径。');
if(!fs.existsSync(path.join(sdk,'platforms/android-36/android.jar')))throw new Error('需要 Android SDK Platform 36。');
const env={...process.env,ANDROID_HOME:sdk,JAVA_HOME:java};
if(mode==='release'&&!env.GUANDAN_STORE_FILE){
  const keys=path.join(os.homedir(),'.local/share/guandan-study');
  fs.mkdirSync(keys,{recursive:true,mode:0o700});
  const key=path.join(keys,'android-release.jks'),secret=path.join(keys,'android-signing-password');
  if(!fs.existsSync(key)||!fs.existsSync(secret))throw new Error('缺少原 Android 发布签名或密码；不能生成新密钥冒充覆盖更新。');
  env.GUANDAN_STORE_FILE=key;env.GUANDAN_STORE_PASSWORD=fs.readFileSync(secret,'utf8').trim();
}
// Keep compilation off the network drive; only source and deliverables live there.
const stage=fs.mkdtempSync(path.join(os.tmpdir(),'guandan-pad-'));
fs.mkdirSync(path.join(stage,'project'));
fs.mkdirSync(path.join(stage,'project/scripts'));fs.copyFileSync(path.join(root,'scripts/public-runtime-manifest.json'),path.join(stage,'project/scripts/public-runtime-manifest.json'));
fs.cpSync(path.join(root,'android'),path.join(stage,'project/android'),{recursive:true,filter:source=>!['.gradle','build','local.properties'].includes(path.basename(source))});
fs.cpSync(path.join(root,'web'),path.join(stage,'project/web'),{recursive:true});
const variant=mode[0].toUpperCase()+mode.slice(1);
const args=['--no-daemon','--console=plain','test'+variant+'UnitTest','assemble'+variant];
if(process.argv.includes('--offline'))args.push('--offline');
execFileSync(gradle,args,{cwd:path.join(stage,'project/android'),env,stdio:'inherit'});
const dist=path.join(root,'dist/GuandanStudy-Android');fs.mkdirSync(dist,{recursive:true});
const name='掼军-公开版-Android-v'+androidVersion+'-build'+androidBuild+(mode==='debug'?'-test':'')+'.apk';
const output=path.join(dist,name);
const staged=path.join(stage,'project/android/app/build/outputs/apk',mode,'app-'+mode+'.apk');
const verification=execFileSync(path.join(sdk,'build-tools/36.0.0/apksigner'),['verify','--verbose','--print-certs',staged],{env,encoding:'utf8'});
if(mode==='release'){
  const signers=[...verification.matchAll(/Signer #\d+ certificate SHA-256 digest: ([a-f0-9]+)/g)].map(match=>match[1]);
  if(signers.length!==1||signers[0]!=='46caadac6c21a35bdeebe8ed2d037b734d73127d3f4c172089e4d404d9db4ce1')throw new Error('安装包签名与原 Android 发行版不一致，已停止发布。');
}
const hash=crypto.createHash('sha256').update(fs.readFileSync(staged)).digest('hex');
if(mode==='release'){
  if(androidBuild<=213)throw new Error('旧版 Android 构建号已发布，不能重新使用。');
  if(fs.existsSync(output)){
    const prior=crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');
    if(prior!==hash)throw new Error('同版本安装包已存在且内容不同；请递增构建号。');
  }
  const records=path.join(os.homedir(),'.local/share/guandan-study/android-build-records');fs.mkdirSync(records,{recursive:true,mode:0o700});
  const record=path.join(records,androidBuild+'.json'),entry={build:androidBuild,version:androidVersion,sha256:hash};
  const temp=path.join(records,'.'+androidBuild+'-'+crypto.randomUUID()+'.tmp');
  try{
    fs.writeFileSync(temp,JSON.stringify(entry)+'\n',{mode:0o600,flag:'wx'});
    try{fs.linkSync(temp,record);}catch(error){
      if(error.code!=='EEXIST')throw error;
      const old=JSON.parse(fs.readFileSync(record,'utf8'));
      if(old.build!==entry.build||old.version!==entry.version||old.sha256!==entry.sha256)throw new Error('该 Android 构建号已有不同安装包；请递增构建号。');
    }
  }finally{fs.rmSync(temp,{force:true});}
}
if(mode!=='release'||!fs.existsSync(output))fs.copyFileSync(staged,output);
console.log(verification.trim());
fs.writeFileSync(path.join(dist,mode==='debug'?'SHA256-test.txt':'SHA256.txt'),hash+'  '+name+'\n');
fs.writeFileSync(path.join(dist,mode==='debug'?'测试构建信息.json':'构建信息.json'),JSON.stringify({name:'掼军',distribution:'公开版',version:androidVersion,build:androidBuild,mode,applicationId:'com.guandan.study'+(mode==='debug'?'.dev':''),minSdk:26,targetSdk:36,networkPermission:true,lanProtocol:3,sha256:hash},null,2)+'\n');
console.log('Android build directory: '+stage);
console.log('APK: '+output);
