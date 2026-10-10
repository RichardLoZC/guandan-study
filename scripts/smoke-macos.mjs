import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';

if (process.platform !== 'darwin') throw new Error('macOS 集成测试需要 Mac。');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testArch = process.env.GUANDAN_TEST_ARCH || process.arch;
assert.ok(['arm64', 'x64'].includes(testArch));
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'guandan-mac-smoke-'));
let appPath = process.env.GUANDAN_TEST_APP;
if (!appPath) {
  const release = path.join(project, 'dist/掼蛋研习社-macOS离线版');
  const build = JSON.parse(await fs.readFile(path.join(release, '构建信息.json'), 'utf8'));
  assert.equal(path.basename(build.archive), build.archive);
  const expanded = path.join(scratch, 'release');
  execFileSync('/usr/bin/ditto', ['-x', '-k', path.join(release, build.archive), expanded]);
  appPath = path.join(expanded, '掼蛋研习社.app');
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]);
}
const executable = path.join(appPath, 'Contents/MacOS/掼蛋研习社');
const resultsDir = path.join(project, 'test-results', testArch);
await fs.mkdir(resultsDir, { recursive: true });
const checks = [];
let application;
let launcher = executable;
if (testArch !== process.arch) {
  // Forward Playwright's debugging flags to the selected Universal slice.
  launcher = path.join(scratch, 'launch-electron');
  const quoted = "'" + executable.replaceAll("'", "'\\''") + "'";
  await fs.writeFile(launcher, `#!/bin/sh\nexec /usr/bin/arch -${testArch === 'x64' ? 'x86_64' : 'arm64'} ${quoted} "$@"\n`, { mode: 0o755 });
}

async function launch(dataDir, legacyDir) {
  const environment = { ...process.env, GUANDAN_DATA_DIR: dataDir };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.GUANDAN_LEGACY_DATA_DIR;
  if (legacyDir) environment.GUANDAN_LEGACY_DATA_DIR = legacyDir;
  application = await electron.launch({ executablePath: launcher, env: environment, timeout: 30000 });
  const page = await application.firstWindow();
  await page.locator('#hand-cards .playing-card').first().waitFor();
  return page;
}
async function savedGame(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('guandan-trainer-v2')));
}
function pass(name) {
  checks.push(name);
  console.log('通过：' + name);
}

