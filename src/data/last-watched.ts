import type { PlayKind } from '../player/player';

// Ultimo item assistido — persistido em localStorage (registro unico, pequeno).
// Some na Home como "Continuar"; para VOD guarda a posicao p/ retomar.

export interface LastWatched {
  title: string;
  url: string;
  kind: PlayKind;
  epgChannelId?: string;
  positionSec?: number;
  ts: number;
}

const KEY = 'iptv:last-watched';

export function getLastWatched(): LastWatched | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LastWatched) : null;
  } catch {
    return null;
  }
}

export function saveLastWatched(lw: LastWatched): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(lw));
  } catch {
    /* storage indisponivel — ignora */
  }
}

/** Atualiza so a posicao (VOD) do ultimo assistido. */
export function updatePosition(positionSec: number): void {
  const lw = getLastWatched();
  if (lw) saveLastWatched({ ...lw, positionSec, ts: Date.now() });
}
