// Preferencia de visualizacao lista/grade (Filmes/Series) — persiste local.

export type ViewMode = 'list' | 'grid';

const KEY = 'iptv:view';

export function getViewMode(): ViewMode {
  try {
    return localStorage.getItem(KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

export function setViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* sem storage: so nao persiste */
  }
}
