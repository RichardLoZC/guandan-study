const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness(search="?view=2d"){
  const elements=new Map(),flags=new Set(),messages=[],views=[];let snapshot={classic:true,large:false,id:'first',revision:1,hand:[]};
  function el(id){if(!elements.has(id))elements.set(id,{clientWidth:1280,hidden:false,listeners:{},attrs:{},style:{removeProperty(){}},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},replaceChildren(){},classList:{toggle(){},contains(){return false;}}});return elements.get(id);}
  const root=el('root');root.classList={toggle(k,on){on?flags.add(k):flags.delete(k);},contains:k=>flags.has(k)};
  const bridge={snapshot:()=>snapshot,buttons:()=>new Map(),layout(){},notice:text=>messages.push(text)};
  let factory=async()=>make();function make(){const v={disposed:0,states:[],dispose(){this.disposed++;},setState(s){this.states.push(s);},resize(){},hover(){},setVisible(){}};views.push(v);return v;}
  const win={GuandanTable:bridge,addEventListener(){}};
  const source=fs.readFileSync(require.resolve('../web/app/table-view.js'),'utf8').replace("import('./table3d.js')","loadModule()");
  vm.runInNewContext(source,{URLSearchParams,location:{search},window:win,document:{documentElement:root,querySelector:()=>el('zone'),getElementById:el,addEventListener(){}},AbortController,ResizeObserver:class{observe(){}disconnect(){}},console:{warn(){}},loadModule:async()=>({createTableView:args=>factory(args)})});
  return {el,flags,messages,views,make,window:win,setFactory:fn=>factory=fn,setSnapshot:s=>snapshot=s,click:id=>el(id).listeners.click()};
}
test('a cancelled slow 3D load is disposed and never replaces the current 2D view',async()=>{
  const h=harness();let release;h.setFactory(()=>new Promise(resolve=>release=resolve));const pending=h.click('view-3d');await new Promise(setImmediate);await h.click('view-2d');const stale=h.make();release(stale);await pending;
  assert.equal(stale.disposed,1);assert.equal(h.flags.has('view-3d'),false);assert.equal(h.el('view-2d').attrs['aria-pressed'],'true');
});
test('the last requested load wins and is populated from the latest revision',async()=>{
  const h=harness(),wait=[];h.setFactory(()=>new Promise(resolve=>wait.push(resolve)));
  const first=h.click('view-3d');await new Promise(setImmediate);await h.click('view-2d');const latest=h.click('view-3d');await new Promise(setImmediate);
  h.setSnapshot({classic:true,id:'new',revision:8,hand:[{id:'selected',selected:true}]});const b=h.make();wait[1](b);await latest;const a=h.make();wait[0](a);await first;
  assert.equal(a.disposed,1);assert.equal(b.disposed,0);assert.equal(b.states.at(-1).revision,8);assert.equal(b.states.at(-1).hand[0].selected,true);
});
test('asset failures restore usable 2D without changing model or match data',async()=>{
  const h=harness();h.setFactory(async()=>{throw new Error('missing hands');});await h.click('view-3d');assert.equal(h.flags.has('view-3d'),false);assert.match(h.messages[0],/已返回 2D.*missing hands/);
  await h.click('view-2d');assert.equal(h.el('view-2d').attrs['aria-pressed'],'true');
});
test('switching 20 times releases every renderer and preserves selection',async()=>{
  const h=harness();h.setSnapshot({classic:true,id:'game',revision:3,hand:[{id:'pair',selected:true}]});
  for(let i=0;i<20;i++){await h.click('view-3d');assert.equal(h.views.at(-1).states.at(-1).hand[0].selected,true);await h.click('view-2d');}
  assert.equal(h.views.length,20);assert.ok(h.views.every(v=>v.disposed===1));
});
test('a legacy variant loaded while graphics are pending safely keeps 2D',async()=>{
  const h=harness();let release;h.setFactory(()=>new Promise(resolve=>release=resolve));const pending=h.click('view-3d');await new Promise(setImmediate);h.setSnapshot({classic:false});const v=h.make();release(v);await pending;assert.equal(v.disposed,1);assert.equal(h.flags.has('view-3d'),false);
});

test('repeated loading clicks coalesce and returning to 2D aborts initialization',async()=>{
 const h=harness();let signal,release,calls=0;h.setFactory(args=>{calls++;signal=args.signal;return new Promise(resolve=>release=resolve);});
 const loading=h.click('view-3d');await new Promise(setImmediate);for(let i=0;i<20;i++)await h.click('view-3d');
 assert.equal(calls,1);await h.click('view-2d');assert.equal(signal.aborted,true);release(h.make());await loading;assert.equal(h.views[0].disposed,1);
});

test('launch defaults to 3D and the explicit recovery URL keeps 2D',async()=>{const a=harness('');await new Promise(setImmediate);assert.equal(a.flags.has('view-3d'),true);const b=harness('?view=2d');await new Promise(setImmediate);assert.equal(b.flags.has('view-3d'),false);});
