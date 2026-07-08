import type { EpgEntry, Stream } from '../data/types';
import type { RemoteAction } from '../platform/keys';
import type { Screen } from './screen';

export interface LiveWatchOptions {
  /** Ordem de zap = lista completa indexada (numeros dos canais). */
  channels: Stream[];
  startIndex: number;
  /** EPG curto p/ o banner ("agora: …"). */
  epg?: (channelId: string) => Promise<EpgEntry[]>;
  onZap: (s: Stream) => void;
  /** Recebe o canal ATUAL (pos-zap) p/ a lista de tras sincronizar o foco. */
  onExit: (current: Stream) => void;
}

const BANNER_MS = 4000;
// Zapping em rajada: o banner troca na hora, mas a sintonia (request no
// provider) so dispara quando o usuario assenta — poupa o rate limit.
const ZAP_COMMIT_MS = 1000;

/**
 * Modo assistir da secao Ao Vivo: tela transparente sobre o backdrop (o video
 * aparece inteiro), com um banner de canal (numero · nome · EPG "agora") que
 * some sozinho. ▲▼ zapeiam pela lista indexada; OK/Voltar retornam pra lista.
 */
export class LiveWatchView implements Screen {
  readonly el: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly numEl: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly epgEl: HTMLElement;
  private idx: number;
  private epgSeq = 0;
  private hideTimer?: ReturnType<typeof setTimeout>;
  private zapTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly opts: LiveWatchOptions) {
    this.idx = Math.max(0, Math.min(opts.channels.length - 1, opts.startIndex));

    this.el = document.createElement('div');
    this.el.className = 'screen live-watch';

    this.banner = document.createElement('div');
    this.banner.className = 'live-banner';
    this.numEl = document.createElement('span');
    this.numEl.className = 'live-num';
    this.nameEl = document.createElement('span');
    this.nameEl.className = 'live-name';
    this.epgEl = document.createElement('div');
    this.epgEl.className = 'live-epg';
    const row = document.createElement('div');
    row.className = 'live-banner-row';
    row.appendChild(this.numEl);
    row.appendChild(this.nameEl);
    this.banner.appendChild(row);
    this.banner.appendChild(this.epgEl);
    this.el.appendChild(this.banner);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.el);
    this.showBanner();
    this.loadEpg();
  }

  setVisible(visible: boolean): void {
    this.el.style.display = visible ? '' : 'none';
  }

  destroy(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (this.zapTimer) clearTimeout(this.zapTimer);
    this.epgSeq++; // descarta EPG em voo
    this.el.remove();
  }

  handleAction(action: RemoteAction): void {
    switch (action) {
      case 'up':
      case 'channelUp':
        this.zap(1);
        break;
      case 'down':
      case 'channelDown':
        this.zap(-1);
        break;
      case 'enter':
      case 'back':
        this.flushZap(); // sintoniza o canal onde parou antes de sair
        this.opts.onExit(this.opts.channels[this.idx]);
        break;
      default:
        this.showBanner(); // qualquer outra tecla reexibe o banner
        break;
    }
  }

  private zap(delta: number): void {
    const n = this.opts.channels.length;
    if (!n) return;
    this.idx = (this.idx + delta + n) % n;
    this.epgSeq++; // canal mudou: EPG em voo nao vale mais
    this.epgEl.textContent = '';
    this.showBanner();
    if (this.zapTimer) clearTimeout(this.zapTimer);
    this.zapTimer = setTimeout(() => this.flushZap(), ZAP_COMMIT_MS);
  }

  /** Sintoniza o canal atual (e busca o EPG) se houver zap pendente. */
  private flushZap(): void {
    if (!this.zapTimer) return;
    clearTimeout(this.zapTimer);
    this.zapTimer = undefined;
    this.opts.onZap(this.opts.channels[this.idx]);
    this.loadEpg();
  }

  /** Atualiza numero+nome do canal atual e (re)arma o auto-hide do banner. */
  private showBanner(): void {
    const s = this.opts.channels[this.idx];
    if (!s) return;
    this.numEl.textContent = String(s.num ?? this.idx + 1);
    this.nameEl.textContent = s.name;
    this.banner.classList.remove('hidden');
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.banner.classList.add('hidden'), BANNER_MS);
  }

  /** EPG assincrono; so a resposta do canal atual vale (zapping rapido). */
  private loadEpg(): void {
    const s = this.opts.channels[this.idx];
    if (!s || !this.opts.epg || !s.epgChannelId) return;
    const seq = ++this.epgSeq;
    this.opts
      .epg(s.epgChannelId)
      .then((entries) => {
        if (seq !== this.epgSeq || !entries.length) return;
        this.epgEl.textContent = `agora: ${entries[0].title}`;
      })
      .catch(() => {
        /* EPG e opcional no banner */
      });
  }
}
