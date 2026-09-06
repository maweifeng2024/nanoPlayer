import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [version, repository, artifactDirectory, outputPath] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '') || !repository || !artifactDirectory) {
  console.error('Usage: node scripts/release/update-website-release.mjs <version> <owner/repo> <artifact-directory>');
  process.exit(1);
}

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    if (!entry.isFile() || entry.name === 'SHA256SUMS.txt') return [];
    return [fullPath];
  });
}

const files = collectFiles(artifactDirectory).sort();

function platformFor(name) {
  if (/\.(dmg|app\.tar\.gz)$/i.test(name)) return 'macos';
  if (/\.(msi|exe)$/i.test(name)) return 'windows';
  if (/\.(AppImage|deb|rpm)$/i.test(name)) return 'linux';
  return null;
}

function architectureFor(name) {
  if (/universal/i.test(name)) return 'universal';
  if (/(aarch64|arm64)/i.test(name)) return 'aarch64';
  if (/(x86_64|amd64|x64)/i.test(name)) return 'x86_64';
  return 'platform-default';
}

function formatFor(name) {
  if (/\.app\.tar\.gz$/i.test(name)) return 'app archive';
  return path.extname(name).slice(1);
}

const platforms = { macos: [], windows: [], linux: [] };
for (const filePath of files) {
  const name = path.basename(filePath);
  const platform = platformFor(name);
  if (!platform) continue;
  const bytes = fs.readFileSync(filePath);
  platforms[platform].push({
    name,
    architecture: architectureFor(name),
    format: formatFor(name),
    url: `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(name)}`,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
  });
}

for (const platform of ['macos', 'windows']) {
  if (platforms[platform].length === 0) throw new Error(`No ${platform} release artifact was found.`);
}

const manifest = {
  version,
  available: true,
  publishedAt: new Date().toISOString().slice(0, 10),
  releaseUrl: `https://github.com/${repository}/releases/tag/v${version}`,
  checksumsUrl: `https://github.com/${repository}/releases/download/v${version}/SHA256SUMS.txt`,
  signed: false,
  platforms,
};

const manifestPath = outputPath ? path.resolve(outputPath) : new URL('../../website/public/downloads/latest.json', import.meta.url);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Updated website release manifest for v${version} with ${files.length} files.`);
