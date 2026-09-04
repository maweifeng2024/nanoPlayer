import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const env = { ...process.env };
const appleKeys = ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_SIGNING_IDENTITY', 'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID'];
// An empty but present certificate triggers Tauri's keychain import.
// Preserve an empty P12 password when a real certificate is supplied.
for (const key of appleKeys) {
  if (!env[key] && !(key === 'APPLE_CERTIFICATE_PASSWORD' && env.APPLE_CERTIFICATE)) delete env[key];
}
if (process.platform === 'darwin') {
  if (env.APPLE_CERTIFICATE) {
    if (!env.APPLE_CERTIFICATE.trim()) throw new Error('APPLE_CERTIFICATE contains only whitespace; supply a Base64-encoded P12.');
    console.log('macOS signing: certificate configured; importing P12.');
  } else {
    console.log('macOS signing: no certificate supplied; no P12 import requested.');
  }
}
const result = spawnSync(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), ...process.argv.slice(2)], { env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
