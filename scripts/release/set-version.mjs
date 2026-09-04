import fs from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  console.error('Usage: node scripts/release/set-version.mjs <semver>');
  process.exit(1);
}

function updateJson(pathname) {
  const value = JSON.parse(fs.readFileSync(pathname, 'utf8'));
  value.version = version;
  fs.writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`);
}

updateJson(new URL('../../package.json', import.meta.url));
updateJson(new URL('../../src-tauri/tauri.conf.json', import.meta.url));
updateJson(new URL('../../website/package.json', import.meta.url));

const websiteLockPath = new URL('../../website/package-lock.json', import.meta.url);
const websiteLock = JSON.parse(fs.readFileSync(websiteLockPath, 'utf8'));
websiteLock.version = version;
websiteLock.packages[''].version = version;
fs.writeFileSync(websiteLockPath, `${JSON.stringify(websiteLock, null, 2)}\n`);

const cargoPath = new URL('../../src-tauri/Cargo.toml', import.meta.url);
const cargo = fs.readFileSync(cargoPath, 'utf8');
fs.writeFileSync(cargoPath, cargo.replace(/^(\[package\][\s\S]*?^version = ")[^"]+("$)/m, `$1${version}$2`));

const lockPath = new URL('../../src-tauri/Cargo.lock', import.meta.url);
const lock = fs.readFileSync(lockPath, 'utf8');
fs.writeFileSync(lockPath, lock.replace(/(name = "nanoplayer"\nversion = ")[^"]+("\n)/, `$1${version}$2`));

const changelogPath = new URL('../../CHANGELOG.md', import.meta.url);
const changelog = fs.readFileSync(changelogPath, 'utf8');
if (!changelog.includes(`## [${version}]`)) {
  const date = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(changelogPath, changelog.replace('## [Unreleased]', `## [Unreleased]\n\n## [${version}] - ${date}`));
}

console.log(`Set nanoPlayer version to ${version}.`);
