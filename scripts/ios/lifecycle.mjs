import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localSigning } from './project-settings.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
const args = process.argv.slice(3).filter((a) => a !== '--');
const project = path.join(root, 'src-tauri/gen/apple/project.yml');
const initialized = () => fs.existsSync(path.join(root, 'src-tauri/gen/apple/nanoplayer.xcodeproj/project.pbxproj'));
function run(cmd, argv) {
  const developmentTeam = localSigning(root);
  const r = spawnSync(cmd, argv, { cwd: root, stdio: 'inherit', env: {
    ...process.env, IPHONEOS_DEPLOYMENT_TARGET: '16.0', NANOPLAYER_IOS_PREBUILT: 'NO',
    ...(developmentTeam ? { APPLE_DEVELOPMENT_TEAM: developmentTeam } : {}),
    CARGO_HTTP_MULTIPLEXING: process.env.CARGO_HTTP_MULTIPLEXING ?? 'false',
    CARGO_HTTP_TIMEOUT: process.env.CARGO_HTTP_TIMEOUT ?? '30',
  } });
  if (r.error || r.status !== 0) throw new Error(`${cmd} failed (${r.status ?? r.error?.message}).`);
}
try {
  if (process.platform !== 'darwin') throw new Error('iOS requires a macOS host with Xcode.');
  if (mode === 'init') {
    if (args.length) throw new Error('ios:init takes no arguments. Team is supplied via APPLE_DEVELOPMENT_TEAM.');
    // Never silently reinitialize a user-edited Xcode project.
    if (!initialized()) {
      const source = fs.existsSync(project) ? fs.readFileSync(project, 'utf8') : undefined;
      run('pnpm', ['tauri', 'ios', 'init', '--ci', '--skip-targets-install']);
      if (source !== undefined) fs.writeFileSync(project, source);
    }
    run(process.execPath, ['scripts/ios/generate-icons.mjs']);
    run(process.execPath, ['scripts/ios/sync-project.mjs']);
  } else if (mode === 'dev') {
    if (!initialized()) throw new Error('Run pnpm ios:init first.');
    run(process.execPath, ['scripts/ios/sync-project.mjs']);
    run('pnpm', ['tauri', 'ios', 'dev', ...args]);
  } else if (mode === 'build-device') {
    if (args.length) throw new Error('ios:build:debug takes no arguments.');
    if (!initialized()) throw new Error('Run pnpm ios:init first.');
    if (!localSigning(root)) throw new Error('Select your Team in Xcode Signing & Capabilities first.');
    run(process.execPath, ['scripts/ios/sync-project.mjs']);
    run('pnpm', ['tauri', 'ios', 'build', '--target', 'aarch64', '--debug', '--archive-only', '--ci']);
  } else if (mode === 'build-simulator') {
    if (args.length) throw new Error('ios:build:simulator takes no arguments.');
    if (!initialized()) throw new Error('Run pnpm ios:init first.');
    run(process.execPath, ['scripts/ios/sync-project.mjs']);
    run('pnpm', ['tauri', 'ios', 'build', '--target', 'aarch64-sim', '--debug', '--no-sign', '--archive-only', '--ci']);
  } else if (mode === 'test-simulator') {
    const [udid] = args;
    if (args.length !== 1 || !/^[0-9a-f-]{36}$/i.test(udid ?? ''))
      throw new Error('Usage: pnpm ios:test:simulator <simulator-UDID>. Run xcrun simctl list devices available.');
    run(process.execPath, ['scripts/ios/lifecycle.mjs', 'build-simulator']);
    run('xcrun', ['simctl', 'bootstatus', udid, '-b']);
    run('xcodebuild', ['test', '-project', 'src-tauri/gen/apple/nanoplayer.xcodeproj',
      '-scheme', 'nanoplayer_iOS', '-destination', `platform=iOS Simulator,id=${udid}`,
      'CODE_SIGNING_ALLOWED=NO', 'NANOPLAYER_IOS_PREBUILT=YES',
      '-resultBundlePath', path.join(root, 'artifacts/ios/tests', `${udid}-${Date.now()}.xcresult`)]);
  } else throw new Error('Unknown iOS lifecycle stage.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
