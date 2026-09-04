import { defineConfig } from '@playwright/test';

const externalBaseURL = process.env.NANOPLAYER_E2E_BASE_URL;
const baseURL = externalBaseURL ?? 'http://127.0.0.1:1422';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: externalBaseURL ? undefined : {
    command: 'pnpm dev --host 127.0.0.1 --port 1422',
    url: baseURL,
    reuseExistingServer: false,
  },
  use: {
    baseURL,
    channel: 'chrome',
    trace: 'on-first-retry',
  },
});
