import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
