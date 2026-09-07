import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
test('nested artifacts survive repeat checksum generation and produce all three platforms once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoplayer-artifact-test-'));
  try {
    for (const name of ['dmg/test_universal.dmg', 'msi/test_x64.msi', 'deb/test_amd64.deb']) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), name);
    }
    for (let i = 0; i < 2; i++) execFileSync(process.execPath, ['scripts/release/create-checksums.mjs', dir]);
    assert.equal(fs.readFileSync(path.join(dir, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').length, 3);
    const manifest = path.join(dir, 'result.json');
    execFileSync(process.execPath, ['scripts/release/update-website-release.mjs', '9.9.9', 'owner/repo', dir, manifest]);
    for (const assets of Object.values(JSON.parse(fs.readFileSync(manifest)).platforms)) assert.equal(assets.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
