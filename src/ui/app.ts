import { makeStore } from '../cache/kv';
import { CachedSource } from '../data/cached';
import { detectSource, type SourceConfig } from '../data/config';
import { createSource } from '../data/factory';
import { getLastWatched, saveLastWatched, updatePosition } from '../data/last-watched';
import { addSource, getActiveSource, getSources, setActive } from '../data/sources-store';
import type { Category, ContentKind, EpgEntry } from '../data/types';
import { isDebug, setDebug } from '../platform/debug';
import { actionFromKey, registerTizenKeys } from '../platform/keys';
import type { PlaySource } from '../player/player';
import { DetailView } from './detail-view';
import { FormView } from './form-view';
import { ListView, type ListItem } from './list-view';
import { PlayerView } from './player-view';
import type { Screen } from './screen';

/** Controlador da app: pilha de telas + fonte ativa + carga de dados (cacheada). */
export class App {
  private readonly stack: Screen[] = [];
  private source?: CachedSource;
  private activeName = '';

  constructor(private readonly root: HTMLElement) {}

  start(): void {
    registerTizenKeys();
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null;
      // enquanto um campo de texto está focado, deixa o browser/IME tratar
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const action = actionFromKey(e);
      if (!action) return;
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

  private resetToHome(): void {
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

  private async openCategories(kind: ContentKind): Promise<void> {
    try {
      const source = this.requireSource();
      const cats = await this.withLoading(() => source.categories(kind));
      const label = kind === 'live' ? 'Ao Vivo' : kind === 'movie' ? 'Filmes' : 'Séries';
      this.push(
        new ListView({
          title: `${label} — categorias`,
          items: cats.map((c) => ({ label: c.name })),
          onSelect: (i) => void this.openItems(kind, cats[i]),
          onBack: () => this.pop(),
          emptyText: 'Nenhuma categoria',
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
        this.push(
          new ListView({
            title: cat.name,
            items: list.map((s) => ({ label: s.name, icon: s.logo })),
            onSelect: (i) => void this.openEpisodes(list[i].name, list[i].id),
            onBack: () => this.pop(),
            emptyText: 'Vazio',
          }),
        );
        return;
      }
      const list = await this.withLoading(() => source.streams(kind, cat.id));
      this.push(
        new ListView({
          title: cat.name,
          items: list.map((s) => ({ label: s.name, icon: s.logo })),
          onSelect: (i) => {
            const s = list[i];
            void this.openDetail({
              title: s.name,
              url: s.url,
              kind: kind === 'live' ? 'live' : 'vod',
              epgChannelId: s.epgChannelId,
            });
          },
          onBack: () => this.pop(),
          emptyText: 'Vazio',
        }),
      );
    } catch (err) {
      this.fail(err);
    }
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
