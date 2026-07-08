import { makeStore } from '../cache/kv';
import { CachedSource } from '../data/cached';
import { detectSource, type SourceConfig } from '../data/config';
import { createSource } from '../data/factory';
import { getLastWatched, saveLastWatched, updatePosition } from '../data/last-watched';
import { CatalogSearch, type SearchHit } from '../data/search';
import { addSource, getActiveSource, getSources, setActive } from '../data/sources-store';
import type { Category, ContentKind, EpgEntry, Stream } from '../data/types';
import { dbg, isDebug, setDebug } from '../platform/debug';
import { actionFromKey, registerTizenKeys } from '../platform/keys';
import type { PlaySource } from '../player/player';
import { DetailView } from './detail-view';
import { FormView } from './form-view';
import { GridView } from './grid-view';
import { ListView, type ListItem } from './list-view';
import { LiveBackdrop } from './live-backdrop';
import { LiveWatchView } from './live-watch';
import { PlayerView } from './player-view';
import { SearchView } from './search-view';
import { getViewMode, setViewMode, type ViewMode } from './view-mode';
import type { Screen } from './screen';

/** Controlador da app: pilha de telas + fonte ativa + carga de dados (cacheada). */
export class App {
  private readonly stack: Screen[] = [];
  private source?: CachedSource;
  private activeName = '';
  private liveBackdrop?: LiveBackdrop;

  constructor(private readonly root: HTMLElement) {}

