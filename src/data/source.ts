import type {
  Category,
  ContentKind,
  Episode,
  EpgEntry,
  Series,
  Stream,
} from './types';

/**
 * Fonte de catalogo IPTV. Implementacoes:
 *  - XtreamSource (player_api.php) — caminho principal.
 *  - M3USource (parser de M3U)     — fallback / import.
 *
 * Tudo e lazy: a UI pede categorias primeiro e so busca itens da categoria
 * aberta. Nunca carregamos o catalogo inteiro em memoria.
 */
export interface Source {
  /** Categorias de um tipo de conteudo. */
  categories(kind: ContentKind): Promise<Category[]>;

  /** Canais ao vivo / filmes de uma categoria. */
  streams(kind: 'live' | 'movie', categoryId: string): Promise<Stream[]>;

  /** Series de uma categoria. */
  series(categoryId: string): Promise<Series[]>;

  /** Episodios de uma serie (temporadas achatadas), sob demanda. */
  episodes(seriesId: string): Promise<Episode[]>;

  /** EPG curto de um canal ao vivo. */
  shortEpg(channelId: string, limit?: number): Promise<EpgEntry[]>;
}
