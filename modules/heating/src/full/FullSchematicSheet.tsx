import { useBackClosable } from '@homebrain/ha-client';
import { Icon } from '@homebrain/ui';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { HeatingSnapshot } from '../types.js';
import { FULL_CANVAS, FullSchematic } from './FullSchematic.js';
import { fullState, mixerFault } from './fullState.js';
import { LegendPanel, legendStyles } from './Legend.js';
import { OVERVIEW_BELOW, overviewBounds } from './overview.js';
import { clampView, fitView, zoomAt, type Rect, type View } from './panZoom.js';
import {
  CONTENT,
  equivalentPreset,
  frameView,
  presetById,
  presetFrame,
  presetsFor,
  bestPlacement,
  padFor,
} from './presets.js';
import { fullSchematicStyles } from './styles.js';

const NARROW = 700;
/** Phone opens on the heat pump, wider screens on the whole drawing. */
const firstPreset = (vw: number) => (vw < NARROW ? 'hp' : 'all');

export function FullSchematicSheet({
  snap,
  open,
  onClose,
}: {
  snap: HeatingSnapshot;
  open: boolean;
  onClose: () => void;
}) {
  useBackClosable(onClose, open);
  const anchor = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  // Portal into the themed shell root (tokens + data-theme live there), not into <body>.
  useLayoutEffect(() => {
    setHost(anchor.current?.closest<HTMLElement>('[data-theme]') ?? document.body);
  }, []);
  const theme = useHostTheme(host);
  return (
    <>
      <span ref={anchor} hidden />
      {open && host && createPortal(<Viewer snap={snap} onClose={onClose} theme={theme} />, host)}
    </>
  );
}

/** Effective theme of the shell: `light` / `dark`, `system` resolved via prefers-color-scheme. */
export function useHostTheme(host: HTMLElement | null): 'light' | 'dark' {
  const subscribe = useCallback(
    (notify: () => void) => {
      const mo = new MutationObserver(notify);
      if (host) mo.observe(host, { attributes: true, attributeFilter: ['data-theme'] });
      const mq =
        typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: light)') : null;
      mq?.addEventListener('change', notify);
      return () => {
        mo.disconnect();
        mq?.removeEventListener('change', notify);
      };
    },
    [host],
  );
  const read = (): 'light' | 'dark' => {
    const v =
      host?.getAttribute('data-theme') ?? document.documentElement.getAttribute('data-theme');
    if (v === 'light' || v === 'dark') return v;
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  };
  return useSyncExternalStore(subscribe, read, () => 'dark');
}

