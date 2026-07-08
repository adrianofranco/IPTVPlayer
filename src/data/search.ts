import type { Source } from './source';
import type { ContentKind } from './types';

/** Teto de resultados por busca (mantem a lista leve na TV). */
export const SEARCH_LIMIT = 200;

/** Resultado de busca: o minimo p/ listar e abrir o item. */
export type SearchHit =
  | {
      kind: 'live' | 'movie';
      id: string;
      name: string;
      logo?: string;
      url: string;
      epgChannelId?: string;
    }
  | { kind: 'series'; id: string; name: string; logo?: string };

interface Entry {
  norm: string;
  hit: SearchHit;
}

/**
 * Busca local sobre o catalogo completo (a Player API nao tem busca): as
 * listas inteiras de live/filmes/series sao pedidas SEM category_id (caem no
 * cache de 1h como o resto) e viram um indice em memoria de nome normalizado.
 * A instancia deve viver so enquanto a tela de busca existe — ~30k entradas
 * slim e o maximo que seguramos, e por tempo limitado.
 */
export class CatalogSearch {
  private entries?: Entry[];
  private loading?: Promise<void>;

  /** `kinds` restringe o escopo (ex.: busca da secao Filmes = ['movie']). */
  constructor(
    private readonly source: Source,
    private readonly kinds: ContentKind[] = ['live', 'movie', 'series'],
  ) {}

  /** Carrega o indice na 1a chamada (sequencial p/ limitar pico de memoria). */
  ensureLoaded(onStage?: (stage: string) => void): Promise<void> {
    if (!this.loading) this.loading = this.load(onStage);
    return this.loading;
  }

  private async load(onStage?: (stage: string) => void): Promise<void> {
    const entries: Entry[] = [];
    if (this.kinds.indexOf('live') >= 0) {
      onStage?.('canais');
      for (const s of await this.source.streams('live')) {
        entries.push({
          norm: normalize(s.name),
          hit: { kind: 'live', id: s.id, name: s.name, logo: s.logo, url: s.url, epgChannelId: s.epgChannelId },
        });
      }
    }
    if (this.kinds.indexOf('movie') >= 0) {
      onStage?.('filmes');
      for (const s of await this.source.streams('movie')) {
        entries.push({
          norm: normalize(s.name),
          hit: { kind: 'movie', id: s.id, name: s.name, logo: s.logo, url: s.url },
        });
      }
    }
    if (this.kinds.indexOf('series') >= 0) {
      onStage?.('séries');
      for (const s of await this.source.series()) {
        entries.push({
          norm: normalize(s.name),
          hit: { kind: 'series', id: s.id, name: s.name, logo: s.logo },
        });
      }
    }
    this.entries = entries;
  }

  /** Todos os termos precisam bater (AND); prefixo do 1o termo rankeia antes. */
  search(query: string, limit = SEARCH_LIMIT): SearchHit[] {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    if (!tokens.length || !this.entries) return [];
    const starts: SearchHit[] = [];
    const contains: SearchHit[] = [];
    for (const e of this.entries) {
      let ok = true;
      for (const t of tokens) {
        if (e.norm.indexOf(t) < 0) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      (e.norm.startsWith(tokens[0]) ? starts : contains).push(e.hit);
      if (starts.length >= limit) break;
    }
    return starts.concat(contains).slice(0, limit);
  }
}

/** minusculas + sem acentos, p/ "acao" casar com "AÇÃO". */
function normalize(s: string): string {
  const lower = s.toLowerCase();
  // normalize() existe desde ES2015; TVs muito antigas caem no fallback sem acentos
  const nfd = typeof lower.normalize === 'function' ? lower.normalize('NFD') : lower;
  return nfd.replace(/[\u0300-\u036f]/g, '');
}
