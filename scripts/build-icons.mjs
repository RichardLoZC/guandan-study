import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'artwork/app-icon.png');
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'guandan-icon-'));
const iconset=path.join(scratch,'Guandan.iconset');
await fs.mkdir(iconset);
function exportPNG(size,destination){
  execFileSync('/usr/bin/sips',['-z',String(size),String(size),source,'--out',destination],{stdio:'ignore'});
}
try{
  for(const size of [16,32,128,256,512]){
    exportPNG(size,path.join(iconset,`icon_${size}x${size}.png`));
    exportPNG(size*2,path.join(iconset,`icon_${size}x${size}@2x.png`));
  }
  await fs.mkdir(path.join(root,'build'),{recursive:true});
  execFileSync('/usr/bin/iconutil',['-c','icns',iconset,'-o',path.join(root,'build/icon.icns')]);
  exportPNG(256,path.join(root,'icon.png'));
  await fs.mkdir(path.join(root,'web/assets/brand'),{recursive:true});
  exportPNG(128,path.join(root,'web/assets/brand/app-icon.png'));
  exportPNG(192,path.join(root,'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'));
  const png=await fs.readFile(path.join(root,'icon.png')),header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);await fs.writeFile(path.join(root,'build/icon.ico'),Buffer.concat([header,png]));
  console.log('Exported macOS, Windows, Android and table icons.');
}finally{await fs.rm(scratch,{recursive:true,force:true});}
