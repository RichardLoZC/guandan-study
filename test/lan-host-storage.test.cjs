'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LanHostStorage}=require('../lan-host-storage.cjs'),{Room}=require('../lan-room.cjs');
test('separate local host tables can be restored by room identity without losing either save',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guandan-host-saves-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const storage=new LanHostStorage(dir),first=new Room({savePath:storage.current}),a=first.host('甲');
 storage.beforeNew();const second=new Room({savePath:storage.current}),b=second.host('乙');assert.notEqual(a.roomId,b.roomId);
 storage.restore(a.roomId);assert.equal(Room.load({savePath:storage.current}).host('甲').token,a.token);
 storage.restore(b.roomId);assert.equal(Room.load({savePath:storage.current}).host('乙').token,b.token);
 const before=fs.readFileSync(storage.current);assert.throws(()=>storage.restore('f'.repeat(48)),/未找到/);assert.deepEqual(fs.readFileSync(storage.current),before);
 assert.throws(()=>storage.restore('../outside'),/身份无效/);
});
test('legacy before-new backup remains recoverable and survives a later new table',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guandan-old-host-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const storage=new LanHostStorage(dir),first=new Room({savePath:storage.current}),a=first.host('旧房主');
 fs.copyFileSync(storage.current,storage.current+'.before-new');
 const second=new Room({savePath:storage.current}),b=second.host('新房主');
 storage.restore(a.roomId);assert.equal(Room.load({savePath:storage.current}).host('旧房主').token,a.token);
 storage.restore(b.roomId);storage.beforeNew();
 assert.equal(fs.existsSync(path.join(storage.archive,a.roomId+'.json')),true);
 assert.equal(JSON.parse(fs.readFileSync(storage.current+'.before-new')).id,b.roomId);
});
test('a legacy snapshot of the current room is preserved before its archive is refreshed',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guandan-old-collision-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const storage=new LanHostStorage(dir),room=new Room({savePath:storage.current}),host=room.host('房主');
 const old=fs.readFileSync(storage.current);fs.writeFileSync(storage.current+'.before-new',old);
 const newer=JSON.parse(old);newer.testSnapshotMarker='newer';fs.writeFileSync(storage.current,JSON.stringify(newer));
 storage.beforeNew();
 const files=fs.readdirSync(storage.archive),conflict=files.find(file=>file.startsWith(host.roomId+'.legacy-'));
 assert.ok(conflict);assert.deepEqual(fs.readFileSync(path.join(storage.archive,conflict)),old);
 assert.equal(JSON.parse(fs.readFileSync(path.join(storage.archive,host.roomId+'.json'))).testSnapshotMarker,'newer');
});
