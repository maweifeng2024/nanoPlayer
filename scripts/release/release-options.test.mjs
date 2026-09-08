import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReleaseArgs, releaseIsComplete } from './release-options.mjs';

test('release arguments reject typos and unsupported prereleases before any mutation', () => {
  for (const args of [['--resum'], ['0.1.7-beta.1'], ['0.1.7', '0.1.8'], ['--resume', '--skip-checks']]) {
    assert.throws(() => parseReleaseArgs(args), /Usage/);
  }
  assert.equal(parseReleaseArgs(['v0.1.7']).explicitVersion, '0.1.7');
  assert.equal(parseReleaseArgs(['--resume', '0.1.6']).resumeTag, 'v0.1.6');
});

test('successful recovery resolves the failed original release without confusing tags', () => {
  const original = { status: 'completed', conclusion: 'failure' };
  const recovery = { displayTitle: 'Publish v0.1.6 from run 123', status: 'completed', conclusion: 'success' };
  assert.equal(releaseIsComplete('v0.1.6', original, [recovery]), true);
  assert.equal(releaseIsComplete('v0.1.7', original, [recovery]), false);
  assert.equal(releaseIsComplete('v0.1.6', original, [{ ...recovery, conclusion: 'failure' }]), false);
  assert.equal(releaseIsComplete('v0.1.6', { status: 'completed', conclusion: 'success' }, []), true);
});
