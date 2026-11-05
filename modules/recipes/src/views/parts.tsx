import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useBackClosable } from '@homebrain/ha-client';
import { Button, Sheet, toast } from '@homebrain/ui';
import type { RecipesApi } from '../api.js';
import { RecipesApiError } from '../api.js';
import { BLOCK_TEXT, airfryerBlock, describeAction, remainingMinutes } from '../domain/airfryer.js';
import { createVideoMusicCoordinator, musicBarModel } from '../domain/music.js';
import { formatClock } from '../domain/scale.js';
import type { TimerStore, TimerView } from '../domain/timers.js';
import type { AirfryerAction, RecipesConfig } from '../types.js';

const PATHS: Record<string, ReactNode> = {
  back: <path d="M15 5l-7 7 7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9.5V13l2 1.5M10 3h4" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5z" />,
  pause: <path d="M8 5h3v14H8zM13 5h3v14h-3z" />,
  next: <path d="M6 6v12l8.5-6zM17 6v12" />,
  prev: <path d="M18 6v12L9.5 12zM7 6v12" />,
  right: <path d="M5 12h14M13 6l6 6-6 6" />,
  left: <path d="M19 12H5M11 6l-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </>
  ),
  music: (
    <path d="M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
  ),
  fryer: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="4" />
      <path d="M8 14h8M12 8v2" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </>
  ),
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
};
export function Icon({ name }: { name: keyof typeof PATHS | string }) {
  return (
    <svg className="rc-i" viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/* ---------- timers ---------- */
function Ring({ fraction, size = 64 }: { fraction: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--hb-fill-strong)"
        strokeWidth="6"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fraction)))}
        style={{ color: 'var(--rc-ac)' }}
      />
    </svg>
  );
}

export function TimerCard({
  timer,
  store,
  soon,
}: {
  timer: TimerView;
  store: TimerStore;
  soon: boolean;
}) {
  const ringing = timer.status === 'ringing';
  return (
    <div
      className="rc-tcard"
      data-testid="recipes-timer"
      data-status={timer.status}
      data-soon={soon && !ringing ? 'true' : 'false'}
      role="timer"
      aria-label={`${timer.label}: ${ringing ? 'hotovo' : formatClock(timer.remainingMs / 1000)}`}
    >
      <div className="ring">
        <Ring fraction={timer.fraction} />
      </div>
      <div className="tx">
        <b className="num">{ringing ? 'Hotovo' : formatClock(timer.remainingMs / 1000)}</b>
        <span>{timer.label}</span>
      </div>
      {ringing ? (
        <>
          <Button onClick={() => store.addTime(timer.id, 60)}>+1 min</Button>
          <Button
            data-testid="recipes-timer-ack"
            onClick={() => {
              store.acknowledge(timer.id);
              store.remove(timer.id);
            }}
          >
            Ztišit
          </Button>
        </>
      ) : (
        <>
          <Button
            aria-label={timer.status === 'paused' ? 'Pokračovat' : 'Pozastavit'}
            icon={<Icon name={timer.status === 'paused' ? 'play' : 'pause'} />}
            onClick={() =>
              timer.status === 'paused' ? store.resume(timer.id) : store.pause(timer.id)
            }
          />
          <Button
            aria-label="Zrušit časovač"
            icon={<Icon name="close" />}
            onClick={() => store.remove(timer.id)}
          />
        </>
      )}
    </div>
  );
}

let audioCtx: AudioContext | null = null;
/** Short three-beep chime (Web Audio; the first tap on the page unlocks audio). */
export function playChime() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    const ctx = audioCtx;
    [0, 0.35, 0.7].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.32);
    });
  } catch {
    // audio not available (tests, locked autoplay) – the toast still shows
  }
}

/* ---------- screen wake lock ---------- */
interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener?(type: 'release', cb: () => void): void;
}
/**
 * Screen Wake Lock API – secure context only (HTTPS/localhost):
 * https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
 * Over plain http the kitchen tablet relies on Companion „Keep screen on“ (docs/modules/recipes.md).
 */
export function useWakeLock(active: boolean): boolean {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
    };
    if (!nav.wakeLock || !window.isSecureContext) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const request = () => {
      nav.wakeLock
        ?.request('screen')
        .then((s) => {
          if (cancelled) {
            void s.release();
            return;
          }
          sentinel = s;
          setLocked(true);
          s.addEventListener?.('release', () => setLocked(false));
        })
        .catch(() => setLocked(false));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') request();
    };
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
      setTimeout(() => setLocked(false), 0);
    };
  }, [active]);
  return locked;
}

