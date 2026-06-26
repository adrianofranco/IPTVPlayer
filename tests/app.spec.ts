import { test, expect, type Page } from '@playwright/test';

const CHROME = process.env.PW_CHANNEL === 'chrome';
const SCREENS = '#app > .screen, #app > .detail, #app > .player';

async function press(page: Page, key: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(90);
  }
}

/** Pressiona Enter e espera uma NOVA tela ser empilhada (carga async concluída). */
async function enterAndWait(page: Page): Promise<void> {
  const before = await page.locator(SCREENS).count();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.locator(SCREENS).count()).toBeGreaterThan(before);
}

/** Cabeçalho/linhas da tela ativa (a última empilhada). */
const topHeader = (page: Page) => page.locator('.screen-header').last();
const topRows = (page: Page) => page.locator('.list-viewport').last().locator('.list-row');

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.screen-header')).toHaveText('IPTV Player');
});

test('Home: 4 botões e foco inicial no primeiro', async ({ page }) => {
  const rows = page.locator('.list-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('Ao Vivo');
  await expect(rows.nth(3)).toContainText('Opções');
  await expect(rows.nth(0)).toHaveClass(/focused/);
});

test('D-pad move o foco', async ({ page }) => {
  const rows = page.locator('.list-row');
  await press(page, 'ArrowDown');
  await expect(rows.nth(1)).toHaveClass(/focused/);
  await press(page, 'ArrowUp');
  await expect(rows.nth(0)).toHaveClass(/focused/);
});

test('Ao Vivo carrega categorias reais (proxy + provider)', async ({ page }) => {
  await enterAndWait(page);
  await expect(topHeader(page)).toContainText('Ao Vivo');
  await expect.poll(() => topRows(page).count()).toBeGreaterThan(0);
  // regressão: a lista precisa estar VISÍVEL na tela (não só presente no DOM)
  await expect(topRows(page).first()).toBeInViewport();
});

test('Cache: 2ª entrada não refaz a requisição', async ({ page }) => {
  let reqs = 0;
  page.on('request', (r) => {
    if (r.url().includes('action=get_live_categories')) reqs++;
  });
  await enterAndWait(page);
  await expect(topHeader(page)).toContainText('Ao Vivo');
  await press(page, 'Backspace');
  await expect(page.locator('.screen-header')).toHaveText('IPTV Player');
  await enterAndWait(page);
  await expect(topHeader(page)).toContainText('Ao Vivo');
  expect(reqs).toBe(1);
});

test('Drill até o player (live): canal → detalhe → player com <video>', async ({ page }) => {
  await enterAndWait(page); // Ao Vivo -> categorias
  await expect(topHeader(page)).toContainText('Ao Vivo');
  await enterAndWait(page); // 1a categoria -> canais
  await expect.poll(() => topRows(page).count()).toBeGreaterThan(0);
  await enterAndWait(page); // 1o canal -> detalhe
  await expect(page.locator('.detail h1')).toBeVisible();
  await enterAndWait(page); // OK -> player
  await expect(page.locator('.player')).toBeVisible();
  await expect(page.locator('.player video')).toHaveCount(1);

  // diagnóstico (sem assert): live HLS toca no browser via hls.js?
  const live = await page.locator('.player video').evaluate(
    (v: HTMLVideoElement) =>
      new Promise((res) => {
        const t0 = Date.now();
        const iv = setInterval(() => {
          if (v.currentTime > 0.2 || Date.now() - t0 > 8000) {
            clearInterval(iv);
            res({
              readyState: v.readyState,
              currentTime: Number(v.currentTime.toFixed(2)),
              advanced: v.currentTime > 0.2,
              errorCode: v.error?.code ?? null,
              srcKind: v.currentSrc.startsWith('blob:') ? 'MSE(hls.js)' : 'direto',
            });
          }
        }, 300);
      }),
  );
  console.log('LIVE métricas:', live);

  const env = await page.evaluate(() => ({
    canPlayHls: document.createElement('video').canPlayType('application/vnd.apple.mpegurl'),
    mse: 'MediaSource' in window,
  }));
  console.log('LIVE env:', env);
});

test('VOD: bytes do filme fluem pelo stack (decode garantido no Chrome)', async ({ page }) => {
  await press(page, 'ArrowDown'); // -> Filmes
  await enterAndWait(page); // categorias de filmes
  await expect(topHeader(page)).toContainText('Filmes');
  await enterAndWait(page); // 1a categoria -> filmes
  await expect.poll(() => topRows(page).count()).toBeGreaterThan(0);
  await enterAndWait(page); // 1o filme -> detalhe
  await expect(page.locator('.detail h1')).toBeVisible();

  const respP = page.waitForResponse((r) => r.url().includes('/movie/'), { timeout: 30_000 });
  await enterAndWait(page); // OK -> player
  await expect(page.locator('.player video')).toHaveCount(1);

  const resp = await respP;
  console.log('VOD resposta:', resp.status(), resp.headers()['content-type']);
  expect(resp.status()).toBeLessThan(400);

  const metrics = await page.locator('.player video').evaluate(
    (v: HTMLVideoElement) =>
      new Promise((res) => {
        const start = v.currentTime;
        const t0 = Date.now();
        const iv = setInterval(() => {
          const advanced = v.currentTime > start + 0.2;
          if (advanced || Date.now() - t0 > 12_000) {
            clearInterval(iv);
            res({
              readyState: v.readyState,
              networkState: v.networkState,
              currentTime: Number(v.currentTime.toFixed(2)),
              duration: Number.isFinite(v.duration) ? Number(v.duration.toFixed(1)) : null,
              advanced,
              errorCode: v.error?.code ?? null,
            });
          }
        }, 300);
      }),
  );
  console.log('VOD métricas:', metrics);
  if (CHROME) expect((metrics as { advanced: boolean }).advanced).toBeTruthy();
});

test('Opções → Limpar cache mostra toast', async ({ page }) => {
  await press(page, 'ArrowDown', 3); // foca "Opções"
  await expect(page.locator('.list-row').nth(3)).toHaveClass(/focused/);
  await enterAndWait(page); // abre tela Opções
  await expect(topHeader(page)).toContainText('Opções');
  await press(page, 'ArrowDown'); // foca "Limpar cache" (item 1)
  await press(page, 'Enter');
  await expect(page.locator('.toast')).toContainText('Cache limpo');
});

test('Opções → Fontes → Adicionar abre formulário', async ({ page }) => {
  await press(page, 'ArrowDown', 3); // "Opções"
  await enterAndWait(page); // tela Opções
  await expect(topHeader(page)).toContainText('Opções');
  await enterAndWait(page); // "Fontes (listas)" (item 0, já focado)
  await expect(topHeader(page)).toContainText('Fontes');
  // último item é "➕ Adicionar lista"
  const rows = topRows(page);
  const last = (await rows.count()) - 1;
  await press(page, 'ArrowDown', last);
  await enterAndWait(page); // abre o formulário
  await expect(topHeader(page)).toContainText('Adicionar lista');
  await expect(page.locator('.form-input')).toBeVisible();
});

test('Player: controles sobrepostos e Voltar retorna', async ({ page }) => {
  await press(page, 'ArrowDown'); // Filmes
  await enterAndWait(page); // categorias
  await enterAndWait(page); // 1a categoria -> filmes
  await expect.poll(() => topRows(page).count()).toBeGreaterThan(0);
  await enterAndWait(page); // filme -> detalhe
  await enterAndWait(page); // OK -> player

  const btns = page.locator('.player-controls .player-btn');
  await expect(btns).toHaveCount(4); // VOD: back, rew, play, fwd
  await expect(btns.first()).toBeInViewport();
  await expect(page.locator('.player-progress')).toBeVisible();

  await press(page, 'Backspace'); // Voltar sai do player
  await expect(page.locator('.detail h1')).toBeVisible();
});

test('Último assistido aparece na Home após assistir (persistido)', async ({ page }) => {
  await press(page, 'ArrowDown'); // Filmes
  await enterAndWait(page);
  await enterAndWait(page);
  await expect.poll(() => topRows(page).count()).toBeGreaterThan(0);
  await enterAndWait(page); // detalhe
  const title = ((await page.locator('.detail h1').textContent()) ?? '').trim();
  await enterAndWait(page); // player
  await expect(page.locator('.player video')).toHaveCount(1);

  // recarrega: a Home oferece "Continuar" como 1º item, já focado
  await page.reload({ waitUntil: 'domcontentloaded' });
  const first = page.locator('.list-row').first();
  await expect(first).toContainText('Continuar');
  if (title) await expect(first).toContainText(title.slice(0, 12));
  await expect(first).toHaveClass(/focused/);
});
