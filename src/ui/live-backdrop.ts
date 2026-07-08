import { dbg } from '../platform/debug';
import { createPlayer, type Player, type PlaySource } from '../player/player';

/**
 * Video de fundo da secao Ao Vivo: um player fullscreen ATRAS das telas
 * (que ficam translucidas via classe `live-tv` na raiz). Trocas de canal sao
 * serializadas e "a ultima vence" — zapping rapido nao empilha loads, e o
 * provider (1 conexao) nunca ve dois streams ao mesmo tempo.
 */
export class LiveBackdrop {
  private readonly el: HTMLElement;
  private readonly statusEl: HTMLElement;
  private player?: Player;
  private want?: PlaySource;
  private current?: string; // url pedida por ultimo (nao recarregar a mesma)
  private busy = false;
  private dead = false;

  constructor(private readonly root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'live-backdrop';
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'live-status hidden';
    this.el.appendChild(this.statusEl);
    root.insertBefore(this.el, root.firstChild); // atras de todas as telas
    root.classList.add('live-tv');
  }

  /** Troca o canal. Chamadas em rajada: so a ultima e carregada. */
  play(src: PlaySource): void {
    // mesmo canal ja pedido/tocando → no-op (zap ida-e-volta custa zero)
    if (src.url === (this.want?.url ?? this.current)) return;
    this.want = src;
    void this.pump();
  }

  destroy(): void {
    this.dead = true;
    this.want = undefined;
    this.player?.destroy();
    this.player = undefined;
    this.el.remove();
    this.root.classList.remove('live-tv');
  }

  private async pump(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.want && !this.dead) {
        const src = this.want;
        this.want = undefined;
        this.current = src.url; // antes do load: play(mesma url) em voo e no-op
        try {
          // spinner ate o onPlaying (AVPlay: prepareAsync concluido) — sem ele
          // a tela fica preta e o usuario nao sabe o que esta acontecendo
          this.setStatus('loading', src.title ? `Sintonizando ${src.title}…` : 'Sintonizando…');
          if (!this.player) {
            this.player = await createPlayer({
              onPlaying: () => this.clearStatus(),
              onError: (m) => {
                dbg(`backdrop: ${m}`);
                this.setStatus('error', `⚠ ${m}`);
              },
            });
            if (this.dead) return; // destruido durante o await
            this.player.attach(this.el);
          } else {
            this.player.stop();
          }
          await this.player.load(src);
        } catch (e) {
          this.current = undefined; // falhou: permite tentar o mesmo canal de novo
          dbg(`backdrop load falhou: ${e instanceof Error ? e.message : String(e)}`);
          this.setStatus('error', `⚠ Não deu para abrir ${src.title ?? 'o canal'} — tente outro`);
        }
      }
    } finally {
      this.busy = false;
    }
  }

  /** Feedback central: spinner na sintonia; erro PERSISTE ate a proxima troca. */
  private setStatus(kind: 'loading' | 'error', text: string): void {
    this.statusEl.textContent = '';
    if (kind === 'loading') {
      const sp = document.createElement('div');
      sp.className = 'spinner';
      this.statusEl.appendChild(sp);
    }
    const msg = document.createElement('div');
    if (kind === 'error') msg.className = 'status-error';
    msg.textContent = text;
    this.statusEl.appendChild(msg);
    this.statusEl.classList.remove('hidden');
  }

  private clearStatus(): void {
    this.statusEl.classList.add('hidden');
  }
}
