import {
  buildRobot,
  createPresetsDemo,
  createRobotsDemo,
  createRobotsUiMemoryDemo,
  createSchedulesDemo,
  demoVectorMap,
  narrowRoomMap,
  type DemoScene,
  type RobotsScenario,
} from '@homebrain/module-robots';
import type { DevHass, WsHandlers } from './shared.js';

/**
 * Roboti: synthetic vacuums, vector maps, presets and schedules. `?robots=<scenario>`,
 * `?presets=demo`, `?schedules=demo`, `?photos=a,b,c`, `?otoceni=90|180|270`, `?drahaod=<0–1>`,
 * `?scena=kuchyne|chodba|dok`, `?mistnost=uzka`, `?vektor=chyba`, `?mapapoll=<ms>`.
 */
export function addRobotsDemo({ hass, now, refresh }: DevHass) {
  const pageLoadedAt = Date.now();
  const routeStartRaw = new URLSearchParams(location.search).get('drahaod');
  const routeStart =
    routeStartRaw !== null && Number(routeStartRaw) >= 0 && Number(routeStartRaw) < 1
      ? Number(routeStartRaw)
      : null;
  const robotsDemo = createRobotsDemo(
    now.getTime(),
    (new URLSearchParams(location.search).get('robots') as RobotsScenario | null) ?? 'default',
  );
  Object.assign(hass.states, robotsDemo.states);
  // Dev only: service calls from the Roboti panel are recorded, never sent anywhere.
  const robotCalls: unknown[] = [];
  (window as unknown as { __hbRobotCalls: unknown[] }).__hbRobotCalls = robotCalls;
  // Presets/defaults backend mock: a start records the service calls the integration would send.
  const robotsUiDemo = createRobotsUiMemoryDemo();
  const presetsDemo = createPresetsDemo(
    (slot) => {
      const meta = robotsGet().robots.find((robot) => robot.slot === slot);
      return meta
        ? buildRobot(slot, robotsDemo.bindings, (id) => (id ? hass.states[id] : undefined), meta)
        : null;
    },
    (message) => robotCalls.push(message),
  );
  // `?presets=demo`: two saved presets + a remembered default on robot 1 (screenshots).
  if (new URLSearchParams(location.search).get('presets') === 'demo') {
    const save = presetsDemo.handlers['homebrain/robots/presets/save'];
    save({
      slot: 1,
      preset: {
        name: 'Rychlé vysátí',
        mode: 'vacuum',
        fan: 'turbo',
        water: null,
        route: null,
        passes: 1,
        rooms: [],
      },
    });
    save({
      slot: 1,
      preset: {
        name: 'Důkladné vytření 2×',
        mode: 'mop',
        fan: null,
        water: 'intense',
        route: 'deep',
        passes: 2,
        rooms: [3, 2],
      },
    });
    presetsDemo.handlers['homebrain/robots/defaults/set']({
      slot: 1,
      defaults: { mode: 'both', fan: 'balanced', water: null, route: null, passes: 1 },
    });
  }
  // Schedules backend mock (no robot ever starts); `?schedules=demo` seeds two plans + results.
  const schedulesDemo = createSchedulesDemo();
  if (new URLSearchParams(location.search).get('schedules') === 'demo') {
    const quick = presetsDemo.data['1']?.presets[0]?.id ?? null;
    const save = schedulesDemo.handlers['homebrain/robots/schedules/save'];
    const daily = save({
      schedule: {
        name: 'Chodba potichu',
        slot: 1,
        preset_id: null,
        settings: { mode: 'vacuum', fan: 'quiet', water: null, route: null, passes: 1 },
        rooms: [2],
        days: [0, 1, 2, 3, 4, 5, 6],
        time: '09:30',
        enabled: true,
      },
    }).schedule;
    const wednesday = save({
      schedule: {
        name: 'Středeční vytírání',
        slot: 1,
        preset_id: presetsDemo.data['1']?.presets[1]?.id ?? quick,
        settings: null,
        rooms: [],
        days: [2],
        time: '13:00',
        enabled: true,
      },
    }).schedule;
    save({
      schedule: {
        name: 'Víkendový úklid',
        slot: 1,
        preset_id: quick,
        settings: null,
        rooms: [],
        days: [5, 6],
        time: '08:00',
        enabled: false,
      },
    });
    const day = new Date(Date.now() - 86_400_000).toISOString();
    schedulesDemo.addRun({
      schedule_id: daily.id,
      name: daily.name,
      slot: 1,
      at: day,
      result: 'ok',
      reason: null,
      attempts: 1,
      manual: false,
    });
    schedulesDemo.addRun({
      schedule_id: wednesday.id,
      name: wednesday.name,
      slot: 1,
      at: day,
      result: 'gave_up',
      reason: 'battery',
      attempts: 3,
      manual: false,
    });
  }
  function robotsGet(): { robots: (typeof robotsDemo.ws.robots)[number][] } {
    const rooms = (globalThis as { __HB_ROBOT_ROOMS__?: { id: number; name: string }[] })
      .__HB_ROBOT_ROOMS__;
    // `?photos=a,b,c`: robot N uses the photo set `/local/homebrain/robots/<name N>/` (dev server
    // serves a local folder via HB_ROBOT_PHOTOS_DIR; e2e routes synthetic images).
    const photos = new URLSearchParams(location.search).get('photos')?.split(',') ?? [];
    if (photos.length && !rooms)
      return {
        robots: robotsDemo.ws.robots.map((r, i) =>
          photos[i] ? { ...r, image: `/local/homebrain/robots/${photos[i]}/` } : r,
        ),
      };
    if (!rooms) return robotsDemo.ws;
    return {
      robots: robotsDemo.ws.robots.map((r, i) =>
        i === 0 ? { ...r, maps: r.maps.map((m) => ({ ...m, rooms })) } : r,
      ),
    };
  }
  const handlers: WsHandlers = {
    // `window.__HB_ROBOT_ROOMS__` (local shot script): placeholder room names for robot 1.
    // `?otoceni=90|180|270`: robot 1 map rotated like the per-robot option.
    'homebrain/robots/get': () => {
      const rot = Number(new URLSearchParams(location.search).get('otoceni')) || 0;
      const ws = robotsGet();
      return rot
        ? { robots: ws.robots.map((r, i) => (i === 0 ? { ...r, rotation: rot } : r)) }
        : ws;
    },
    // Invented vector plans; robot 1 advances one step per `?mapapoll` tick, robot 3 = PNG fallback.
    // `window.__HB_ROBOT_MAP__` (set by a local shot script) renders a locally parsed plan.
    'homebrain/robots/map': (message: unknown) =>
      new URLSearchParams(location.search).get('mistnost') === 'uzka'
        ? narrowRoomMap()
        : new URLSearchParams(location.search).get('vektor') === 'chyba'
          ? { available: false, reason: 'parse_failed' }
          : (globalThis as { __HB_ROBOT_MAP__?: unknown }).__HB_ROBOT_MAP__
            ? {
                available: true,
                map: (globalThis as { __HB_ROBOT_MAP__?: unknown }).__HB_ROBOT_MAP__,
              }
            : demoVectorMap(
                Number((message as { slot?: number }).slot),
                // `?drahaod=<0–1>`: start there at page load (wrap-free e2e, #38), else wall clock.
                routeStart === null ? Date.now() : Date.now() - pageLoadedAt,
                Number(new URLSearchParams(location.search).get('mapapoll')) || 30_000,
                // `?scena=kuchyne|chodba|dok`: fixed robot pose (deterministic shots and e2e).
                new URLSearchParams(location.search).get('scena') as DemoScene | null,
                routeStart,
              ),
    // Raster base layers of the demo plans (scripts/build_robot_demo_rasters.py); a local shot
    // script may inject its own via `window.__HB_ROBOT_RASTER__ = { light, dark }` (data URLs).
    'auth/sign_path': (message: unknown) => {
      const path = String((message as { path?: string }).path ?? '');
      const hit =
        /^\/api\/homebrain\/robots\/map\/(\d)\/[^/]+\/((?:light|dark)(?:-walls)?)\.png$/.exec(path);
      if (!hit) return { path };
      const injected = (globalThis as { __HB_ROBOT_RASTER__?: Record<string, string> })
        .__HB_ROBOT_RASTER__;
      return {
        path:
          injected?.[hit[2]!] ??
          new URL(`../../src/dev-assets/robots/demo-${hit[1]}-${hit[2]}.png`, import.meta.url).href,
      };
    },
    ...presetsDemo.handlers,
    ...robotsUiDemo.handlers,
    ...schedulesDemo.handlers,
  };
  return {
    bindings: robotsDemo.bindings,
    handlers,
    /** `vacuum.send_command resolve_error` clears the dock error; every call is recorded. */
    onCallService(message: unknown) {
      const call = message as {
        domain?: string;
        service?: string;
        service_data?: { value?: number; command?: string; params?: { error_code?: number } };
        target?: { entity_id?: string };
      };
      if (
        call.domain === 'vacuum' &&
        call.service === 'send_command' &&
        call.service_data?.command === 'resolve_error'
      ) {
        const vacuumId = call.target?.entity_id ?? '';
        const slot = Number(/^vacuum\.demo_robot_(\d+)$/.exec(vacuumId)?.[1] ?? 0);
        if (slot) {
          const dockId = robotsDemo.bindings[`robot${slot}_dock_error`];
          if (dockId && hass.states[dockId]) {
            const stamp = new Date().toISOString();
            hass.states[dockId] = {
              ...hass.states[dockId]!,
              state: 'ok',
              last_updated: stamp,
            };
          }
          const cleanWater = robotsDemo.bindings[`robot${slot}_clean_water`];
          const applyOk = () => {
            if (cleanWater && hass.states[cleanWater]) {
              hass.states[cleanWater] = { ...hass.states[cleanWater]!, state: 'off' };
            }
            refresh();
          };
          // One frame of pending UI before the store sees dock_error „ok“ (e2e, dev screenshots).
          globalThis.setTimeout(applyOk, 120);
        }
      }
      robotCalls.push(message);
    },
  };
}
