import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoplayer-ios-unit-'));
const binary = path.join(directory, 'state-tests');
try {
  for (const [command, args] of [
    ['xcrun', ['swiftc', 'src-tauri/plugins/nanoplayer-mobile/ios/Sources/PlaybackState.swift', 'src-tauri/plugins/nanoplayer-mobile/ios/Sources/NativeLibrary.swift', 'tests/ios-unit/main.swift', '-o', binary]],
    [binary, []],
  ]) {
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error('iOS native unit test failed.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { fs.rmSync(directory, { recursive: true, force: true }); }
