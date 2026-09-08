import fs from 'node:fs';
import path from 'node:path';

/** Normalize Actions' nested bundle layout before any manifest consumer runs. */
export function flattenArtifacts(directory) {
  const absolute = path.resolve(directory);
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const source = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected artifact symlink: ${entry.name}`);
    return entry.isDirectory() ? walk(source) : entry.isFile() ? [source] : [];
  });
  const byName = new Map();
  for (const source of walk(absolute).sort()) {
    const name = path.basename(source);
    if (name === 'SHA256SUMS.txt') continue;
    const previous = byName.get(name);
    if (previous && !fs.readFileSync(previous).equals(fs.readFileSync(source))) throw new Error(`Conflicting artifact name: ${name}`);
    byName.set(name, source);
  }
  // Validate all collisions before writing anything. Never alter source bundles.
  for (const [name, source] of byName) {
    const destination = path.join(absolute, name);
    if (source !== destination) fs.copyFileSync(source, destination);
  }
  return [...byName.keys()].sort();
}
