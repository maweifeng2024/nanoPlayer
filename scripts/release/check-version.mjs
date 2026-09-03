import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const tauri = JSON.parse(fs.readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const cargo = fs.readFileSync(new URL('../../src-tauri/Cargo.toml', import.meta.url), 'utf8');
const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];

const versions = { package: pkg.version, tauri: tauri.version, cargo: cargoVersion };
const unique = new Set(Object.values(versions));

if (unique.size !== 1 || unique.has(undefined)) {
  console.error('Version mismatch:', versions);
  process.exit(1);
}

console.log(`Version ${pkg.version} is consistent.`);

