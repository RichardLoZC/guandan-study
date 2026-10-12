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
  for(const [density,size] of Object.entries({mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192})){
    const destination=path.join(root,`android/app/src/main/res/mipmap-${density}`);
    await fs.mkdir(destination,{recursive:true});
    exportPNG(size,path.join(destination,'ic_launcher.png'));
  }
  // Supply native Windows sizes instead of asking the shell to shrink one
  // 256 px frame for every taskbar, Explorer and shortcut view.
  const sizes=[16,24,32,48,64,128,256],frames=[];
  for(const size of sizes){
    const frame=path.join(scratch,`windows-${size}.png`);exportPNG(size,frame);
    frames.push(await fs.readFile(frame));
  }
  const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
  let offset=header.length;
  sizes.forEach((size,index)=>{
    const entry=6+index*16;
    header[entry]=header[entry+1]=size===256?0:size;
    header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);
    header.writeUInt32LE(frames[index].length,entry+8);header.writeUInt32LE(offset,entry+12);
    offset+=frames[index].length;
  });
  await fs.writeFile(path.join(root,'build/icon.ico'),Buffer.concat([header,...frames]));
  console.log('Exported macOS, Windows, Android and table icons.');
}finally{await fs.rm(scratch,{recursive:true,force:true});}
