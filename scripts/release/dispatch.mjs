import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePlatformArgs } from './platform-options.mjs';

try {
  const { platform, args } = parsePlatformArgs(process.argv.slice(2));

  const result = spawnSync(process.execPath, [fileURLToPath(new URL(platform === 'android' ? './android.mjs' : './release.mjs', import.meta.url)), ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
