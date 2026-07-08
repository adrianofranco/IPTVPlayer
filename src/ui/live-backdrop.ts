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
  private player?: Player;
  private want?: PlaySource;
  private current?: string; // url pedida por ultimo (nao recarregar a mesma)
  private busy = false;
  private dead = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly onError?: (msg: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'live-backdrop';
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
          if (!this.player) {
            this.player = await createPlayer({
              onError: (m) => {
                dbg(`backdrop: ${m}`);
                this.onError?.(m);
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
          this.onError?.('Não deu para abrir o canal');
        }
      }
    } finally {
      this.busy = false;
    }
  }
}
