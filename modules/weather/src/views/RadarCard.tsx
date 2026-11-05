import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RadarBlock, RadarFrame, WeatherSnapshot } from '../contract.js';
import { BASEMAP } from './basemap.data.js';
import {
  RAIN_LEVELS,
  buildRamp,
  chartBands,
  chartTopMmh,
  chartY,
  dbzToMmh,
  decodeDbz,
  minuteHeadline,
  minuteSeries,
  monotonePath,
  rainWord,
  legendGradient,
  fitBox,
  pathBBox,
  CHART_GUIDES,
  renderField,
  type MinutePoint,
} from './radarRender.js';
import { placeMapLabels, type Rect } from './labels.js';

const hm = new Intl.DateTimeFormat('cs-CZ', { hour: 'numeric', minute: '2-digit' });
const nf1 = (v: number) =>
  v.toLocaleString('cs-CZ', { minimumFractionDigits: v < 10 ? 1 : 0, maximumFractionDigits: 1 });
const COMPASS = [
  'S',
  'SSV',
  'SV',
  'VSV',
  'V',
  'VJV',
  'JV',
  'JJV',
  'J',
  'JJZ',
  'JZ',
  'ZJZ',
  'Z',
  'ZSZ',
  'SZ',
  'SSZ',
];
const compass16 = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]!;
const CONF_CS = { high: 'vysoká', medium: 'střední', low: 'nízká', uncertain: 'nejistá' } as const;

export type RadarZoom = 'okoli' | 'kraj' | 'cesko';
const ZOOMS: { id: RadarZoom; label: string; km: number | null; aria: string }[] = [
  { id: 'okoli', label: 'Okolí', km: 25, aria: 'Okolí domova, 25 km' },
  { id: 'kraj', label: 'Kraj', km: 75, aria: 'Kraj, 75 km' },
  { id: 'cesko', label: 'Česko', km: null, aria: 'Celé Česko' },
];
const ASPECT = 4 / 3;
type Box = [number, number, number, number]; // x, y, w, h in composite px
let czBB: [number, number, number, number] | null = null;
const czBBox = () => (czBB ??= pathBBox(BASEMAP.orp));

/** Target view box (composite px) for a zoom level. */
export function zoomBox(rb: RadarBlock, zoom: RadarZoom): Box {
  const [H, W] = rb.composite_px ?? [BASEMAP.h, BASEMAP.w];
  const [hy, hx] = rb.home_px ?? [H / 2, W / 2];
  const km = ZOOMS.find((z) => z.id === zoom)!.km;
  if (km == null) {
    // Fit the country outline (ORP union), not the composite: the composite's east edge cuts CZ.
    if (W === BASEMAP.w && H === BASEMAP.h) return fitBox(czBBox(), ASPECT);
    const w = Math.max(W, H * ASPECT);
    return [(W - w) / 2, (H - w / ASPECT) / 2, w, w / ASPECT];
  }
  const h = (2 * km) / rb.km_per_px;
  const w = h * ASPECT;
  const clamp = (v: number, size: number, max: number) =>
    size >= max ? (max - size) / 2 : Math.min(max - size, Math.max(0, v));
  return [clamp(hx - w / 2, w, W), clamp(hy - h / 2, h, H), w, h];
}

function useAnimatedBox(target: Box): Box {
  const [box, setBox] = useState(target);
  const from = useRef(target);
  const key = target.join(',');
  useEffect(() => {
    const start = from.current;
    const reduce =
      typeof window === 'undefined' ||
      !window.matchMedia ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 0 : 480;
    const raf_ =
      typeof requestAnimationFrame === 'undefined'
        ? (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number
        : requestAnimationFrame;
    const cancel =
      typeof cancelAnimationFrame === 'undefined' ? clearTimeout : cancelAnimationFrame;
    let raf = 0;
    let t0 = -1;
    const tick = (t: number) => {
      if (t0 < 0) t0 = t;
      const k = dur ? Math.min(1, (t - t0) / dur) : 1;
      const e = 1 - (1 - k) ** 3;
      const b = start.map((v, i) => v + (target[i]! - v) * e) as Box;
      from.current = b;
      setBox(b);
      if (k < 1) raf = raf_(tick);
    };
    raf = raf_(tick);
    return () => cancel(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return box;
}

const canDraw = () =>
  typeof document !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !/jsdom/i.test(navigator.userAgent);

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('radar image failed'));
    img.src = url;
  });
}

