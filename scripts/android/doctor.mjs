import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Read-only: never install packages, accept licenses, start adb, or initialize a project.
let missing = 0;
function check(label, ok, detail) {
  console.log(`${ok ? 'OK' : 'MISSING'} ${label}: ${detail}`);
  if (!ok) missing++;
}
function run(command, args) {
  const r = spawnSync(command, args, { encoding: 'utf8', timeout: 15000 });
  return { ok: !r.error && r.status === 0, text: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}
const sdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk');
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java') : 'java';
for (const [label, command, args] of [['Node', 'node', ['--version']], ['pnpm', 'pnpm', ['--version']], ['Rust', 'rustc', ['--version']], ['JDK 21', java, ['-version']]]) {
  const result = run(command, args);
  check(label, result.ok, result.text.split('\n')[0] || 'command not found');
}
check('ANDROID_HOME', fs.existsSync(sdk), sdk);
for (const entry of ['platform-tools/adb', 'cmdline-tools/latest/bin/sdkmanager', 'platforms/android-36/android.jar', 'build-tools/36.0.0/apksigner', 'licenses/android-sdk-license']) {
  check(entry, fs.existsSync(path.join(sdk, entry)), path.join(sdk, entry));
}
const ndk = process.env.NDK_HOME || path.join(sdk, 'ndk/27.2.12479018');
check('NDK 27.2', fs.existsSync(path.join(ndk, 'source.properties')), ndk);
const targets = run('rustup', ['target', 'list', '--installed']);
for (const target of ['aarch64-linux-android', 'x86_64-linux-android']) check(target, targets.ok && targets.text.split('\n').includes(target), 'rustup target list --installed');
console.log('Tool presence only; functional build and device evidence are recorded separately in docs/android/IMPLEMENTATION_STATUS.md.');
process.exitCode = missing ? 1 : 0;
