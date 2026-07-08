// Dominio do catalogo IPTV — agnostico de fonte (Xtream API ou M3U).
// A UI so conhece estes tipos e a interface Source.

export type ContentKind = 'live' | 'movie' | 'series';

export interface Category {
  id: string;
  name: string;
  kind: ContentKind;
}

/** Item reproduzivel direto: canal ao vivo ou filme (VOD). */
export interface Stream {
  id: string;
  kind: 'live' | 'movie';
  name: string;
  categoryId: string;
  /** So live: numero do canal (zapping) — vem do `num` da Player API. */
  num?: number;
  logo?: string;
  /** URL pronta para o player (ja montada pela Source). */
  url: string;
  /** So live: id para casar com o EPG (tvg-id / epg_channel_id). */
  epgChannelId?: string;
  /** So movie: extensao do container (mp4 / mkv / avi). */
  ext?: string;
}

/** Serie = agrupador; episodios carregados sob demanda. */
export interface Series {
  id: string;
  name: string;
  categoryId: string;
  logo?: string;
  plot?: string;
}

export interface Episode {
  id: string;
  seriesId: string;
  season: number;
  episode: number;
  title: string;
  url: string;
  ext?: string;
}

/** Entrada de guia de programacao (EPG) de um canal ao vivo. */
export interface EpgEntry {
  channelId: string;
  title: string;
  description?: string;
  start: number; // epoch ms
  end: number; // epoch ms
}

/** Credenciais Xtream inseridas pelo usuario em runtime (nunca commitadas). */
export interface XtreamCredentials {
  baseUrl: string; // http://host:porta
  username: string;
  password: string;
}
