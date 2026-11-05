import type { Signal } from '@homebrain/signals';

export type WeatherIcon = 'clear' | 'partly' | 'cloudy' | 'rain' | 'wind' | 'moon' | 'snow';

export type RibbonKind = 'cheap' | 'rain' | 'waste' | 'event';

export type TodayData = {
  now: string;
  station: {
    tempC: number;
    updatedAt: string;
    condition: string;
    icon: WeatherIcon;
  };
  sun: {
    sunrise: string;
    sunset: string;
  };
  cloudCover: number;
  rain?: { probability: number; inMinutes: number };
  windy: boolean;
  hourly: Array<{ time: string; tempC: number; icon: WeatherIcon }>;
  ribbon: Array<{
    id: string;
    kind: RibbonKind;
    from: string;
    to?: string;
    label: string;
    /** Signal describing the same event; when its card is visible the ribbon shows only a marker. */
    signalId?: string;
    /**
     * Calendar event listed in the agenda row under the ribbon (the ribbon keeps only its
     * marker). `time` is local `H:MM`, empty for all-day events.
     */
    agenda?: { time: string; title: string };
  }>;
  signals: Signal[];
  ha: { connected: boolean; updatedAt: string };
  tomorrow?: string;
  /** Normalized moon position on night arc (0–1), default 0.5 when icon is moon. */
  moonPhase?: number;
};

export type StateKey = 'a' | 'a-night' | 'b' | 'c' | 'd';

export const TIME_ZONE = 'Europe/Prague' as const;
