import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { releaseManifest } from './sync-release.mjs';
const repository = 'example/player';
const hash = 'a'.repeat(64);
const assets = ['player_universal.dmg', 'player_x64.exe', 'player_amd64.deb'].map(name => ({ name, state: 'uploaded', size: 100, digest: `sha256:${hash}`, browser_download_url: `https://github.com/${repository}/releases/download/v1.2.3/${name}` }));
const release = { tag_name: 'v1.2.3', published_at: '2026-10-26T00:00:00Z', html_url: `https://github.com/${repository}/releases/tag/v1.2.3`, assets };
const checksums = assets.map(a => `${hash}  ${a.name}`).join('\n');
test('published assets map to all three platforms with exact metadata', () => {
  const result = releaseManifest(release, checksums, repository);
  assert.equal(result.version, '1.2.3');
  assert.deepEqual(Object.values(result.platforms).map(a => a.length), [1, 1, 1]);
  assert.equal(result.platforms.macos[0].architecture, 'universal');
  assert.equal(result.platforms.windows[0].sha256, hash);
});
test('reject incomplete, prerelease, mismatching digest and URL', () => {
  for (const invalid of [
    { ...release, prerelease: true },
    { ...release, assets: assets.slice(1) },
    { ...release, assets: [{ ...assets[0], digest: 'sha256:bad' }, ...assets.slice(1)] },
    { ...release, assets: [{ ...assets[0], browser_download_url: 'https://example.com/untrusted' }, ...assets.slice(1)] },
  ]) assert.throws(() => releaseManifest(invalid, checksums, repository));
  assert.throws(() => releaseManifest(release, '', repository));
});
test('Cloudflare serves static export with custom 404 and explicit production domain', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../../website/wrangler.jsonc', import.meta.url)));
  assert.equal(config.assets.directory, './out');
  assert.equal(config.assets.not_found_handling, '404-page');
  assert.deepEqual(config.routes, [{ pattern: 'nanoplayer.nanodo.cc', custom_domain: true }]);
  const workflow = fs.readFileSync(new URL('../../.github/workflows/publish-release.yml', import.meta.url), 'utf8');
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(workflow, /VERCEL_TOKEN|vercel@/);
  assert.match(workflow, /persist-website-manifest/);
});
