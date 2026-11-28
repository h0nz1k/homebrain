/**
 * Full-screen photo viewer for wine label zoom (WIN-027).
 *
 * Renders a portal overlay above the HA shell.  Supports:
 *   – pinch zoom (Pointer Events) and one-finger pan when zoomed
 *   – double-tap / double-click toggle 1× ↔ 2.5×
 *   – mouse-wheel / trackpad zoom around the cursor
 *   – +/− and reset buttons; Esc, X and backdrop (at 1×) close
 *   – progressive image swap: thumbnail immediately, fullUrl once loaded
 *   – body scroll lock, focus trap, focus restore on close
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useBackClosable } from '@homebrain/ha-client';
import type { WineRecord } from '../domain/index.js';
import { MAX_SCALE, MIN_SCALE, clampPan, doubleTapToggle, zoomAround } from './zoom.js';
import type { Size, ZoomState } from './zoom.js';

const STEP = 1.5; // zoom step for +/− buttons

// ---------------------------------------------------------------------------
// Focus trap helper
// ---------------------------------------------------------------------------

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function trapFocus(e: KeyboardEvent, root: HTMLElement) {
  if (e.key !== 'Tab') return;
  const els = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (!els.length) return;
  const first = els[0]!;
  const last = els[els.length - 1]!;
  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

// ---------------------------------------------------------------------------
// LabelViewer
// ---------------------------------------------------------------------------

export function LabelViewer({
  wine,
  thumbUrl,
  fullUrl,
  onClose,
  triggerRef,
}: {
  wine: WineRecord;
  /** URL to show immediately (thumbnail). */
  thumbUrl: string;
  /** Full-resolution URL to swap in once loaded (may be null). */
  fullUrl: string | null | undefined;
  onClose: () => void;
  /** Ref to the button that opened the viewer; focus returns here on close. */
  triggerRef: RefObject<HTMLElement | null>;
}) {
  const [src, setSrc] = useState(thumbUrl);
  const [zoom, setZoom] = useState<ZoomState>({ scale: 1, tx: 0, ty: 0 });
  const zoomRef = useRef(zoom);
  useLayoutEffect(() => {
    zoomRef.current = zoom;
  });
  const [hintGone, setHintGone] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  useBackClosable(onClose);
  // Portal into the themed shell root (tokens, data-theme and the module styles live
  // there, inside HA's shadow DOM), not into <body> where none of them apply.
  useLayoutEffect(() => {
    setHost(anchor.current?.closest<HTMLElement>('[data-theme]') ?? document.body);
  }, []);

  const getVP = useCallback(
    (): Size => ({
      width: stageRef.current?.clientWidth || window.innerWidth,
      height: stageRef.current?.clientHeight || window.innerHeight,
    }),
    [],
  );
  /** Rendered image size at 1× (offset sizes ignore the CSS transform). */
  const getContent = useCallback((): Size => {
    const img = imgRef.current;
    return img && img.offsetWidth > 0
      ? { width: img.offsetWidth, height: img.offsetHeight }
      : getVP();
  }, [getVP]);

  // Progressive image upgrade
  useEffect(() => {
    if (!fullUrl || fullUrl === thumbUrl) return;
    const img = new Image();
    img.onload = () => setSrc(fullUrl);
    img.src = fullUrl;
  }, [fullUrl, thumbUrl]);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Focus management. Esc is caught in the capture phase and stopped, so a sheet or
  // drawer underneath (they listen on window) does not close together with the viewer.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
        closeRef.current();
        return;
      }
      trapFocus(e, dialog!);
    }
    window.addEventListener('keydown', onKey, true);
    const trigger = triggerRef.current;
    return () => {
      window.removeEventListener('keydown', onKey, true);
      trigger?.focus();
    };
  }, [host, triggerRef]);

  // Pointer events (pan + pinch)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const ptrs = new Map<number, { x: number; y: number }>();
    let lastTap = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    let downX = 0;
    let downY = 0;
    let multi = false;

    function onDown(e: PointerEvent) {
      e.preventDefault();
      stage!.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) {
        downX = e.clientX;
        downY = e.clientY;
        multi = false;
      } else {
        multi = true;
      }
    }

    /** The stage covers the backdrop, so a backdrop tap is a still tap outside the photo. */
    function isOutsideImage(x: number, y: number): boolean {
      const r = imgRef.current?.getBoundingClientRect();
      if (!r || r.width === 0) return false;
      return x < r.left || x > r.right || y < r.top || y > r.bottom;
    }

    function onMove(e: PointerEvent) {
      e.preventDefault();
      const prev = ptrs.get(e.pointerId);
      if (!prev) return;

      const vp = getVP();

      if (ptrs.size === 1) {
        // Single pointer: pan when zoomed
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        setZoom((s: ZoomState) => {
          if (s.scale <= MIN_SCALE) return s;
          return clampPan({ ...s, tx: s.tx + dx, ty: s.ty + dy }, vp, getContent());
        });
      } else if (ptrs.size >= 2) {
        // Two-finger pinch
        const other = [...ptrs.entries()].find(([id]) => id !== e.pointerId);
        if (!other) return;
        const otherPt = other[1];
        const prevDist = Math.hypot(prev.x - otherPt.x, prev.y - otherPt.y);
        const currDist = Math.hypot(e.clientX - otherPt.x, e.clientY - otherPt.y);
        if (prevDist < 1) return;
        const factor = currDist / prevDist;
        const midX = (e.clientX + otherPt.x) / 2;
        const midY = (e.clientY + otherPt.y) / 2;
        setZoom((s: ZoomState) => zoomAround(s, s.scale * factor, midX, midY, vp, getContent()));
        dismissHint();
      }

      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    function onUp(e: PointerEvent) {
      const prev = ptrs.get(e.pointerId);
      ptrs.delete(e.pointerId);
      if (!prev) return;

      const still = !multi && Math.hypot(e.clientX - downX, e.clientY - downY) < 10;
      if (
        e.type === 'pointerup' &&
        still &&
        ptrs.size === 0 &&
        zoomRef.current.scale <= MIN_SCALE &&
        isOutsideImage(e.clientX, e.clientY)
      ) {
        closeRef.current();
        return;
      }

      // Double-tap detection (≤300 ms, ≤30 px apart)
      const now = Date.now();
      const dist = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY);
      if (now - lastTap < 300 && dist < 30) {
        const vp = getVP();
        setZoom((s: ZoomState) => doubleTapToggle(s, e.clientX, e.clientY, vp, getContent()));
        dismissHint();
        lastTap = 0;
      } else {
        lastTap = now;
        lastTapX = e.clientX;
        lastTapY = e.clientY;
      }
    }

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    return () => {
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
    };
  }, [getVP, getContent, host]);

  // Mouse wheel zoom
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const vp = getVP();
      setZoom((s: ZoomState) =>
        zoomAround(s, s.scale * factor, e.clientX, e.clientY, vp, getContent()),
      );
      dismissHint();
    }
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [getVP, getContent, host]);

  function dismissHint() {
    setHintGone(true);
  }

  function zoomStep(factor: number) {
    const vp = getVP();
    setZoom((s: ZoomState) =>
      zoomAround(s, s.scale * factor, vp.width / 2, vp.height / 2, vp, getContent()),
    );
  }

  function resetZoom() {
    setZoom({ scale: MIN_SCALE, tx: 0, ty: 0 });
  }

  function handleBackdropClick() {
    // Only close on backdrop tap when at 1× (not mid-zoom).
    if (zoom.scale <= MIN_SCALE) onClose();
  }

  const imgStyle: CSSProperties = {
    transform: `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`,
    transformOrigin: 'center center',
    transition: zoom.scale === MIN_SCALE ? 'transform .2s ease' : undefined,
    // No will-change: it freezes the raster at 1x and the zoomed label turns blurry.
    userSelect: 'none',
    pointerEvents: 'none',
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    display: 'block',
    touchAction: 'none',
  };

  const content = (
    <div
      className="wine-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Fotka etikety: ${wine.name}`}
      ref={dialogRef}
      tabIndex={-1}
    >
      {/* backdrop */}
      <div className="wine-viewer-backdrop" onClick={handleBackdropClick} aria-hidden="true" />

      {/* stage: receives all pointer/wheel events */}
      <div
        className="wine-viewer-stage"
        ref={stageRef}
        style={{ touchAction: 'none' }}
        data-testid="wine-viewer-stage"
      >
        <img
          className="wine-viewer-img"
          ref={imgRef}
          src={src}
          alt={`Fotografie etikety: ${wine.name}`}
          draggable={false}
          style={imgStyle}
          data-testid="wine-viewer-img"
          data-scale={String(zoom.scale)}
        />
      </div>

      {/* close button */}
      <button
        type="button"
        className="wine-viewer-close"
        aria-label="Zavřít"
        onClick={onClose}
        data-autofocus
        data-testid="wine-viewer-close"
      >
        ✕
      </button>

      {/* zoom controls */}
      <div className="wine-viewer-controls" role="group" aria-label="Ovládání lupy">
        <button
          type="button"
          className="wine-viewer-ctrl"
          aria-label="Přiblížit"
          onClick={() => {
            zoomStep(STEP);
            dismissHint();
          }}
          disabled={zoom.scale >= MAX_SCALE}
          data-testid="wine-viewer-zoom-in"
        >
          +
        </button>
        <button
          type="button"
          className="wine-viewer-ctrl"
          aria-label="Oddálit"
          onClick={() => {
            zoomStep(1 / STEP);
            dismissHint();
          }}
          disabled={zoom.scale <= MIN_SCALE}
          data-testid="wine-viewer-zoom-out"
        >
          −
        </button>
        <button
          type="button"
          className="wine-viewer-ctrl wine-viewer-ctrl--reset"
          aria-label="Resetovat zoom"
          onClick={resetZoom}
          disabled={zoom.scale <= MIN_SCALE}
          data-testid="wine-viewer-zoom-reset"
        >
          1:1
        </button>
      </div>

      {/* hint (disappears on first interaction) */}
      {!hintGone && (
        <p className="wine-viewer-hint" aria-live="polite">
          Roztáhni prsty nebo dvakrát klepni pro přiblížení
        </p>
      )}
    </div>
  );

  return (
    <>
      <span ref={anchor} hidden />
      {host && createPortal(content, host)}
    </>
  );
}
