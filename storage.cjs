'use strict';
const fs = require('node:fs');
const path = require('node:path');

function prepareDataPath({ platform, appData, executableDir, override }) {
  if (override && !path.isAbsolute(override)) {
    throw new Error('GUANDAN_DATA_DIR 必须是绝对路径。');
  }
  const requested = override || (platform === 'win32'
    ? path.join(executableDir, '掼蛋数据')
    : path.join(appData, 'GuandanStudyOffline'));
  let dataPath = requested;
  let fallback = false;
  try {
    ensureWritable(dataPath);
  } catch (error) {
    if (override || platform !== 'win32') throw error;
    dataPath = path.join(appData, 'GuandanStudyOffline');
    ensureWritable(dataPath);
    fallback = true;
  }
  const sessionPath = path.join(dataPath, '浏览器数据');
  fs.mkdirSync(sessionPath, { recursive: true });
  return { dataPath, sessionPath, fallback };
}

function ensureWritable(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const probe = path.join(directory, '.write-check-' + process.pid);
  fs.writeFileSync(probe, '', { flag: 'wx' });
  fs.unlinkSync(probe);
}

// Copy only localStorage on the first launch. Never edit the Windows profile.
function migrateLegacyStorage(sessionPath, candidates) {
  const destination = path.join(sessionPath, 'Local Storage');
  if (fs.existsSync(destination)) return null;
  for (const candidate of candidates) {
    const source = path.join(candidate, '浏览器数据', 'Local Storage');
    const leveldb = path.join(source, 'leveldb');
    if (!fs.existsSync(path.join(leveldb, 'CURRENT'))) continue;
    const staging = destination + '.migrating-' + process.pid;
    try {
      fs.cpSync(source, staging, { recursive: true, errorOnExist: true, force: false });
      fs.renameSync(staging, destination);
    } catch (error) {
      fs.rmSync(staging, { recursive: true, force: true });
      throw error;
    }
    return candidate;
  }
  return null;
}

module.exports = { prepareDataPath, migrateLegacyStorage };
