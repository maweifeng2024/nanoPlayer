import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function releaseManifest(release, checksums, repository) {
  const version = release.tag_name?.replace(/^v/, '');
  if (release.draft || release.prerelease || !/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Expected published stable release');
  const hashes = new Map(checksums.trim().split(/\r?\n/).map(line => {
    const match = /^([a-f\d]{64})\s+\*?(.+)$/.exec(line);
    if (!match) throw new Error('Invalid checksum line');
    return [match[2], match[1]];
  }));
  const platforms = { macos: [], windows: [], linux: [] };
  for (const asset of release.assets) {
    const name = asset.name;
    const platform = /\.(dmg|app\.tar\.gz)$/.test(name) ? 'macos' : /\.(exe|msi)$/.test(name) ? 'windows' : /\.(rpm|deb|AppImage)$/.test(name) ? 'linux' : null;
    if (!platform) continue;
    const sha256 = hashes.get(name);
    const url = `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(name)}`;
    if (!sha256 || asset.digest !== `sha256:${sha256}` || asset.state !== 'uploaded' || !(asset.size > 0) || asset.browser_download_url !== url) throw new Error(`Unverified asset: ${name}`);
    platforms[platform].push({ name, architecture: /universal/i.test(name) ? 'universal' : /(aarch64|arm64)/i.test(name) ? 'aarch64' : /(x86_64|amd64|x64)/i.test(name) ? 'x86_64' : 'platform-default', format: name.endsWith('.app.tar.gz') ? 'app archive' : name.split('.').at(-1), url, sha256, size: asset.size });
  }
  if (Object.values(platforms).some(assets => !assets.length)) throw new Error('Missing desktop platform');
  return { version, available: true, publishedAt: release.published_at.slice(0, 10), releaseUrl: release.html_url, checksumsUrl: `https://github.com/${repository}/releases/download/v${version}/SHA256SUMS.txt`, signed: false, platforms };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repository = 'maweifeng2024/nanoPlayer';
  const release = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/releases/latest`], { encoding: 'utf8' }));
  const checksumAsset = release.assets.find(asset => asset.name === 'SHA256SUMS.txt');
  if (!checksumAsset) throw new Error('Missing published checksums');
  const checksums = execFileSync('gh', ['api', `repos/${repository}/releases/assets/${checksumAsset.id}`, '-H', 'Accept: application/octet-stream'], { encoding: 'utf8' });
  const manifest = releaseManifest(release, checksums, repository);
  fs.writeFileSync(new URL('../../website/public/downloads/latest.json', import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Verified published v${manifest.version}: ${Object.values(manifest.platforms).flat().length} downloads. Manifest updated.`);
}
