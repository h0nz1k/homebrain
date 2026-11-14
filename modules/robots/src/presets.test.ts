import { describe, expect, it } from 'vitest';
import { createRobotsDemo } from './demo.js';
import { buildRobot } from './model.js';
import {
  createPresetsDemo,
  effectiveSettings,
  fitSettings,
  planStart,
  robotCapabilities,
  settingsSummary,
  validateDraft,
  type RobotPreset,
} from './presets.js';

const demo = createRobotsDemo(Date.UTC(2026, 10, 6, 9), 'default');
const robot = (slot: number) =>
  buildRobot(
    slot,
    demo.bindings,
    (id) => (id ? demo.states[id] : undefined),
    demo.ws.robots.find((meta) => meta.slot === slot),
  );

describe('presets', () => {
  it('layers defaults ← preset ← explicit, null never overrides', () => {
    const settings = effectiveSettings(
      { mode: 'both', fan: 'quiet', water: 'mild', route: null, passes: 2 },
      { mode: null, fan: 'max', water: null, route: 'deep', passes: 1 },
      { fan: null },
    );
    expect(settings).toEqual({ mode: 'both', fan: 'max', water: 'mild', route: 'deep', passes: 1 });
    expect(effectiveSettings()).toEqual({
      mode: null,
      fan: null,
      water: null,
      route: null,
      passes: 1,
    });
  });

  it('offers only what the robot exposes and drops blocked/unknown options', () => {
    const caps = robotCapabilities(robot(1));
    expect(caps.modes).toEqual(['vacuum', 'mop', 'both']);
    expect(caps.water).not.toContain('off');
    expect(caps.water).not.toContain('custom');
    expect(
      fitSettings(
        { mode: 'both', fan: 'jet', water: 'off', route: 'custom', passes: 7 },
        caps,
        robot(1).maxPasses,
      ),
    ).toEqual({ mode: 'both', fan: null, water: null, route: null, passes: 2 });
  });

  it('plans mode → suction → water → route → start like the backend', () => {
    const r = robot(1);
    const plan = planStart(
      r,
      effectiveSettings({ mode: 'vacuum', fan: 'turbo', water: 'intense', passes: 2 }),
      [3, 2],
    );
    const services = plan.map((step) => step.service);
    // Vacuum-only: water/route are never sent; the start carries the passes.
    expect(services.filter((s) => s === 'select.select_option').length).toBeLessThanOrEqual(1);
    expect(services.at(-1)).toBe('vacuum.send_command');
    expect(plan.at(-1)!.data).toEqual({
      command: 'app_segment_clean',
      params: [{ segments: [3, 2], repeat: 2 }],
    });
    expect(plan.some((step) => step.summary.startsWith('Voda'))).toBe(false);
    // Mop-only: suction is ignored; no rooms = whole-home start.
    const mop = planStart(r, effectiveSettings({ mode: 'mop', fan: 'max' }), []);
    expect(mop.some((step) => step.service === 'vacuum.set_fan_speed')).toBe(false);
    expect(mop.at(-1)!.service).toBe('vacuum.start');
  });

  it('summarises and validates presets in Czech', () => {
    expect(
      settingsSummary({ mode: 'mop', fan: 'max', water: 'intense', route: 'deep', passes: 2 }),
    ).toEqual(['Mopovat', 'Voda Vysoká', 'Důkladně', '2×']);
    const others = [{ id: 'a1', name: 'Rychlé vysátí' } as RobotPreset];
    const draft = { name: '  ', rooms: [], ...effectiveSettings() };
    expect(validateDraft(draft, others)).toMatch(/název/);
    expect(validateDraft({ ...draft, name: 'rychlé VYSÁTÍ' }, others)).toMatch(/existuje/);
    expect(validateDraft({ ...draft, id: 'a1', name: 'Rychlé vysátí' }, others)).toBeNull();
  });

  it('dev mock: start applies defaults when rooms are picked without a preset', () => {
    const calls: Record<string, unknown>[] = [];
    const mock = createPresetsDemo(robot, (message) => calls.push(message));
    mock.handlers['homebrain/robots/defaults/set']({
      slot: 1,
      defaults: { mode: 'vacuum', fan: 'quiet', water: null, route: null, passes: 2 },
    });
    mock.handlers['homebrain/robots/start']({ slot: 1, rooms: [2] });
    expect(calls.at(-1)).toMatchObject({
      domain: 'vacuum',
      service: 'send_command',
      service_data: { params: [{ segments: [2], repeat: 2 }] },
    });
    expect(
      calls.some((c) => (c.service_data as { fan_speed?: string }).fan_speed === 'quiet'),
    ).toBe(robot(1).fan !== 'quiet');
    const { preset } = mock.handlers['homebrain/robots/presets/save']({
      slot: 1,
      preset: { name: 'Celý byt', ...effectiveSettings({ mode: 'mop' }), rooms: [] },
    });
    calls.length = 0;
    mock.handlers['homebrain/robots/start']({ slot: 1, preset_id: preset.id });
    expect(calls.at(-1)).toMatchObject({ domain: 'vacuum', service: 'start' });
    expect(mock.handlers['homebrain/robots/presets/list']().robots['1']!.presets).toHaveLength(1);
  });
});

