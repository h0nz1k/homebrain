import type { EntityStateLike } from '@homebrain/ha-client';
import type { RobotMeta } from './model.js';

/** Synthetic robots for the dev server, unit tests and e2e (no real house data). */
export type RobotsScenario = 'default' | 'calm' | 'error' | 'docked' | 'water';

type RoomRect = [id: number, name: string, x: number, y: number, w: number, h: number];
const PALETTE = [
  '#7aa7d9',
  '#8fc7b4',
  '#d9b37a',
  '#b9a3d9',
  '#d99a9a',
  '#9ac2d9',
  '#c7c48f',
  '#a3b8d9',
  '#d9a3c4',
  '#9fd9a3',
];

const LAYOUTS: Record<number, { floor: string; name: string; rooms: RoomRect[] }> = {
  1: {
    floor: 'Přízemí',
    name: 'Alfa',
    rooms: [
      [1, 'Obývací pokoj', 20, 20, 190, 130],
      [2, 'Kuchyně', 214, 20, 116, 80],
      [3, 'Jídelna', 214, 104, 116, 86],
      [4, 'Chodba', 20, 154, 190, 36],
      [5, 'WC', 20, 194, 56, 60],
      [6, 'Koupelna', 80, 194, 80, 60],
      [7, 'Prádelna', 164, 194, 70, 60],
      [8, 'Šatna', 238, 194, 92, 60],
    ],
  },
  2: {
    floor: '1. patro',
    name: 'Beta',
    rooms: [
      [16, 'Ložnice', 20, 20, 130, 110],
      [17, 'Pracovna', 154, 20, 90, 110],
      [18, 'Dětský pokoj', 248, 20, 82, 110],
      [19, 'Chodba', 20, 134, 310, 34],
      [20, 'Koupelna', 20, 172, 110, 82],
      [21, 'WC', 134, 172, 60, 82],
      [22, 'Pokoj pro hosty', 198, 172, 132, 82],
    ],
  },
  3: {
    floor: '3. patro',
    name: 'Gama',
    rooms: [
      [16, 'WC', 20, 150, 90, 104],
      [17, 'Chodba', 114, 150, 216, 104],
      [18, 'Podkrovní pokoj', 20, 20, 310, 126],
    ],
  },
};

