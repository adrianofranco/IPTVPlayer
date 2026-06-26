import type { EpgEntry } from '../data/types';
import type { RemoteAction } from '../platform/keys';
import type { PlaySource } from '../player/player';
import type { Screen } from './screen';

export interface DetailOptions {
  playable: PlaySource;
  epg?: EpgEntry[];
  onPlay: (src: PlaySource) => void;
  onBack: () => void;
}

/** Tela de detalhe: titulo + (para live) guia "agora/a seguir". OK reproduz. */
export class DetailView implements Screen {
  readonly el: HTMLElement;

  constructor(private readonly opts: DetailOptions) {
    this.el = document.createElement('div');
    this.el.className = 'detail';

    const h1 = document.createElement('h1');
    h1.textContent = opts.playable.title ?? '(sem título)';
    this.el.appendChild(h1);

    const hint = document.createElement('div');
    hint.className = 'detail-note';
    hint.textContent = '▶ Pressione OK para reproduzir';
    this.el.appendChild(hint);

    if (opts.epg && opts.epg.length) {
      const h2 = document.createElement('h2');
      h2.textContent = 'Agora / A seguir';
      h2.style.fontSize = '22px';
      h2.style.marginTop = '12px';
      this.el.appendChild(h2);

      for (const e of opts.epg) {
        const item = document.createElement('div');
        item.className = 'epg-item';
        const time = document.createElement('div');
        time.className = 'epg-time';
        time.textContent = `${fmt(e.start)} – ${fmt(e.end)}`;
        const title = document.createElement('div');
        title.textContent = e.title;
        item.appendChild(time);
        item.appendChild(title);
        if (e.description) {
          const desc = document.createElement('div');
          desc.className = 'row-sub';
          desc.textContent = e.description;
          item.appendChild(desc);
        }
        this.el.appendChild(item);
      }
    }
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.el);
  }

  setVisible(visible: boolean): void {
    this.el.style.display = visible ? '' : 'none';
  }

  destroy(): void {
    this.el.remove();
  }

  handleAction(action: RemoteAction): void {
    if (action === 'enter' || action === 'play') this.opts.onPlay(this.opts.playable);
    else if (action === 'back') this.opts.onBack();
  }
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
