'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { prepareDataPath, migrateLegacyStorage } = require('../storage.cjs');

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guandan-storage-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('macOS data stays outside the application bundle', t => {
  const base = temporary(t);
  const appData = path.join(base, 'Library', 'Application Support');
  const executableDir = path.join(base, '掼蛋研习社.app', 'Contents', 'MacOS');
  const result = prepareDataPath({ platform: 'darwin', appData, executableDir });
  assert.equal(result.dataPath, path.join(appData, 'GuandanStudyOffline'));
  assert.ok(fs.existsSync(result.sessionPath));
  assert.equal(fs.existsSync(executableDir), false);
});

test('a test data override must be absolute', t => {
  const base = temporary(t);
  assert.throws(() => prepareDataPath({ platform: 'darwin', appData: base, override: 'relative' }), /绝对路径/);
});

test('first launch copies Windows saves without modifying the source', t => {
  const base = temporary(t);
  const legacy = path.join(base, 'Windows', '掼蛋数据');
  const leveldb = path.join(legacy, '浏览器数据', 'Local Storage', 'leveldb');
  fs.mkdirSync(leveldb, { recursive: true });
  fs.writeFileSync(path.join(leveldb, 'CURRENT'), 'MANIFEST-000001\n');
  fs.writeFileSync(path.join(leveldb, '000003.log'), 'saved game');
  const sessionPath = path.join(base, 'Mac', '浏览器数据');
  fs.mkdirSync(sessionPath, { recursive: true });
  assert.equal(migrateLegacyStorage(sessionPath, [path.join(base, 'missing'), legacy]), legacy);
  const copied = path.join(sessionPath, 'Local Storage', 'leveldb', '000003.log');
  assert.equal(fs.readFileSync(copied, 'utf8'), 'saved game');
  fs.writeFileSync(copied, 'new Mac game');
  assert.equal(migrateLegacyStorage(sessionPath, [legacy]), null);
  assert.equal(fs.readFileSync(copied, 'utf8'), 'new Mac game');
  assert.equal(fs.readFileSync(path.join(leveldb, '000003.log'), 'utf8'), 'saved game');
});
