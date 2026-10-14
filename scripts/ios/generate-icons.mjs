import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoplayer-ios-icons-'));
try {
  const r = spawnSync('pnpm', ['tauri', 'icon', 'docs/design/nanoplayer-app-icon-v3.png',
    '--output', temporary, '--ios-color', '#18181b'], { stdio: 'inherit' });
  if (r.error || r.status !== 0) throw new Error('iOS icon generation failed.');
  const destination = 'src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset';
  for (const file of fs.readdirSync(path.join(temporary, 'ios')))
    fs.copyFileSync(path.join(temporary, 'ios', file), path.join(destination, file));
  const catalog = JSON.parse(fs.readFileSync(path.join(destination, 'Contents.json'), 'utf8'));
  if (catalog.images.some((entry) => entry.filename && !fs.existsSync(path.join(destination, entry.filename))))
    throw new Error('Missing image in iOS icon catalog.');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
