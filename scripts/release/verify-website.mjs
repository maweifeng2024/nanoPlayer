import { pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers/promises';

export async function verifyWebsite(baseURL, version, { attempts = 10, retryDelayMs = 5000 } = {}) {
  const base = new URL(baseURL).origin;
  let failure;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const paths = ['/', '/download', '/downloads/latest.json'];
      const [home, download, data] = await Promise.all(paths.map(async path => {
        const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } });
        if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
        return response.text();
      }));
      if (!home.includes('播放你电脑里的')) throw new Error('Homepage content missing');
      if (!download.includes('macOS') || !download.includes(`v${version}`)) throw new Error('Download page content or version mismatch');
      const manifest = JSON.parse(data);
      if (manifest.version !== version) throw new Error(`Version is ${manifest.version}; expected ${version}`);
      for (const platform of ['macos', 'windows', 'linux']) {
        if (!manifest.platforms?.[platform]?.length) throw new Error(`No ${platform} downloads`);
        for (const asset of manifest.platforms[platform]) {
          if (!asset.url?.includes(`/releases/download/v${version}/`) || !/^[a-f\d]{64}$/.test(asset.sha256 ?? '') || !(asset.size > 0)) throw new Error(`Invalid ${platform} asset metadata`);
        }
      }
      console.log(`Verified ${base}: homepage, download page and v${version} manifest for all three platforms.`);
      return;
    } catch (error) {
      failure = error;
      console.log(`Readiness check ${attempt}/${attempts} for ${base}: ${error.message}`);
      if (attempt < attempts) await setTimeout(retryDelayMs);
    }
  }
  throw new Error(`Website verification failed: ${failure.message}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [url, version] = process.argv.slice(2);
  if (!url || !/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Usage: verify-website.mjs <url> <version>');
  await verifyWebsite(url, version);
}
