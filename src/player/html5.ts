import type { Player, PlayerEvents, PlaySource } from './player';

/**
 * Adapter HTML5 para browser/Tauri.
 *  - VOD (mp4): <video> progressivo, sem dependencia.
 *  - Live (.m3u8): HLS nativo (Safari/Tizen) ou hls.js (Chrome/Firefox), carregado
 *    dinamicamente — so paga o custo em KB quando assiste live fora do Safari.
 */
export class Html5Player implements Player {
  private readonly video: HTMLVideoElement;
  private hls?: { destroy(): void };

  constructor(private readonly events: PlayerEvents) {
    const v = document.createElement('video');
    v.className = 'player-video';
    v.autoplay = true;
    v.playsInline = true;
    v.controls = false;
    v.addEventListener('playing', () => this.events.onPlaying?.());
    v.addEventListener('pause', () => this.events.onPaused?.());
    v.addEventListener('ended', () => this.events.onEnded?.());
    v.addEventListener('error', () => this.events.onError?.('Erro ao reproduzir'));
    v.addEventListener('timeupdate', () =>
      this.events.onTime?.(v.currentTime, isFinite(v.duration) ? v.duration : 0),
    );
    this.video = v;
  }

  attach(container: HTMLElement): void {
    container.appendChild(this.video);
  }

  async load(src: PlaySource): Promise<void> {
    this.teardownHls();
    const isHls = src.kind === 'live' || src.url.includes('.m3u8');

    // HLS: preferir hls.js quando suportado (Chrome/Firefox/webview Tizen).
    // canPlayType('...mpegurl') NAO e confiavel — o Chrome responde 'maybe' mas nao
    // toca de fato; so caimos no HLS nativo quando o hls.js nao roda (Safari/iOS).
    if (isHls) {
      const { default: Hls } = await import('hls.js');
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          let msg: string;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            // bufferAddCodecError etc.: MSE do navegador nao suporta o codec (HEVC)
            msg = 'Codec não suportado no navegador (provável H.265/HEVC) — deve funcionar na TV.';
          } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            msg = 'Falha ao carregar o stream no navegador (pode ser 4K/H.265) — deve funcionar na TV.';
          } else {
            msg = `Erro HLS: ${data.details}`;
          }
          this.events.onError?.(msg);
        });
        hls.loadSource(src.url);
        hls.attachMedia(this.video);
        this.hls = hls;
        return;
      }
    }

    this.video.src = src.url; // VOD progressivo ou HLS nativo (Safari)
    try {
      await this.video.play();
    } catch {
      /* autoplay pode ser bloqueado — usuario aperta OK */
    }
  }

  play(): void {
    void this.video.play().catch(() => {});
  }
  pause(): void {
    this.video.pause();
  }
  togglePlay(): void {
    if (this.video.paused) this.play();
    else this.pause();
  }
  stop(): void {
    this.teardownHls();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }
  seekBy(delta: number): void {
    if (isFinite(this.video.duration)) {
      const t = this.video.currentTime + delta;
      this.video.currentTime = Math.max(0, Math.min(this.video.duration, t));
    }
  }
  seekTo(seconds: number): void {
    const d = this.video.duration;
    this.video.currentTime = isFinite(d) ? Math.max(0, Math.min(d, seconds)) : Math.max(0, seconds);
  }
  destroy(): void {
    this.stop();
    this.video.remove();
  }

  private teardownHls(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = undefined;
    }
  }
}
