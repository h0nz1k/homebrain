import type { StateKey, TodayData, WeatherIcon } from './types.js';
import { SIGNALS_A, SIGNALS_B, SIGNALS_C, SIGNALS_D } from './signalFixtures.js';

const HOURLY_A: TodayData['hourly'] = [
  { time: '2026-10-31T07:00:00+01:00', tempC: 8, icon: 'cloudy' },
  { time: '2026-10-31T10:00:00+01:00', tempC: 11, icon: 'partly' },
  { time: '2026-10-31T13:00:00+01:00', tempC: 13, icon: 'partly' },
  { time: '2026-10-31T16:00:00+01:00', tempC: 12, icon: 'clear' },
  { time: '2026-10-31T19:00:00+01:00', tempC: 9, icon: 'moon' },
  { time: '2026-10-31T22:00:00+01:00', tempC: 7, icon: 'moon' },
];

const HOURLY_B: TodayData['hourly'] = [
  { time: '2026-11-02T06:00:00+01:00', tempC: 5, icon: 'cloudy' },
  { time: '2026-11-02T09:00:00+01:00', tempC: 7, icon: 'rain' },
  { time: '2026-11-02T12:00:00+01:00', tempC: 9, icon: 'rain' },
  { time: '2026-11-02T15:00:00+01:00', tempC: 8, icon: 'cloudy' },
  { time: '2026-11-02T18:00:00+01:00', tempC: 7, icon: 'cloudy' },
];

const HOURLY_C: TodayData['hourly'] = [
  { time: '2026-11-01T09:00:00+01:00', tempC: 10, icon: 'wind' },
  { time: '2026-11-01T12:00:00+01:00', tempC: 12, icon: 'wind' },
  { time: '2026-11-01T15:00:00+01:00', tempC: 11, icon: 'wind' },
  { time: '2026-11-01T18:00:00+01:00', tempC: 9, icon: 'cloudy' },
];

const HOURLY_D: TodayData['hourly'] = [
  { time: '2026-11-05T18:00:00+01:00', tempC: 4, icon: 'clear' },
  { time: '2026-11-05T21:00:00+01:00', tempC: 2, icon: 'moon' },
  { time: '2026-11-06T00:00:00+01:00', tempC: 0, icon: 'moon' },
  { time: '2026-11-06T03:00:00+01:00', tempC: -2, icon: 'moon' },
  { time: '2026-11-06T06:00:00+01:00', tempC: -1, icon: 'moon' },
];

