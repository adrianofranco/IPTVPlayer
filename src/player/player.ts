import { dbg } from '../platform/debug';
import { RUNTIME } from '../platform/env';

export type PlayKind = 'live' | 'vod';

export interface PlaySource {
  url: string;
  kind: PlayKind;
  title?: string;
  epgChannelId?: string;
}

export interface PlayerEvents {
  onPlaying?(): void;
  onPaused?(): void;
  onEnded?(): void;
  onError?(msg: string): void;
  onTime?(current: number, duration: number): void;
}

/** Player abstrato. Adapters: HTML5 (browser/Tauri) e AVPlay (Tizen). */
export interface Player {
  attach(container: HTMLElement): void;
  load(src: PlaySource): Promise<void>;
  play(): void;
  pause(): void;
  togglePlay(): void;
  stop(): void;
  /** Avanca/retrocede `delta` segundos (VOD). Sem efeito util em live. */
  seekBy(delta: number): void;
  /** Vai para a posicao absoluta em segundos (VOD) — usado p/ retomar. */
  seekTo(seconds: number): void;
  destroy(): void;
}

/** Escolhe o adapter por runtime. Adapters sao code-split (import dinamico). */
export async function createPlayer(events: PlayerEvents): Promise<Player> {
  dbg(`runtime=${RUNTIME} → ${RUNTIME === 'tizen' ? 'AVPlay' : 'HTML5'}`);
  if (RUNTIME === 'tizen') {
    const { AVPlayPlayer } = await import('./avplay');
    return new AVPlayPlayer(events);
  }
  const { Html5Player } = await import('./html5');
  return new Html5Player(events);
}
