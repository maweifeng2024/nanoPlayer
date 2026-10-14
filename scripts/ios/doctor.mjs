import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

let missing = 0;
function check(label, ok, detail) {
  console.log(`${ok ? 'OK' : 'MISSING'} ${label}: ${detail}`);
  if (!ok) missing++;
}
function run(command, args) {
  const r = spawnSync(command, args, { encoding: 'utf8', timeout: 30000 });
  return { ok: !r.error && r.status === 0, text: (r.stdout ?? '').trim(), error: (r.stderr ?? '').trim() };
}
check('macOS host', process.platform === 'darwin', process.platform);
for (const [label, cmd, args] of [
  ['Node', 'node', ['--version']], ['pnpm', 'pnpm', ['--version']],
  ['Xcode', 'xcodebuild', ['-version']], ['CocoaPods', 'pod', ['--version']],
  ['XcodeGen', 'xcodegen', ['--version']],
]) {
  const result = run(cmd, args);
  check(label, result.ok, result.text || result.error || 'not found');
}
const targets = run('rustup', ['target', 'list', '--installed']);
for (const target of ['aarch64-apple-ios', 'aarch64-apple-ios-sim'])
  check(target, targets.ok && targets.text.split('\n').includes(target), 'rustup target list --installed');
const sdk = run('xcrun', ['--sdk', 'iphoneos', '--show-sdk-version']);
check('iOS SDK', sdk.ok, sdk.text || sdk.error);
const runtimes = run('xcrun', ['simctl', 'list', 'runtimes', '-j']);
let available = [];
try { available = JSON.parse(runtimes.text).runtimes.filter((r) => r.isAvailable && r.identifier.includes('iOS')); } catch { /* diagnostic below */ }
check('iOS simulator runtime', runtimes.ok && available.length > 0,
  available.map((r) => r.name).join(', ') || 'Xcode > Settings > Components: download iOS Simulator (sandbox errors require host access).');
console.log(`Native project: ${fs.existsSync('src-tauri/gen/apple/project.yml') ? 'initialized' : 'run pnpm ios:init'}`);
console.log('Read-only diagnosis. Signing, native build and device acceptance are separate gates; no account/certificate contents are printed.');
process.exitCode = missing ? 1 : 0;
