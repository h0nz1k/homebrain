import { describe, expect, it, vi } from 'vitest';
import {
  formatClock,
  formatDuration,
  formatNumber,
  formatQuantity,
  kroky,
  krokyWord,
  minuty,
  porce,
  suroviny,
  scaleIngredients,
} from './scale.js';
import { createTimerStore, type Timer, type TimerBackend, type TimerSnapshot } from './timers.js';
import { createMockTimerBackend } from '../api.js';
import { createVideoMusicCoordinator, musicBarModel } from './music.js';
import { airfryerBlock, remainingMinutes } from './airfryer.js';
import type { Ingredient, RecipesConfig } from '../types.js';

const ing = (
  qty: number | null,
  unit: string | null,
  name: string,
  countable = false,
): Ingredient => ({
  qty,
  unit,
  name,
  group: null,
  note: null,
  countable,
});

describe('scaling + Czech formatting', () => {
  it('formats numbers with a decimal comma', () => {
    expect(formatNumber(1.5)).toBe('1,5');
    expect(formatNumber(0.333)).toBe('0,33');
    expect(formatNumber(12.4)).toBe('12');
  });
  it('uses fractions for spoons and cups', () => {
    expect(formatQuantity(0.5, 'lžička')).toEqual({ qty: '½', unit: 'lžička' });
    expect(formatQuantity(1.5, 'hrnek')).toEqual({ qty: '1 ½', unit: 'hrnek' });
    expect(formatQuantity(2 / 3, 'lžíce')).toEqual({ qty: '⅔', unit: 'lžíce' });
  });
  it('converts large metric amounts', () => {
    expect(formatQuantity(1200, 'g')).toEqual({ qty: '1,2', unit: 'kg' });
    expect(formatQuantity(1500, 'ml')).toEqual({ qty: '1 ½', unit: 'l' });
  });
  it('rounds countable items to whole pieces', () => {
    expect(formatQuantity(1.5, null, true)?.qty).toBe('2');
    expect(formatQuantity(0.5, null, true)?.qty).toBe('½');
  });
  it('scales by servings and marks changed rows', () => {
    const rows = scaleIngredients(
      [
        ing(800, 'g', 'svíčková'),
        ing(2, 'lžíce', 'mouka'),
        ing(1, null, 'cibule', true),
        ing(null, null, 'sůl'),
      ],
      4,
      6,
    );
    expect(rows.map((r) => r.qtyText)).toEqual(['1,2 kg', '3 lžíce', '2', null]);
    expect(rows[0]!.changed).toBe(true);
    expect(rows[3]!.changed).toBe(false);
    expect(scaleIngredients([ing(2, 'lžíce', 'mouka')], 4, 4)[0]!.changed).toBe(false);
  });
  it('halves into fractions', () => {
    expect(scaleIngredients([ing(1, 'lžička', 'cukr')], 4, 2)[0]!.qtyText).toBe('½ lžička');
  });
  it('formats ranges', () => {
    expect(scaleIngredients([{ ...ing(2, 'lžíce', 'olej'), qtyMax: 3 }], 2, 2)[0]!.qtyText).toBe(
      '2–3 lžíce',
    );
  });
  it('declines porce and formats durations/clock', () => {
    expect([porce(1), porce(3), porce(5)]).toEqual(['1 porce', '3 porce', '5 porcí']);
    expect([kroky(1), kroky(3), kroky(5)]).toEqual(['1 krok', '3 kroky', '5 kroků']);
    expect([krokyWord(3), krokyWord(0)]).toEqual(['kroky', 'kroků']);
    expect([suroviny(1), suroviny(4), suroviny(17)]).toEqual([
      '1 surovina',
      '4 suroviny',
      '17 surovin',
    ]);
    expect([minuty(1), minuty(2), minuty(20)]).toEqual(['1 minuta', '2 minuty', '20 minut']);
    expect(formatDuration(5400)).toBe('1 h 30 min');
    expect(formatDuration(1200)).toBe('20 min');
    expect(formatDuration(45)).toBe('45 s');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('timers', () => {
  function setup() {
    let now = 1_000_000;
    const onAlarm = vi.fn();
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    const store = createTimerStore({ now: () => now, onAlarm, storage });
    return { store, onAlarm, storage, advance: (ms: number) => (now += ms), getNow: () => now };
  }
  it('runs several timers concurrently, sorted by remaining time', () => {
    const { store, advance } = setup();
    store.add('Omáčka', 600);
    store.add('Knedlík', 120);
    advance(60_000);
    store.tick();
    const [first, second] = store.getSnapshot();
    expect(first!.label).toBe('Knedlík');
    expect(first!.remainingMs).toBe(60_000);
    expect(second!.remainingMs).toBe(540_000);
    expect(second!.fraction).toBeCloseTo(0.9);
  });
  it('rings once, puts ringing first and stops after acknowledge', () => {
    const { store, onAlarm, advance } = setup();
    store.add('Dlouhý', 600);
    const id = store.add('Krátký', 30);
    advance(31_000);
    store.tick();
    store.tick();
    expect(onAlarm).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()[0]).toMatchObject({ id, status: 'ringing' });
    store.acknowledge(id);
    expect(store.getSnapshot().find((t) => t.id === id)?.status).toBe('done');
  });
  it('pauses, resumes and extends', () => {
    const { store, advance } = setup();
    const id = store.add('Těsto', 100);
    advance(40_000);
    store.pause(id);
    advance(500_000);
    store.tick();
    expect(store.getSnapshot()[0]).toMatchObject({ status: 'paused', remainingMs: 60_000 });
    store.resume(id);
    store.addTime(id, 60);
    advance(1000);
    store.tick();
    expect(store.getSnapshot()[0]!.remainingMs).toBe(119_000);
  });
  it('rings again after +1 min on a finished timer', () => {
    const { store, onAlarm, advance } = setup();
    const id = store.add('Rýže', 10);
    advance(11_000);
    store.tick();
    store.addTime(id, 60);
    store.tick();
    expect(store.getSnapshot()[0]!.status).toBe('running');
    advance(61_000);
    store.tick();
    expect(onAlarm).toHaveBeenCalledTimes(2);
  });
  it('persists across reloads', () => {
    const { store, storage, getNow } = setup();
    store.add('Vývar', 300);
    const reloaded = createTimerStore({ now: getNow, storage });
    expect(reloaded.getSnapshot()).toHaveLength(1);
    expect(reloaded.getSnapshot()[0]!.label).toBe('Vývar');
  });
});

describe('server-side timers (backend)', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  it('shares one server list between devices: start, +1 min, cancel', async () => {
    const backend = createMockTimerBackend();
    const tablet = createTimerStore({ backend });
    const phone = createTimerStore({ backend });
    await flush();
    tablet.add('Guláš · krok 3', 120, 2, 'r1');
    await flush();
    expect(phone.getSnapshot()).toHaveLength(1);
    const id = phone.getSnapshot()[0]!.id;
    expect(tablet.getSnapshot()[0]!.id).toBe(id); // optimistic id replaced by the server id
    expect(phone.getSnapshot()[0]).toMatchObject({ recipeId: 'r1', stepIndex: 2 });
    phone.addTime(id, 60);
    await flush();
    expect(tablet.getSnapshot()[0]!.durationMs).toBe(180_000);
    tablet.remove(id);
    await flush();
    expect(phone.getSnapshot()).toHaveLength(0);
  });
  it('+1 min counts once on the device that pressed it (backend echo + optimistic update)', async () => {
    // Regression: the local backend echoes its snapshot synchronously; the store
    // applied the optimistic +60 s on top of that echo, so 3:00 became 5:00.
    const backend = createMockTimerBackend();
    const store = createTimerStore({ backend });
    await flush();
    store.add('Minutka 3 min', 180);
    await flush();
    const id = store.getSnapshot()[0]!.id;
    store.addTime(id, 60);
    expect(store.getSnapshot()[0]!.remainingMs).toBeGreaterThan(235_000);
    expect(store.getSnapshot()[0]!.remainingMs).toBeLessThanOrEqual(240_000);
    await flush();
    expect(store.getSnapshot()[0]!.remainingMs).toBeLessThanOrEqual(240_000);
    expect(store.getSnapshot()[0]!.durationMs).toBe(240_000);
    store.pause(id);
    store.addTime(id, 60);
    await flush();
    const paused = store.getSnapshot()[0]!;
    expect(paused.status).toBe('paused');
    expect(paused.remainingMs).toBeGreaterThan(295_000);
    expect(paused.remainingMs).toBeLessThanOrEqual(300_000);
  });
  it('the same recipe step started on two devices is one timer', async () => {
    const backend = createMockTimerBackend();
    const a = createTimerStore({ backend });
    const b = createTimerStore({ backend });
    a.add('Knedlíky', 600, 1, 'r1');
    b.add('Knedlíky', 600, 1, 'r1');
    await flush();
    expect(a.getSnapshot()).toHaveLength(1);
    expect(b.getSnapshot()).toHaveLength(1);
  });
  it('uses the server clock (device clock skew) and never touches localStorage', async () => {
    let cb: ((s: TimerSnapshot) => void) | null = null;
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    const backend: TimerBackend = {
      subscribe: async (c) => ((cb = c), () => undefined),
      start: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
    };
    const deviceNow = 1_000_000;
    const store = createTimerStore({ backend, storage, now: () => deviceNow });
    await flush();
    // The server is 30 s ahead; its timer ends 60 s after the server's now.
    const serverNow = deviceNow + 30_000;
    const timer: Timer = {
      id: 'x',
      label: 'Rýže',
      stepIndex: null,
      durationMs: 90_000,
      endsAt: serverNow + 60_000,
      pausedRemainingMs: null,
      acknowledged: false,
    };
    cb!({ timers: [timer], serverNow });
    expect(store.getSnapshot()[0]!.remainingMs).toBe(60_000);
    store.pause('x');
    expect(backend.update).toHaveBeenCalledWith('x', 'pause');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

const config = (music: boolean, fryer = false, allowed = true): RecipesConfig => ({
  music: { configured: music, mediaSessionEntity: music ? 'sensor.x_media_session' : null },
  airfryer: { configured: fryer, allowed, entities: {}, methods: [] },
  canEdit: false,
});

describe('music bar visibility', () => {
  const session = { state: 'Playing', attributes: { title: 'Song', artist: 'Band' } };
  it('is hidden until the tablet notify target is configured', () => {
    expect(musicBarModel(null, session, false).visible).toBe(false);
    expect(musicBarModel(config(false), session, false).visible).toBe(false);
    expect(musicBarModel(config(true), undefined, false)).toMatchObject({
      visible: true,
      playing: false,
      title: null,
    });
  });
  it('reads the Companion media session sensor', () => {
    expect(musicBarModel(config(true), session, false)).toMatchObject({
      playing: true,
      title: 'Song',
      artist: 'Band',
      mode: 'full',
    });
    const perApp = {
      state: 'Paused',
      attributes: { 'title_com.google.android.apps.youtube.music': 'YT song' },
    };
    expect(musicBarModel(config(true), perApp, false)).toMatchObject({
      playing: false,
      title: 'YT song',
    });
  });
  it('ducks while the recipe video plays', () => {
    expect(musicBarModel(config(true), session, true)).toMatchObject({
      mode: 'ducked',
      playing: false,
    });
  });
  it('pauses music for the video and resumes only if it paused it', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const c = createVideoMusicCoordinator(send);
    await c.videoPlaying(true);
    await c.videoPlaying(true);
    await c.videoStopped();
    expect(send.mock.calls).toEqual([['pause'], ['play']]);
    send.mockClear();
    await c.videoPlaying(false);
    await c.videoStopped();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('airfryer availability', () => {
  it('blocks unless configured, allowed and the drawer is closed', () => {
    expect(airfryerBlock(config(false, false), 'off')).toBe('not_configured');
    expect(airfryerBlock(config(false, true, false), 'off')).toBe('not_allowed');
    expect(airfryerBlock(config(false, true), 'on')).toBe('drawer_open');
    expect(airfryerBlock(config(false, true), 'unavailable')).toBe('drawer_unknown');
    expect(airfryerBlock(config(false, true), undefined)).toBe('drawer_unknown');
    expect(airfryerBlock(config(false, true), 'off')).toBeNull();
  });
  it('reads remaining time in minutes or seconds', () => {
    expect(remainingMinutes({ state: '12', attributes: { unit_of_measurement: 'min' } })).toBe(12);
    expect(remainingMinutes({ state: '90', attributes: { unit_of_measurement: 's' } })).toBe(2);
    expect(remainingMinutes({ state: '0', attributes: {} })).toBeNull();
    expect(remainingMinutes(undefined)).toBeNull();
  });
});
