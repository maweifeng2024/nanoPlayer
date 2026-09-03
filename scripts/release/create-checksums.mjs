import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const directory = process.argv[2];
if (!directory) {
  console.error('Usage: node scripts/release/create-checksums.mjs <artifact-directory>');
  process.exit(1);
}

const absolute = path.resolve(directory);
const files = fs.readdirSync(absolute, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name !== 'SHA256SUMS.txt')
  .map((entry) => entry.name)
  .sort();

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