/** Soft, Roborock-like floor plan as an SVG data URL (stands in for the `image.*` PNG). */
export function demoMapImage(slot: number, highlight: number[] = []): string {
  const layout = LAYOUTS[slot] ?? LAYOUTS[1]!;
  const rooms = layout.rooms
    .map(([id, , x, y, w, h], index) => {
      const fill = PALETTE[index % PALETTE.length];
      const lit = highlight.includes(id) ? 0.95 : 0.7;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${fill}" fill-opacity="${lit}"/>`;
    })
    .join('');
  const dock = `<rect x="300" y="226" width="20" height="14" rx="4" fill="#f4f6fa" stroke="#2b3443" stroke-width="2"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 274"><rect width="350" height="274" fill="none"/><g stroke="#1d2430" stroke-opacity=".55" stroke-width="3">${rooms}</g>${dock}<circle cx="252" cy="62" r="8" fill="#fff" stroke="#3d8bff" stroke-width="3"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createRobotsDemo(nowMs: number, scenario: RobotsScenario = 'default') {
  const at = new Date(nowMs).toISOString();
  const states: Record<string, EntityStateLike> = {};
  const bindings: Record<string, string> = {};
  const put = (
    slot: number,
    suffix: string,
    domain: string,
    state: string,
    attributes: Record<string, unknown> = {},
  ) => {
    const entityId = `${domain}.demo_robot_${slot}_${suffix}`;
    states[entityId] = { entity_id: entityId, state, last_updated: at, attributes };
    bindings[`robot${slot}_${suffix}`] = entityId;
  };
  const fanKraken = [
    'quiet',
    'balanced',
    'turbo',
    'max',
    'max_plus',
    'off',
    'smart_mode',
    'custom',
  ];
  const waterKraken = ['off', 'slight', 'low', 'medium', 'moderate', 'high', 'extreme'];
  const mopKraken = ['standard', 'deep', 'deep_plus', 'fast', 'smart_mode', 'custom'];
  const modeKraken = ['vacuum', 'vac_and_mop', 'mop'];
  const robots: {
    slot: number;
    vacuum: string;
    status: string;
    fan: string;
    battery: number;
    room: string;
    progress: number | null;
    error: string;
    dock: string;
    hours: [number, number, number, number, number, number | null];
    tanks: [string, string, string, string];
    mode: string;
  }[] = [
    {
      slot: 1,
      // `docked`: robot 1 waits in its dock (plan a clean; pair with the map scene `dok`).
      // `water`: segment clean with dock_error water_empty (Kraken-like advanced selects).
      vacuum: scenario === 'docked' ? 'docked' : 'cleaning',
      status: scenario === 'docked' ? 'charging_complete' : 'segment_cleaning',
      fan: 'balanced',
      battery: scenario === 'docked' ? 100 : 64,
      room: 'Kuchyně',
      progress: scenario === 'docked' ? null : 38,
      error: 'none',
      dock: scenario === 'water' ? 'water_empty' : 'ok',
      hours: [279, 173, 129, 2.9, 11, null],
      tanks:
        scenario === 'water' ? ['on', 'off', 'off', 'off'] : (['off', 'off', 'off', 'off'] as const),
      mode: 'vac_and_mop',
    },
    {
      slot: 2,
      vacuum: scenario === 'calm' ? 'docked' : 'error',
      status: scenario === 'calm' ? 'charging_complete' : 'error',
      fan: 'max',
      battery: 41,
      room: 'Pracovna',
      progress: 0,
      error: scenario === 'calm' ? 'none' : 'main_brush_jammed',
      dock: scenario === 'error' ? 'waste_water_tank_full' : 'ok',
      hours: [258, 151, 108, 11, 143, null],
      tanks: [
        'off',
        scenario === 'error' ? 'on' : 'off',
        scenario === 'calm' ? 'off' : 'on',
        'off',
      ],
      mode: 'vacuum',
    },
    {
      slot: 3,
      vacuum: 'docked',
      status: 'charging',
      fan: 'turbo',
      battery: 92,
      room: 'Chodba',
      progress: 0,
      error: 'none',
      dock: 'ok',
      hours: [264, 164, 70, -5.9, 42, 41],
      // Dock tanks like prod (all 3 robots): dirty water full → red „Vylít“.
      tanks: ['off', 'on', 'off', 'off'],
      mode: 'vac_and_mop',
    },
  ];
  const metas: RobotMeta[] = [];
  for (const r of robots) {
    const layout = LAYOUTS[r.slot]!;
    const vacuumId = `vacuum.demo_robot_${r.slot}`;
    states[vacuumId] = {
      entity_id: vacuumId,
      state: r.vacuum,
      last_updated: at,
      attributes: {
        friendly_name: layout.name,
        fan_speed: r.fan,
        fan_speed_list: r.slot === 1 ? fanKraken : r.slot === 3 ? fanKraken.filter((f) => f !== 'smart_mode') : fanKraken,
      },
    };
    bindings[`robot${r.slot}_vacuum`] = vacuumId;
    put(r.slot, 'status', 'sensor', r.status);
    put(r.slot, 'battery', 'sensor', String(r.battery), { unit_of_measurement: '%' });
    put(r.slot, 'current_room', 'sensor', r.room);
    put(r.slot, 'cleaning_progress', 'sensor', String(r.progress ?? 'unknown'), {
      unit_of_measurement: '%',
    });
    put(r.slot, 'error', 'sensor', r.error);
    put(r.slot, 'dock_error', 'sensor', r.dock);
    if (scenario === 'water' && r.slot === 1) {
      const dockId = bindings[`robot${r.slot}_dock_error`]!;
      const stamp = '2026-11-10T08:15:00.000Z';
      states[dockId] = { ...states[dockId]!, last_updated: stamp };
      Object.assign(states[dockId]! as Record<string, unknown>, { last_changed: stamp });
    }
    (
      ['main_brush', 'side_brush', 'filter', 'sensors', 'dock_strainer', 'dock_brush'] as const
    ).forEach((kind, i) => {
      const hours = r.hours[i];
      if (hours !== null && hours !== undefined)
        put(r.slot, kind, 'sensor', String(hours), { unit_of_measurement: 'h' });
    });
    // Roborock „reset consumable“ button (maintenance guide → „Hotovo, vynulovat počítadlo“).
    put(r.slot, 'reset_main_brush', 'button', 'unknown');
    if (r.slot === 3) put(r.slot, 'dock_reset_cleaning_brush', 'button', 'unknown');
    (['clean_water', 'dirty_water', 'cleaning_fluid', 'water_shortage'] as const).forEach(
      (tank, i) => put(r.slot, tank, 'binary_sensor', r.tanks[i]!),
    );
    put(r.slot, 'cleaning_mode', 'select', r.mode, {
      options: r.slot === 1 ? modeKraken : ['vacuum', 'vac_and_mop', 'mop', 'custom'],
    });
    if (r.slot !== 3) {
      put(r.slot, 'mop_intensity', 'select', r.slot === 1 ? 'moderate' : 'moderate', {
        options: r.slot === 1 ? waterKraken : ['off', 'mild', 'moderate', 'intense', 'custom'],
      });
      put(r.slot, 'mop_mode', 'select', 'standard', {
        options: r.slot === 1 ? mopKraken : ['standard', 'deep', 'deep_plus', 'custom'],
      });
    }
    put(
      r.slot,
      'selected_map',
      'select',
      r.slot === 1 ? layout.floor : `Map ${r.slot === 3 ? 1 : 0}`,
    );
    put(r.slot, 'map_image', 'image', at, {
      entity_picture: demoMapImage(r.slot, r.slot === 1 ? [2] : []),
    });
    metas.push({
      slot: r.slot,
      name: layout.name,
      floor: layout.floor,
      image: '',
      vacuum: vacuumId,
      maps: [
        {
          flag: r.slot === 3 ? 1 : 0,
          name: r.slot === 1 ? layout.floor : '',
          rooms: layout.rooms.map(([id, name]) => ({ id, name })),
        },
      ],
      maps_error: null,
      maps_updated_at: at,
    });
  }
  return { states, bindings, ws: { robots: metas } };
}
