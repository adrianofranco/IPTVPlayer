import { defineConfig, loadEnv } from 'vite';
import { MOBILE_USER_AGENT } from './src/platform/constants';

// Dev: proxy `/api` -> servidor IPTV, resolvendo dois problemas do browser:
//  1) CORS — o provider nao manda headers CORS;
//  2) User-Agent — providers costumam bloquear UA "nao-mobile". O browser NAO
//     deixa o fetch sobrescrever o UA, mas o proxy (Node) sobrescreve aqui.
// VITE_XTREAM_BASE pode ser o host puro OU a URL completa do get.php — usamos so a origem.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const raw = env.VITE_XTREAM_BASE || 'http://localhost';
  let target = raw;
  try {
    target = new URL(raw).origin; // descarta path/query (ex.: /get.php?...)
  } catch {
    /* mantem raw */
  }

  return {
    base: './', // caminhos relativos: necessario p/ app empacotado (Tizen .wgt / Tauri)
    build: { target: 'es2015' },
    // pre-bundla o hls.js no start, evitando reload do dev no 1o import dinamico
    optimizeDeps: { include: ['hls.js'] },
    server: {
      proxy: {
        // catalogo/streams via /api -> origem do provider (UA mobile injetada)
        '/api': {
          target,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('user-agent', MOBILE_USER_AGENT);
            });
          },
        },
        // alguns m3u8 listam segmentos como /hls/<hash>/... (relativo a raiz);
        // sem este proxy eles cairiam no dev server e dariam 404 no browser.
        '/hls': {
          target,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('user-agent', MOBILE_USER_AGENT);
            });
          },
        },
      },
    },
  };
});
