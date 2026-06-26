import { defineConfig } from '@playwright/test';

// E2E contra o app rodando em dev (Vite carrega VITE_XTREAM_BASE do .env.local).
// Use PW_CHANNEL=chrome para rodar no Chrome real (com codecs) e provar decode.
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // serial: respeita o limite de 1 conexão da conta
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5179',
    channel: process.env.PW_CHANNEL || undefined,
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5179 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5179',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