  start(): void {
    registerTizenKeys();
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null;
      // enquanto um campo de texto está focado, deixa o browser/IME tratar
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const action = actionFromKey(e);
      if (!action) {
        dbg(`tecla não mapeada: keyCode=${e.keyCode} key=${e.key}`);
        return;
      }
      e.preventDefault();
      this.top?.handleAction(action);
    });

    const active = getActiveSource() ?? this.envSource();
    if (active) {
      this.useSource(active);
      this.openHome();
    } else {
      this.openSources(true); // sem fonte: tela de fontes como raiz
    }
  }

  /**
   * Fonte de conveniência via VITE_XTREAM_BASE. Ativa em `npm run dev` OU quando
   * `VITE_DEV_TIME === 'true'` (permite embutir a lista no build/wgt p/ testar na
   * TV sem digitar a URL). ⚠️ Com a flag ligada, as credenciais ENTRAM no bundle —
   * deixar `VITE_DEV_TIME=false` no build "de verdade".
   */
  private envSource(): SourceConfig | null {
    const useEnv = import.meta.env.DEV || import.meta.env.VITE_DEV_TIME === 'true';
    const base = useEnv ? import.meta.env.VITE_XTREAM_BASE : undefined;
    return base ? detectSource(base, 'Lista (env)') : null;
  }

  // ---- pilha ----
  private get top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  private push(view: Screen): void {
    this.top?.setVisible(false);
    this.stack.push(view);
    view.mount(this.root);
  }

  private pop(): void {
    if (this.stack.length <= 1) return;
    this.stack.pop()?.destroy();
    this.top?.setVisible(true);
  }

  /** Troca a tela do topo sem mexer no resto da pilha (toggle lista↔grade). */
  private swapTop(view: Screen): void {
    this.stack.pop()?.destroy();
    this.stack.push(view);
    view.mount(this.root);
  }

  private resetToHome(): void {
    this.stopLiveBackdrop();
    while (this.stack.length) this.stack.pop()?.destroy();
    this.openHome();
  }

  // ---- fonte ----
  private useSource(cfg: SourceConfig): void {
    this.source = new CachedSource(createSource(cfg), makeStore());
    this.activeName = cfg.name;
  }

  private requireSource(): CachedSource {
    if (!this.source) throw new Error('Nenhuma fonte ativa');
    return this.source;
  }

  // ---- telas ----
  private openHome(): void {
    const items: ListItem[] = [];
    const actions: Array<() => void> = [];

    const lw = getLastWatched();
    if (lw) {
      items.push({
        label: `▶  Continuar: ${lw.title}`,
        sublabel: lw.kind === 'live' ? 'Ao Vivo' : 'Vídeo',
      });
      actions.push(() =>
        this.openPlayer(
          { url: lw.url, kind: lw.kind, title: lw.title, epgChannelId: lw.epgChannelId },
          lw.positionSec,
        ),
      );
    }

    const add = (label: string, fn: () => void): void => {
      items.push({ label });
      actions.push(fn);
    };
    add('📺  Ao Vivo', () => void this.openCategories('live'));
    add('🎬  Filmes', () => void this.openCategories('movie'));
    add('📚  Séries', () => void this.openCategories('series'));
    add('🔍  Buscar', () => this.openSearch());
    add('⚙️  Opções', () => this.openSettings());

    this.push(
      new ListView({ title: 'IPTV Player', items, onSelect: (i) => actions[i]() }),
    );
  }

  private openSettings(): void {
    const items: ListItem[] = [
      { label: '🗂️  Fontes (listas)', sublabel: this.activeName ? `ativa: ${this.activeName}` : undefined },
      { label: '🗑️  Limpar cache' },
      { label: `🐞  Debug na tela: ${isDebug() ? 'ON' : 'OFF'}` },
    ];
    this.push(
      new ListView({
        title: 'Opções',
        items,
        onSelect: (i) => {
          if (i === 0) this.openSources();
          else if (i === 1) void this.clearCache();
          else {
            setDebug(!isDebug());
            this.pop();
            this.openSettings(); // re-renderiza o label ON/OFF
          }
        },
        onBack: () => this.pop(),
      }),
    );
  }

  private openSources(asRoot = false): void {
    const sources = getSources();
    const active = getActiveSource();
    const items: ListItem[] = sources.map((s) => ({
      label: `${active && s.id === active.id ? '● ' : ''}${s.name}`,
      sublabel: describeSource(s),
    }));
    items.push({ label: '➕  Adicionar lista' });

    this.push(
      new ListView({
        title: asRoot ? 'Adicione uma lista para começar' : 'Fontes (listas)',
        items,
        onSelect: (i) => {
          if (i === sources.length) {
            this.openAddSource();
          } else {
            setActive(sources[i].id);
            this.useSource(sources[i]);
            this.resetToHome();
          }
        },
        onBack: asRoot ? undefined : () => this.pop(),
      }),
    );
  }

  private openAddSource(): void {
    this.push(
      new FormView({
        title: 'Adicionar lista',
        label: 'URL da lista (Xtream get.php ou M3U)',
        placeholder: 'http://host:porta/get.php?username=...&password=...',
        onSubmit: (value) => {
          let name = 'Lista';
          try {
            name = new URL(value).host || name;
          } catch {
            /* mantem o nome padrao */
          }
          const cfg = detectSource(value, name);
          addSource(cfg); // persiste e ativa
          this.useSource(cfg);
          this.resetToHome();
        },
        onBack: () => this.pop(),
      }),
    );
  }

  private openSearch(): void {
    const source = this.requireSource();
    // o indice (~30k entradas slim) vive so enquanto a tela de busca existe
    const index = new CatalogSearch(source);
    this.push(
      new SearchView({
        title: '🔍',
        autoFocus: true,
        search: async (q, onStage) => {
          await index.ensureLoaded(onStage);
          return index.search(q);
        },
        onSelect: (hit) => this.openHit(hit),
        onBack: () => this.pop(),
      }),
    );
  }

  /** Abre um resultado de busca: serie → episodios; filme/canal → detalhe. */
  private openHit(hit: SearchHit): void {
    if (hit.kind === 'series') {
      void this.openEpisodes(hit.name, hit.id);
    } else {
      void this.openDetail({
        title: hit.name,
        url: hit.url,
        kind: hit.kind === 'live' ? 'live' : 'vod',
        epgChannelId: hit.epgChannelId,
      });
    }
  }

  // ---- Ao Vivo: modo TV (video atras, telas translucidas, zapping) ----
  private async openLive(): Promise<void> {
    try {
      const source = this.requireSource();
      const [cats, all] = await this.withLoading(() =>
        Promise.all([source.categories('live'), source.streams('live')]),
      );
      // ordem de zap/numeracao = num do provider
      const channels = all.slice().sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
      this.startLiveBackdrop(channels);

      const counts: Record<string, number> = {};
      for (const c of channels) counts[c.categoryId] = (counts[c.categoryId] ?? 0) + 1;
      const index = new CatalogSearch(source, ['live']);
      this.push(
        new SearchView({
          title: 'Ao Vivo — categorias',
          placeholder: 'Buscar em Ao Vivo…',
          base: {
            items: cats.map((c) => ({ label: c.name, sublabel: `${counts[c.id] ?? 0} canais` })),
            hint: '▲ no topo da lista para buscar em Ao Vivo',
            emptyText: 'Nenhuma categoria',
            onSelect: (i) => this.openLiveChannels(cats[i], cats, channels),
          },
          search: async (q, onStage) => {
            await index.ensureLoaded(onStage);
            return index.search(q);
          },
          onSelect: (hit) => {
            const s = channels.find((c) => c.id === hit.id);
            if (s) this.watchLive(channels, s);
          },
          onBack: () => {
            this.stopLiveBackdrop(); // sair da secao desliga o video
            this.pop();
          },
        }),
      );
    } catch (err) {
      this.fail(err);
    }
  }

  private openLiveChannels(
    cat: Category,
    cats: Category[],
    channels: Stream[],
    initialIndex?: number,
    swap = false,
  ): void {
    const list = channels.filter((s) => s.categoryId === cat.id);
    const view = new ListView({
      title: cat.name,
      items: list.map((s, i) => ({ label: `${s.num ?? i + 1} · ${s.name}`, icon: s.logo })),
      initialIndex,
      onSelect: (i) =>
        this.watchLive(channels, list[i], (cur) => {
          // volta do modo assistir focando o canal zapeado; se ele for de
          // OUTRA categoria, troca a lista pela categoria dele
          const idx = list.findIndex((c) => c.id === cur.id);
          if (idx >= 0) return view.focusItem(idx);
          const dest = cats.find((c) => c.id === cur.categoryId);
          if (!dest) return;
          const destIdx = channels
            .filter((s) => s.categoryId === dest.id)
            .findIndex((s) => s.id === cur.id);
          this.openLiveChannels(dest, cats, channels, Math.max(0, destIdx), true);
        }),
      onBack: () => this.pop(),
      emptyText: 'Vazio',
    });
    if (swap) this.swapTop(view);
    else this.push(view);
  }

  /** Troca o canal do backdrop e persiste como ultimo assistido. */
  private zapLive(s: Stream): void {
    this.liveBackdrop?.play({ url: s.url, kind: 'live', title: s.name, epgChannelId: s.epgChannelId });
    saveLastWatched({ title: s.name, url: s.url, kind: 'live', epgChannelId: s.epgChannelId, ts: Date.now() });
  }

  /** Modo assistir: some a lista, banner de canal, ▲▼/CH∧∨ zapeiam. */
  private watchLive(channels: Stream[], s: Stream, onExitSync?: (cur: Stream) => void): void {
    this.zapLive(s);
    this.push(
      new LiveWatchView({
        channels,
        startIndex: Math.max(0, channels.findIndex((c) => c.id === s.id)),
        epg: (ch) => this.requireSource().shortEpg(ch, 1),
        onZap: (c) => this.zapLive(c),
        onExit: (cur) => {
          this.pop();
          onExitSync?.(cur);
        },
      }),
    );
  }

  private startLiveBackdrop(channels: Stream[]): void {
    if (this.liveBackdrop) return;
    // feedback de sintonia/erro fica no proprio backdrop (persistente),
    // nao em toast (que some e deixa a tela preta sem explicacao)
    this.liveBackdrop = new LiveBackdrop(this.root);
    // autoplay: ultimo assistido se for canal ao vivo; senao o canal padrao.
    // Nao salva como "ultimo assistido" — so escolha explicita conta.
    const lw = getLastWatched();
    if (lw && lw.kind === 'live') {
      this.liveBackdrop.play({ url: lw.url, kind: 'live', title: lw.title, epgChannelId: lw.epgChannelId });
      return;
    }
    const def = defaultChannel(channels);
    if (def) {
      this.liveBackdrop.play({ url: def.url, kind: 'live', title: def.name, epgChannelId: def.epgChannelId });
    }
  }

  private stopLiveBackdrop(): void {
    this.liveBackdrop?.destroy();
    this.liveBackdrop = undefined;
  }

  private async openCategories(kind: ContentKind): Promise<void> {
    if (kind === 'live') return this.openLive();
    try {
      const source = this.requireSource();
      const cats = await this.withLoading(() => source.categories(kind));
      const label = kind === 'movie' ? 'Filmes' : 'Séries';
      const index = new CatalogSearch(source, [kind]); // busca escopada na secao
      this.push(
        new SearchView({
          title: `${label} — categorias`,
          placeholder: `Buscar em ${label}…`,
          base: {
            items: cats.map((c) => ({ label: c.name })),
            hint: `▲ no topo da lista para buscar em ${label}`,
            emptyText: 'Nenhuma categoria',
            onSelect: (i) => void this.openItems(kind, cats[i]),
          },
          search: async (q, onStage) => {
            await index.ensureLoaded(onStage);
            return index.search(q);
          },
          onSelect: (hit) => this.openHit(hit),
          onBack: () => this.pop(),
        }),
      );
    } catch (err) {
      this.fail(err);
    }
  }

  private async openItems(kind: ContentKind, cat: Category): Promise<void> {
    try {
      const source = this.requireSource();
      if (kind === 'series') {
        const list = await this.withLoading(() => source.series(cat.id));
        this.pushBrowse(
          cat.name,
          list.map((s) => ({ label: s.name, icon: s.logo })),
          (i) => void this.openEpisodes(list[i].name, list[i].id),
        );
        return;
      }
      const list = await this.withLoading(() => source.streams(kind, cat.id));
      const items = list.map((s) => ({ label: s.name, icon: s.logo }));
      const onSelect = (i: number): void => {
        const s = list[i];
        void this.openDetail({
          title: s.name,
          url: s.url,
          kind: kind === 'live' ? 'live' : 'vod',
          epgChannelId: s.epgChannelId,
        });
      };
      if (kind === 'live') {
        // canais: sempre lista (logos horizontais + espaco p/ EPG na linha)
        this.push(
          new ListView({ title: cat.name, items, onSelect, onBack: () => this.pop(), emptyText: 'Vazio' }),
        );
      } else {
        this.pushBrowse(cat.name, items, onSelect);
      }
    } catch (err) {
      this.fail(err);
    }
  }

  /**
   * Filmes/Series: lista OU grade conforme a preferencia persistida, com
   * toggle (tecla amarela / botao no header) que troca a tela no lugar
   * preservando o item focado.
   */
  private pushBrowse(title: string, items: ListItem[], onSelect: (i: number) => void): void {
    const make = (mode: ViewMode, initialIndex: number): ListView | GridView => {
      const toggle = {
        label: mode === 'grid' ? 'Lista' : 'Grade',
        onToggle: (): void => {
          const next: ViewMode = mode === 'grid' ? 'list' : 'grid';
          setViewMode(next);
          this.swapTop(make(next, view.focusedIndex));
        },
      };
      const opts = {
        title,
        items,
        initialIndex,
        onSelect,
        onBack: () => this.pop(),
        emptyText: 'Vazio',
        viewToggle: toggle,
      };
      const view = mode === 'grid' ? new GridView(opts) : new ListView(opts);
      return view;
    };
    this.push(make(getViewMode(), 0));
  }

  private async openEpisodes(seriesName: string, seriesId: string): Promise<void> {
    try {
      const source = this.requireSource();
      const eps = await this.withLoading(() => source.episodes(seriesId));
      this.push(
        new ListView({
          title: seriesName,
          items: eps.map((e) => ({ label: `S${e.season}E${e.episode}  ${e.title}` })),
          onSelect: (i) => {
            const e = eps[i];
            void this.openDetail({ title: e.title, url: e.url, kind: 'vod' });
          },
          onBack: () => this.pop(),
          emptyText: 'Sem episódios',
        }),
      );
    } catch (err) {
      this.fail(err);
    }
  }

  private async openDetail(playable: PlaySource): Promise<void> {
    let epg: EpgEntry[] | undefined;
    const ch = playable.epgChannelId;
    if (ch) {
      try {
        epg = await this.withLoading(() => this.requireSource().shortEpg(ch, 4));
      } catch {
        epg = undefined;
      }
    }
    this.push(
      new DetailView({
        playable,
        epg,
        onPlay: (src) => this.openPlayer(src),
        onBack: () => this.pop(),
      }),
    );
  }

  private openPlayer(src: PlaySource, startAt?: number): void {
    saveLastWatched({
      title: src.title ?? '',
      url: src.url,
      kind: src.kind,
      epgChannelId: src.epgChannelId,
      positionSec: startAt,
      ts: Date.now(),
    });
    this.push(
      new PlayerView(src, {
        startAt: src.kind === 'vod' ? startAt : undefined,
        onClose: () => this.pop(),
        onProgress: src.kind === 'vod' ? (sec) => updatePosition(sec) : undefined,
      }),
    );
  }

  private async clearCache(): Promise<void> {
    try {
      await this.requireSource().clear();
      this.toast('Cache limpo ✓');
    } catch (err) {
      this.fail(err);
    }
  }

  // ---- util ----
  private async withLoading<T>(fn: () => Promise<T>): Promise<T> {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.textContent = 'Carregando…';
    this.root.appendChild(ov);
    try {
      return await fn();
    } finally {
      ov.remove();
    }
  }

  private toast(msg: string): void {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    this.root.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  private fail(err: unknown): void {
    console.error(err);
    this.toast('Erro ao carregar');
  }
}

function describeSource(s: SourceConfig): string {
  return s.type === 'xtream' ? 'Xtream' : s.type === 'm3u-url' ? 'M3U (URL)' : 'M3U (arquivo)';
}

const DEFAULT_LIVE = 'globo sp fhd';

/** Canal padrao do autoplay: "Globo SP FHD" exato → contendo → primeiro da lista. */
function defaultChannel(channels: Stream[]): Stream | undefined {
  const norm = (s: string): string => s.toLowerCase().trim();
  return (
    channels.find((c) => norm(c.name) === DEFAULT_LIVE) ??
    channels.find((c) => norm(c.name).includes(DEFAULT_LIVE)) ??
    channels[0]
  );
}
