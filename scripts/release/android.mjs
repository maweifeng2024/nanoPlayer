import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const options = process.argv.slice(2).filter((arg) => arg !== '--');
const allowed = new Set(['--debug', '--dry-run', '--build-only']);
try {
  if (options.some((arg) => !allowed.has(arg))) throw new Error('Android packaging accepts --debug, --dry-run, --build-only. Public upload is not enabled.');
  const debug = options.includes('--debug');
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const { versionCode } = JSON.parse(fs.readFileSync(path.join(root, 'packaging/android/version-code.json'), 'utf8'));
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0 || versionCode > 2100000000) throw new Error('Invalid Android versionCode.');
  const signingNames = ['NANOPLAYER_ANDROID_KEYSTORE', 'NANOPLAYER_ANDROID_KEY_ALIAS', 'NANOPLAYER_ANDROID_STORE_PASSWORD', 'NANOPLAYER_ANDROID_KEY_PASSWORD'];
  const variant = debug ? 'debug' : 'release';
  const output = path.join(root, 'artifacts/android', `v${version}-b${versionCode}`, variant);
  const args = ['tauri', 'android', 'build', '--apk', '--target', 'aarch64', ...(debug ? ['--debug'] : [])];
  if (options.includes('--dry-run')) {
    console.log(JSON.stringify({ platform: 'android', version, versionCode, variant, command: ['pnpm', ...args], output, signingRequired: !debug, signingEnvironment: debug ? [] : signingNames, publication: false }, null, 2));
    process.exit(0);
  }
  if (!debug) {
    const missing = signingNames.filter((key) => !process.env[key]);
    if (missing.length) throw new Error(`Release signing requires environment variables: ${missing.join(', ')}. Use --debug for a test APK or --dry-run to inspect the build.`);
    if (!fs.existsSync(process.env.NANOPLAYER_ANDROID_KEYSTORE)) throw new Error('Signing keystore does not exist.');
  }
  const sdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk');
  const java = process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
  const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, NDK_HOME: process.env.NDK_HOME || path.join(sdk, 'ndk/27.2.12479018'), CARGO_HTTP_MULTIPLEXING: process.env.CARGO_HTTP_MULTIPLEXING || 'false', PATH: `${java}/bin:${sdk}/platform-tools:${process.env.PATH}` };
  const run = (command, argv, capture = false) => {
    const result = spawnSync(command, argv, { cwd: root, env, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} failed${result.status == null ? '' : ` (${result.status})`}.`);
    return result.stdout;
  };
  run(process.execPath, ['scripts/android/doctor.mjs']);
  run('pnpm', ['check']);
  run('cargo', ['test', '--manifest-path', 'src-tauri/Cargo.toml']);
  run('pnpm', args);
  const source = path.join(root, `src-tauri/gen/android/app/build/outputs/apk/universal/${variant}/app-universal-${variant}.apk`);
  if (!fs.existsSync(source)) throw new Error('Signed APK was not produced. Check signing and Gradle output.');
  const certificate = run(path.join(sdk, 'build-tools/36.0.0/apksigner'), ['verify', '--verbose', '--print-certs', source], true);
  fs.mkdirSync(output, { recursive: true });
  const name = `nanoPlayer-${version}-b${versionCode}-arm64-${variant}.apk`;
  const destination = path.join(output, name);
  fs.copyFileSync(source, destination);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex');
  fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${sha256}  ${name}\n`);
  fs.writeFileSync(path.join(output, 'signing-verification.txt'), certificate);
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ platform: 'android', applicationId: 'app.nanoplayer.android', version, versionCode, variant, minSdk: 29, abi: 'arm64-v8a', file: name, sha256, sizeBytes: fs.statSync(destination).size, generatedAt: new Date().toISOString(), published: false }, null, 2) + '\n');
  console.log(`Android ${variant} APK verified: ${destination}\nNo tag, upload or desktop update metadata was changed.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
