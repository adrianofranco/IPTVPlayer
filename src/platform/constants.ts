// Constantes de plataforma compartilhadas (browser, Tizen, Tauri e o proxy de dev).

/**
 * UA "mobile" usado em TODA requisicao ao provider IPTV (catalogo e stream).
 * Muitos providers bloqueiam User-Agent nao-mobile. Centralizado aqui para ser
 * o unico ponto de verdade: proxy de dev, fetch em runtime e o player.
 */
export const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

/** Prefixo do proxy de dev (browser). Em Tizen/Tauri usamos a URL direta. */
export const DEV_API_PREFIX = '/api';
