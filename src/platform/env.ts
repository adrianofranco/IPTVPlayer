// Deteccao de runtime — governa escolha de player e estrategia de rede.

export type Runtime = 'tizen' | 'tauri' | 'browser';

export function detectRuntime(): Runtime {
  // Sem window (Node / testes): trata como runtime nativo (URL direta + UA no header).
  if (typeof window === 'undefined') return 'tauri';
  const w = window as unknown as {
    tizen?: unknown;
    webapis?: { avplay?: unknown };
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  if (w.tizen || w.webapis?.avplay) return 'tizen';
  if (w.__TAURI__ || w.__TAURI_INTERNALS__) return 'tauri';
  return 'browser';
}

export const RUNTIME: Runtime = detectRuntime();
export const IS_TIZEN = RUNTIME === 'tizen';
export const IS_BROWSER = RUNTIME === 'browser';
