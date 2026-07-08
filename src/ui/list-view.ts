import type { RemoteAction } from '../platform/keys';
import type { Screen } from './screen';

export interface ListItem {
  label: string;
  sublabel?: string;
  icon?: string;
}

export interface ListViewOptions {
  /** Sem title → sem header (uso embutido, ex.: resultados da busca). */
  title?: string;
  items: ListItem[];
  onSelect: (index: number) => void;
  onBack?: () => void;
  emptyText?: string;
  /** Comeca focado neste indice (preserva a posicao ao alternar lista↔grade). */
  initialIndex?: number;
  /** Alternar visualizacao: tecla AMARELA ou clique no botao do header. */
  viewToggle?: { label: string; onToggle: () => void };
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
  private items: ListItem[];
  private emptyText: string;
  private emptyEl?: HTMLElement;
  private toggleBtn?: HTMLButtonElement;
  private headerFocused = false;
  private index = 0;
  private scroll = 0;

  constructor(private readonly opts: ListViewOptions) {
    this.items = opts.items;
    this.emptyText = opts.emptyText ?? 'Vazio';

    this.el = document.createElement('div');
    this.el.className = 'screen';

    if (opts.title !== undefined) {
      const header = document.createElement('div');
      header.className = 'screen-header';
      const title = document.createElement('span');
      title.className = 'header-title';
      title.textContent = opts.title;
      header.appendChild(title);
      if (opts.viewToggle) {
        const btn = document.createElement('button');
        btn.className = 'view-toggle';
        btn.textContent = `🟡 ${opts.viewToggle.label}`;
        btn.addEventListener('click', () => this.opts.viewToggle?.onToggle());
        header.appendChild(btn);
        this.toggleBtn = btn;
      }
      this.el.appendChild(header);
    }

    this.viewport = document.createElement('div');
    this.viewport.className = 'list-viewport';

    // rolagem por mouse (dev); a TV usa D-pad
    this.viewport.addEventListener(
      'wheel',
      (e) => {
        this.scrollBy(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );

    this.el.appendChild(this.viewport);
  }

  /** Troca os itens (ex.: resultados da busca) e volta o foco pro topo. */
  setItems(items: ListItem[], emptyText?: string): void {
    this.items = items;
    if (emptyText !== undefined) this.emptyText = emptyText;
    this.index = 0;
    this.scroll = 0;
    this.render();
  }

  /** Indice focado — p/ o dono decidir transicoes de foco (ex.: busca ▲ → input). */
  get focusedIndex(): number {
    return this.index;
  }

  /** Foca (e revela) o item `i` — ex.: sincronizar com o canal zapeado. */
  focusItem(i: number): void {
    if (!this.items.length) return;
    this.focusIndex(Math.max(0, Math.min(this.items.length - 1, i)));
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.el);
    this.focusIndex(Math.max(0, Math.min(this.items.length - 1, this.opts.initialIndex ?? 0)));
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
        // ▲ no topo foca o botao lista↔grade do header (controles novos nao
        // tem tecla amarela fisica); ▼ volta pra lista
        if (this.headerFocused) break;
        if (this.index === 0 && this.toggleBtn) this.setHeaderFocus(true);
        else this.move(-1);
        break;
      case 'down':
        if (this.headerFocused) this.setHeaderFocus(false);
        else this.move(1);
        break;
      case 'enter':
        if (this.headerFocused) this.opts.viewToggle?.onToggle();
        else if (this.items.length) this.opts.onSelect(this.index);
        break;
      case 'yellow':
        this.opts.viewToggle?.onToggle();
        break;
      case 'back':
        this.opts.onBack?.();
        break;
      default:
        break;
    }
  }

  private setHeaderFocus(focused: boolean): void {
    this.headerFocused = focused;
    this.toggleBtn?.classList.toggle('focused', focused);
    this.render(); // linha focada solta/recupera o destaque
  }

  private move(delta: number): void {
    const n = this.items.length;
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
    const max = Math.max(0, this.items.length * ROW_H - vh);
    this.scroll = Math.max(0, Math.min(this.scroll, max));
  }

  private render(): void {
    const items = this.items;
    const vh = this.viewport.clientHeight || 720;
    const first = Math.max(0, Math.floor(this.scroll / ROW_H) - OVERSCAN);
    const last = Math.min(items.length - 1, Math.ceil((this.scroll + vh) / ROW_H) + OVERSCAN);

    for (const old of Array.from(this.viewport.querySelectorAll('.list-row'))) old.remove();
    for (let i = first; i <= last; i++) {
      this.viewport.appendChild(this.renderRow(i, items[i]));
    }

    if (!items.length) {
      if (!this.emptyEl) {
        this.emptyEl = document.createElement('div');
        this.emptyEl.className = 'list-empty';
        this.viewport.appendChild(this.emptyEl);
      }
      this.emptyEl.textContent = this.emptyText;
    } else if (this.emptyEl) {
      this.emptyEl.remove();
      this.emptyEl = undefined;
    }
  }

  private renderRow(i: number, item: ListItem): HTMLElement {
    const row = document.createElement('div');
    row.className = i === this.index && !this.headerFocused ? 'list-row focused' : 'list-row';
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
