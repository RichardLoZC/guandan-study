// Ship only runtime files. Never include local reports, saves, signing keys or research downloads.
const runtime=new Set(['web','main.cjs','preload.cjs','engine-preload.cjs','lan-room.cjs','lan-server.cjs','lan-discovery.cjs','storage.cjs','desktop-fit.cjs','package.json','icon.png','LICENSE','NOTICE','THIRD_PARTY_NOTICES.md','使用说明.txt']);
export function ignoreRuntimeFile(name){
 if(!name||name==='/')return false;
 const parts=name.replace(/^[/\\]+/,'').split(/[/\\]/);
 return !runtime.has(parts[0])||parts.some(part=>part==='.DS_Store'||part.startsWith('._'));
}
