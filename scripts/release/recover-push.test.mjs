import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverPush } from './recover-push.mjs';

function fixture({ remote = '', dirty = '', divergent = false, networkError = false } = {}) {
  const calls = [];
  return { calls, io: {
    output: (_, args) => args[0] === 'rev-parse' ? 'local-sha' : dirty,
    succeeds: (_, args) => !(divergent && args.includes('origin/main')),
    network: args => { calls.push(args); if (networkError) throw new Error('connection failed'); return remote; },
    watch: tag => calls.push(['watch', tag]),
  } };
}
test('resume pushes an existing local tag and main before watching, without creating a version or dispatching recovery', () => {
  const { calls, io } = fixture();
  assert.equal(recoverPush('v0.1.7', io), true);
  assert.deepEqual(calls.slice(1), [['push', '--atomic', 'origin', 'main', 'refs/tags/v0.1.7'], ['watch', 'v0.1.7']]);
});
test('already-pushed tag continues to workflow recovery; mismatches and uncertain network fail closed', () => {
  assert.equal(recoverPush('v0.1.7', fixture({ remote: 'tag-object\trefs/tags/v0.1.7\nlocal-sha\trefs/tags/v0.1.7^{}' }).io), false);
  for (const options of [{ remote: 'different\trefs/tags/v0.1.7' }, { dirty: ' M file' }, { divergent: true }, { networkError: true }]) {
    const { calls, io } = fixture(options);
    assert.throws(() => recoverPush('v0.1.7', io));
    assert.equal(calls.some(args => args[0] === 'push'), false);
  }
});