describe('Max+ only when vacuuming alone', () => {
  it('offers Max+ only in vacuum mode and downgrades on mode switch', async () => {
    const { applyMode, fansForMode, validateDraft } = await import('./presets.js');
    const fans = ['quiet', 'balanced', 'max', 'max_plus'];
    expect(fansForMode(fans, 'vacuum')).toContain('max_plus');
    expect(fansForMode(fans, 'both')).not.toContain('max_plus');
    expect(fansForMode(fans, null)).not.toContain('max_plus'); // „Ponechat“ + Max+ not allowed
    const switched = applyMode({ mode: 'vacuum', fan: 'max_plus', route: null }, 'mop', fans);
    expect(switched).toEqual({
      next: { mode: 'mop', fan: 'max', route: null },
      downgradedFan: true,
      downgradedRoute: false,
    });
    expect(applyMode({ mode: 'vacuum', fan: 'turbo', route: null }, 'both', fans).downgradedFan).toBe(
      false,
    );
    const draft = { name: 'X', mode: 'both' as const, fan: 'max_plus', water: null, route: null };
    expect(validateDraft({ ...draft, passes: 1, rooms: [] }, [])).toMatch(/Max\+/);
  });
});

describe('Důkladné trasy jen při mopu', () => {
  it('offers deep routes only in mop mode and downgrades on mode switch', async () => {
    const { applyMode, routesForMode, startCleaningToasts, DEEP_ROUTES_SKIPPED_TOAST } =
      await import('./presets.js');
    const routes = ['standard', 'deep', 'deep_plus'];
    expect(routesForMode(routes, 'mop')).toContain('deep_plus');
    expect(routesForMode(routes, 'both')).not.toContain('deep');
    expect(routesForMode(routes, 'both')).not.toContain('deep_plus');
    const switched = applyMode({ mode: 'mop', fan: null, route: 'deep_plus' }, 'both', [], routes);
    expect(switched.downgradedRoute).toBe(true);
    expect(switched.next.route).toBe('standard');
    expect(startCleaningToasts({ applied: [], skipped: ['deep_plus'] })).toEqual([
      DEEP_ROUTES_SKIPPED_TOAST,
    ]);
  });
});

describe('Počet průchodů podle modelu', () => {
  it('limits passes in fitSettings and UI options', async () => {
    const { fitSettings } = await import('./presets.js');
    const caps = {
      modes: ['vacuum', 'mop', 'both'] as import('./commands.js').CleanMode[],
      fans: ['quiet'],
      water: ['standard'],
      routes: ['standard', 'deep'],
    };
    expect(
      fitSettings({ mode: 'both', fan: null, water: null, route: null, passes: 9 }, caps, 2),
    ).toMatchObject({ passes: 2 });
    expect(robot(1).maxPasses).toBe(2);
    expect(robot(3).maxPasses).toBe(3);
  });
});
