import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { flattenArtifacts } from './artifact-files.mjs';

const directory = process.argv[2];
if (!directory) {
  console.error('Usage: node scripts/release/create-checksums.mjs <artifact-directory>');
  process.exit(1);
}

const absolute = path.resolve(directory);
const files = flattenArtifacts(absolute);

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
