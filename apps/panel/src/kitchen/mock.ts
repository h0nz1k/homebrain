/** Dev only. Invented stations, providers, entities and neutral procedural artwork. */
import type { KitchenSnapshot, MediaItem } from './types';

export function kitchenMock(query: URLSearchParams) {
  const scenario = query.get('kitchen') ?? 'radio';
  const radios: MediaItem[] = [
    'Rádio Ráno',
    'Vlna',
    'Kytary',
    'Klid',
    'Horizont',
    'Jazz',
    'Klasika',
    'Pohoda',
    'Retro',
    'Tóny',
    'Folk',
    'Večer',
    'Mix',
  ].map((name, i) => ({ uri: `demo://radio/${i}`, name, image: null, providers: ['demo_radio'] }));
  const playlists: MediaItem[] = [
    'Ranní rozjezd',
    'České písničky',
    'Rock na vaření',
    'Po práci',
    'Víkend doma',
    'Pohoda doma',
    'Oblíbené hity',
    'Zpíváme spolu',
    'Večerní klid',
    'Na dobrou noc',
    'Další výběr',
  ].map((name, i) => ({
    uri: `demo://playlist/${i}`,
    name,
    image: null,
    providers: [i < 5 ? 'demo_ytm_a' : 'demo_ytm_b'],
  }));
  const noPlayer = ['no-player', 'unavailable-player'].includes(scenario);
  const snapshot: KitchenSnapshot = {
    is_admin: !['kiosk', 'adult', 'child', 'guest'].includes(query.get('session') ?? ''),
    ma_available: scenario !== 'unavailable',
    config: {
      player: scenario === 'no-player' ? null : 'media_player.demo_kitchen',
      radios: radios.slice(0, 5),
      more_radios: radios.slice(5),
      persons: ['Táta', 'Máma'].map((name, i) => ({
        name,
        person_entity: `person.demo_parent_${i}`,
        provider: `demo_ytm_${i ? 'b' : 'a'}`,
        playlists: playlists.slice(i * 5, i * 5 + 5),
        youtube_url: 'vnd.youtube://',
      })),
      battery_sensor: 'sensor.demo_tablet_battery_level',
      battery_state_sensor: 'sensor.demo_tablet_battery_state',
      meater_url: 'meater://',
      rest_minutes: 10,
    },
    player: noPlayer
      ? null
      : {
          entity_id: 'media_player.demo_kitchen',
          name: 'Tablet · USB reproduktor',
          state: scenario === 'idle' ? 'idle' : 'playing',
          title:
            scenario === 'playlist'
              ? 'Ranní rozjezd'
              : scenario === 'idle'
                ? 'Nic nehraje'
                : radios[0]!.name,
          artist: scenario === 'playlist' ? 'Ukázkový interpret' : '',
          image: null,
          volume: 0.38,
        },
    battery: { level: '80', state: 'not_charging' },
    candidates: {
      players: [{ entity_id: 'media_player.demo_kitchen', name: 'Tablet · USB reproduktor' }],
      persons: ['Táta', 'Máma'].map((name, i) => ({ entity_id: `person.demo_parent_${i}`, name })),
      sensors: [
        { entity_id: 'sensor.demo_tablet_battery_level', name: 'Tablet · baterie' },
        { entity_id: 'sensor.demo_tablet_battery_state', name: 'Tablet · nabíjení' },
      ],
    },
  };
  const configuredPlayer = snapshot.player;
  const log: unknown[] = [];
  (window as unknown as { __hbKitchenLog: unknown[] }).__hbKitchenLog = log;
  const requireAdmin = () => {
    if (!snapshot.is_admin) throw new Error('unauthorized');
  };
  return {
    'homebrain/kitchen/get': () =>
      structuredClone({ ...snapshot, candidates: snapshot.is_admin ? snapshot.candidates : null }),
    'homebrain/kitchen/search_radios': (m: { query: string }) => ({
      items: radios.filter((r) => r.name.toLowerCase().includes(m.query.toLowerCase())),
      next_offset: null,
    }),
    'homebrain/kitchen/playlists': () => ({ items: playlists, next_offset: null }),
    'homebrain/kitchen/save': (m: { config: KitchenSnapshot['config'] }) => {
      requireAdmin();
      log.push(m);
      snapshot.config = structuredClone(m.config);
      snapshot.player = m.config.player ? configuredPlayer : null;
      return { ok: true };
    },
    'homebrain/kitchen/play': (m: { media_id: string; media_type: string }) => {
      if (!snapshot.ma_available || !snapshot.player) throw new Error('no_player');
      log.push(m);
      const item = [...radios, ...playlists].find((i) => i.uri === m.media_id);
      snapshot.player.title = item?.name ?? '';
      snapshot.player.state = 'playing';
      return { ok: true };
    },
    'homebrain/kitchen/transport': (m: { action: string; level?: number }) => {
      log.push(m);
      if (snapshot.player) {
        if (m.action === 'volume') snapshot.player.volume = m.level ?? 0;
        else snapshot.player.state = m.action === 'pause' ? 'paused' : 'playing';
      }
      return { ok: true };
    },
  };
}