export const FIXTURES: Record<StateKey, TodayData> = {
  a: {
    now: '2026-10-31T10:40:00+01:00',
    station: {
      tempC: 12.4,
      updatedAt: '2026-10-31T10:39:20+01:00',
      condition: 'polojasno',
      icon: 'partly',
    },
    sun: {
      sunrise: '2026-10-31T06:56:00+01:00',
      sunset: '2026-10-31T16:47:00+01:00',
    },
    cloudCover: 0.45,
    windy: false,
    hourly: HOURLY_A,
    ribbon: [
      {
        id: 'cheap-1315',
        signalId: 'energy.cheap.1031',
        kind: 'cheap',
        from: '2026-10-31T13:00:00+01:00',
        to: '2026-10-31T15:00:00+01:00',
        label: 'Levný proud 13–15 h · 0,9 Kč',
      },
      {
        id: 'cal-dinner',
        signalId: 'cal.dinner',
        kind: 'event',
        from: '2026-10-31T18:00:00+01:00',
        label: '18:00 Večeře u babičky',
      },
    ],
    signals: SIGNALS_A,
    ha: { connected: true, updatedAt: '2026-10-31T10:39:20+01:00' },
  },
  'a-night': {
    now: '2026-10-31T23:00:00+01:00',
    station: {
      tempC: 7.1,
      updatedAt: '2026-10-31T22:59:30+01:00',
      condition: 'jasno',
      icon: 'moon',
    },
    sun: {
      sunrise: '2026-10-31T06:56:00+01:00',
      sunset: '2026-10-31T16:47:00+01:00',
    },
    cloudCover: 0.15,
    windy: false,
    moonPhase: 0.62,
    hourly: HOURLY_A,
    ribbon: [],
    signals: [],
    ha: { connected: true, updatedAt: '2026-10-31T22:59:30+01:00' },
  },
  b: {
    now: '2026-11-02T07:25:00+01:00',
    station: {
      tempC: 6.2,
      updatedAt: '2026-11-02T07:24:30+01:00',
      condition: 'zataženo, déšť se blíží',
      icon: 'rain',
    },
    sun: {
      sunrise: '2026-11-02T06:59:00+01:00',
      sunset: '2026-11-02T16:44:00+01:00',
    },
    cloudCover: 0.88,
    rain: { probability: 0.92, inMinutes: 35 },
    windy: false,
    hourly: HOURLY_B,
    ribbon: [
      {
        id: 'cheap-79',
        signalId: 'energy.cheap.now',
        kind: 'cheap',
        from: '2026-11-02T07:00:00+01:00',
        to: '2026-11-02T09:00:00+01:00',
        label: 'Levně do 9:00',
      },
      {
        id: 'rain-front',
        signalId: 'weather.nowcast.rain',
        kind: 'rain',
        from: '2026-11-02T08:00:00+01:00',
        to: '2026-11-02T12:00:00+01:00',
        label: 'Déšť od 8:00, pak přeháňky',
      },
      {
        id: 'waste-plastic',
        signalId: 'waste.today.plastic',
        kind: 'waste',
        from: '2026-11-02T06:00:00+01:00',
        to: '2026-11-02T08:00:00+01:00',
        label: 'Plasty do 8:00',
      },
      {
        id: 'meds-morning',
        signalId: 'health.meds',
        kind: 'event',
        from: '2026-11-02T07:30:00+01:00',
        label: '7:30 Ranní léky',
      },
      {
        id: 'cal-meeting',
        signalId: 'cal.meeting',
        kind: 'event',
        from: '2026-11-02T09:30:00+01:00',
        label: '9:30 Porada',
      },
    ],
    signals: SIGNALS_B,
    ha: { connected: true, updatedAt: '2026-11-02T07:24:30+01:00' },
  },
  c: {
    now: '2026-11-01T15:20:00+01:00',
    station: {
      tempC: 11.1,
      updatedAt: '2026-11-01T15:06:00+01:00',
      condition: 'bouřlivý vítr',
      icon: 'wind',
    },
    sun: {
      sunrise: '2026-11-01T06:57:00+01:00',
      sunset: '2026-11-01T16:45:00+01:00',
    },
    cloudCover: 1,
    windy: true,
    hourly: HOURLY_C,
    ribbon: [],
    signals: SIGNALS_C,
    ha: { connected: false, updatedAt: '2026-11-01T15:06:00+01:00' },
  },
  d: {
    now: '2026-11-05T20:45:00+01:00',
    station: {
      tempC: 2.1,
      updatedAt: '2026-11-05T20:44:10+01:00',
      condition: 'jasno',
      icon: 'moon',
    },
    sun: {
      sunrise: '2026-11-05T07:04:00+01:00',
      sunset: '2026-11-05T16:38:00+01:00',
    },
    cloudCover: 0.08,
    windy: false,
    hourly: HOURLY_D,
    ribbon: [
      {
        id: 'waste-paper',
        signalId: 'waste.tomorrow.paper',
        kind: 'waste',
        from: '2026-11-05T17:00:00+01:00',
        to: '2026-11-06T07:00:00+01:00',
        label: 'Zítra svoz: papír',
      },
    ],
    signals: SIGNALS_D,
    ha: { connected: true, updatedAt: '2026-11-05T20:44:10+01:00' },
    tomorrow: 'Zítra svoz: papír',
  },
};

export function fixtureFor(state: StateKey): TodayData {
  return structuredClone(FIXTURES[state]);
}

/** Maps station icon to expected Czech condition keywords (for summary consistency tests). */
export const ICON_CONDITION_HINTS: Record<WeatherIcon, readonly string[]> = {
  clear: ['jasno', 'bez oblačnosti'],
  partly: ['polojasno', 'polojasná'],
  cloudy: ['zataženo', 'oblačno'],
  rain: ['déšť', 'zataženo'],
  wind: ['vítr', 'větrno', 'bouřlivý'],
  moon: ['jasno', 'noc'],
  snow: ['sníh', 'sněžení'],
};
