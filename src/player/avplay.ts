import { MOBILE_USER_AGENT } from '../platform/constants';
import { dbg } from '../platform/debug';
import type { Player, PlayerEvents, PlaySource } from './player';

// Subconjunto da API nativa Tizen AVPlay que usamos. (Vendor global — tipagem
// minima proposital; comportamento real so verificavel no aparelho.)
interface AvPlay {
  open(url: string): void;
  close(): void;
  prepareAsync(onSuccess: () => void, onError: (e: unknown) => void): void;
  setDisplayRect(x: number, y: number, w: number, h: number): void;
  setStreamingProperty(type: string, value: string): void;
  play(): void;
  pause(): void;
  stop(): void;
  seekTo(ms: number): void;
  jumpForward?(ms: number): void;
  jumpBackward?(ms: number): void;
  getDuration?(): number;
  setListener(listener: Record<string, (...args: unknown[]) => void>): void;
}

function avplay(): AvPlay | undefined {
  return (window as unknown as { webapis?: { avplay?: AvPlay } }).webapis?.avplay;
}

/** Adapter AVPlay (Tizen): decodificacao por hardware, ideal para TV. */
export class AVPlayPlayer implements Player {
  private obj?: HTMLElement;
  private paused = false;

  constructor(private readonly events: PlayerEvents) {}

  attach(container: HTMLElement): void {
    const obj = document.createElement('object');
    obj.setAttribute('type', 'application/avplayer');
    obj.className = 'player-av';
    container.appendChild(obj);
    this.obj = obj;
    // AVPlay desenha num plano de video ATRAS da pagina; a UI precisa ficar
    // transparente sobre o video, senao o fundo opaco esconde a imagem.
    document.documentElement.classList.add('av-playing');
  }

  load(src: PlaySource): Promise<void> {
    const av = avplay();
    if (!av) {
      dbg('AVPlay indisponível (webapis.avplay undefined)');
      return Promise.reject(new Error('AVPlay indisponível'));
    }
    dbg(`open ${src.kind}: ${src.url}`);
    return new Promise<void>((resolve, reject) => {
      try {
        av.open(src.url);
        try {
          av.setStreamingProperty('USER_AGENT', MOBILE_USER_AGENT);
        } catch {
          /* nem todo firmware aceita — segue */
        }
        av.setDisplayRect(0, 0, 1920, 1080);
        av.setListener({
          onstreamcompleted: () => this.events.onEnded?.(),
          onerror: (e: unknown) => {
            dbg(`AVPlay onerror: ${String(e)}`);
            this.events.onError?.(`AVPlay: ${String(e)}`);
          },
          onbufferingcomplete: () => {
            dbg('buffering complete');
            this.events.onPlaying?.();
          },
          oncurrentplaytime: (ms: unknown) => {
            const dur = (av.getDuration?.() ?? 0) / 1000;
            this.events.onTime?.(Number(ms) / 1000, dur);
          },
        });
        dbg('prepareAsync…');
        av.prepareAsync(
          () => {
            dbg('prepared → play()');
            av.play();
            this.paused = false;
            this.events.onPlaying?.();
            resolve();
          },
          (e) => {
            dbg(`prepare FALHOU: ${String(e)}`);
            reject(new Error(`prepare falhou: ${String(e)}`));
          },
        );
      } catch (e) {
        dbg(`open/prepare throw: ${String(e)}`);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  play(): void {
    try {
      avplay()?.play();
      this.paused = false;
      this.events.onPlaying?.();
    } catch {
      /* */
    }
  }
  pause(): void {
    try {
      avplay()?.pause();
      this.paused = true;
      this.events.onPaused?.();
    } catch {
      /* */
    }
  }
  togglePlay(): void {
    if (this.paused) this.play();
    else this.pause();
  }
  stop(): void {
    try {
      const av = avplay();
      av?.stop();
      av?.close();
    } catch {
      /* */
    }
  }
  seekBy(delta: number): void {
    const av = avplay();
    try {
      if (delta < 0) av?.jumpBackward?.(Math.abs(delta) * 1000);
      else av?.jumpForward?.(delta * 1000);
    } catch {
      /* */
    }
  }
  seekTo(seconds: number): void {
    try {
      avplay()?.seekTo(Math.max(0, seconds) * 1000);
    } catch {
      /* */
    }
  }
  destroy(): void {
    this.stop();
    this.obj?.remove();
    document.documentElement.classList.remove('av-playing');
  }
}
