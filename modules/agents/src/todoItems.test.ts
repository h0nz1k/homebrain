import { describe, expect, it } from 'vitest';
import { buildTodoItems } from './todoItems.js';
import { createMockSnapshot } from './mock.js';
import type { AgentsSnapshot, Quota } from './types.js';

const NOW = Date.parse('2026-11-24T08:45:00Z');

describe('buildTodoItems', () => {
  it('ok: empty → card would be hidden', () => {
    expect(buildTodoItems(createMockSnapshot('ok', NOW))).toEqual([]);
  });

  it('dedup: exhausted quota + exhaust_forecast = one item; critical before warning', () => {
    const items = buildTodoItems(createMockSnapshot('warn', NOW));
    const titles = items.map((i) => i.title);
    // Exhausted Y 5h appears once.
    expect(
      titles.filter((t) => /Poskytovatel Y/.test(t) && /5 h|vyčerp/.test(t)).length,
    ).toBeLessThanOrEqual(2);
    const exhausted = items.filter((i) => i.tag === 'vyčerpáno');
    expect(exhausted.length).toBeGreaterThanOrEqual(1);
    // Critical items first.
    const levels = items.map((i) => i.level);
    const firstWarn = levels.findIndex((l) => l === 'warning');
    const lastCrit = levels.lastIndexOf('critical');
    if (firstWarn >= 0 && lastCrit >= 0) expect(lastCrit).toBeLessThan(firstWarn);
  });

  it('real: exactly exhausted + forecast + blocked (no mere-low / SLA dupes)', () => {
    const items = buildTodoItems(createMockSnapshot('real', NOW));
    expect(items).toHaveLength(3);
    expect(items.some((i) => i.tag === 'blokováno')).toBe(true);
    expect(items.some((i) => i.tag === 'vyčerpáno')).toBe(true);
    expect(items.some((i) => i.tag === 'dojde před obnovou')).toBe(true);
    expect(items.every((i) => i.tag !== 'málo zbývá' && i.tag !== 'SLA')).toBe(true);
    const ids = new Set(items.map((i) => i.id));
    expect(ids.size).toBe(items.length);
    // Title does not repeat tag text („dojde před obnovou“ / „vyčerpáno“).
    const forecast = items.find((i) => i.tag === 'dojde před obnovou');
    expect(forecast?.title).toMatch(/Codex/);
    expect(forecast?.title).not.toMatch(/dojde před obnovou/);
    const exhausted = items.find((i) => i.tag === 'vyčerpáno');
    expect(exhausted?.detail).toMatch(/Gemini dál k dispozici/);
  });

  it('stale: data neaktuální amber', () => {
    const items = buildTodoItems(createMockSnapshot('stale', NOW));
    expect(items.some((i) => i.tag === 'data neaktuální' && i.tone === 'warn')).toBe(true);
  });

  it('crit: service down + agent stopped without redundant Agent/model prefix', () => {
    const items = buildTodoItems(createMockSnapshot('crit', NOW), NOW);
    expect(items.some((i) => i.tag === 'výpadek')).toBe(true);
    const stopped = items.find((i) => i.tag === 'neběží');
    expect(stopped).toBeTruthy();
    expect(stopped!.title).toBe('Agent B');
    expect(stopped!.title).not.toMatch(/neběží/);
    expect(stopped!.title).not.toMatch(/^Agent Agent/);
    expect(stopped!.detail).toMatch(
      /^Model Y · ověřit v AgentsMonitoringu · poslední kontakt před/,
    );
    expect(stopped!.detail).not.toMatch(/^model /);
    const outage = items.find((i) => i.tag === 'výpadek');
    expect(outage!.detail).toMatch(/SLA 24 h 81,5 % · trvá \d/);
    expect(outage!.detail).not.toMatch(/výpadek|od před/);
  });

  it('appends last_seen / since when present; leaves detail alone when missing', () => {
    const base = createMockSnapshot('ok', NOW);
    const withTimes = buildTodoItems(
      {
        ...base,
        status: { available: true, level: 'attention', critical: 0, attention: 1 },
        agents: {
          available: true,
          active: 0,
          total: 1,
          waiting: 0,
          waiting_names: [],
          items: [
            {
              name: 'Agent Z',
              model: 'Model Z',
              alive: false,
              waiting: false,
              last_seen: new Date(NOW - 5 * 60_000).toISOString(),
            },
          ],
        },
        services: [
          {
            id: 'svc',
            name: 'Služba X',
            available: true,
            up: false,
            state: 'down',
            sla_24h: 90,
            level: 'critical',
            since: new Date(NOW - 15 * 60_000).toISOString(),
          },
        ],
        queue: { available: true, pending: 0, running: 0, blocked: 0, review: 0 },
        quotas: [],
        exhaust_forecast: { available: false, active: false, items: [] },
        verdict: { level: 'warning', reasons: [] },
      },
      NOW,
    );
    expect(withTimes.find((i) => i.tag === 'neběží')!.detail).toMatch(/poslední kontakt před/);
    expect(withTimes.find((i) => i.tag === 'výpadek')!.detail).toMatch(/· trvá \d/);

    const withoutTimes = buildTodoItems(
      {
        ...base,
        status: { available: true, level: 'attention', critical: 0, attention: 1 },
        agents: {
          available: true,
          active: 0,
          total: 1,
          waiting: 0,
          waiting_names: [],
          items: [{ name: 'Agent Z', model: 'Model Z', alive: false, waiting: false }],
        },
        services: [
          {
            id: 'svc',
            name: 'Služba X',
            available: true,
            up: false,
            state: 'down',
            sla_24h: 90,
            level: 'critical',
          },
        ],
        queue: { available: true, pending: 0, running: 0, blocked: 0, review: 0 },
        quotas: [],
        exhaust_forecast: { available: false, active: false, items: [] },
        verdict: { level: 'warning', reasons: [] },
      },
      NOW,
    );
    expect(withoutTimes.find((i) => i.tag === 'neběží')!.detail).toBe(
      'Model Z · ověřit v AgentsMonitoringu',
    );
    expect(withoutTimes.find((i) => i.tag === 'výpadek')!.detail).toBe('SLA 24 h 90 %');
  });

  it('exhausted: hints sibling quota of same provider still available', () => {
    const base = createMockSnapshot('ok', NOW);
    const quotas: Quota[] = [
      {
        id: 'p_week',
        available: true,
        provider: 'Antigravity · Claude/GPT · Gemini',
        window: 'Claude/GPT week',
        window_label: 'týden',
        remaining_pct: 0,
        used_pct: 100,
        reset_at: new Date(NOW + 24 * 60 * 60_000).toISOString(),
        exhausted: true,
        exhaust_before_reset: false,
        level: 'critical',
      },
      {
        id: 'p_gem',
        available: true,
        provider: 'Antigravity · Claude/GPT · Gemini',
        window: 'Gemini week',
        window_label: 'týden',
        remaining_pct: 99,
        used_pct: 1,
        reset_at: new Date(NOW + 24 * 60 * 60_000).toISOString(),
        exhausted: false,
        exhaust_before_reset: false,
        level: 'ok',
      },
    ];
    const snap: AgentsSnapshot = {
      ...base,
      quotas,
      exhaust_forecast: { available: false, active: false, items: [] },
      agents: { ...base.agents, items: [] },
      services: [],
      queue: { available: true, pending: 0, running: 0, blocked: 0, review: 0 },
      status: { available: true, level: 'attention', critical: 0, attention: 1 },
      verdict: { level: 'warning', reasons: [] },
    };
    const items = buildTodoItems(snap, NOW);
    const exhausted = items.find((i) => i.tag === 'vyčerpáno');
    expect(exhausted).toBeTruthy();
    expect(exhausted!.detail).toMatch(/Gemini dál k dispozici/);
    expect(exhausted!.title).not.toMatch(/vyčerpáno|dojde před obnovou/);
  });
});
