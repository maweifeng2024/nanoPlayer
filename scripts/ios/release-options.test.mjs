import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIOSReleaseArgs } from './release-options.mjs';

test('simulator is local and unsigned; device signing/export is explicit', () => {
  assert.equal(parseIOSReleaseArgs(['--', '--simulator', '--debug']).simulator, true);
  assert.equal(parseIOSReleaseArgs(['--device', '--export-method', 'release-testing']).exportMethod, 'release-testing');
});
test('reject ambiguous targets, invalid options and publication', () => {
  for (const args of [[], ['--simulator'], ['--simulator', '--device'], ['--device', '--upload'],
    ['--device', '--skip-checks'], ['--device', '--export-method', 'ad-hoc'], ['--device', '--device']])
    assert.throws(() => parseIOSReleaseArgs(args));
});
