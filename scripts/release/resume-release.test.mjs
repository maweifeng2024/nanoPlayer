import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const missing of ['verify', 'Build macOS universal', 'Build Windows x64', 'Build Linux x64']) {
  test(`recovery rejects unsuccessful ${missing} before dispatch`, () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-source-'));
    try {
      fs.writeFileSync(path.join(temp, 'gh'), `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('release.yml')) console.log(JSON.stringify([{databaseId: 1, status: 'completed'}]));
else if (args.includes('list')) console.log('[]');
else if (args.includes('view')) console.log(JSON.stringify({jobs: ${JSON.stringify(['verify', 'Build macOS universal', 'Build Windows x64', 'Build Linux x64'].map(name => ({ name, conclusion: name === missing ? 'failure' : 'success' })))} }));
else { console.error('Unexpected dispatch: ' + args.join(' ')); process.exit(99); }
`, { mode: 0o755 });
      assert.throws(() => execFileSync(process.execPath, [fileURLToPath(new URL('./resume-release.mjs', import.meta.url)), 'v0.1.6'], {
        encoding: 'utf8', stdio: 'pipe', env: { ...process.env, PATH: `${temp}${path.delimiter}${process.env.PATH}` },
      }), error => error.status === 1 && error.stderr.includes(`source job did not succeed: ${missing}`) && !error.stderr.includes('Unexpected dispatch'));
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
}

test('resuming a completed recovery never dispatches another deployment', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-release-'));
  try {
    const gh = path.join(temp, 'gh');
    fs.writeFileSync(gh, `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('release.yml')) console.log(JSON.stringify([{databaseId: 1, status: 'completed'}]));
else if (args.includes('publish-release.yml') && args.includes('list')) console.log(JSON.stringify([{databaseId: 2, displayTitle: 'Publish v0.1.6 from run 1', status: 'completed', conclusion: 'success', url: 'https://example.test/run/2'}]));
else { console.error('Unexpected command: ' + args.join(' ')); process.exit(99); }
`, { mode: 0o755 });
    const output = execFileSync(process.execPath, [fileURLToPath(new URL('./resume-release.mjs', import.meta.url)), 'v0.1.6'], {
      encoding: 'utf8', env: { ...process.env, PATH: `${temp}${path.delimiter}${process.env.PATH}` },
    });
    assert.match(output, /already completed successfully/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
