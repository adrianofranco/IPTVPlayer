import type { XtreamCredentials } from './types';

// Como o usuario adicionou a lista. A app e source-agnostica: suporta varias
// fontes e o usuario as gerencia. Persistido localmente (inclui credenciais)
// — NUNCA commitado.

export type SourceConfig = XtreamConfig | M3uUrlConfig | M3uFileConfig;

export interface XtreamConfig {
  type: 'xtream';
  name: string;
  baseUrl: string; // http://host:porta
  username: string;
  password: string;
}

export interface M3uUrlConfig {
  type: 'm3u-url';
  name: string;
  url: string;
  /** XMLTV opcional para EPG (M3U cru nao traz guia). */
  epgUrl?: string;
}

export interface M3uFileConfig {
  type: 'm3u-file';
  name: string;
  /** XMLTV opcional para EPG. */
  epgUrl?: string;
}

/**
 * Detecta o melhor Source a partir de UMA entrada de texto do usuario.
 * Um link Xtream (`get.php`/`player_api.php` com username+password) e
 * reconhecido e "promovido" para a API JSON (lazy, series em arvore, EPG)
 * em vez de baixar o M3U gigante. Qualquer outra URL vira um M3U cru.
 */
export function detectSource(input: string, name = 'Minha lista'): SourceConfig {
  const creds = parseXtreamUrl(input);
  if (creds) {
    return { type: 'xtream', name, ...creds };
  }
  return { type: 'm3u-url', name, url: input.trim() };
}

/**
 * Extrai credenciais de um link Xtream. Retorna null se nao reconhecer
 * o padrao (host + get.php/player_api.php + username + password).
 */
export function parseXtreamUrl(input: string): XtreamCredentials | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const path = url.pathname.toLowerCase();
  const isXtream = path.endsWith('/get.php') || path.endsWith('/player_api.php');
  const username = url.searchParams.get('username');
  const password = url.searchParams.get('password');
  if (!isXtream || !username || !password) return null;
  return {
    baseUrl: `${url.protocol}//${url.host}`,
    username,
    password,
  };
}
