import fs from 'node:fs';
import path from 'node:path';

const [version, repository, directory] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !directory) throw new Error('Expected stable version, owner/repository and artifact directory');
const files = fs.readdirSync(directory);
const asset = (suffix) => {
  const matches = files.filter(name => name.endsWith(suffix));
  if (matches.length !== 1) throw new Error(`Expected one ${suffix} updater artifact, found ${matches.length}`);
  const name = matches[0];
  const signature = fs.readFileSync(path.join(directory, `${name}.sig`), 'utf8').trim();
  if (!signature) throw new Error(`Empty signature: ${name}`);
  return { signature, url: `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(name)}` };
};
const mac = asset('.app.tar.gz');
const platforms = { 'darwin-aarch64': mac, 'darwin-x86_64': mac, 'windows-x86_64': asset('.exe'), 'linux-x86_64': asset('.AppImage') };
fs.writeFileSync(path.join(directory, 'latest.json'), JSON.stringify({ version, notes: `nanoPlayer ${version}`, pub_date: new Date().toISOString(), platforms }, null, 2) + '\n');
console.log(`Verified signed update artifacts for ${Object.keys(platforms).join(', ')}`);
