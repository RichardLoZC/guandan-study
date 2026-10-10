import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { packager } from '@electron/packager';
import {ignoreRuntimeFile} from './package-options.mjs';

if (process.platform !== 'darwin') throw new Error('请在 macOS 上构建，以完成 Universal 合并与本地签名。');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await fs.readFile(path.join(project, 'package.json'), 'utf8'));
const arch = process.env.GUANDAN_BUILD_ARCH || 'universal';
if (!['universal', 'arm64', 'x64'].includes(arch)) throw new Error('GUANDAN_BUILD_ARCH 只能是 universal、arm64 或 x64。');
const dist = path.join(project, 'dist');
// Build and sign on the local filesystem. Cloud providers can attach Finder
// metadata to app bundles that makes macOS code-signature verification fail.
const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'guandan-macos-build-'));
const packages = await packager({
  dir: project, name: '掼蛋研习社',
  appBundleId: 'cn.guandan.study.offline', appCategoryType: 'public.app-category.card-games',
  platform: 'darwin', arch, electronVersion: metadata.devDependencies.electron,
  appVersion: metadata.version, buildVersion: metadata.version,
  asar: true, prune: false, icon: path.join(project, 'build', 'icon.icns'),
  out: path.join(staging, 'packages'), overwrite: true,
  ignore: ignoreRuntimeFile,
  extendInfo: {
    NSHumanReadableCopyright: 'Guandan Study; third-party licenses included',
    NSLocalNetworkUsageDescription: '与同一局域网中的电脑、手机和平板连接，在同一张牌桌上进行掼蛋对局。',
  },
  osxUniversal: { mergeASARs: true },
  osxSign: {
    identity: '-', identityValidation: false,
    preAutoEntitlements: false, preEmbedProvisioningProfile: false,
    optionsForFile: () => ({ hardenedRuntime: false, timestamp: 'none' }),
  },
});
const release = path.join(dist, '掼蛋研习社-macOS离线版');
await fs.mkdir(release, { recursive: true });
const appPath = path.join(staging, '掼蛋研习社.app');
await fs.rename(path.join(packages[0], '掼蛋研习社.app'), appPath);
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
const binary = path.join(appPath, 'Contents', 'MacOS', '掼蛋研习社');
const architectures = execFileSync('/usr/bin/lipo', ['-archs', binary], { encoding: 'utf8' }).trim();
await fs.copyFile(path.join(project, '使用说明.txt'), path.join(release, '使用说明.txt'));
const zipName = `掼蛋研习社-macOS离线版-v${metadata.version}-${arch}.zip`;
const zipPath = path.join(release, zipName);
const localZip = path.join(staging, zipName);
execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, localZip]);
await fs.copyFile(localZip, zipPath);
const hash = createHash('sha256').update(await fs.readFile(zipPath)).digest('hex');
await fs.writeFile(path.join(release, 'SHA256.txt'), `${hash}  ${zipName}\n`);
await fs.writeFile(path.join(release, '构建信息.json'), JSON.stringify({
  name: '掼蛋研习社', version: metadata.version,
  electron: metadata.devDependencies.electron, architectures,
  archive: zipName,
  signed: 'ad-hoc', notarized: false,
}, null, 2) + '\n');
console.log(`本机应用：${appPath}\n架构：${architectures}\n发布包：${zipPath}\n请将 ZIP 解压到本机后运行其中的 .app。`);
