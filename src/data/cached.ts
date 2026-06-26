import type { KvStore } from '../cache/kv';
import type { Source } from './source';
import type { Category, ContentKind, Episode, EpgEntry, Series, Stream } from './types';

const ONE_HOUR = 60 * 60 * 1000;

/**
 * Embrulha qualquer Source com cache em KvStore.
 * O catalogo (categorias/streams/series/episodios) e cacheado por `ttl` (default 1h).
 * O EPG NAO e cacheado (dado ao vivo) — delega direto ao inner.
 */
export class CachedSource implements Source {
  constructor(
    private readonly inner: Source,
    private readonly store: KvStore,
    private readonly ttl: number = ONE_HOUR,
  ) {}

  categories(kind: ContentKind): Promise<Category[]> {
    return this.cached(`categories:${kind}`, () => this.inner.categories(kind));
  }

  streams(kind: 'live' | 'movie', categoryId: string): Promise<Stream[]> {
    return this.cached(`streams:${kind}:${categoryId}`, () => this.inner.streams(kind, categoryId));
  }

  series(categoryId: string): Promise<Series[]> {
    return this.cached(`series:${categoryId}`, () => this.inner.series(categoryId));
  }

  episodes(seriesId: string): Promise<Episode[]> {
    return this.cached(`episodes:${seriesId}`, () => this.inner.episodes(seriesId));
  }

  shortEpg(channelId: string, limit?: number): Promise<EpgEntry[]> {
    return this.inner.shortEpg(channelId, limit); // sempre fresco
  }

  /** Apaga todo o cache do catalogo (botao "Limpar cache"). */
  clear(): Promise<void> {
    return this.store.clear();
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    try {
      const rec = await this.store.get(key);
      if (rec && Date.now() - rec.fetchedAt < this.ttl) {
        return rec.value as T;
      }
    } catch {
      /* leitura do cache falhou — segue para a rede */
    }
    const value = await load();
    try {
      await this.store.set(key, { fetchedAt: Date.now(), value });
    } catch {
      /* escrita no cache falhou — ignora */
    }
    return value;
  }
}