/* ---------- music bar ---------- */
interface StateLike {
  state: string;
  attributes: Record<string, unknown>;
}
export function MusicBar({
  api,
  config,
  session,
  videoPlaying,
}: {
  api: RecipesApi;
  config: RecipesConfig | null;
  session: StateLike | undefined;
  videoPlaying: boolean;
}) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  // Companion uses Android music-stream levels 0–15; do not send a default on mount.
  const [volume, setVolume] = useState(8);
  const model = musicBarModel(config, session, videoPlaying, optimistic);
  if (!model.visible) return null;
  const send = (command: 'play' | 'pause' | 'next' | 'previous') => {
    if (command === 'play' || command === 'pause') setOptimistic(command === 'play');
    api.music(command).catch(() => {
      setOptimistic(null);
      toast.error('Hudbu se nepodařilo ovládnout');
    });
  };
  if (model.mode === 'ducked') {
    return (
      <div className="rc-mbar" data-mode="ducked" data-testid="recipes-music" aria-label="Hudba">
        <span className="art">
          <Icon name="music" />
        </span>
        <div className="np">
          <b>Hudba pozastavena</b>
          <span>naváže po videu</span>
        </div>
      </div>
    );
  }
  return (
    <div className="rc-mbar" data-mode="full" data-testid="recipes-music" aria-label="Hudba">
      <span className="art">
        <Icon name="music" />
      </span>
      <div className="np">
        <b>{model.title ?? 'YouTube Music'}</b>
        <span>{model.artist ?? 'Tablet v kuchyni'}</span>
      </div>
      <button type="button" aria-label="Předchozí" onClick={() => send('previous')}>
        <Icon name="prev" />
      </button>
      <button
        type="button"
        className="pp"
        aria-label={model.playing ? 'Pozastavit hudbu' : 'Přehrát hudbu'}
        data-testid="recipes-music-toggle"
        onClick={() => send(model.playing ? 'pause' : 'play')}
      >
        <Icon name={model.playing ? 'pause' : 'play'} />
      </button>
      <button type="button" aria-label="Další" onClick={() => send('next')}>
        <Icon name="next" />
      </button>
      <label className="rc-volume">
        <span>Hlasitost</span>
        <input
          type="range"
          min="0"
          max="15"
          step="1"
          value={volume}
          aria-label="Hlasitost hudby"
          onChange={(e) => {
            const level = Number(e.target.value);
            setVolume(level);
            api.music('volume', level).catch(() => toast.error('Hlasitost se nepodařilo změnit'));
          }}
        />
      </label>
    </div>
  );
}

/* ---------- airfryer ---------- */
export function AirfryerConfirm({
  action,
  onConfirm,
  onClose,
}: {
  action: AirfryerAction;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useBackClosable(onClose);
  return (
    <Sheet
      title="Spustit fritézu?"
      onClose={onClose}
      dismissOnScrim
      data-testid="recipes-airfryer-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zrušit
          </Button>
          <Button
            variant="primary"
            icon={<Icon name="fryer" />}
            data-testid="recipes-airfryer-confirm"
            onClick={onConfirm}
          >
            Spustit
          </Button>
        </>
      }
    >
      <p>
        Nastaví se <b>{describeAction(action)}</b> a fritéza se hned rozběhne. Zkontrolujte, že je
        jídlo v koši a zásuvka zavřená.
      </p>
    </Sheet>
  );
}

