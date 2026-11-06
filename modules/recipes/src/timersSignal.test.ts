import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockRecipesApi, setRecipesApiFactory } from './api.js';
import type { Timer } from './domain/timers.js';
import { recipesTimersTodaySignalSource, timerSignals } from './timersSignal.js';

const NOW = Date.parse('2026-11-05T07:30:00Z');
const t = (over: Partial<Timer>): Timer => ({
  id: 'x',
  label: 'Vejce M naměkko (2 ks)',
  stepIndex: null,
  durationMs: 320_000,
  endsAt: NOW + 200_000,
  pausedRemainingMs: null,
  acknowledged: false,
  ...over,
});

afterEach(() => vi.useRealTimers());

describe('timerSignals (Dnes)', () => {
  it('is empty without running timers', () => {
    expect(timerSignals([], NOW)).toEqual([]);
    expect(timerSignals([t({ endsAt: NOW - 1, acknowledged: true })], NOW)).toEqual([]);
  });

  it('shows the soonest timer with a countdown and lists the others', () => {
    const s = timerSignals(
      [
        t({ id: 'b', label: 'Těstoviny', endsAt: NOW + 460_000 }),
        t({ id: 'a' }),
        t({ id: 'c', label: 'Rýže', endsAt: null, pausedRemainingMs: 65_000 }),
      ],
      NOW,
    )[0]!;
    expect(s.module).toBe('recipes');
    expect(s.title).toBe('Minutka · Vejce M naměkko (2 ks)');
    expect(s.severity).toBe('notice'); // a Dnes card with the big countdown, not a chip
    expect(s.value).toMatchObject({ v: '3:20', label: 'zbývá' });
    // Running timers by remaining time, paused ones last.
    expect(s.context).toBe('Další: Těstoviny za 7:40 · Rýže (pauza, zbývá 1:05)');
    expect(s.action).toEqual({
      type: 'navigate',
      label: 'Minutky',
      href: '/homebrain-recepty/minutky',
    });
  });

  it('puts the last minute and a finished timer into the hero (warning)', () => {
    const last = timerSignals([t({ endsAt: NOW + 45_000 })], NOW)[0]!;
    expect(last.severity).toBe('warning');
    expect(last.value).toMatchObject({ v: '0:45', label: 'zbývá' });
    const s = timerSignals([t({ endsAt: NOW - 1000 })], NOW)[0]!;
    expect(s.title).toBe('Minutka doběhla · Vejce M naměkko (2 ks)');
    expect(s.severity).toBe('warning');
    expect(s.value).toEqual({ v: 'Hotovo' });
  });
});

describe('recipesTimersTodaySignalSource', () => {
  it('follows the shared timer backend and ticks the countdown', async () => {
    vi.useFakeTimers({ now: NOW });
    const api = createMockRecipesApi();
    setRecipesApiFactory(() => api);
    const feed = recipesTimersTodaySignalSource({ connection: undefined });
    expect(feed).not.toBeNull();
    const seen: string[] = [];
    const stop = feed!.subscribe((signals) => seen.push(signals[0]?.value?.v ?? '-'));
    await api.timers.start({ label: 'Vejce', seconds: 90 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen).toContain('1:30');
    expect(seen.at(-1)).toBe('1:29');
    stop();
  });
});
