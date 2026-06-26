import type { XtreamCredentials } from '../data/types';
import { DEV_API_PREFIX, MOBILE_USER_AGENT } from './constants';
import { RUNTIME } from './env';

/**
 * Base de URL para falar com o provider, por runtime:
 *  - browser: prefixo do proxy de dev ('/api') — injeta UA e resolve CORS.
 *  - tizen/tauri/node: a origem real do provider; a UA vai no header.
 *
 * Obs.: no browser o proxy tem um unico target (VITE_XTREAM_BASE), entao em DEV
 * vale um provider por vez. Em Tizen/Tauri (URL direta) nao ha essa limitacao.
 */
export function gatewayBase(creds: XtreamCredentials): string {
  return RUNTIME === 'browser' ? DEV_API_PREFIX : creds.baseUrl;
}

/** Headers do provider — UA mobile fora do browser (no browser o proxy cuida). */
export function providerHeaders(): Record<string, string> | undefined {
  return RUNTIME === 'browser' ? undefined : { 'User-Agent': MOBILE_USER_AGENT };
}

/** GET + parse JSON, com erro claro. */
export async function getJson<T>(url: string): Promise<T> {
  const headers = providerHeaders();
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} em ${url}`);
  }
  return (await res.json()) as T;
}
