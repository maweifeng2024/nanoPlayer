import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { verifyWebsite } from './verify-website.mjs';

test('website verification retries propagation 404 but rejects stale or incomplete releases', async () => {
  let ready = false;
  let version = '0.1.6';
  const server = createServer((request, response) => {
    if (!ready) { ready = true; response.writeHead(404); response.end('not ready'); return; }
    const asset = { url: `https://github.com/example/player/releases/download/v${version}/file`, sha256: 'a'.repeat(64), size: 10 };
    response.end(request.url === '/' ? '播放你电脑里的音乐' : request.url === '/download' ? `macOS v${version}` : JSON.stringify({ version, platforms: { macos: [asset], windows: [asset], linux: [asset] } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    await verifyWebsite(url, '0.1.6', { attempts: 2, retryDelayMs: 1 });
    version = '0.1.5';
    await assert.rejects(verifyWebsite(url, '0.1.6', { attempts: 1 }), /version mismatch/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
