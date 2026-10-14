import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseIOSReleaseArgs } from './release-options.mjs';
import { localSigning } from './project-settings.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
let temporary;
const env = { ...process.env, IPHONEOS_DEPLOYMENT_TARGET: '16.0', NANOPLAYER_IOS_PREBUILT: 'NO', pnpm_config_verify_deps_before_run: 'false', CARGO_HTTP_MULTIPLEXING: process.env.CARGO_HTTP_MULTIPLEXING ?? 'false', CARGO_HTTP_TIMEOUT: process.env.CARGO_HTTP_TIMEOUT ?? '30' };
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.error?.message}).`);
  return result.stdout;
}
function files(directory, suffix) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(directory, entry.name);
    if (entry.name.endsWith(suffix)) return [name];
    return entry.isDirectory() ? files(name, suffix) : [];
  });
}
function plist(file, key) { return run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, file], true).trim(); }
try {
  const options = parseIOSReleaseArgs(process.argv.slice(2));
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const { version: allocatedVersion, buildNumber } = JSON.parse(fs.readFileSync(path.join(root, 'packaging/ios/build-number.json'), 'utf8'));
  if (version !== allocatedVersion || !Number.isSafeInteger(buildNumber) || buildNumber < 1)
    throw new Error('The shared version needs an allocated iOS build number.');
  const kind = options.simulator ? 'simulator-debug' : options.debug ? 'device-debug' : 'device-release';
  const output = path.join(root, 'artifacts/ios', `v${version}-b${buildNumber}`, kind);
  const buildArgs = ['tauri', 'ios', 'build', '--target', options.simulator ? 'aarch64-sim' : 'aarch64', '--ci',
    ...(options.debug ? ['--debug'] : []), ...(options.simulator ? ['--no-sign', '--archive-only'] : ['--export-method', options.exportMethod])];
  if (options.dryRun) {
    console.log(JSON.stringify({ version, buildNumber, output, command: ['pnpm', ...buildArgs],
      signingRequired: options.device, publication: false }, null, 2));
  } else {
    if (process.platform !== 'darwin') throw new Error('iOS packaging requires macOS/Xcode.');
    const developmentTeam = localSigning(root);
    if (developmentTeam) env.APPLE_DEVELOPMENT_TEAM = developmentTeam;
    if (options.device && !developmentTeam)
      throw new Error('Set APPLE_DEVELOPMENT_TEAM and configure the matching Xcode signing identity/profile. Device export is not ready without them.');
    if (fs.existsSync(path.join(output, 'manifest.json')))
      throw new Error('This build already has an artifact. Allocate a new iOS build number; never overwrite a delivered build.');
    run(process.execPath, ['scripts/ios/doctor.mjs']);
    run(process.execPath, ['scripts/release/check-version.mjs']);
    run('pnpm', ['check']);
    run('pnpm', ['test:e2e']);
    run('cargo', ['fmt', '--check', '--manifest-path', 'src-tauri/Cargo.toml']);
    run('cargo', ['clippy', '--manifest-path', 'src-tauri/Cargo.toml', '--', '-D', 'warnings']);
    run('cargo', ['test', '--manifest-path', 'src-tauri/Cargo.toml']);
    run('cargo', ['test', '--manifest-path', 'src-tauri/Cargo.toml', 'database::tests::search_benchmark_10000_tracks', '--', '--ignored', '--exact']);
    const releaseTests = fs.readdirSync(path.join(root, 'scripts/release')).filter((f) => f.endsWith('.test.mjs')).map((f) => `scripts/release/${f}`);
    const iosTests = fs.readdirSync(path.join(root, 'scripts/ios')).filter((f) => f.endsWith('.test.mjs')).map((f) => `scripts/ios/${f}`);
    run(process.execPath, ['--test', ...releaseTests, ...iosTests]);
    run('pnpm', ['website:build']);
    run(process.execPath, ['scripts/ios/test-unit.mjs']);
    run(process.execPath, ['scripts/ios/sync-project.mjs']);
    const started = Date.now();
    run('pnpm', buildArgs);
    const buildDir = path.join(root, 'src-tauri/gen/apple/build');
    let source;
    let app;
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoplayer-ios-package-'));
    if (options.device) {
      const candidates = files(buildDir, '.ipa').filter((f) => fs.statSync(f).mtimeMs >= started);
      if (candidates.length !== 1) throw new Error('Expected exactly one freshly exported IPA.');
      source = candidates[0];
      run('unzip', ['-t', source]);
      run('unzip', ['-q', source, '-d', temporary]);
      const apps = files(path.join(temporary, 'Payload'), '.app');
      if (apps.length !== 1) throw new Error('Expected one application inside the IPA.');
      app = apps[0];
    } else {
      const apps = files(buildDir, '.app').filter((f) => {
        const info = path.join(f, 'Info.plist');
        return fs.existsSync(info) && fs.statSync(info).mtimeMs >= started &&
          plist(info, 'CFBundleSupportedPlatforms:0') === 'iPhoneSimulator';
      });
      if (apps.length !== 1) throw new Error('Expected exactly one freshly built simulator app.');
      app = apps[0];
      source = path.join(temporary, `nanoPlayer-${version}-b${buildNumber}-arm64-simulator.zip`);
      run('ditto', ['-c', '-k', '--keepParent', app, source]);
    }
    const info = path.join(app, 'Info.plist');
    if (plist(info, 'CFBundleIdentifier') !== 'app.nanoplayer.ios' ||
      plist(info, 'CFBundleShortVersionString') !== version || plist(info, 'CFBundleVersion') !== String(buildNumber))
      throw new Error('Packaged application identity/version/build does not match allocated source.');
    const binary = path.join(app, plist(info, 'CFBundleExecutable'));
    const architectures = run('lipo', ['-archs', binary], true).trim();
    if (architectures !== 'arm64') throw new Error(`Unexpected architecture: ${architectures}`);
    let signing = 'Unsigned simulator package; not installable on iPhone/iPad hardware.\n';
    if (options.device) {
      run('codesign', ['--verify', '--deep', '--strict', app]);
      if (!fs.existsSync(path.join(app, 'embedded.mobileprovision'))) throw new Error('Missing device provisioning profile.');
      const signed = spawnSync('codesign', ['-d', '--verbose=4', app], { encoding: 'utf8' });
      if (signed.status !== 0 || !signed.stderr.includes('TeamIdentifier=')) throw new Error('Missing signing team evidence.');
      signing = signed.stderr;
    }
    fs.mkdirSync(output, { recursive: true });
    const name = options.device ? `nanoPlayer-${version}-b${buildNumber}-arm64-${kind}.ipa` : path.basename(source);
    fs.copyFileSync(source, path.join(output, name));
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
    fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${sha256}  ${name}\n`);
    fs.writeFileSync(path.join(output, 'signing-verification.txt'), signing);
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ platform: 'ios', version, buildNumber,
      applicationId: 'app.nanoplayer.ios', architectures, minimumSystemVersion: plist(info, 'MinimumOSVersion'),
      kind, file: name, sha256, sizeBytes: fs.statSync(source).size, signed: options.device,
      installed: false, deviceAccepted: false, published: false, generatedAt: new Date().toISOString() }, null, 2) + '\n');
    console.log(`Local iOS artifact verified: ${path.join(output, name)}\nInstall/device qualification and publication are separate.`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); }
