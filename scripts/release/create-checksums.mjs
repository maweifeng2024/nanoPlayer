import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const directory = process.argv[2];
if (!directory) {
  console.error('Usage: node scripts/release/create-checksums.mjs <artifact-directory>');
  process.exit(1);
}

const absolute = path.resolve(directory);
function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    if (!entry.isFile() || entry.name === 'SHA256SUMS.txt') return [];
    return [fullPath];
  });
}

const discovered = collectFiles(absolute).sort();
const files = [...new Set(discovered.map((source) => {
  const name = path.basename(source);
  const destination = path.join(absolute, name);
  if (source !== destination) {
    if (fs.existsSync(destination)) {
      if (!fs.readFileSync(source).equals(fs.readFileSync(destination))) throw new Error(`Conflicting artifact name: ${name}`);
    } else fs.copyFileSync(source, destination);
  }
  return name;
}))];

if (files.length === 0) {
  console.error(`No artifacts found in ${absolute}`);
  process.exit(1);
}

const lines = files.map((name) => {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(absolute, name))).digest('hex');
  return `${digest}  ${name}`;
});

fs.writeFileSync(path.join(absolute, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
console.log(`Wrote ${files.length} checksums.`);
