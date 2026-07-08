import { SEARCH_LIMIT, type SearchHit } from '../data/search';
import type { RemoteAction } from '../platform/keys';
import { ListView, type ListItem } from './list-view';
import type { Screen } from './screen';

export interface SearchViewOptions {
  /** Titulo na barra do header (ex.: 'Filmes — categorias'; global usa '🔍'). */
  title: string;
  /** Placeholder do input (default: dica generica). */
  placeholder?: string;
  /** Conteudo com query vazia (ex.: categorias da secao). Sem base: lista vazia + dica. */
  base?: {
    items: ListItem[];
    hint: string;
    emptyText?: string;
    onSelect: (index: number) => void;
  };
  /** Foca o input ao abrir (busca global). Secoes começam na lista/base. */
  autoFocus?: boolean;
  /** Busca no catalogo; a 1a chamada carrega as listas (onStage reporta o passo). */
  search: (query: string, onStage?: (stage: string) => void) => Promise<SearchHit[]>;
  onSelect: (hit: SearchHit) => void;
  onBack: () => void;
}

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;
const HINT = 'Digite o nome de um filme, série ou canal';
const KIND_LABEL: Record<SearchHit['kind'], string> = {
  live: 'Ao Vivo',
  movie: 'Filme',
  series: 'Série',
};

/**
 * Tela com busca no header: [titulo | input] + ListView embutida (virtualizada).
 * Com `base` (secoes), a lista mostra a base (categorias) e digitar ≥2 letras
 * troca pelos resultados; limpar volta pra base. Digitar re-busca com debounce;
 * ▼/OK saem do input pra lista, ▲ no topo da lista volta pro input. Focar o
 * input abre o teclado do Tizen; ele trata os proprios eventos (o keydown
 * global ignora alvos editaveis).
 */
export class SearchView implements Screen {
  readonly el: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly results: HTMLElement;
  private readonly list: ListView;
  private hits: SearchHit[] = [];
  private showingBase: boolean;
  private seq = 0;
  private debTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly opts: SearchViewOptions) {
    this.showingBase = !!opts.base;

    this.el = document.createElement('div');
    this.el.className = 'screen search';

    const bar = document.createElement('div');
    bar.className = 'screen-header search-bar';
    const title = document.createElement('span');
    title.className = 'search-title';
    title.textContent = opts.title;
    this.input = document.createElement('input');
    this.input.className = 'search-input';
    this.input.type = 'text';
    this.input.placeholder = opts.placeholder ?? HINT;
    this.input.spellcheck = false;
    this.input.setAttribute('autocapitalize', 'off');
    this.input.setAttribute('autocomplete', 'off');
    this.input.addEventListener('input', () => this.scheduleSearch());
    this.input.addEventListener('keydown', (e) => {
      if (e.keyCode === 40 || e.keyCode === 13) {
        // ▼/OK: fecha o teclado e desce pra lista
        e.preventDefault();
        this.input.blur();
      } else if (e.keyCode === 27 || e.keyCode === 10009) {
        e.preventDefault();
        this.opts.onBack();
      }
    });
    bar.appendChild(title);
    bar.appendChild(this.input);

    this.status = document.createElement('div');
    this.status.className = 'search-status';
    this.status.textContent = opts.base?.hint ?? HINT;

    this.results = document.createElement('div');
    this.results.className = 'search-results';
    this.list = new ListView({
      items: opts.base?.items ?? [],
      emptyText: opts.base?.emptyText ?? '',
      onSelect: (i) => {
        if (this.showingBase) this.opts.base?.onSelect(i);
        else if (this.hits[i]) this.opts.onSelect(this.hits[i]);
      },
    });

    this.el.appendChild(bar);
    this.el.appendChild(this.status);
    this.el.appendChild(this.results);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.el);
    this.list.mount(this.results);
    if (this.opts.autoFocus) setTimeout(() => this.input.focus(), 60);
  }

  setVisible(visible: boolean): void {
    this.el.style.display = visible ? '' : 'none';
    if (visible) this.list.setVisible(true);
  }

  destroy(): void {
    if (this.debTimer) clearTimeout(this.debTimer);
    this.seq++; // invalida buscas em voo
    this.list.destroy();
    this.el.remove();
  }

  handleAction(action: RemoteAction): void {
    if (action === 'back') {
      this.opts.onBack();
      return;
    }
    if (action === 'up' && this.list.focusedIndex === 0) {
      this.input.focus();
      return;
    }
    this.list.handleAction(action);
  }

  private scheduleSearch(): void {
    if (this.debTimer) clearTimeout(this.debTimer);
    this.debTimer = setTimeout(() => void this.run(), DEBOUNCE_MS);
  }

  private async run(): Promise<void> {
    const q = this.input.value.trim();
    const seq = ++this.seq;
    if (q.length < MIN_CHARS) {
      // query vazia/curta: volta pra base (categorias) ou lista vazia (global)
      this.hits = [];
      this.showingBase = !!this.opts.base;
      this.list.setItems(this.opts.base?.items ?? [], this.opts.base?.emptyText ?? '');
      this.status.textContent = q
        ? `Digite pelo menos ${MIN_CHARS} letras`
        : (this.opts.base?.hint ?? HINT);
      return;
    }
    this.status.textContent = 'Buscando…';
    try {
      const hits = await this.opts.search(q, (stage) => {
        if (seq === this.seq)
          this.status.textContent = `Carregando catálogo — ${stage}… (a 1ª busca demora mais)`;
      });
      if (seq !== this.seq) return; // resposta velha: o usuario ja digitou mais
      this.hits = hits;
      this.showingBase = false;
      this.list.setItems(
        hits.map((h) => ({ label: h.name, sublabel: KIND_LABEL[h.kind], icon: h.logo })),
        'Nenhum resultado',
      );
      this.status.textContent = hits.length
        ? `${hits.length >= SEARCH_LIMIT ? `${SEARCH_LIMIT}+` : hits.length} resultado${hits.length > 1 ? 's' : ''}`
        : `Nada encontrado para “${q}”`;
    } catch {
      if (seq === this.seq) this.status.textContent = 'Erro na busca — tente de novo';
    }
  }
}
