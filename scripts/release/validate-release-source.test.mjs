import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseSource } from './validate-release-source.mjs';
import { flattenArtifacts } from './artifact-files.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const fixture = () => ({ tag: 'v0.1.6', tagCommit: 'abcdef', repository: 'example/player', run: { head_repository: { full_name: 'example/player' }, head_branch: 'v0.1.6', head_sha: 'abcdef', event: 'push', path: '.github/workflows/release.yml' }, jobs: ['verify', 'Build macOS universal', 'Build Windows x64', 'Build Linux x64'].map(name => ({ name, conclusion: 'success' })), artifacts: ['macos', 'windows', 'linux'].map(name => ({ name, expired: false })) });
test('recovery accepts only complete artifacts from the exact tag', () => {
  validateReleaseSource(fixture());
  for (const mutate of [f => f.run.head_sha = 'wrong', f => f.run.event = 'pull_request', f => f.artifacts[0].expired = true, f => f.jobs[2].conclusion = 'failure']) {
    const value = fixture(); mutate(value); assert.throws(() => validateReleaseSource(value));
  }
});
test('conflicting nested filenames fail before any copies are written', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-artifact-conflict-'));
  try {
    fs.mkdirSync(path.join(dir, 'a')); fs.mkdirSync(path.join(dir, 'b'));
    fs.writeFileSync(path.join(dir, 'a/file.exe'), 'one'); fs.writeFileSync(path.join(dir, 'b/file.exe'), 'two');
    assert.throws(() => flattenArtifacts(dir), /Conflicting/);
    assert.equal(fs.existsSync(path.join(dir, 'file.exe')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
