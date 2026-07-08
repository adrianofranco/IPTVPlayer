import type { Source } from './source';
import type {
  Category,
  ContentKind,
  Episode,
  EpgEntry,
  Series,
  Stream,
  XtreamCredentials,
} from './types';
import { gatewayBase, getJson } from '../platform/http';

// ---- Formas cruas da Player API (apenas os campos que usamos). ----
interface RawCategory {
  category_id: string | number;
  category_name: string;
}
interface RawStream {
  stream_id: string | number;
  name: string;
  category_id?: string | number;
  stream_icon?: string;
  container_extension?: string;
}
interface RawSeries {
  series_id: string | number;
  name: string;
  category_id?: string | number;
  cover?: string;
  plot?: string;
}
interface RawEpisode {
  id: string | number;
  title?: string;
  season?: string | number;
  episode_num?: string | number;
  container_extension?: string;
}
interface RawSeriesInfo {
  episodes?: Record<string, RawEpisode[]>;
}
interface RawEpg {
  title?: string;
  description?: string;
  start_timestamp?: string | number;
  stop_timestamp?: string | number;
}

export interface XtreamOptions {
  /** Extensao para montar a URL de live. Default 'm3u8' (HLS). */
  liveExt?: 'm3u8' | 'ts';
}

/**
 * Source baseada na Xtream Codes Player API (player_api.php).
 * Tudo lazy: a UI pede categorias e so busca itens da categoria aberta.
 */
export class XtreamSource implements Source {
  private readonly base: string;
  private readonly auth: string;
  private readonly liveExt: 'm3u8' | 'ts';

  constructor(
    private readonly creds: XtreamCredentials,
    opts: XtreamOptions = {},
  ) {
    this.base = gatewayBase(creds);
    this.auth =
      `username=${encodeURIComponent(creds.username)}` +
      `&password=${encodeURIComponent(creds.password)}`;
    this.liveExt = opts.liveExt ?? 'm3u8';
  }

  async categories(kind: ContentKind): Promise<Category[]> {
    const action =
      kind === 'live'
        ? 'get_live_categories'
        : kind === 'movie'
          ? 'get_vod_categories'
          : 'get_series_categories';
    const raw = await getJson<RawCategory[]>(this.api(action));
    return raw.map((c) => ({ id: String(c.category_id), name: c.category_name, kind }));
  }

  async streams(kind: 'live' | 'movie', categoryId?: string): Promise<Stream[]> {
    const action = kind === 'live' ? 'get_live_streams' : 'get_vod_streams';
    const raw = await getJson<RawStream[]>(
      this.api(action, categoryId ? { category_id: categoryId } : {}),
    );
    return raw.map((s) => this.toStream(kind, s));
  }

  async series(categoryId?: string): Promise<Series[]> {
    const raw = await getJson<RawSeries[]>(
      this.api('get_series', categoryId ? { category_id: categoryId } : {}),
    );
    return raw.map((s) => ({
      id: String(s.series_id),
      name: s.name,
      categoryId: String(s.category_id ?? categoryId ?? ''),
      logo: s.cover || undefined,
      plot: s.plot || undefined,
    }));
  }

  async episodes(seriesId: string): Promise<Episode[]> {
    const info = await getJson<RawSeriesInfo>(this.api('get_series_info', { series_id: seriesId }));
    const seasons = info.episodes ?? {};
    const out: Episode[] = [];
    for (const key of Object.keys(seasons)) {
      for (const ep of seasons[key]) {
        out.push({
          id: String(ep.id),
          seriesId,
          season: Number(ep.season ?? key),
          episode: Number(ep.episode_num ?? 0),
          title: ep.title || `S${key}E${ep.episode_num ?? ''}`,
          url: this.streamUrl('series', String(ep.id), ep.container_extension),
          ext: ep.container_extension,
        });
      }
    }
    return out.sort((a, b) => a.season - b.season || a.episode - b.episode);
  }

  async shortEpg(channelId: string, limit = 8): Promise<EpgEntry[]> {
    const raw = await getJson<{ epg_listings?: RawEpg[] }>(
      this.api('get_short_epg', { stream_id: channelId, limit: String(limit) }),
    );
    return (raw.epg_listings ?? []).map((e) => ({
      channelId,
      title: decodeBase64(e.title),
      description: decodeBase64(e.description) || undefined,
      start: Number(e.start_timestamp ?? 0) * 1000,
      end: Number(e.stop_timestamp ?? 0) * 1000,
    }));
  }

  // ---- helpers ----
  private api(action: string, params: Record<string, string> = {}): string {
    const extra = Object.keys(params)
      .map((k) => `&${k}=${encodeURIComponent(params[k])}`)
      .join('');
    return `${this.base}/player_api.php?${this.auth}&action=${action}${extra}`;
  }

  private toStream(kind: 'live' | 'movie', s: RawStream): Stream {
    const id = String(s.stream_id);
    const ext = kind === 'movie' ? s.container_extension || 'mp4' : undefined;
    const stream: Stream = {
      id,
      kind,
      name: s.name,
      categoryId: String(s.category_id ?? ''),
      url: this.streamUrl(kind, id, ext),
    };
    if (s.stream_icon) stream.logo = s.stream_icon;
    if (kind === 'live') stream.epgChannelId = id;
    if (ext) stream.ext = ext;
    return stream;
  }

  private streamUrl(kind: 'live' | 'movie' | 'series', id: string, ext?: string): string {
    const u = encodeURIComponent(this.creds.username);
    const p = encodeURIComponent(this.creds.password);
    if (kind === 'live') return `${this.base}/live/${u}/${p}/${id}.${this.liveExt}`;
    const seg = kind === 'movie' ? 'movie' : 'series';
    return `${this.base}/${seg}/${u}/${p}/${id}.${ext || 'mp4'}`;
  }
}

/** Xtream codifica title/description do EPG em base64 (UTF-8). */
function decodeBase64(b?: string): string {
  if (!b) return '';
  try {
    const bin = atob(b);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return b;
  }
}
