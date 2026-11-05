'use strict';
const { app, BrowserWindow, Menu, protocol, session, dialog, shell, screen, ipcMain, powerSaveBlocker } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const lan = require('./lan-server.cjs');
const {LanHostStorage} = require('./lan-host-storage.cjs');
const { prepareDataPath, migrateLegacyStorage } = require('./storage.cjs');
const { fitDesktopWindow } = require('./desktop-fit.cjs');
const {OfficialDanLM} = require('./official-danlm.cjs');

const ORIGIN = 'guandan://app';
const APP_NAME = '掼军';
const DISTRIBUTION = require('./package.json').distributionName;
let uiLanguage='zh-CN';
const english=require('./web/app/locales/en.js');
const ui=text=>uiLanguage==='en'?english.translate(text):text;
const isMac = process.platform === 'darwin';
const edition = isMac ? 'macOS' : process.platform === 'win32' ? 'Windows' : '桌面';
const root = path.join(__dirname, 'web');
protocol.registerSchemesAsPrivileged([{
  scheme: 'guandan',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);
app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('cn.guandan.study.offline');

let storage;
try {
  storage = prepareDataPath({
    platform: process.platform,
    appData: app.getPath('appData'),
    executableDir: process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath),
    override: process.env.GUANDAN_DATA_DIR,
  });
} catch (error) {
  dialog.showErrorBox('无法创建存档文件夹', error.message);
  app.exit(1);
}
const { dataPath, sessionPath, fallback } = storage;
app.setPath('userData', dataPath);
app.setPath('sessionData', sessionPath);
const logPath = path.join(dataPath, '运行日志.txt');
try {
  if (fs.existsSync(logPath) && fs.statSync(logPath).size > 2 * 1024 * 1024) {
    fs.renameSync(logPath, logPath + '.previous');
  }
} catch {}
function log(message) {
  try { fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`); } catch {}
}
const nativeDirectory=app.isPackaged?path.join(process.resourcesPath,'danlm-native'):(process.env.GUANDAN_NATIVE_DIR||path.join(process.resourcesPath,'danlm-native'));
const nativeAvailable=isMac&&process.arch==='arm64'&&fs.existsSync(path.join(nativeDirectory,'worker.py'))&&fs.existsSync(path.join(nativeDirectory,'runtime/bin/python3.12'));
const officialDanLM=nativeAvailable?new OfficialDanLM(nativeDirectory,log):null;
let win = null, lanService=null, lanStarting=false, engineWindow=null, enginePromise=null, engineSequence=0, powerBlock=null;
const lanHostStorage=new LanHostStorage(dataPath);
const enginePending=new Map();
async function engineReady(){
  if(enginePromise)return enginePromise;
  enginePromise=(async()=>{
    const engine=new BrowserWindow({show:false,webPreferences:{additionalArguments:nativeAvailable?['--guandan-native-danlm']:[],preload:path.join(__dirname,'engine-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
    engineWindow=engine;engine.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    engine.webContents.on('will-navigate',event=>event.preventDefault());
    const fail=()=>{for(const task of enginePending.values()){clearTimeout(task.timer);task.reject(new Error('联机模型进程已停止'));}enginePending.clear();enginePromise=null;engineWindow=null;};
    engine.webContents.on('render-process-gone',fail);engine.on('closed',fail);
    await engine.loadURL(ORIGIN+'/engine.html');
    return engine;
  })().catch(error=>{enginePromise=null;throw error;});
  return enginePromise;
}
ipcMain.on('guandan-engine-result',(event,result)=>{
  if(event.sender!==engineWindow?.webContents||event.senderFrame!==engineWindow.webContents.mainFrame)return;
  const pending=enginePending.get(result?.id);if(!pending)return;
  clearTimeout(pending.timer);enginePending.delete(result.id);result.error?pending.reject(new Error(result.error)):pending.resolve(result.value);
});
async function runLanModel(payload){
  const engine=await engineReady(),id=++engineSequence;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{enginePending.delete(id);reject(new Error('联机模型计算超时'));},95000);
    enginePending.set(id,{resolve,reject,timer});engine.webContents.send('guandan-engine-request',{id,payload});
  });
}
ipcMain.handle('guandan-official-danlm',async(event,payload)=>{
  const table=event.sender===win?.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url.startsWith(ORIGIN+'/index.html');
  const engine=event.sender===engineWindow?.webContents&&event.senderFrame===engineWindow.webContents.mainFrame&&event.senderFrame.url.startsWith(ORIGIN+'/engine.html');
  if(!officialDanLM||(!table&&!engine))throw new Error('无效的模型调用');
  return officialDanLM.request(payload);
});
ipcMain.handle('guandan-lan',async(event,payload)=>{
  if(event.sender!==win?.webContents||event.senderFrame!==win.webContents.mainFrame||!event.senderFrame.url.startsWith(ORIGIN+'/index.html'))throw new Error('无效的房间调用');
  if(!payload||typeof payload!=='object')throw new Error('无效的联机参数');
  if(payload.action==='discover')return lan.discover();
  if(payload.action==='host'){
    if(lanStarting)throw new Error('牌桌正在准备，请稍后');
    lanStarting=true;
    try{
      const requested=payload.roomId;
      if(requested!==undefined&&(typeof requested!=='string'||!/^[a-f0-9]{48}$/.test(requested)||payload.fresh===true))throw new Error('局域网牌桌身份无效。');
      if(payload.fresh===true||(requested&&lanService&&lanService.room.id!==requested)){
        await lanService?.close();lanService=null;
        if(payload.fresh===true)lanHostStorage.beforeNew();else lanHostStorage.checkpoint();
      }
      if(!lanService){
        if(requested)lanHostStorage.restore(requested);
        lanService=await lan.start({savePath:lanHostStorage.current,runModel:runLanModel,fresh:payload.fresh===true});
      }
      if(requested&&lanService.room.id!==requested)throw new Error('未找到原来的局域网牌桌，请重新开桌。');
      const identity=lanService.room.host(payload.name);
      if(powerBlock===null)powerBlock=powerSaveBlocker.start('prevent-app-suspension');
      return {...identity,address:lanService.address,addresses:lanService.addresses};
    }finally{lanStarting=false;}
  }
  if(payload.action==='request'){
    const result=await lan.request(payload.address,payload.body,payload.token);
    if(lanService?.room.paused&&powerBlock!==null){powerSaveBlocker.stop(powerBlock);powerBlock=null;}
    else if(lanService?.room.match&&!lanService.room.paused&&powerBlock===null)powerBlock=powerSaveBlocker.start('prevent-app-suspension');
    return result;
  }
  throw new Error('不支持的联机操作');
});
ipcMain.on('guandan-language',(event,locale)=>{
  if(event.sender!==win?.webContents||event.senderFrame!==win.webContents.mainFrame||!event.senderFrame.url.startsWith(ORIGIN+'/index.html')||!['en','zh-CN'].includes(locale))return;
  uiLanguage=locale;setMenus();win.setTitle(APP_NAME+' · '+DISTRIBUTION+' · '+edition);
});
function showMessage(options) {
  return win && !win.isDestroyed() ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}
function focusTable() {
  if (!win || win.isDestroyed()) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return Promise.resolve();
}

function configureOfflineSession() {
  const mime = {
    '.webp': 'image/webp',
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  };
  const csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'";
  protocol.handle('guandan', async request => {
    try {
      const u = new URL(request.url);
      if (u.hostname !== 'app' || !['GET', 'HEAD'].includes(request.method)) {
        return new Response('Forbidden', { status: 403 });
      }
      let name = decodeURIComponent(u.pathname);
      if (name === '/') name = '/index.html';
      if (name.includes('\\') || name.includes('\0')) return new Response('Forbidden', { status: 403 });
      const file = path.resolve(root, '.' + name);
      if (!file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
      const bytes = await fs.promises.readFile(file);
      return new Response(request.method === 'HEAD' ? null : bytes, { headers: {
        'Content-Type': mime[path.extname(file)] || 'text/plain; charset=utf-8',
        'Content-Security-Policy': csp,
        'X-Content-Type-Options': 'nosniff',
      } });
    } catch (error) {
      log('asset error ' + error.message);
      return new Response('Not found', { status: 404 });
    }
  });
  const currentSession = session.defaultSession;
  currentSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  currentSession.setPermissionCheckHandler(() => false);
  currentSession.webRequest.onBeforeRequest((details, callback) => {
    const permitted = details.url.startsWith(ORIGIN + '/') || details.url.startsWith('blob:' + ORIGIN + '/');
    if (!permitted) log('blocked external request');
    callback({ cancel: !permitted });
  });
}

async function createWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const table = new BrowserWindow({
    width: Math.min(1380, area.width), height: Math.min(940, area.height),
    minWidth: 880, minHeight: 640, backgroundColor: '#f6f5ee',
    title: `${APP_NAME} · ${DISTRIBUTION} · ${edition}`, icon: path.join(__dirname, 'icon.png'),
    show: false,
    webPreferences: {
      additionalArguments:nativeAvailable?['--guandan-native-danlm']:[],
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, devTools: false, spellcheck: false,
    },
  });
  win = table;
  table.fitToWindow = fitDesktopWindow(table);
  table.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  table.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    try {
      const u = new URL(url);
      const allowed = new Set(['/mobile/DanLM-LICENSE.txt', '/mobile/ONNX-Runtime-LICENSE.txt', '/mobile/React-LICENSE.txt', '/mobile/LICENSE', '/card-sources/SVGCards-README-license.txt']);
      const filename = path.basename(u.pathname);
      if (u.protocol === 'guandan:' && u.hostname === 'app' && allowed.has(u.pathname)) {
        dialog.showMessageBox(table, {
          type: 'info', title: filename, message: filename,
          detail: fs.readFileSync(path.join(root, u.pathname), 'utf8'), buttons: ['关闭'],
        });
      }
    } catch (error) { log('license error ' + error.message); }
  });
  table.webContents.on('console-message', details => log(`renderer ${details.level}: ${details.message}`));
  table.webContents.on('render-process-gone', (_event, details) => {
    log('renderer stopped ' + details.reason);
    dialog.showMessageBox(table, {type:'error',title:uiLanguage==='en'?'Table stopped':'牌桌已停止',message:uiLanguage==='en'?'Reopen the saved table':'重新打开已保存的牌桌',detail:uiLanguage==='en'?'Your last saved progress will be restored. Select any unplayed cards again.':'将恢复最近成功保存的进度。尚未出手的选牌需要重新选择。',buttons:uiLanguage==='en'?['Restore table','Quit']:['恢复牌桌','退出'],defaultId:0,cancelId:1}).then(({response})=>{if(response===0&&!table.isDestroyed())table.loadURL(ORIGIN+'/index.html');else app.quit();});
  });
  table.webContents.on('did-fail-load', (_event, code, description) => log(`load failed ${code}: ${description}`));
  table.on('close', () => session.defaultSession.flushStorageData());
  table.on('closed', () => {
    if (win !== table) return;
    win = null;
    // The hidden LAN engine is also a BrowserWindow, so it can keep
    // window-all-closed from firing after the last visible window closes.
    if (!isMac) app.quit();
  });
  table.on('page-title-updated', event => {event.preventDefault();table.setTitle(`${APP_NAME} · ${DISTRIBUTION} · ${edition}`);});
  table.once('ready-to-show', () => table.show());
  await table.loadURL(ORIGIN + '/index.html');
}

function setMenus() {
  const about = () => showMessage({
    type: 'info', title: ui('关于掼军'),
    message: `${APP_NAME} · ${DISTRIBUTION} · ${edition} ${app.getVersion()}`,
    detail: uiLanguage==='en'?`${officialDanLM?'Classic and new-style play models use the official macOS core. Tribute uses classic DanLM.':'Classic and new-style play models use the aligned ONNX runtime. Tribute uses classic DanLM.'} Solo play and locally hosted LAN tables use the local model. The game validates moves against its own rules.\n\nSave folder: ${dataPath}`:`${officialDanLM?'经典与新风格出牌模型使用 DanLM 官方 Mac 原生核心，贡还使用经典模型。':'经典与新风格出牌模型使用已对齐的 ONNX 引擎，贡还使用经典模型。'}游戏按本桌规则检查出牌。\n\n存档位置：${dataPath}`,
    buttons: [uiLanguage==='en'?'OK':'知道了'],
  });
  const appMenu = { label: APP_NAME, submenu: [
    { label: '关于掼军', click: about },
    { label: '打开存档文件夹', click: () => shell.openPath(dataPath) },
    { type: 'separator' },
    ...(isMac ? [
      { role: 'services', label: '服务' }, { type: 'separator' },
      { role: 'hide', label: '隐藏掼军' }, { role: 'hideOthers', label: '隐藏其他' },
      { role: 'unhide', label: '全部显示' }, { type: 'separator' },
    ] : []),
    { role: 'quit', label: '退出掼军' },
  ] };
  const localize=items=>items.map(item=>({...item,...(item.label?{label:ui(item.label)}:{}),...(item.submenu?{submenu:localize(item.submenu)}:{})}));
  Menu.setApplicationMenu(Menu.buildFromTemplate(localize([
    appMenu,
    { label: '文件', submenu: [{ role: 'close', label: '关闭窗口' }] },
    { label: '编辑', submenu: [
      { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' },
      { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' },
    ] },
    { label: '显示', submenu: [
      { label: '恢复大小', accelerator: 'CommandOrControl+0', click: () => win?.fitToWindow() }, { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' }, { type: 'separator' },
      { role: 'togglefullscreen', label: '全屏', accelerator: isMac ? 'Control+Command+F' : 'F11' },
    ] },
    { label: '窗口', submenu: [
      { role: 'minimize', label: '最小化' }, { role: 'zoom', label: '缩放' },
      { type: 'separator' }, { label: '显示牌桌', click: () => focusTable().catch(startupError) },
      ...(isMac ? [{ role: 'front', label: '全部置于前面' }] : []),
    ] },
    { label: '帮助', submenu: [{ label: '关于掼军', click: about }] },
  ])));
}

function startupError(error) {
  log(error.stack || error.message);
  dialog.showErrorBox('无法启动掼军', error.message);
  app.quit();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  log(`start v${app.getVersion()} electron=${process.versions.electron} platform=${process.platform} arch=${process.arch}`);
  if (isMac) {
    const releaseDir = app.isPackaged
      ? path.resolve(path.dirname(process.execPath), '../../..') : __dirname;
    const candidates = process.env.GUANDAN_LEGACY_DATA_DIR
      ? [process.env.GUANDAN_LEGACY_DATA_DIR]
      : [path.join(releaseDir, '掼蛋数据'), path.join(releaseDir, '..', '掼蛋研习社-Windows离线版', '掼蛋数据')];
    try {
      const migratedFrom = migrateLegacyStorage(sessionPath, candidates);
      if (migratedFrom) {
        fs.writeFileSync(path.join(dataPath, 'Windows存档迁移.json'), JSON.stringify({
          source: migratedFrom, migratedAt: new Date().toISOString(),
        }, null, 2) + '\n');
        log('copied Windows localStorage from ' + migratedFrom);
      }
    } catch (error) { log('Windows save migration failed: ' + error.message); }
  }
  app.on('second-instance', () => {
    if (app.isReady()) focusTable().catch(startupError);
  });
  app.on('activate', () => {
    if (app.isReady()) focusTable().catch(startupError);
  });
  app.whenReady().then(async () => {
    configureOfflineSession();
    setMenus();
    await createWindow();
    if (fallback) dialog.showMessageBox(win, {
      type: 'info', message: '程序所在文件夹不可写，进度已保存在当前用户目录。',
      detail: dataPath, buttons: [uiLanguage==='en'?'OK':'知道了'],
    });
  }).catch(startupError);
}
app.on('window-all-closed', () => { if (!isMac) app.quit(); });
app.on('before-quit', () => {
  if (app.isReady()) session.defaultSession.flushStorageData();
  officialDanLM?.close();
  lanService?.close();if(powerBlock!==null)powerSaveBlocker.stop(powerBlock);
  log('exit');
});
