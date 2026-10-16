import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoplayer-wifi-test-'));
let server;
let browser;
try {
  const binary = path.join(directory, 'wifi-test');
  const sources = ['PlaybackState', 'NativeLibrary', 'WifiReceiver', 'WifiPage'].map(name => `src-tauri/plugins/nanoplayer-mobile/ios/Sources/${name}.swift`);
  const compile = spawnSync('xcrun', ['swiftc', ...sources, 'tests/ios-wifi/main.swift', '-o', binary], { stdio: 'inherit' });
  assert.equal(compile.status, 0, 'Compile the production LAN receiver against macOS SDK');
  server = spawn(binary, [directory], { stdio: ['ignore', 'pipe', 'pipe'] });
  const info = await new Promise((resolve, reject) => {
    let output = '', error = '';
    const timer = setTimeout(() => reject(Error('LAN receiver did not become ready')), 15000);
    server.stderr.on('data', value => { error += value; });
    server.once('exit', () => { clearTimeout(timer); reject(Error(error || 'LAN receiver exited')); });
    server.stdout.on('data', value => { output += value; if (output.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(output.split('\n')[0])); } });
  });
  let token = '';
  const post = (route, body, headers = {}) => fetch(info.address + route, {
    method: 'POST', headers: { Origin: info.address, 'X-Session-Token': token, ...headers }, body,
    signal: AbortSignal.timeout(10000),
  });
  assert.equal((await post('/api', '{}')).status, 401, 'Directory data requires pairing');
  assert.equal((await post('/pair', '', { 'X-Pairing-Code': '00000000' === info.code ? '99999999' : '00000000' })).status, 403);
  const pair = await post('/pair', '', { 'X-Pairing-Code': info.code });
  token = (await pair.json()).token; assert.ok(token);
  let state;
  const api = async (action, args = {}, ok = true) => {
    const result = await post('/api', JSON.stringify({ action, id: state?.currentId, revision: state?.revision, ...args }), { 'Content-Type': 'application/json' });
    if (!ok) return result;
    assert.equal(result.status, 200, await result.clone().text()); return result.json();
  };
  state = await api('list'); const rootId = state.currentId;
  await api('create', { name: '目标目录' }); state = await api('list');
  const folder = state.entries.find(e => e.name === '目标目录'); assert.ok(folder?.id);
  assert.equal((await api('create', { name: '../逃逸' }, false)).status, 409);
  assert.equal((await api('create', { name: '过期修改', revision: -1 }, false)).status, 409);
  assert.equal((await api('list', { id: '../External' }, false)).status, 409);
  const source = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 251));
  for (let i = 0; i < 2; i++) {
    const uploaded = await post('/upload', source, { 'X-Directory-Id': folder.id, 'X-File-Name': encodeURIComponent('合成音频.wav') });
    assert.equal(uploaded.status, 201, await uploaded.text());
  }
  const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha(fs.readFileSync(path.join(directory, 'Music/目标目录/合成音频.wav'))), sha(source));
  assert.equal(sha(fs.readFileSync(path.join(directory, 'Music/目标目录/合成音频（2）.wav'))), sha(source));
  state = await api('list'); await api('rename', { id: folder.id, name: '已改名' });
  state = await api('list'); assert.equal(state.entries.find(e => e.id === folder.id)?.name, '已改名');
  await api('trash', { id: folder.id }); state = await api('list'); assert.equal(state.trash.length, 1);
  await api('restore', { trashId: state.trash[0].id }); state = await api('list'); assert.equal(state.trash.length, 0);
  assert.equal(state.entries.find(e => e.name === '已改名')?.id, folder.id);
  assert.equal(sha(fs.readFileSync(path.join(directory, 'Music/已改名/合成音频.wav'))), sha(source));
  await api('create', { name: '另一目录' }); state = await api('list');
  const target = state.entries.find(e => e.name === '另一目录');
  await api('move', { id: folder.id, targetId: target.id });
  state = await api('list', { id: target.id }); assert.equal(state.entries[0].id, folder.id);
  await api('trash', { id: folder.id }); state = await api('list', { id: rootId });
  await api('purge', { trashId: state.trash[0].id }); state = await api('list'); assert.equal(state.trash.length, 0);
  assert.equal((await post('/api', '{}', { Origin: 'http://untrusted.example' })).status, 403);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(info.address);
  await page.locator('#code').fill(info.code);
  await page.getByRole('button', { name: '配对并打开' }).click();
  await page.locator('#create').click();
  await page.locator('#name').fill('浏览器审核目录');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '▱ 浏览器审核目录', exact: true }).click();
  await page.locator('#files').setInputFiles({ name: '<script>示例.wav', mimeType: 'audio/wav', buffer: source });
  await page.locator('#send').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('失败 0 项'));
  assert.equal(await page.locator('#entries script').count(), 0, 'Filename must never become executable markup');
  assert.equal(errors.length, 0, errors.join('\n'));
  const evidence = 'artifacts/verification/v0.1.24';
  fs.mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: path.join(evidence, 'wifi-browser-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(evidence, 'wifi-browser-phone.png'), fullPage: true });
  await page.locator('#logout').click();
  await page.waitForFunction(() => !document.querySelector('#login').hidden);
  await browser.close(); browser = undefined;
  assert.equal((await post('/logout', '')).status, 200);
  assert.equal((await post('/api', '{}')).status, 401, 'Logout revokes this browser session');
  for (let i = 0; i < 8; i++) assert.equal((await post('/pair', '', { 'X-Pairing-Code': info.code })).status, 200);
  const limit = await post('/pair', '', { 'X-Pairing-Code': info.code });
  assert.equal(limit.status, 429);
  assert.match(await limit.text(), /Wi-Fi 传输/);
  console.log('LAN receiver integration passed: pairing, scoped IDs, revision, nested targets, upload hashes/collisions, rename, move, trash/restore/purge and origin rejection. macOS network evidence; iOS foreground/device acceptance is separate.');
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
  if (server && server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
  fs.rmSync(directory, { recursive: true, force: true });
}
