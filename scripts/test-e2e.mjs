import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createViteServer } from 'vite';

const vite = await createViteServer({
  server: { middlewareMode: true },
});
const server = createHttpServer(vite.middlewares);
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Vite did not return its temporary E2E port.');

  const baseURL = `http://127.0.0.1:${address.port}`;
  console.log(`Running E2E tests against ${baseURL}.`);

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(pnpm, ['exec', 'playwright', 'test'], {
      stdio: 'inherit',
      env: { ...process.env, NANOPLAYER_E2E_BASE_URL: baseURL },
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Playwright exited after signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await vite.close();
}
