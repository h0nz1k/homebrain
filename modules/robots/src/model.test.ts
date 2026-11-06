import { describe, expect, it } from 'vitest';
import { attention, buildRobot, configuredSlots, imageUrl } from './model.js';
import { createRobotsDemo } from './demo.js';

const demo = createRobotsDemo(Date.parse('2026-11-03T10:00:00Z'));
const get = (id: string | undefined) => (id ? demo.states[id] : undefined);

describe('robot model', () => {
  it('builds three demo robots with floors and state', () => {
    const robots = configuredSlots(demo.bindings, demo.ws.robots).map((slot) =>
      buildRobot(
        slot,
        demo.bindings,
        get,
        demo.ws.robots.find((m) => m.slot === slot),
      ),
    );
    expect(robots.map((r) => [r.floor, r.status.tone])).toEqual([
      ['Přízemí', 'cleaning'],
      ['1. patro', 'error'],
      ['3. patro', 'charging'],
    ]);
    const [a, b, c] = robots as [(typeof robots)[0], (typeof robots)[0], (typeof robots)[0]];
    expect(a.progress).toBe(38);
    expect(a.rooms).toHaveLength(8);
    expect(a.mode).toBe('both');
    expect(a.fanChoices).toEqual(['quiet', 'balanced', 'turbo', 'max', 'max_plus']);
    expect(b.error?.title).toBe('Zamotaný hlavní kartáč');
    expect(b.tanks.find((t) => t.key === 'cleaning_fluid')).toMatchObject({
      ok: false,
      text: 'Došel',
    });
    expect(attention(b)).toBe('crit');
    expect(c.consumables[0]).toMatchObject({ kind: 'sensors', action: 'Vyčistit teď' });
    expect(c.fanChoices).not.toContain('smart_mode');
    expect(b.consumables.find((item) => item.kind === 'sensors')?.tone).toBe('warn');
    expect(c.rooms.map((r) => r.name)).toContain('Podkrovní pokoj');
  });
  it('works from bindings alone (no WS answer)', () => {
    expect(configuredSlots({ robot2_vacuum: 'vacuum.x' }, null)).toEqual([2]);
    const robot = buildRobot(1, demo.bindings, get, undefined);
    expect(robot.name).toBe('Alfa');
    expect(robot.rooms).toEqual([]);
  });
  it('builds the image proxy URL from the access token', () => {
    expect(
      imageUrl({
        entity_id: 'image.map',
        state: 'x',
        last_updated: '',
        attributes: { access_token: 'a b' },
      }),
    ).toBe('/api/image_proxy/image.map?token=a%20b');
  });
});
