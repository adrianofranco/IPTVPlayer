import type { RemoteAction } from '../platform/keys';
import type { ListItem } from './list-view';
import type { Screen } from './screen';

export interface GridViewOptions {
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

const CELL_W = 200; // largura-alvo da celula → colunas = floor(largura/CELL_W)
const ROW_H = 330; // capa 2:3 + legenda (bater com .grid-poster/.grid-label no CSS)
const OVERSCAN = 1; // linhas extras renderizadas acima/abaixo da viewport

/**
 * Grade de capas (Filmes/Series) com a MESMA virtualizacao deterministica da
 * ListView, so que por LINHA de N celulas: scroll controlado, translateY por
 * linha, DOM so com as linhas visiveis + overscan. D-pad 2D: ◀▶ anda 1 item,
 * ▲▼ pula uma linha. Capas lazy — so as linhas renderizadas pedem imagem.
 */
export class GridView implements Screen {
  readonly el: HTMLElement;
  private readonly viewport: HTMLElement;
  private items: ListItem[];
  private emptyEl?: HTMLElement;
  private toggleBtn?: HTMLButtonElement;
  private headerFocused = false;
  private index = 0;
  private scroll = 0;
  private cols = 5;

  constructor(private readonly opts: GridViewOptions) {
    this.items = opts.items;
    this.index = Math.max(0, Math.min(opts.items.length - 1, opts.initialIndex ?? 0));

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

  mount(parent: HTMLElement): void {
    parent.appendChild(this.el);
    this.focusIndex(this.index);
    // re-render quando o layout assentar (clientHeight/Width podem ser 0 no append)
    requestAnimationFrame(() => this.render());
  }

  setVisible(visible: boolean): void {
    this.el.style.display = visible ? '' : 'none';
    if (visible) requestAnimationFrame(() => this.render());
  }

  destroy(): void {
    this.el.remove();
  }

  /** Indice focado — p/ preservar a posicao ao alternar lista↔grade. */
  get focusedIndex(): number {
    return this.index;
  }

  handleAction(action: RemoteAction): void {
    const n = this.items.length;
    switch (action) {
      case 'left':
        this.moveBy(-1);
        break;
      case 'right':
        this.moveBy(1);
        break;
      case 'up': {
        if (this.headerFocused) break;
        const t = this.index - this.cols;
        if (t >= 0) this.focusIndex(t);
        // ▲ na primeira linha foca o botao lista↔grade do header (controles
        // novos nao tem tecla amarela fisica); ▼ volta pra grade
        else if (this.toggleBtn) this.setHeaderFocus(true);
        break;
      }
      case 'down': {
        if (this.headerFocused) {
          this.setHeaderFocus(false);
          break;
        }
        const t = this.index + this.cols;
        if (t < n) this.focusIndex(t);
        // ultima linha parcial: desce pro ultimo item em vez de travar
        else if (n && Math.floor(this.index / this.cols) < Math.floor((n - 1) / this.cols))
          this.focusIndex(n - 1);
        break;
      }
      case 'enter':
        if (this.headerFocused) this.opts.viewToggle?.onToggle();
        else if (n) this.opts.onSelect(this.index);
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
    this.render(); // celula focada solta/recupera o destaque
  }

  private moveBy(delta: number): void {
    const n = this.items.length;
    if (!n) return;
    this.focusIndex(Math.max(0, Math.min(n - 1, this.index + delta)));
  }

  private focusIndex(i: number): void {
    this.index = i;
    const vh = this.viewport.clientHeight || 720;
    const row = Math.floor(i / this.cols);
    const top = row * ROW_H;
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
    const rows = Math.ceil(this.items.length / this.cols);
    const max = Math.max(0, rows * ROW_H - vh);
    this.scroll = Math.max(0, Math.min(this.scroll, max));
  }

  private render(): void {
    const vw = this.viewport.clientWidth || window.innerWidth || 1280;
    this.cols = Math.max(2, Math.floor(vw / CELL_W));
    const vh = this.viewport.clientHeight || 720;
    const rows = Math.ceil(this.items.length / this.cols);
    const first = Math.max(0, Math.floor(this.scroll / ROW_H) - OVERSCAN);
    const last = Math.min(rows - 1, Math.ceil((this.scroll + vh) / ROW_H) + OVERSCAN);

    for (const old of Array.from(this.viewport.querySelectorAll('.grid-row'))) old.remove();
    for (let r = first; r <= last; r++) this.viewport.appendChild(this.renderRow(r));

    if (!this.items.length) {
      if (!this.emptyEl) {
        this.emptyEl = document.createElement('div');
        this.emptyEl.className = 'list-empty';
        this.viewport.appendChild(this.emptyEl);
      }
      this.emptyEl.textContent = this.opts.emptyText ?? 'Vazio';
    } else if (this.emptyEl) {
      this.emptyEl.remove();
      this.emptyEl = undefined;
    }
  }

  private renderRow(r: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'grid-row';
    row.style.height = `${ROW_H}px`;
    row.style.transform = `translateY(${r * ROW_H - this.scroll}px)`;
    const from = r * this.cols;
    const to = Math.min(this.items.length, from + this.cols);
    for (let i = from; i < to; i++) row.appendChild(this.renderCell(i, this.items[i]));
    return row;
  }

  private renderCell(i: number, item: ListItem): HTMLElement {
    const cell = document.createElement('div');
    cell.className = i === this.index && !this.headerFocused ? 'grid-cell focused' : 'grid-cell';
    cell.style.width = `${100 / this.cols}%`;
    cell.addEventListener('click', () => {
      this.focusIndex(i);
      this.opts.onSelect(i);
    });

    const poster = document.createElement('div');
    poster.className = 'grid-poster';
    if (item.icon) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = item.icon;
      img.onerror = () => img.remove(); // capa quebrada: fica a caixa escura
      poster.appendChild(img);
    }

    const label = document.createElement('div');
    label.className = 'grid-label';
    label.textContent = item.label;

    cell.appendChild(poster);
    cell.appendChild(label);
    return cell;
  }
}
