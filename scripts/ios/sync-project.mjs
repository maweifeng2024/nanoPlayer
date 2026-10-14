import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { localSigning, synchronizeProject } from './project-settings.mjs';

const file = 'src-tauri/gen/apple/project.yml';
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const allocation = JSON.parse(fs.readFileSync('packaging/ios/build-number.json', 'utf8'));
if (allocation.version !== version || !Number.isSafeInteger(allocation.buildNumber) || allocation.buildNumber < 1)
  throw new Error('Allocate a unique iOS build number for this version in packaging/ios/build-number.json first.');
const configPath = 'src-tauri/tauri.ios.conf.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.bundle.iOS.bundleVersion = String(allocation.buildNumber);
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
let text = fs.readFileSync(file, 'utf8');
localSigning(process.cwd());
text = synchronizeProject(text, { version, buildNumber: allocation.buildNumber });
if (!text.includes('UIBackgroundModes:')) text = text.replace('        LSRequiresIPhoneOS: true',
  '        LSRequiresIPhoneOS: true\n        UIBackgroundModes: [audio]\n        NSLocalNetworkUsageDescription: "开启 Wi-Fi 传歌时允许同一 Wi-Fi 的设备上传音乐。"');
if (!text.includes('nanoplayerUITests:')) {
  text += `\n  nanoplayerUITests:\n    type: bundle.ui-testing\n    platform: iOS\n    sources:\n      - path: ../../../tests/ios\n    dependencies:\n      - target: nanoplayer_iOS\n    settings:\n      base:\n        GENERATE_INFOPLIST_FILE: YES\n        PRODUCT_BUNDLE_IDENTIFIER: app.nanoplayer.ios.uitests\n`;
}
text = text.replace(/      testTargets: \[nanoplayerUITests\]\n/g, '');
const scheme = text.indexOf('    scheme:\n', text.indexOf('\ntargets:'));
if (scheme < 0) throw new Error('Missing iOS target scheme in generated template.');
text = text.slice(0, scheme) + text.slice(scheme).replace('    scheme:\n',
  '    scheme:\n      testTargets: [nanoplayerUITests]\n');
fs.writeFileSync(file, text);
for (const directory of ['Externals', 'assets'])
  fs.mkdirSync(`src-tauri/gen/apple/${directory}`, { recursive: true });
const result = spawnSync('xcodegen', ['generate', '--spec', file], { stdio: 'inherit' });
if (result.error || result.status !== 0) throw new Error('Xcode project regeneration failed.');