export function AirfryerStep({
  api,
  config,
  action,
  drawer,
  remaining,
  onStarted,
}: {
  api: RecipesApi;
  config: RecipesConfig | null;
  action: AirfryerAction;
  drawer: StateLike | undefined;
  remaining: StateLike | undefined;
  onStarted?: (minutes: number) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!config?.airfryer.configured) return null;
  const block = airfryerBlock(config, drawer?.state);
  const left = remainingMinutes(remaining);
  const start = () => {
    setConfirming(false);
    setBusy(true);
    api
      .airfryer({
        temperature: action.temperature,
        minutes: action.minutes,
        method: action.method,
        confirmed: true,
      })
      .then((res) => {
        toast.success(`Fritéza běží · ${res.minutes} min`);
        onStarted?.(res.minutes);
      })
      .catch((err: unknown) => {
        const code = err instanceof RecipesApiError ? err.code : '';
        toast.error(
          code === 'AIRFRYER_DRAWER_OPEN'
            ? 'Zavřete zásuvku fritézy'
            : 'Fritézu se nepodařilo spustit',
        );
      })
      .finally(() => setBusy(false));
  };
  return (
    <div className="rc-fryact" data-testid="recipes-airfryer">
      <span className="rc-ibtn">
        <Icon name="fryer" />
      </span>
      <div className="t">
        <b>Fritéza · {describeAction(action)}</b>
        <span data-testid="recipes-airfryer-status">
          {left !== null ? `Zbývá ${left} min` : block ? BLOCK_TEXT[block] : 'Připraveno'}
        </span>
      </div>
      <button
        type="button"
        className="rc-btn rc-pri"
        disabled={block !== null || busy}
        data-testid="recipes-airfryer-send"
        onClick={() => setConfirming(true)}
      >
        Poslat do fritézy
      </button>
      {confirming ? (
        <AirfryerConfirm action={action} onConfirm={start} onClose={() => setConfirming(false)} />
      ) : null}
    </div>
  );
}

/* ---------- YouTube mini player (IFrame Player API) ---------- */
interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars: Record<string, number>;
      events: { onStateChange: (e: { data: number }) => void };
    },
  ) => YTPlayer;
}
let ytPromise: Promise<YTNamespace> | null = null;
/** https://developers.google.com/youtube/iframe_api_reference – loaded only on first play. */
function loadYouTube(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  ytPromise ??= new Promise((resolve, reject) => {
    w.onYouTubeIframeAPIReady = () => (w.YT ? resolve(w.YT) : reject(new Error('yt')));
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      ytPromise = null;
      reject(new Error('yt'));
    };
    document.head.append(script);
  });
  return ytPromise;
}

export function VideoPip({
  youtubeId,
  startAt,
  poster,
  api,
  musicPlaying,
  onPlayingChange,
}: {
  youtubeId: string;
  startAt: number | null;
  poster: string | undefined;
  api: RecipesApi;
  musicPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [open, setOpen] = useState(false);
  const musicRef = useRef(musicPlaying);
  const coordinator = useRef(
    createVideoMusicCoordinator((cmd) => api.music(cmd).catch(() => undefined)),
  );
  useEffect(() => {
    musicRef.current = musicPlaying;
  });
  useEffect(() => {
    if (open && startAt !== null) player.current?.seekTo(startAt, true);
  }, [open, startAt]);
  useEffect(
    () => () => {
      player.current?.destroy();
      void coordinator.current.videoStopped();
    },
    [],
  );
  const start = () => {
    setOpen(true);
    loadYouTube()
      .then((YT) => {
        if (!host.current || player.current) return;
        const el = document.createElement('div');
        host.current.append(el);
        player.current = new YT.Player(el, {
          videoId: youtubeId,
          playerVars: { start: startAt ?? 0, playsinline: 1, rel: 0, autoplay: 1 },
          events: {
            onStateChange: ({ data }) => {
              // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
              if (data === 1) {
                onPlayingChange(true);
                void coordinator.current.videoPlaying(musicRef.current);
              } else if (data === 2 || data === 0) {
                onPlayingChange(false);
                void coordinator.current.videoStopped();
              }
            },
          },
        });
      })
      .catch(() => {
        setOpen(false);
        toast.error('Video se nepodařilo načíst');
      });
  };
  const close = () => {
    player.current?.destroy();
    player.current = null;
    setOpen(false);
    onPlayingChange(false);
    void coordinator.current.videoStopped();
  };
  return (
    <div className="rc-pip" data-testid="recipes-video">
      <div className="yt-host" ref={host} />
      {open ? (
        <button type="button" className="x" aria-label="Zavřít video" onClick={close}>
          <Icon name="close" />
        </button>
      ) : (
        <button
          type="button"
          className="ov"
          onClick={start}
          style={
            poster
              ? {
                  backgroundImage: `linear-gradient(transparent 20%, rgb(8 5 3 / 90%)), url("${poster}")`,
                  backgroundSize: 'cover',
                }
              : undefined
          }
        >
          <span className="row">
            <span className="rc-play">
              <Icon name="play" />
            </span>
            <span>
              <b>Video k receptu</b>
              <span>{startAt ? `od ${formatClock(startAt)} · tento krok` : 'YouTube'}</span>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
