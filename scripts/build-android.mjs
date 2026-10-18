import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const metadata=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
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
  if(!fs.existsSync(key)){
    if(!fs.existsSync(secret))fs.writeFileSync(secret,crypto.randomBytes(32).toString('hex'),{mode:0o600});
    env.GUANDAN_STORE_PASSWORD=fs.readFileSync(secret,'utf8').trim();
    execFileSync(path.join(java,'bin/keytool'),['-genkeypair','-keystore',key,'-storepass:env','GUANDAN_STORE_PASSWORD','-keypass:env','GUANDAN_STORE_PASSWORD','-alias','guandan','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Guandan Study, OU=Offline App, O=Personal Development'],{env,stdio:'inherit'});
    fs.chmodSync(key,0o600);
  }
  env.GUANDAN_STORE_FILE=key;env.GUANDAN_STORE_PASSWORD=fs.readFileSync(secret,'utf8').trim();
}
// Keep compilation off the network drive; only source and deliverables live there.
const stage=fs.mkdtempSync(path.join(os.tmpdir(),'guandan-pad-'));
fs.mkdirSync(path.join(stage,'project'));
fs.cpSync(path.join(root,'android'),path.join(stage,'project/android'),{recursive:true,filter:source=>!['.gradle','build','local.properties'].includes(path.basename(source))});
fs.cpSync(path.join(root,'web'),path.join(stage,'project/web'),{recursive:true});
const variant=mode[0].toUpperCase()+mode.slice(1);
const args=['--no-daemon','--console=plain','test'+variant+'UnitTest','assemble'+variant];
if(process.argv.includes('--offline'))args.push('--offline');
execFileSync(gradle,args,{cwd:path.join(stage,'project/android'),env,stdio:'inherit'});
const dist=path.join(root,'dist/GuandanStudy-Android');fs.mkdirSync(dist,{recursive:true});
const name='GuandanStudy-Android-v'+metadata.version+(mode==='debug'?'-test':'')+'.apk';
const output=path.join(dist,name);
fs.copyFileSync(path.join(stage,'project/android/app/build/outputs/apk',mode,'app-'+mode+'.apk'),output);
execFileSync(path.join(sdk,'build-tools/36.0.0/apksigner'),['verify','--verbose',output],{env,stdio:'inherit'});
const hash=crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');
fs.writeFileSync(path.join(dist,mode==='debug'?'SHA256-test.txt':'SHA256.txt'),hash+'  '+name+'\n');
fs.writeFileSync(path.join(dist,mode==='debug'?'测试构建信息.json':'构建信息.json'),JSON.stringify({version:metadata.version,mode,applicationId:'com.guandan.study'+(mode==='debug'?'.dev':''),minSdk:26,targetSdk:36,networkPermission:true,lanProtocol:1,sha256:hash},null,2)+'\n');
console.log('Android build directory: '+stage);
console.log('APK: '+output);
