import type { RemoteAction } from '../platform/keys';
import { createPlayer, type Player, type PlaySource } from '../player/player';
import type { Screen } from './screen';

export interface PlayerViewOptions {
  /** Posicao inicial (s) p/ retomar VOD. */
  startAt?: number;
  onClose: () => void;
  /** Chamado periodicamente e ao sair (VOD) p/ salvar a posicao. */
  onProgress?: (sec: number) => void;
}

interface Ctrl {
  id: 'back' | 'rew' | 'play' | 'fwd';
  icon: string;
}

const SEEK_STEP = 30; // segundos por toque em ⏪/⏩
const HIDE_MS = 4000;

/**
 * Reproducao em tela cheia, com barra de controles SOBREPOSTA (semitransparente)
 * que some por inatividade. Botoes focaveis por D-pad: Voltar e, p/ VOD,
 * retroceder/play-pause/avancar + barra de progresso. Live nao tem seek.
 */
export class PlayerView implements Screen {
  readonly el: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly msgEl: HTMLElement;
  private readonly ctrls: Ctrl[];
  private readonly btnEls: HTMLElement[] = [];
  private readonly isVod: boolean;
  private player?: Player;
  private focus = 0;
  private paused = false;
  private cur = 0;
  private lastSaved = 0;
  private resumed = false;
  private hideTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly src: PlaySource,
    private readonly opts: PlayerViewOptions,
  ) {
    this.isVod = src.kind === 'vod';
    this.ctrls = this.isVod
      ? [
          { id: 'back', icon: '←' },
          { id: 'rew', icon: '⏪' },
          { id: 'play', icon: '⏯' },
          { id: 'fwd', icon: '⏩' },
        ]
      : [
          { id: 'back', icon: '←' },
          { id: 'play', icon: '⏯' },
        ];
    this.focus = this.ctrls.findIndex((c) => c.id === 'play');

    this.el = document.createElement('div');
    this.el.className = 'player';

    this.stage = document.createElement('div');
    this.stage.className = 'player-stage';

    this.msgEl = document.createElement('div');
    this.msgEl.className = 'player-msg';

    this.overlay = document.createElement('div');
    this.overlay.className = 'player-overlay';

    const top = document.createElement('div');
    top.className = 'player-top';
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'player-title';
    this.titleEl.textContent = src.title ?? '';
    top.appendChild(this.titleEl);

    const controls = document.createElement('div');
    controls.className = 'player-controls';

    const progress = document.createElement('div');
    progress.className = 'player-progress';
    this.fill = document.createElement('div');
    this.fill.className = 'player-progress-fill';
    progress.appendChild(this.fill);
    if (!this.isVod) progress.style.visibility = 'hidden';

    const row = document.createElement('div');
    row.className = 'player-bottomrow';
    const buttons = document.createElement('div');
    buttons.className = 'player-buttons';
    this.ctrls.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'player-btn';
      b.textContent = c.icon;
      b.addEventListener('click', () => {
        this.focus = i;
        this.renderFocus();
        this.activate(c.id);
        this.showBar();
      });
      buttons.appendChild(b);
      this.btnEls.push(b);
    });
    this.timeEl = document.createElement('div');
    this.timeEl.className = 'player-time';
    this.timeEl.textContent = this.isVod ? '' : 'AO VIVO';
    row.appendChild(buttons);
    row.appendChild(this.timeEl);

    controls.appendChild(progress);
    controls.appendChild(row);
    this.overlay.appendChild(top);
    this.overlay.appendChild(controls);

    this.el.appendChild(this.stage);
    this.el.appendChild(this.msgEl);
    this.el.appendChild(this.overlay);

    this.el.addEventListener('mousemove', () => this.showBar());
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.el);
    this.renderFocus();
    void this.init();
  }

  private async init(): Promise<void> {
    this.player = await createPlayer({
      onPlaying: () => {
        this.paused = false;
        this.setPlayIcon();
        this.hideMessage();
      },
      onPaused: () => {
        this.paused = true;
        this.setPlayIcon();
      },
      onEnded: () => this.close(),
      onError: (m) => this.showMessage(m),
      onTime: (c, d) => this.onTime(c, d),
    });
    this.player.attach(this.stage);
    this.showBar();
    try {
      await this.player.load(this.src);
    } catch (e) {
      this.showMessage(e instanceof Error ? e.message : 'erro ao reproduzir');
    }
  }

  setVisible(visible: boolean): void {
    this.el.style.display = visible ? '' : 'none';
  }

  destroy(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.saveProgress();
    this.player?.destroy();
    this.el.remove();
  }

  handleAction(action: RemoteAction): void {
    switch (action) {
      case 'left':
        this.moveFocus(-1);
        break;
      case 'right':
        this.moveFocus(1);
        break;
      case 'enter':
        this.activate(this.ctrls[this.focus].id);
        break;
      case 'play':
      case 'pause':
        this.player?.togglePlay();
        break;
      case 'stop':
      case 'back':
        this.close();
        return;
      default:
        break;
    }
    this.showBar();
  }

  // ---- controles ----
  private moveFocus(delta: number): void {
    this.focus = Math.max(0, Math.min(this.ctrls.length - 1, this.focus + delta));
    this.renderFocus();
  }

  private activate(id: Ctrl['id']): void {
    if (id === 'back') this.close();
    else if (id === 'play') this.player?.togglePlay();
    else if (id === 'rew') this.player?.seekBy(-SEEK_STEP);
    else if (id === 'fwd') this.player?.seekBy(SEEK_STEP);
  }

  private renderFocus(): void {
    this.btnEls.forEach((b, i) => b.classList.toggle('focused', i === this.focus));
  }

  private setPlayIcon(): void {
    const i = this.ctrls.findIndex((c) => c.id === 'play');
    const b = this.btnEls[i];
    if (b) b.textContent = this.paused ? '▶' : '⏸';
  }

  private onTime(current: number, duration: number): void {
    this.cur = current;
    if (!this.resumed && this.isVod && this.opts.startAt && this.opts.startAt > 0) {
      this.resumed = true;
      this.player?.seekTo(this.opts.startAt);
    }
    if (this.isVod && duration > 0) {
      this.fill.style.width = `${Math.min(100, (current / duration) * 100)}%`;
      this.timeEl.textContent = `${fmt(current)} / ${fmt(duration)}`;
    }
    if (this.opts.onProgress && current - this.lastSaved >= 3) {
      this.lastSaved = current;
      this.opts.onProgress(current);
    }
  }

  private saveProgress(): void {
    if (this.opts.onProgress && this.cur > 0) this.opts.onProgress(this.cur);
  }

  private showMessage(m: string): void {
    this.msgEl.textContent = `⚠ ${m}`;
    this.msgEl.style.display = 'flex';
    this.showBar();
  }

  private hideMessage(): void {
    this.msgEl.style.display = 'none';
  }

  private close(): void {
    this.opts.onClose();
  }

  private showBar(): void {
    this.overlay.classList.remove('hidden');
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.overlay.classList.add('hidden'), HIDE_MS);
  }
}

function fmt(sec: number): string {
  if (!isFinite(sec)) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
