import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

test('failure guidance distinguishes local checks from an interrupted tagged push', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-failure-'));
  try {
    const mock = path.join(temp, 'mock.mjs');
    // Replace every subprocess: this exercises the release entry point without
    // changing versions, staging files, creating tags, or contacting GitHub.
    fs.writeFileSync(mock, `
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
childProcess.execFileSync = (command, args) => {
  const call = command + ' ' + args.join(' ');
  console.log('MOCK: ' + call);
  if (command === 'git') {
    if (args[0] === 'branch') return 'main';
    if (args[0] === 'remote') return 'https://github.com/example/player.git';
    if (args[0] === 'show') return JSON.stringify({ version: '0.1.9' });
    if (args[0] === 'show-ref' || args[0] === 'merge-base') throw new Error('No tag');
    if (args[0] === 'rev-list') return '0 0';
    if (args[0] === 'status') return ' M package.json';
    if (args.includes('push')) throw new Error('Simulated push failure');
  }
  if (command === 'pnpm' && args[0] === 'test:e2e' && process.env.FAILURE_STAGE === 'checks') {
    throw new Error('Simulated E2E failure');
  }
  return '';
};
syncBuiltinESMExports();
`);
    const run = (stage) => spawnSync(process.execPath, [
      '--import', pathToFileURL(mock).href,
      fileURLToPath(new URL('./release.mjs', import.meta.url)), '0.1.10',
    ], { encoding: 'utf8', env: { ...process.env, FAILURE_STAGE: stage } });
    const checks = run('checks');
    assert.equal(checks.status, 1);
    assert.match(checks.stderr, /rerun: pnpm release 0\.1\.10/);
    assert.doesNotMatch(checks.stdout, /MOCK: git (add|commit|tag|.*push)/);
    const push = run('push');
    assert.equal(push.status, 1);
    assert.match(push.stdout, /MOCK: git tag -a v0\.1\.10/);
    assert.match(push.stderr, /pnpm release --resume v0\.1\.10/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
