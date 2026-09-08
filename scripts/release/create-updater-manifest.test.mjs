import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('release manifest maps signed bundles and refuses incomplete releases', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-updater-test-'));
  try {
    const names = ['nano Player.app.tar.gz', 'nanoPlayer.exe', 'nanoPlayer.AppImage'];
    for (const name of names) {
      fs.writeFileSync(path.join(directory, name), 'test artifact');
      fs.writeFileSync(path.join(directory, `${name}.sig`), 'test signature');
    }
    const run = () => spawnSync(process.execPath, ['scripts/release/create-updater-manifest.mjs', '0.2.0', 'example/player', directory], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'latest.json')));
    assert.equal(manifest.version, '0.2.0');
    assert.equal(Object.keys(manifest.platforms).length, 4);
    assert.equal(manifest.platforms['darwin-aarch64'].url, 'https://github.com/example/player/releases/download/v0.2.0/nano%20Player.app.tar.gz');
    fs.unlinkSync(path.join(directory, 'nanoPlayer.exe.sig'));
    assert.notEqual(run().status, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
