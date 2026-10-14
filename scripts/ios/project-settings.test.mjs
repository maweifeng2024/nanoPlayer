import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { localSigning, projectTeam, synchronizeProject } from './project-settings.mjs';

test('scene adoption and reproducible Xcode script preserve single-window behavior', () => {
  const source = 'configs:\n  debug: debug\nsettingGroups:\ninfo:\n        LSRequiresIPhoneOS: true\n        CFBundleShortVersionString: 0.1.20\n        CFBundleVersion: "1"\n      - script: if [ "$X" ]; then pnpm tauri ios xcode-script --old; fi\n';
  const next = synchronizeProject(source, { version: '0.1.21', buildNumber: 2 });
  assert.match(next, /UIApplicationSceneManifest:\n          UIApplicationSupportsMultipleScenes: false/);
  assert.match(next, /bash .*scripts\/ios\/xcode-build.sh/);
  assert.match(next, /\.ios-local\/Signing.xcconfig/);
  assert.equal(synchronizeProject(next, { version: '0.1.21', buildNumber: 2 }), next);
  assert.doesNotMatch(next, /DEVELOPMENT_TEAM\s*=/);
});
test('existing manual signing survives regeneration in ignored local storage', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoplayer-signing-test-'));
  const directory = path.join(root, 'src-tauri/gen/apple/nanoplayer.xcodeproj');
  fs.mkdirSync(directory, { recursive: true });
  const audio = path.join(root, 'source.wav');
  const sourceBytes = Buffer.from('synthetic source audio remains byte-identical');
  fs.writeFileSync(audio, sourceBytes);
  try {
    fs.writeFileSync(path.join(directory, 'project.pbxproj'), 'DEVELOPMENT_TEAM = TESTTEAM01;');
    assert.equal(localSigning(root, {}), 'TESTTEAM01');
    fs.writeFileSync(path.join(directory, 'project.pbxproj'), '// regenerated, team comes from xcconfig');
    assert.equal(localSigning(root, {}), 'TESTTEAM01');
    assert.match(fs.readFileSync(path.join(root, '.ios-local/Signing.xcconfig'), 'utf8'), /TESTTEAM01/);
    assert.equal(localSigning(root, { APPLE_DEVELOPMENT_TEAM: 'TESTTEAM02' }), 'TESTTEAM02');
    assert.throws(() => localSigning(root, { APPLE_DEVELOPMENT_TEAM: 'invalid' }));
    assert.throws(() => projectTeam('DEVELOPMENT_TEAM = TESTTEAM01; DEVELOPMENT_TEAM = TESTTEAM02;'));
    assert.deepEqual(fs.readFileSync(audio), sourceBytes);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