try {
  const dataDir = path.join(scratch, 'data');
  let page = await launch(dataDir);
  const runtime = await application.evaluate(({ app }) => ({
    arch: process.arch, platform: process.platform, data: app.getPath('userData'),
  }));
  assert.equal(runtime.arch, testArch);
  assert.equal(runtime.platform, 'darwin');
  assert.equal(runtime.data, dataDir);
  await page.waitForFunction(() => {
    const save = JSON.parse(localStorage.getItem('guandan-trainer-v2'));
    return save?.game.currentPlayer === 0;
  }, null, { timeout: 90000 });
  const initial = await savedGame(page);
  assert.equal(initial.version, 2);
  assert.equal(initial.game.players.length, 4);
  assert.equal(initial.game.currentPlayer, 0);
  pass('原生 macOS 启动与四人牌桌');

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByText('程序内置模型已加载 · 离线运行，无需联网', { exact: true }).waitFor({ timeout: 90000 });
  assert.ok(await page.getByRole('dialog').getByText('DanLM 离线引擎', { exact: true }).isVisible());
  await page.getByRole('button', { name: '回到牌桌', exact: true }).click();
  pass('内置 DanLM ONNX/WASM 模型加载');

  await page.locator('#hint-button').click();
  await page.locator('#adopt-from-dialog:not(:disabled)').waitFor({ timeout: 90000 });
  await page.screenshot({ path: path.join(resultsDir, 'teaching.png'), fullPage: true });
  await page.locator('#adopt-from-dialog:not(:disabled)').click();
  const selectedCards = await page.locator('#hand-cards .playing-card.selected').count();
  const play = selectedCards > 0 ? page.locator('#play-button')
    : page.getByRole('button', { name: '不出', exact: true });
  assert.equal(await play.isEnabled(), true);
  await play.click();
  await page.waitForFunction(minimum => {
    const save = JSON.parse(localStorage.getItem('guandan-trainer-v2'));
    return save.game.actionHistory.length >= minimum && save.game.currentPlayer === 0;
  }, initial.game.actionHistory.length + 4, { timeout: 90000 });
  assert.equal(await page.locator('[role="alert"]:visible').count(), 0);
  const afterPlay = await savedGame(page);
  assert.equal(afterPlay.game.players[0].hand.length, initial.game.players[0].hand.length - selectedCards);
  const actingSeats = new Set(afterPlay.game.actionHistory.map(action => action.player ?? action.seat));
  assert.ok(afterPlay.game.actionHistory.length >= 4);
  assert.deepEqual([...actingSeats].sort(), [0, 1, 2, 3]);
  pass('教学推荐、采用建议、人类行动与三位 NPC 离线回应');
  await page.screenshot({ path: path.join(resultsDir, 'table.png'), fullPage: true });

  // Exercise native window closure, then the Dock activation event.
  const closed = page.waitForEvent('close', { timeout: 10000 });
  await application.evaluate(({ BrowserWindow }) => new Promise(resolve => {
    const window = BrowserWindow.getAllWindows()[0];
    window.once('closed', resolve);
    window.close();
  }));
  await closed;
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 0);
  const reopened = application.waitForEvent('window', { timeout: 10000 });
  await application.evaluate(({ app }) => app.emit('activate'));
  page = await reopened;
  await page.locator('#hand-cards .playing-card').first().waitFor();
  assert.deepEqual(await savedGame(page), afterPlay);
  pass('关闭窗口、Dock 重开与进度恢复');

  await application.close();
  application = null;
  page = await launch(dataDir);
  assert.deepEqual(await savedGame(page), afterPlay);
  pass('完全退出并重新启动后恢复存档');

  const offline = await application.evaluate(async ({ session }) => {
    try { await session.defaultSession.fetch('https://example.com/'); return false; }
    catch { return true; }
  });
  assert.equal(offline, true);
  const resourceStatus = await page.evaluate(async () => ({
    model: (await fetch('/mobile/context.onnx', { method: 'HEAD' })).status,
    forbidden: (await fetch('guandan://app/mobile/..%2f..%2fpackage.json')).status,
    license: (await (await fetch('/mobile/ONNX-Runtime-LICENSE.txt')).text()).includes('MIT'),
    nodeIntegration: typeof window.require,
  }));
  assert.equal(resourceStatus.model, 200);
  assert.equal(resourceStatus.forbidden, 403);
  assert.equal(resourceStatus.license, true);
  assert.equal(resourceStatus.nodeIntegration, 'undefined');
  pass('离线资源、许可、沙箱与外部请求限制');

  const menus = await application.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map(item => ({
    label: item.label,
    children: item.submenu?.items.map(child => ({ role: child.role, accelerator: child.accelerator })),
  })));
  assert.ok(menus.some(menu => menu.children?.some(item => item.role === 'quit')));
  assert.ok(menus.some(menu => menu.children?.some(item => item.role === 'togglefullscreen' && item.accelerator === 'Control+Command+F')));
  pass('Mac 菜单与全屏快捷键');
  await application.close();
  application = null;

  if (process.env.GUANDAN_TEST_LEGACY_DIR) {
    const importedDir = path.join(scratch, 'imported-data');
    page = await launch(importedDir, process.env.GUANDAN_TEST_LEGACY_DIR);
    const marker = JSON.parse(await fs.readFile(path.join(importedDir, 'Windows存档迁移.json'), 'utf8'));
    assert.equal(marker.source, process.env.GUANDAN_TEST_LEGACY_DIR);
    const imported = await savedGame(page);
    assert.equal(imported.version, 2);
    if (process.env.GUANDAN_TEST_LEGACY_ID) assert.equal(imported.id, process.env.GUANDAN_TEST_LEGACY_ID);
    pass('现有 Windows LevelDB 存档复制与加载');
    await application.close();
    application = null;
  }

  await fs.writeFile(path.join(resultsDir, 'report.json'), JSON.stringify({
    arch: testArch, app: appPath, checks, gameId: afterPlay.id,
    actions: afterPlay.game.actionHistory.length, actingSeats: [...actingSeats],
  }, null, 2) + '\n');
  await fs.rm(path.join(resultsDir, 'failure.txt'), { force: true });
  await fs.rm(scratch, { recursive: true, force: true });
  console.log(`全部通过（${testArch}）。报告：${resultsDir}`);
} catch (error) {
  await fs.writeFile(path.join(resultsDir, 'failure.txt'), String(error.stack || error));
  console.error(`测试失败，临时数据保留在 ${scratch}`);
  throw error;
} finally {
  if (application) await application.close().catch(() => {});
}
