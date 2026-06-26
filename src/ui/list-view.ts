import type { RemoteAction } from '../platform/keys';
import type { Screen } from './screen';

export interface ListItem {
  label: string;
  sublabel?: string;
  icon?: string;
}

export interface ListViewOptions {
  title: string;
  items: ListItem[];
  onSelect: (index: number) => void;
  onBack?: () => void;
  emptyText?: string;
}

const ROW_H = 64; // altura fixa da linha
const OVERSCAN = 4;

/**
 * Lista vertical navegavel por D-pad, com virtualizacao DETERMINISTICA: o
 * deslocamento (`scroll`) e controlado por nos (nao usamos o scroll nativo do
 * DOM, que sofre com scroll-anchoring e timing de layout). Cada linha e
 * posicionada em translateY(i*ROW_H - scroll); a viewport tem overflow:hidden.
 * Aguenta milhares de itens com poucas dezenas de nos no DOM.
 */
export class ListView implements Screen {
  readonly el: HTMLElement;
  private readonly viewport: HTMLElement;
  private index = 0;
  private scroll = 0;

  constructor(private readonly opts: ListViewOptions) {
    this.el = document.createElement('div');
    this.el.className = 'screen';

    const header = document.createElement('div');
    header.className = 'screen-header';
    header.textContent = opts.title;

    this.viewport = document.createElement('div');
    this.viewport.className = 'list-viewport';

    if (!opts.items.length) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = opts.emptyText ?? 'Vazio';
      this.viewport.appendChild(empty);
    }

    // rolagem por mouse (dev); a TV usa D-pad
    this.viewport.addEventListener(
      'wheel',
      (e) => {
        this.scrollBy(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );

    this.el.appendChild(header);
    this.el.appendChild(this.viewport);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.el);
    this.focusIndex(0);
    // re-render quando o layout assentar (clientHeight pode ser 0 no append)
    requestAnimationFrame(() => this.render());
  }

  setVisible(visible: boolean): void {
    this.el.style.display = visible ? '' : 'none';
    if (visible) requestAnimationFrame(() => this.render());
  }

  destroy(): void {
    this.el.remove();
  }

  handleAction(action: RemoteAction): void {
    switch (action) {
      case 'up':
        this.move(-1);
        break;
      case 'down':
        this.move(1);
        break;
      case 'enter':
        if (this.opts.items.length) this.opts.onSelect(this.index);
        break;
      case 'back':
        this.opts.onBack?.();
        break;
      default:
        break;
    }
  }

  private move(delta: number): void {
    const n = this.opts.items.length;
    if (!n) return;
    this.focusIndex(Math.max(0, Math.min(n - 1, this.index + delta)));
  }

  private focusIndex(i: number): void {
    this.index = i;
    const vh = this.viewport.clientHeight || 720;
    const top = i * ROW_H;
    const bottom = top + ROW_H;
    if (top < this.scroll) this.scroll = top;
    else if (bottom > this.scroll + vh) this.scroll = bottom - vh;
    this.clampScroll(vh);
    this.render();
  }

  private scrollBy(dy: number): void {
    this.scroll += dy;
    this.clampScroll(this.viewport.clientHeight || 720);
    this.render();
  }

  private clampScroll(vh: number): void {
    const max = Math.max(0, this.opts.items.length * ROW_H - vh);
    this.scroll = Math.max(0, Math.min(this.scroll, max));
  }

  private render(): void {
    const items = this.opts.items;
    const vh = this.viewport.clientHeight || 720;
    const first = Math.max(0, Math.floor(this.scroll / ROW_H) - OVERSCAN);
    const last = Math.min(items.length - 1, Math.ceil((this.scroll + vh) / ROW_H) + OVERSCAN);

    for (const old of Array.from(this.viewport.querySelectorAll('.list-row'))) old.remove();
    for (let i = first; i <= last; i++) {
      this.viewport.appendChild(this.renderRow(i, items[i]));
    }
  }

  private renderRow(i: number, item: ListItem): HTMLElement {
    const row = document.createElement('div');
    row.className = i === this.index ? 'list-row focused' : 'list-row';
    row.style.transform = `translateY(${i * ROW_H - this.scroll}px)`;
    row.addEventListener('click', () => {
      this.focusIndex(i);
      this.opts.onSelect(i);
    });

    if (item.icon) {
      const img = document.createElement('img');
      img.className = 'row-icon';
      img.loading = 'lazy';
      img.src = item.icon;
      img.onerror = () => img.remove();
      row.appendChild(img);
    }

    const text = document.createElement('div');
    text.className = 'row-text';
    const label = document.createElement('div');
    label.className = 'row-label';
    label.textContent = item.label;
    text.appendChild(label);
    if (item.sublabel) {
      const sub = document.createElement('div');
      sub.className = 'row-sub';
      sub.textContent = item.sublabel;
      text.appendChild(sub);
    }
    row.appendChild(text);
    return row;
  }
}
