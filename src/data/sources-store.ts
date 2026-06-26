import type { SourceConfig } from './config';

// Fontes (listas) adicionadas pelo usuario, persistidas em localStorage.
// Substitui o VITE_XTREAM_BASE em producao/wgt (env fica so p/ dev).

export type StoredSource = SourceConfig & { id: string };

interface State {
  sources: StoredSource[];
  activeId?: string;
}

const KEY = 'iptv:sources';

function read(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { sources: [] };
    const s = JSON.parse(raw) as State;
    return { sources: s.sources ?? [], activeId: s.activeId };
  } catch {
    return { sources: [] };
  }
}

function write(state: State): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage indisponivel — ignora */
  }
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getSources(): StoredSource[] {
  return read().sources;
}

export function getActiveSource(): StoredSource | null {
  const s = read();
  return s.sources.find((x) => x.id === s.activeId) ?? s.sources[0] ?? null;
}

/** Adiciona uma fonte e a torna ativa. */
export function addSource(config: SourceConfig): StoredSource {
  const s = read();
  const stored: StoredSource = { ...config, id: genId() };
  s.sources.push(stored);
  s.activeId = stored.id;
  write(s);
  return stored;
}

export function setActive(id: string): void {
  const s = read();
  if (s.sources.some((x) => x.id === id)) {
    s.activeId = id;
    write(s);
  }
}

export function removeSource(id: string): void {
  const s = read();
  s.sources = s.sources.filter((x) => x.id !== id);
  if (s.activeId === id) s.activeId = s.sources[0]?.id;
  write(s);
}
