import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../web/assets');
// Keep the rank and suit uncovered. A gold star in the exposed left margin
// remains visible when cards overlap; retain each source SVG and its license.
const mark='<g id="level-star" aria-label="Level card"><circle cx="25" cy="124" r="19" fill="#fff8e4"/><path d="M25 106 L30.3 117 L42.5 118.5 L33.5 127 L35.7 139 L25 133.3 L14.3 139 L16.5 127 L7.5 118.5 L19.7 117 Z" fill="#e6a126" stroke="#875010" stroke-width="1.8" stroke-linejoin="round"/></g>';
let count=0;
for(const skin of ['jumbo','accessible','minimal']){
  const folder=path.join(root,skin);await fs.mkdir(path.join(folder,'level'),{recursive:true});
  for(const name of await fs.readdir(folder)){
    if(!/^(heart|spade|club|diamond)(Ace|King|Queen|Jack|10|[2-9])\.svg$/.test(name))continue;
    const svg=await fs.readFile(path.join(folder,name),'utf8');
    if(!svg.includes('</svg>'))throw Error('Invalid card SVG: '+name);
    await fs.writeFile(path.join(folder,'level',name),svg.replace('</svg>',mark+'</svg>'));count++;
  }
}
console.log('Generated '+count+' level-card faces.');