/** Image -> smooth recoloured ImageData (ČHMÚ palette -> dBZ -> perceptual ramp). */
async function renderFrame(url: string, w: number, h: number, f: number, light: boolean) {
  const img = await loadImage(url);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no canvas');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);
  const dbz = decodeDbz(ctx.getImageData(0, 0, w, h).data, w, h);
  const out = renderField(dbz, w, h, f, buildRamp(light));
  return new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, out.width, out.height);
}

/** Put a rendered frame into a canvas (kept outside the component: DOM mutation). */
function paint(canvas: HTMLCanvasElement | null, data: ImageData): boolean {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return false;
  canvas.width = data.width;
  canvas.height = data.height;
  ctx.putImageData(data, 0, 0);
  return true;
}

function frameLabel(f: RadarFrame): string {
  if (f.kind === 'fct') return `předpověď +${f.offset_min} min`;
  return f.offset_min === 0 ? 'teď' : `před ${-f.offset_min} min`;
}

// ---------- hero: next-hour minute chart ----------
function MinuteChart({ series }: { series: MinutePoint[] | null }) {
  const lut = useMemo(() => buildRamp(false), []);
  const [scrub, setScrub] = useState<number | null>(null);
  const plotRef = useRef<SVGSVGElement>(null);
  if (!series) return null;
  const peak = series.reduce((m, p) => Math.max(m, p.mmh), 0);
  const dry = peak < RAIN_LEVELS[0]!.mmh;
  // Weak rain gets a lower ceiling (never below the 'mírný' threshold) so it uses the height.
  const top = chartTopMmh(peak);
  const y = (mmh: number) => 100 - chartY(mmh, top) * 92;
  // Display curve: rain onset eases in over ~3 min (the series keeps the exact ETA minute).
  const onset = series.findIndex((p) => p.mmh >= 0.1);
  const shown = series.map((p, i) => {
    if (onset <= 0 || i >= onset || i < onset - 3) return p.mmh;
    const k = (i - (onset - 4)) / 4;
    return series[onset]!.mmh * k * k * (3 - 2 * k);
  });
  const pts = series.map((p, i) => [(p.min / 60) * 600, y(shown[i]!)] as const);
  // Monotone cubic: smooth, but never below 0 mm/h or above the peak between samples.
  const line = monotonePath(pts);
  const area = `${line}L600 100L0 100Z`;
  const stops = [0.1, 0.6, 2.5, 6, 10, 30].map((mmh) => {
    const dbz = Math.round(10 * Math.log10(200 * mmh ** 1.6));
    const i = Math.min(64, Math.max(10, dbz)) * 4;
    return { off: chartY(mmh, top) * 0.92, col: `rgb(${lut[i]},${lut[i + 1]},${lut[i + 2]})` };
  });
  const firstWet = series.find((p) => p.mmh >= 0.1);
  const wetMin = series.filter((p) => p.mmh >= 0.1).map((p) => p.min);
  const summary = dry
    ? 'Srážky v příští hodině: bez srážek.'
    : `Srážky v příští hodině: ${
        firstWet!.min > 0 ? `do ${firstWet!.min} min sucho, ` : ''
      }srážky ${wetMin[0]}.–${wetMin[wetMin.length - 1]}. minutu, nejvýše ${nf1(peak)} mm/h (${rainWord(peak)}).`;
  const at = (clientX: number) => {
    const r = plotRef.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    setScrub(Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 60));
  };
  const sp = scrub == null ? null : series[Math.min(series.length - 1, scrub)]!;
  const tip =
    sp &&
    `${sp.min === 0 ? 'teď' : `za ${sp.min} min`} · ${
      sp.mmh < 0.1 ? 'sucho' : `${nf1(sp.mmh)} mm/h, ${rainWord(sp.mmh)}`
    }`;
  return (
    <div
      className="wx-rv-chart"
      role="img"
      aria-label={summary}
      data-testid="weather-radar-minutes"
      data-top-mmh={top}
      onPointerMove={(e) => at(e.clientX)}
      onPointerDown={(e) => at(e.clientX)}
      onPointerLeave={() => setScrub(null)}
      onPointerCancel={() => setScrub(null)}
    >
      <svg ref={plotRef} viewBox="0 0 600 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="wx-rv-g" gradientUnits="userSpaceOnUse" x1="0" y1="100" x2="0" y2="0">
            <stop offset="0" stopColor="var(--hb-t3)" stopOpacity="0.35" />
            <stop offset="0.012" stopColor="var(--hb-t3)" stopOpacity="0.35" />
            {stops.map((s) => (
              <stop key={s.col} offset={s.off.toFixed(3)} stopColor={s.col} />
            ))}
          </linearGradient>
          <linearGradient id="wx-rv-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="wx-rv-m" maskContentUnits="userSpaceOnUse">
            <rect x="0" y="0" width="600" height="100" fill="url(#wx-rv-fade)" />
          </mask>
        </defs>
        {CHART_GUIDES.filter((mmh) => mmh <= top).map((mmh) => (
          <line key={mmh} x1="0" x2="600" y1={y(mmh)} y2={y(mmh)} className="wx-rv-guide" />
        ))}
        <line x1="0" x2="600" y1="99.5" y2="99.5" className="wx-rv-base" />
        {!dry && <path d={area} fill="url(#wx-rv-g)" mask="url(#wx-rv-m)" className="wx-rv-area" />}
        {!dry && <path d={line} stroke="url(#wx-rv-g)" className="wx-rv-glow" />}
        {!dry && (
          <path
            d={line}
            stroke="url(#wx-rv-g)"
            className="wx-rv-line"
            data-testid="weather-radar-curve"
          />
        )}
      </svg>
      {sp && (
        <div
          className="wx-rv-scrub"
          style={{ left: `calc((100% - 54px) * ${(sp.min / 60).toFixed(4)})` }}
          data-testid="weather-radar-scrub"
        >
          <i style={{ top: `calc((100% - 18px) * ${(y(sp.mmh) / 100).toFixed(4)})` }} />
          <span className={sp.min > 40 ? 'end' : sp.min < 12 ? 'start' : ''}>{tip}</span>
        </div>
      )}
      {chartBands(top).map((b) => (
        <span
          key={b.word}
          className={`wx-rv-yl ${b.edge ? 'wx-rv-yl--edge' : ''}`}
          style={{ top: `calc((100% - 18px) * ${(1 - b.y * 0.92).toFixed(3)})` }}
          data-testid="weather-radar-band"
        >
          {b.edge ? `↑ ${b.word}` : b.word}
        </span>
      ))}
      {dry && <span className="wx-rv-dry">bez srážek</span>}
      <div className="wx-rv-xl" aria-hidden="true">
        {['teď', '15', '30', '45', '60 min'].map((t, i) => (
          <span key={t} style={{ left: `${i * 25}%` }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------- map ----------
type R = { left: number; right: number; top: number; bottom: number };
const hits = (a: R, b: R, pad: number) =>
  a.left < b.right + pad &&
  a.right > b.left - pad &&
  a.top < b.bottom + pad &&
  a.bottom > b.top - pad;

/**
 * Hide town labels whose rendered rect intersects a UI overlay (time chip, scale, home marker),
 * another kept label or the map edge. Runs on the real DOM rects after layout, so it holds for
 * any font, zoom animation frame and card width. The home-town label is placed first.
 */
export function avoidOverlays(map: HTMLElement): void {
  const m = map.getBoundingClientRect();
  if (!m.width) return;
  const obstacles = [...map.querySelectorAll<HTMLElement>('[data-rv-obstacle]')]
    .map((e) => ({ r: e.getBoundingClientRect(), home: e.dataset.rvObstacle === 'home' }))
    .filter((o) => o.r.width > 0 && o.r.height > 0);
  const labels = [...map.querySelectorAll<HTMLElement>('.wx-rv-place')].sort(
    (a, b) => Number(b.dataset.home === '1') - Number(a.dataset.home === '1'),
  );
  const kept: R[] = [];
  for (const el of labels) {
    const r = el.getBoundingClientRect();
    const isHome = el.dataset.home === '1';
    const out =
      r.left < m.left + 2 || r.right > m.right - 2 || r.top < m.top + 2 || r.bottom > m.bottom - 2;
    const hit =
      out ||
      obstacles.some((o) => !(isHome && o.home) && hits(r, o.r, 4)) ||
      kept.some((k) => hits(r, k, 2));
    if (hit) el.setAttribute('data-hidden', '');
    else {
      el.removeAttribute('data-hidden');
      kept.push(r);
    }
  }
}

const LABEL_RULES: Record<RadarZoom, { maxRank: number; max: number; gap: number }> = {
  okoli: { maxRank: 2, max: 9, gap: 10 },
  kraj: { maxRank: 1, max: 8, gap: 12 },
  cesko: { maxRank: 0, max: 8, gap: 12 },
};

/** Town labels for the view: rank priority, min spacing, clear of chips and the home marker. */
function placeLabels(box: Box, zoom: RadarZoom, home: [number, number] | null, pxW: number) {
  const rule = LABEL_RULES[zoom];
  const [bx, by, bw, bh] = box;
  const pxH = pxW / ASPECT;
  const toPx = (x: number, y: number) => [((x - bx) / bw) * pxW, ((y - by) / bh) * pxH] as const;
  const hp = home ? toPx(home[1], home[0]) : null;
  const cands = BASEMAP.places
    .filter(([, x, y, r]) => r <= rule.maxRank && x > bx && x < bx + bw && y > by && y < by + bh)
    .map(([name, x, y, rank]) => {
      const [px, py] = toPx(x, y);
      // The town you live in: label it beside the home marker instead of dropping it.
      const atHome = !!hp && Math.hypot(px - hp[0], py - hp[1]) < 14;
      return {
        name,
        x: atHome ? hp![0] + 4 : px,
        y: atHome ? hp![1] : py,
        rank,
        atHome,
        pinned: atHome,
        gx: x,
        gy: y,
      };
    });
  const reserved: Rect[] = [
    { x: 0, y: 0, w: Math.min(190, pxW * 0.5), h: 44 }, // time chip
    { x: pxW - 96, y: pxH - 48, w: 96, h: 48 }, // scale bar
  ];
  if (hp) reserved.push({ x: hp[0] - 12, y: hp[1] - 12, w: 24, h: 24 });
  return placeMapLabels(cands, {
    width: pxW,
    height: pxH,
    reserved,
    max: rule.max,
    gap: rule.gap,
  }).map((c) => ({ name: c.name, x: c.gx, y: c.gy, rank: c.rank, atHome: c.atHome }));
}

export function RadarCard({
  d,
  now,
  radarImage,
}: {
  d: WeatherSnapshot;
  now: number;
  radarImage?: (path: string) => Promise<string>;
}) {
  const rb = d.radar;
  const nc = d.nowcast;
  const frames = useMemo(() => rb?.frames ?? [], [rb]);
  const newest = Math.max(0, frames.map((f) => f.kind).lastIndexOf('obs'));
  const [idx, setIdx] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState<RadarZoom>('okoli');
  const [light, setLight] = useState(false);
  const [version, setVersion] = useState(0);
  const [front, setFront] = useState(0);
  const [ready, setReady] = useState(false);
  const [mapW, setMapW] = useState(360);
  const mapRef = useRef<HTMLDivElement>(null);
  // Label collision avoidance against the overlay chips (after every layout change).
  useLayoutEffect(() => {
    if (mapRef.current && canDraw()) avoidOverlays(mapRef.current);
  });
  useEffect(() => {
    const el = mapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => e && setMapW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const cvA = useRef<HTMLCanvasElement>(null);
  const cvB = useRef<HTMLCanvasElement>(null);
  const cache = useRef(new Map<string, ImageData>());
  const cur = Math.min(idx ?? newest, Math.max(0, frames.length - 1));
  const frame = frames[cur];
  const hasCz = !!rb?.cz_image_path && !!rb.origin_px;
  const scope: 'local' | 'cz' = zoom !== 'okoli' && hasCz ? 'cz' : 'local';
  const target = useMemo<Box>(
    () => (rb ? zoomBox(rb, hasCz ? zoom : 'okoli') : [0, 0, 1, 1]),
    [rb, zoom, hasCz],
  );
  const box = useAnimatedBox(target);
  const series = useMemo(
    () => minuteSeries(nc.radar_profile, nc.slots, now),
    [nc.radar_profile, nc.slots, now],
  );
  const approx = nc.source?.includes('radar') ? '~' : '';
  const headline = minuteHeadline(series, nc.status, nc.eta_min, nc.end_min, approx);
  const peak = series?.reduce((m, p) => Math.max(m, p.mmh), 0) ?? 0;
  const motion = nc.motion?.reliable && nc.motion.from_deg != null ? nc.motion : null;

  // Theme (ramp alpha differs on light basemap).
  useEffect(() => {
    const el = mapRef.current;
    if (!el || typeof getComputedStyle === 'undefined') return;
    const read = () => setLight(getComputedStyle(el).colorScheme === 'light');
    const t = setTimeout(read, 0);
    const shell = el.closest('[data-theme]');
    const mo =
      typeof MutationObserver === 'undefined' || !shell ? null : new MutationObserver(read);
    mo?.observe(shell!, { attributes: true, attributeFilter: ['data-theme'] });
    const mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    mq?.addEventListener?.('change', read);
    return () => {
      clearTimeout(t);
      mo?.disconnect();
      mq?.removeEventListener?.('change', read);
    };
  }, [rb?.available]);

  // Render frames of the active scope (current frame first), cached as ImageData.
  useEffect(() => {
    if (!rb || !radarImage || !frames.length || !canDraw()) return;
    let alive = true;
    const [w, h, f, tpl] =
      scope === 'cz'
        ? [
            Math.round(rb.composite_px![1] / rb.cz_factor!),
            Math.round(rb.composite_px![0] / rb.cz_factor!),
            2,
            rb.cz_image_path!,
          ]
        : [rb.size_px, rb.size_px, 3, rb.image_path];
    const order = [...frames.keys()].sort(
      (a, b) => Math.abs(a - (idx ?? newest)) - Math.abs(b - (idx ?? newest)),
    );
    void (async () => {
      for (const i of order) {
        const fr = frames[i]!;
        const key = `${scope}:${fr.id}:${light ? 'l' : 'd'}`;
        if (cache.current.has(key)) continue;
        try {
          const url = await radarImage(tpl.replace('{id}', fr.id));
          const data = await renderFrame(url, w, h, f, light);
          if (!alive) return;
          cache.current.set(key, data);
          setVersion((v) => v + 1);
        } catch {
          /* missing frame: keep previous one on screen */
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rb, frames, radarImage, scope, light]);

  // Crossfade: draw the wanted frame into the back canvas, then flip.
  const drawn = useRef('');
  useEffect(() => {
    if (!frame) return;
    const key = `${scope}:${frame.id}:${light ? 'l' : 'd'}`;
    const data = cache.current.get(key);
    if (!data || drawn.current === key) return;
    const back = (front === 0 ? cvB : cvA).current;
    const raf = requestAnimationFrame(() => {
      if (!paint(back, data)) return;
      drawn.current = key;
      setFront(1 - front);
      setReady(true);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, scope, light, version]);

  // Playback: loop through all frames, short hold on the newest observation and the end.
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const t = setTimeout(
      () => setIdx((i) => ((i ?? newest) + 1) % frames.length),
      cur === frames.length - 1 ? 1400 : cur === newest ? 1000 : 520,
    );
    return () => clearTimeout(t);
  }, [playing, frames.length, newest, cur]);

  if (!rb || !rb.available || !frame) {
    return (
      <section
        className="wx-card wx-radar"
        aria-label="Srážkový radar"
        data-testid="weather-radar"
        id="radar"
      >
        <header className="wx-ch">
          <div className="wx-ch-l">
            <h2 className="wx-ct">Srážkový radar</h2>
          </div>
        </header>
        <p className="wx-rv-head">{headline}</p>
        <MinuteChart series={series} />
        <p className="wx-t3">Radar není k dispozici (mimo pokrytí ČHMÚ nebo výpadek zdroje).</p>
      </section>
    );
  }

  const [bx, by, bw, bh] = box;
  const pct = (x: number, y: number) => ({
    left: `${((x - bx) / bw) * 100}%`,
    top: `${((y - by) / bh) * 100}%`,
  });
  const rect = (x: number, y: number, w: number, h: number) => ({
    ...pct(x, y),
    width: `${(w / bw) * 100}%`,
    height: `${(h / bh) * 100}%`,
  });
  const [H, W] = rb.composite_px ?? [BASEMAP.h, BASEMAP.w];
  const origin = rb.origin_px ?? [0, 0];
  const imgRect =
    scope === 'cz' ? rect(0, 0, W, H) : rect(origin[1], origin[0], rb.size_px, rb.size_px);
  const home = rb.home_px ?? null;
  const labels = placeLabels(target, hasCz ? zoom : 'okoli', home, mapW);
  const scaleKm = zoom === 'okoli' ? 10 : zoom === 'kraj' ? 25 : 50;
  const first = frames[0]!.offset_min;
  const last = frames[frames.length - 1]!.offset_min;
  const pos = (off: number) => ((off - first) / Math.max(1, last - first)) * 100;
  const nowPos = pos(0);
  const snap = (off: number) =>
    frames.reduce(
      (best, f, i) =>
        Math.abs(f.offset_min - off) < Math.abs(frames[best]!.offset_min - off) ? i : best,
      0,
    );
  const zoomInfo = ZOOMS.find((z) => z.id === zoom)!;
  const sub = [
    motion && `od ${compass16(motion.from_deg!)} ~${Math.round(motion.speed_kmh ?? 0)} km/h`,
    nc.confidence &&
      (nc.confidence === 'uncertain' ? 'nejistý odhad' : `jistota ${CONF_CS[nc.confidence]}`),
    peak >= 0.1 && `max ${nf1(peak)} mm/h`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      id="radar"
      className="wx-card wx-radar"
      aria-label="Srážkový radar"
      data-testid="weather-radar"
    >
      <header className="wx-ch">
        <div className="wx-ch-l">
          <h2 className="wx-ct">Srážky v příští hodině</h2>
          <span className="wx-cs">
            radar ČHMÚ · {rb.latest ? hm.format(new Date(rb.latest)) : '—'}
          </span>
        </div>
      </header>
      <div className="wx-rv-hero">
        <p className="wx-rv-head" data-testid="weather-radar-headline">
          {headline}
        </p>
        {sub && <p className="wx-rv-sub">{sub}</p>}
        <MinuteChart series={series} />
      </div>

      <div className="wx-rv-seg" role="radiogroup" aria-label="Přiblížení mapy">
        {ZOOMS.map((z) => (
          <button
            key={z.id}
            type="button"
            role="radio"
            aria-checked={zoom === z.id}
            aria-label={z.aria}
            disabled={z.id !== 'okoli' && !hasCz}
            className={zoom === z.id ? 'on' : ''}
            onClick={() => setZoom(z.id)}
            data-testid={`weather-radar-zoom-${z.id}`}
          >
            {z.label}
          </button>
        ))}
      </div>
      <div
        className={`wx-rv-map wx-rv-map--${zoom}`}
        ref={mapRef}
        role="img"
        aria-label={`Radarová mapa (${zoomInfo.aria}), ${hm.format(new Date(frame.t))}, ${frameLabel(frame)}. ${headline}.`}
        data-testid="weather-radar-map"
        data-zoom={zoom}
        data-scope={scope}
      >
        <svg
          className="wx-rv-base-map"
          viewBox={box.map((v) => v.toFixed(2)).join(' ')}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={BASEMAP.orp} className="wx-rv-cz" />
          {BASEMAP.urban && <path d={BASEMAP.urban} className="wx-rv-urban" />}
          <path d={BASEMAP.orp} className="wx-rv-orp" />
          <path d={BASEMAP.lakes} className="wx-rv-lake" />
          {BASEMAP.minorRivers && <path d={BASEMAP.minorRivers} className="wx-rv-river2" />}
          <path d={BASEMAP.rivers} className="wx-rv-river" />
          {BASEMAP.roads && <path d={BASEMAP.roads} className="wx-rv-road" />}
          {BASEMAP.motorways && <path d={BASEMAP.motorways} className="wx-rv-mway" />}
        </svg>
        <div
          className="wx-rv-radar"
          style={imgRect}
          data-testid={ready ? 'weather-radar-img' : undefined}
        >
          <canvas ref={cvA} className={`wx-rv-cv ${front === 0 && ready ? 'on' : ''}`} />
          <canvas ref={cvB} className={`wx-rv-cv ${front === 1 && ready ? 'on' : ''}`} />
        </div>
        <svg
          className="wx-rv-top"
          viewBox={box.join(' ')}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={BASEMAP.kraje} className="wx-rv-kraj" />
          <path d={BASEMAP.border} className="wx-rv-border" />
        </svg>
        {labels.map((l) => (
          <span
            key={l.name}
            className={`wx-rv-place wx-rv-place--${l.rank} ${l.atHome ? 'wx-rv-place--home' : ''}`}
            style={l.atHome && home ? pct(home[1], home[0]) : pct(l.x, l.y)}
            data-home={l.atHome ? '1' : undefined}
            data-testid="weather-radar-place"
          >
            <i />
            {l.name}
          </span>
        ))}
        {home && (
          <span
            className="wx-rv-home"
            key={zoom}
            style={pct(home[1], home[0])}
            data-testid="weather-radar-home"
          >
            <i data-rv-obstacle="home" />
          </span>
        )}
        <span
          className={`wx-rv-time ${frame.kind === 'fct' ? 'wx-rv-time--fct' : ''}`}
          data-testid="weather-radar-time"
          data-rv-obstacle="chip"
        >
          <b>{hm.format(new Date(frame.t))}</b> {frameLabel(frame)}
        </span>
        <span className="wx-rv-scale" aria-hidden="true" data-rv-obstacle="chip">
          <i style={{ width: `${Math.round((scaleKm / rb.km_per_px / bw) * mapW)}px` }} />
          <span>{scaleKm} km</span>
        </span>
      </div>

      <div className="wx-rv-tl">
        <button
          type="button"
          className="wx-rv-play"
          onClick={() => {
            if (!playing && cur === frames.length - 1) setIdx(0);
            setPlaying((p) => !p);
          }}
          aria-label={playing ? 'Pozastavit smyčku' : 'Přehrát smyčku'}
          aria-pressed={playing}
          data-testid="weather-radar-play"
        >
          {playing ? (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3.5" y="2.5" width="3" height="11" rx="1" />
              <rect x="9.5" y="2.5" width="3" height="11" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.4-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7z" />
            </svg>
          )}
        </button>
        <div className="wx-rv-track">
          <div className="wx-rv-rail">
            <span className="wx-rv-past" style={{ width: `${nowPos}%` }} />
            <span className="wx-rv-fct" style={{ left: `${nowPos}%` }} />
            {frames.map((f) => (
              <i
                key={f.id}
                className={`wx-rv-tick wx-rv-tick--${f.kind}`}
                style={{ left: `${pos(f.offset_min)}%` }}
              />
            ))}
            <span
              className="wx-rv-nowm"
              style={{ left: `${nowPos}%` }}
              data-testid="weather-radar-now"
            />
            <span className="wx-rv-tf">předpověď</span>
          </div>
          <input
            type="range"
            min={first}
            max={last}
            step={5}
            value={frame.offset_min}
            onChange={(e) => {
              setPlaying(false);
              setIdx(snap(Number(e.target.value)));
            }}
            aria-label="Čas snímku"
            aria-valuetext={`${hm.format(new Date(frame.t))}, ${frameLabel(frame)}`}
            data-testid="weather-radar-slider"
          />
          <div className="wx-rv-tx" aria-hidden="true">
            <span>{hm.format(new Date(frames[0]!.t))}</span>
            <span className="wx-rv-tnow" style={{ left: `${nowPos}%` }}>
              teď
            </span>
            <span>{hm.format(new Date(frames[frames.length - 1]!.t))}</span>
          </div>
        </div>
      </div>

      <div className="wx-rv-foot" data-testid="weather-radar-credits">
        <span className="wx-rv-foot-l">
          © ČHMÚ, ČÚZK, GeoNames ·{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/deed.cs"
            target="_blank"
            rel="noreferrer"
          >
            CC&nbsp;BY&nbsp;4.0
          </a>
        </span>
        <details className="wx-rv-credits">
          <summary aria-label="Zdroje a licence mapy">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6.6" />
              <path d="M8 7.2v4M8 4.9v.1" />
            </svg>
          </summary>
          <div className="wx-rv-pop" role="note">
            <b>Intenzita srážek</b>
            <div className="wx-rv-leg" data-testid="weather-radar-legend">
              <div className="wx-rv-legbar" style={{ background: legendGradient() }} />
              <div className="wx-rv-legx">
                {RAIN_LEVELS.map((l, i) => (
                  <span key={l.word} style={{ left: `${((i + 0.5) / RAIN_LEVELS.length) * 100}%` }}>
                    {l.word}
                  </span>
                ))}
              </div>
            </div>
            <span>
              {RAIN_LEVELS.map((l) => `${l.word} od ${nf1(l.mmh)} mm/h`).join(', ')} (z odrazivosti
              radaru, {nf1(dbzToMmh(20))} mm/h ≈ 20 dBZ).
            </span>
            <b>Zdroje mapy a radaru</b>
            <span>Radarová data: ČHMÚ, CC BY 4.0 (přebarveno a vyhlazeno).</span>
            <span>Hranice ORP a krajů: ČÚZK RÚIAN, CC BY 4.0.</span>
            <span>Názvy obcí: GeoNames, CC BY 4.0.</span>
            <span>Řeky, jezera, silnice, zástavba: Natural Earth (volné dílo).</span>
            <span>Vše je součástí HomeBrain, prohlížeč nekontaktuje žádný mapový server.</span>
          </div>
        </details>
      </div>
    </section>
  );
}
