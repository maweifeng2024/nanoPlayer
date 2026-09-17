import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePlatformArgs } from './platform-options.mjs';

test('existing desktop release and recovery arguments pass through', () => {
  assert.deepEqual(parsePlatformArgs(['--', '--resume', 'v0.1.7']), { platform: 'desktop', args: ['--resume', 'v0.1.7'] });
  assert.deepEqual(parsePlatformArgs(['--platform=desktop', '0.2.0']), { platform: 'desktop', args: ['0.2.0'] });
  for (const args of [['--platform'], ['--platform', 'ios'], ['--platform=android', '--platform=desktop']]) assert.throws(() => parsePlatformArgs(args));
});

test('Android request fails before invoking desktop release even outside a Git repo', () => {
  const script = new URL('./dispatch.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [fileURLToPath(script), '--platform', 'android', '--skip-checks'], { cwd: '/tmp', encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Android packaging accepts/);
  assert.doesNotMatch(result.stderr, /not a git repository/);
});

test('Android dry run uses independent versionCode and never publishes', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./dispatch.mjs', import.meta.url)), '--platform', 'android', '--dry-run'], { cwd: '/tmp', encoding: 'utf8' });
  assert.equal(result.status, 0);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.platform, 'android');
  assert.equal(plan.publication, false);
  assert.equal(plan.signingRequired, true);
  assert.ok(plan.versionCode > 0);
});
