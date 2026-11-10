export interface MediaItem {
  uri: string;
  name: string;
  image: string | null;
  providers: string[];
}
export interface KitchenPerson {
  name: string;
  person_entity: string | null;
  provider: string;
  playlists: MediaItem[];
  youtube_url: string;
}
export interface KitchenConfig {
  player: string | null;
  radios: MediaItem[];
  more_radios: MediaItem[];
  persons: KitchenPerson[];
  battery_sensor: string | null;
  battery_state_sensor: string | null;
  meater_url: string;
  rest_minutes: number;
}
export interface Candidate {
  entity_id: string;
  name: string;
}
export interface KitchenSnapshot {
  config: KitchenConfig;
  is_admin: boolean;
  ma_available: boolean;
  player: {
    entity_id: string;
    name: string;
    state: string;
    title: string;
    artist: string;
    image: string | null;
    volume: number;
  } | null;
  battery: { level: string | null; state: string | null };
  candidates: { players: Candidate[]; persons: Candidate[]; sensors: Candidate[] } | null;
}
export interface Catalog {
  items: MediaItem[];
  next_offset: number | null;
}

import type { ConnectionLike } from './index.js';
/** Closed WS action allowlist; the server resolves and verifies the configured MA target. */
export function kitchenApi(connection: ConnectionLike) {
  const send = <T>(command: string, data = {}) =>
    connection.sendMessagePromise<T>({ type: `homebrain/kitchen/${command}`, ...data });
  return {
    get: () => send<KitchenSnapshot>('get'),
    radios: (query: string) => send<Catalog>('search_radios', { query }),
    playlists: (provider = '', offset = 0) => send<Catalog>('playlists', { provider, offset }),
    play: (item: MediaItem, media_type: 'radio' | 'playlist') =>
      send('play', { media_id: item.uri, media_type }),
    transport: (action: 'play' | 'pause' | 'volume', level?: number) =>
      send('transport', { action, ...(level !== undefined ? { level } : {}) }),
    save: (config: KitchenConfig) => send('save', { config }),
  };
}
export type KitchenApi = ReturnType<typeof kitchenApi>;
