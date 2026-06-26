import type { SourceConfig } from './config';
import type { Source } from './source';
import { XtreamSource } from './xtream';

/** Instancia o Source correto a partir da config gerenciada pelo usuario. */
export function createSource(config: SourceConfig): Source {
  switch (config.type) {
    case 'xtream':
      return new XtreamSource({
        baseUrl: config.baseUrl,
        username: config.username,
        password: config.password,
      });
    case 'm3u-url':
    case 'm3u-file':
      throw new Error(`Source "${config.type}" ainda nao implementado (M3USource vem depois).`);
  }
}
