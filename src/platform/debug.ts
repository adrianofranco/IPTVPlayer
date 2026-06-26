// Log on-screen p/ depurar na TV (Tizen bloqueia dlog/inspector no aparelho de
// varejo). Mostra as ultimas linhas num painel sobreposto. Liga/desliga em
// Opcoes (persiste em localStorage `iptv:debug`) ou via `?debug` na URL.

let panel: HTMLElement | undefined;
const lines: string[] = [];
let enabled = false;
let captured = false;

const KEY = 'iptv:debug';

function readFlag(): boolean {
  try {
    return location.search.includes('debug') || localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function isDebug(): boolean {
  return enabled;
}

export function initDebug(): void {
  enabled = readFlag();
  if (enabled) startCapture();
}

/** Liga/desliga em runtime (chamado pela tela de Opcoes). */
export function setDebug(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* storage indisponivel */
  }
  enabled = on;
  if (on) {
    startCapture();
    dbg('debug ON');
  } else {
    panel?.remove();
    panel = undefined;
    lines.length = 0;
  }
}

function startCapture(): void {
  if (captured) return;
  captured = true;
  window.addEventListener('error', (e) => dbg(`JS error: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) =>
    dbg(`reject: ${String((e as PromiseRejectionEvent).reason)}`),
  );
}

export function dbg(msg: string): void {
  if (!enabled) return;
  const t = new Date().toISOString().slice(11, 19);
  lines.push(`${t} ${msg}`);
  if (lines.length > 14) lines.shift();
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'dbg';
    document.body.appendChild(panel);
  }
  panel.textContent = lines.join('\n');
}