function Viewer({
  snap,
  onClose,
  theme,
}: {
  snap: HeatingSnapshot;
  onClose: () => void;
  theme: 'light' | 'dark';
}) {
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const port = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, top: 0 });
  const [view, setView] = useState<View>({ scale: 0.3, tx: 0, ty: 0 });
  const [preset, setPresetState] = useState<string | null>(null);
  // r4: visible frame of the preset (its box grown to the viewport), snapped after measuring
  const [frame, setFrame] = useState<{ box: Rect; frame: Rect; snapped: boolean } | null>(null);
  const [service, setService] = useState(false);
  const [touched, setTouched] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const tools = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; x: number; y: number } | null>(null);
  const moved = useRef(false);
  const lastTap = useRef(0);
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);

  const st = fullState(snap);
  // Whole drawing: the overview (zone cards above / below the house) when the detail text would be
  // too small, else the plain drawing.
  const bounds = overviewBounds(st);
  const allBox: Rect =
    size.w && fitView(size.w, size.h, CONTENT, 12).scale >= OVERVIEW_BELOW ? CONTENT : bounds;
  const minScale = size.w ? fitView(size.w, size.h, allBox, 12).scale : 0.05;
  const narrow = size.w > 0 && size.w < NARROW;
  const offered = size.w ? presetsFor(size.w, size.h) : [];
  // Any user move ends the preset (and its clip) and hides the gesture hint.
  const setPreset = useCallback((id: string | null) => {
    setPresetState(id);
    setTouched(true);
  }, []);

  const apply = useCallback(
    (next: View) => {
      if (!size.w) return;
      setView(clampView(next, size.w, size.h, bounds, Math.min(minScale, next.scale)));
    },
    [bounds, minScale, size.h, size.w],
  );

  const goPreset = useCallback(
    (id: string) => {
      if (!size.w) return;
      setPresetState(id);
      const p = id === 'all' ? undefined : presetById(id);
      if (p) {
        const fit = presetFrame(size.w, size.h, p.box);
        setFrame({ box: p.box, frame: fit.frame, snapped: false });
        setView(fit.view);
      } else {
        setFrame(null);
        setView(fitView(size.w, size.h, allBox, 12));
      }
    },
    [size.h, size.w, allBox],
  );

  useLayoutEffect(() => {
    const el = port.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight, top: el.offsetTop });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  // First layout: phone on the heat pump, wide on the whole drawing. Every resize (rotation, dock
  // toggle) keeps the same place: the preset (or its equivalent on this size) or the free view.
  const started = useRef(false);
  useLayoutEffect(() => {
    if (!size.w) return;
    if (!started.current) {
      started.current = true;
      goPreset(firstPreset(size.w));
      return;
    }
    if (preset === null) {
      apply(viewRef.current);
      return;
    }
    goPreset(preset === 'all' ? 'all' : (equivalentPreset(preset, offered) ?? 'all'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  // Leaving a preset (pan, zoom, Celé) shows everything again.
  useLayoutEffect(() => {
    if (preset && preset !== 'all') return;
    for (const el of Array.from(port.current?.querySelectorAll('[data-cut]') ?? [])) {
      el.removeAttribute('data-cut');
    }
  }, [preset]);

  // Grown frame edges must not cut a text, pill or glyph: measure what the frame shows (drawing
  // units) and pull such edges in (never into the preset box itself), keeping the scale.
  useLayoutEffect(() => {
    if (!frame || frame.snapped || !size.w) return;
    const svg = port.current?.querySelector<SVGSVGElement>('svg[data-testid="heating-full-svg"]');
    const inv = svg?.getScreenCTM()?.inverse();
    if (!svg || !inv) return;
    const items: Rect[] = [];
    const els: SVGGraphicsElement[] = [];
    const sel =
      'text, rect.fs-vpill, rect.fs-card, [data-glyph], [data-badge-for], [data-zone-title], [data-snap]';
    for (const el of Array.from(svg.querySelectorAll<SVGGraphicsElement>(sel))) {
      if (el.closest('[data-layer="end-labels"]')) continue;
      const m = el.getScreenCTM();
      if (!m) continue;
      const b = el.getBBox();
      if (!b.width && !b.height) continue;
      const k = inv.multiply(m);
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [px, py] of [
        [b.x, b.y],
        [b.x + b.width, b.y],
        [b.x, b.y + b.height],
        [b.x + b.width, b.y + b.height],
      ] as const) {
        const q = new DOMPoint(px, py).matrixTransform(k);
        xs.push(q.x);
        ys.push(q.y);
      }
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      items.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
      els.push(el);
    }
    const place = bestPlacement(frame.frame, frame.box, items);
    // snapping must not undo the fill: if it would leave > 15 % of the canvas empty, keep the
    // grown frame – whatever its edges cut is hidden below instead
    const shrunk = place.snapped.h < place.raw.h * 0.85 || place.snapped.w < place.raw.w * 0.85;
    const next = shrunk ? place.raw : place.snapped;
    // whatever still straddles the final frame (a fixed side edge on a narrow screen) belongs to
    // equipment outside it: hidden rather than cut in half
    for (const el of Array.from(svg.querySelectorAll<SVGGraphicsElement>('[data-cut]'))) {
      el.removeAttribute('data-cut');
    }
    els.forEach((el, i) => {
      const it = items[i]!;
      const touches =
        it.x < next.x + next.w &&
        it.x + it.w > next.x &&
        it.y < next.y + next.h &&
        it.y + it.h > next.y;
      const whole =
        it.x >= next.x - 0.5 &&
        it.y >= next.y - 0.5 &&
        it.x + it.w <= next.x + next.w + 0.5 &&
        it.y + it.h <= next.y + next.h + 0.5;
      if (touches && !whole) (el.closest('.fs-pill-g') ?? el).setAttribute('data-cut', '');
    });
    setFrame({ ...frame, frame: next, snapped: true });
    setView((v) => frameView(size.w, next, v.scale, padFor(size.w)));
  }, [frame, size.w]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    root.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);

  // Wheel must be non-passive to keep the page from zooming/scrolling.
  useEffect(() => {
    const el = port.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setTouched(true);
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      setPreset(null);
      if (e.shiftKey) {
        apply({ ...v, tx: v.tx - e.deltaY - e.deltaX });
        return;
      }
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        apply({ ...v, tx: v.tx - e.deltaX });
        return;
      }
      apply(
        zoomAt(
          v,
          e.clientX - r.left,
          e.clientY - r.top,
          Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)),
          minScale,
        ),
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [apply, minScale, setPreset]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = port.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    setTouched(true);
    port.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      pinch.current = {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      };
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const v = viewRef.current;
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      const zoomed = zoomAt(
        { ...v, tx: v.tx + x - pinch.current.x, ty: v.ty + y - pinch.current.y },
        x,
        y,
        d / pinch.current.d,
        minScale,
      );
      pinch.current = { d, x, y };
      moved.current = true;
      setPreset(null);
      apply(zoomed);
    } else if (pointers.current.size === 1) {
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) {
        moved.current = true;
        setPreset(null);
        apply({ ...v, tx: v.tx + dx, ty: v.ty + dy });
      }
    }
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (!p || moved.current || e.pointerType === 'mouse') return;
    const now = performance.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      apply(zoomAt(viewRef.current, p.x, p.y, 2, minScale));
    } else lastTap.current = now;
  };

  const zoomBy = (factor: number) => {
    setPreset(null);
    apply(zoomAt(view, size.w / 2, size.h / 2, factor, minScale));
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = 60;
    const k = e.key;
    if (k === '+' || k === '=') zoomBy(1.25);
    else if (k === '-') zoomBy(0.8);
    else if (k === '0') goPreset('all');
    else if (k.startsWith('Arrow')) {
      const dx = k === 'ArrowLeft' ? step : k === 'ArrowRight' ? -step : 0;
      const dy = k === 'ArrowUp' ? step : k === 'ArrowDown' ? -step : 0;
      setPreset(null);
      apply({ ...view, tx: view.tx + dx, ty: view.ty + dy });
    } else return;
    e.preventDefault();
  };

  const fault = mixerFault(snap);
  const otherFaults = snap.faults.active.filter((f) => f !== fault);
  const presetButtons = [{ id: 'all', label: 'Celé' }, ...offered];
  const showLegend = legendOpen;
  const active = preset && preset !== 'all' ? presetById(preset) : undefined;
  const lod = view.scale < OVERVIEW_BELOW ? 'overview' : 'detail';
  // Preset frame: the drawing is clipped to the preset box (drawing units, before scaling).
  const shown = active && frame ? frame.frame : undefined;
  const clip = shown
    ? `inset(${shown.y}px ${FULL_CANVAS.w - shown.x - shown.w}px ${
        FULL_CANVAS.h - shown.y - shown.h
      }px ${shown.x}px)`
    : undefined;

  return (
    <div
      ref={root}
      className="ht-fs-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="heating-full-schematic"
      data-preset={preset ?? 'free'}
      data-presets={offered.map((p) => p.id).join(' ')}
      data-fs-theme={theme}
      data-scale={view.scale.toFixed(3)}
    >
      <style>{fullSchematicStyles + overlayStyles + legendStyles}</style>
      <header className="ht-fs-head">
        <h2 id={titleId}>
          <span className="ht-fs-title-long">Topení – celé schéma</span>
          <span className="ht-fs-title-short" aria-hidden="true">
            Schéma topení
          </span>
        </h2>
        <div
          ref={tools}
          className="ht-fs-tools"
          role="toolbar"
          aria-label="Pohled na schéma"
          data-testid="heating-full-tabs"
        >
          {presetButtons.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className="ht-fs-btn"
              aria-pressed={preset === id}
              data-testid={`heating-full-preset-${id}`}
              onClick={() => {
                setTouched(true);
                goPreset(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ht-fs-actions">
          <button
            type="button"
            className="ht-fs-tool ht-fs-zoom"
            aria-label="Oddálit"
            onClick={() => zoomBy(0.8)}
          >
            −
          </button>
          <button
            type="button"
            className="ht-fs-tool ht-fs-zoom"
            aria-label="Přiblížit"
            onClick={() => zoomBy(1.25)}
          >
            +
          </button>
          <button
            type="button"
            className="ht-fs-tool"
            aria-pressed={service}
            data-testid="heating-full-service"
            onClick={() => {
              setTouched(true);
              setService((s) => !s);
            }}
          >
            <span className="ht-fs-check" aria-hidden="true" />
            Servis
          </button>
          <button
            type="button"
            className="ht-fs-tool"
            aria-expanded={showLegend}
            aria-pressed={showLegend}
            data-testid="heating-full-legend-toggle"
            onClick={() => {
              setTouched(true);
              setLegendOpen(!showLegend);
            }}
          >
            <span className="ht-fs-info" aria-hidden="true">
              i
            </span>
            Legenda
          </button>
          <button
            type="button"
            className="ht-fs-close"
            aria-label="Zavřít celé schéma"
            onClick={onClose}
            data-testid="heating-full-close"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
      </header>
      {(fault || otherFaults.length > 0) && (
        <p className="ht-fs-alert" role="status" data-testid="heating-full-alert">
          <span aria-hidden="true">⚠</span>{' '}
          {[fault ? 'Směšovací ventil ÚT: porucha' : null, ...otherFaults.map((f) => f.label)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      <div
        ref={port}
        className="ht-fs ht-fs-port"
        data-theme={theme}
        data-testid="heating-full-viewport"
        tabIndex={0}
        aria-label="Schéma: tažením posunete, kolečkem nebo dvěma prsty přiblížíte, šipky a + / − z klávesnice"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          const p = local(e);
          setPreset(null);
          apply(zoomAt(view, p.x, p.y, 2, minScale));
        }}
        onKeyDown={onKeyDown}
      >
        <div
          className="ht-fs-world"
          data-clip={active?.id}
          data-clip-box={
            shown
              ? `${shown.x.toFixed(1)} ${shown.y.toFixed(1)} ${shown.w.toFixed(1)} ${shown.h.toFixed(1)}`
              : undefined
          }
          style={{
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            clipPath: clip,
          }}
        >
          <FullSchematic
            snap={snap}
            service={service}
            theme={theme}
            lod={lod}
            frame={frame?.snapped ? (shown ?? null) : null}
            scale={view.scale}
            poolCard={active?.id === 'basin' ? 'above' : 'pit'}
          />
        </div>
        {showLegend && (
          <aside className="ht-fs fs-drawer" data-theme={theme} aria-label="Legenda a stav">
            <LegendPanel st={st} snap={snap} />
          </aside>
        )}
      </div>
      {narrow && !touched && (
        <p className="ht-fs-hint" data-testid="heating-full-hint">
          Posun tažením · přiblížení dvěma prsty · dvojité klepnutí
        </p>
      )}
    </div>
  );
}

const overlayStyles = `
.ht-fs-overlay { position:fixed; inset:0; z-index:60; display:flex; flex-direction:column; background:var(--hb-bg, #111418); color:var(--hb-t1); outline:none; }
.ht-fs-head { display:flex; align-items:center; gap:8px 12px; padding:8px 24px 8px 16px; padding-top:max(8px, env(safe-area-inset-top)); border-bottom:1px solid var(--hb-edge, #2a3038); }
.ht-fs-head h2 { font-size:16px; font-weight:600; margin:0; white-space:nowrap; }
.ht-fs-title-short { display:none; }
.ht-fs-tools { display:flex; flex-wrap:wrap; gap:6px; align-items:center; flex:1; min-width:0; }
.ht-fs-actions { display:flex; align-items:center; gap:6px; margin-left:auto; }
.ht-fs-btn { min-height:40px; padding:0 14px; border-radius:20px; border:1px solid var(--hb-edge, #3a414a); background:var(--hb-s1, #1b2026); color:var(--hb-t1); font:inherit; font-size:14px; font-weight:500; cursor:pointer; white-space:nowrap; }
.ht-fs-btn[aria-pressed='true'] { background:var(--hb-ac, #3d8bff); border-color:transparent; color:var(--hb-on-ac, #fff); }
/* tools are square-ish outline buttons, never filled like a selected view tab */
.ht-fs-tool { display:inline-flex; align-items:center; gap:6px; min-height:36px; padding:0 10px; border-radius:8px; border:1.5px solid var(--hb-edge, #3a414a); background:transparent; color:var(--hb-t1); font:inherit; font-size:14px; font-weight:500; cursor:pointer; white-space:nowrap; }
.ht-fs-tool[aria-pressed='true'] { border-color:var(--hb-ac, #3d8bff); color:var(--hb-t1); box-shadow:inset 0 -3px 0 var(--hb-ac, #3d8bff); }
.ht-fs-zoom { min-width:36px; justify-content:center; padding:0; font-size:20px; line-height:1; }
.ht-fs-info { display:inline-grid; place-items:center; width:18px; height:18px; border-radius:9px; border:1.5px solid currentColor; font-size:11px; font-weight:700; font-style:italic; }
.ht-fs-check { width:14px; height:14px; border-radius:4px; border:1.5px solid currentColor; }
.ht-fs-tool[aria-pressed='true'] .ht-fs-check { background:var(--hb-ac, #3d8bff); border-color:var(--hb-ac, #3d8bff); box-shadow:inset 0 0 0 2px var(--hb-bg, #111418); }
.ht-fs-close { width:44px; height:44px; border-radius:22px; border:0; background:transparent; color:var(--hb-t1); display:grid; place-items:center; cursor:pointer; }
.ht-fs-alert { margin:0; padding:8px 16px; font-size:14px; font-weight:600; background:color-mix(in srgb, var(--hb-warn, #ffb000) 22%, var(--hb-s1, #1b2026)); color:var(--hb-t1); border-bottom:2px solid var(--hb-warn, #ffb000); }
.ht-fs-port { position:relative; flex:1; min-height:0; overflow:hidden; touch-action:none; cursor:grab; outline:none; }
.ht-fs-port:active { cursor:grabbing; }
.ht-fs-port:focus-visible { box-shadow:inset 0 0 0 2px var(--hb-ac, #3d8bff); }
.ht-fs-world { position:absolute; left:0; top:0; transform-origin:0 0; }
.ht-fs-hint { position:absolute; left:50%; bottom:calc(20px + env(safe-area-inset-bottom)); transform:translateX(-50%); margin:0; padding:6px 12px; border-radius:16px; font-size:12px; background:color-mix(in srgb, var(--hb-s1, #1b2026) 88%, transparent); color:var(--hb-t2); pointer-events:none; white-space:nowrap; }
@media (max-width: 699px) {
  .ht-fs-head { flex-wrap:wrap; padding:6px 8px 8px 12px; gap:6px; }
  .ht-fs-title-long { display:none; }
  .ht-fs-title-short { display:inline; }
  .ht-fs-head h2 { font-size:15px; flex:1; min-width:0; }
  .ht-fs-actions { gap:4px; }
  .ht-fs-zoom { display:none; }
  .ht-fs-tool { min-height:34px; padding:0 7px; gap:4px; font-size:13px; }
  .ht-fs-close { width:38px; height:38px; }
  .ht-fs-check { width:12px; height:12px; }
  .ht-fs-tools { order:3; flex-basis:100%; gap:6px; }
  .ht-fs-btn { min-height:34px; padding:0 11px; font-size:13px; }
}
`;
