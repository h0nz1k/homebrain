import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';

export interface PanZoomViewportProps {
  children: ReactNode;
  className?: string;
  /** World bounds in SVG units. */
  worldBounds: { x: number; y: number; w: number; h: number };
  /** Top inset reserved for header (px). */
  headerInset?: number;
  /** Bottom inset reserved for controls (px). */
  footerInset?: number;
  /** Phone: start focused; wide screens: fit all. */
  initialFocus?: { cx: number; cy: number; multiplier: number } | 'fit';
  onTransform?: (t: { scale: number; tx: number; ty: number; minScale: number }) => void;
  'data-testid'?: string;
}

interface PanZoomState {
  scale: number;
  tx: number;
  ty: number;
  minScale: number;
}

const HINT_KEY = 'hb-heating-detail-hint';

function safeRect(
  viewport: DOMRect,
  headerInset: number,
  footerInset: number,
): { x: number; y: number; w: number; h: number } {
  return { x: 16, y: headerInset + 6, w: viewport.width - 32, h: viewport.height - headerInset - footerInset };
}

function fitAll(safe: { x: number; y: number; w: number; h: number }, world: PanZoomViewportProps['worldBounds']) {
  const minScale = Math.min((safe.w - 12) / world.w, (safe.h - 12) / world.h);
  const scale = minScale;
  const tx = safe.x + safe.w / 2 - (world.x + world.w / 2) * scale;
  const ty = safe.y + safe.h / 2 - (world.y + world.h / 2) * scale;
  return { scale, tx, ty, minScale };
}

function clamp(state: PanZoomState, viewportW: number, viewportH: number, world: PanZoomViewportProps['worldBounds']) {
  const margin = 30;
  const tx = Math.max(
    margin - (world.x + world.w) * state.scale,
    Math.min(viewportW - margin - world.x * state.scale, state.tx),
  );
  const ty = Math.max(
    margin - (world.y + world.h) * state.scale,
    Math.min(viewportH - margin - world.y * state.scale, state.ty),
  );
  return { ...state, tx, ty };
}

export function PanZoomViewport({
  children,
  className,
  worldBounds,
  headerInset = 56,
  footerInset = 88,
  initialFocus = 'fit',
  onTransform,
  ...rest
}: PanZoomViewportProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PanZoomState>({ scale: 1, tx: 0, ty: 0, minScale: 0.1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ d: number; x: number; y: number } | null>(null);
  const lastTap = useRef(-Infinity);
  const down = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const applyState = useCallback(
    (next: PanZoomState) => {
      const el = ref.current;
      if (!el) return;
      const clamped = clamp(next, el.clientWidth, el.clientHeight, worldBounds);
      setState(clamped);
      onTransform?.(clamped);
    },
    [onTransform, worldBounds],
  );

  const layout = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const safe = safeRect(el.getBoundingClientRect(), headerInset, footerInset);
    const fitted = fitAll(safe, worldBounds);
    if (initialFocus === 'fit' || el.clientWidth >= 600) {
      applyState(fitted);
      return;
    }
    const [cx, cy] = [initialFocus.cx, initialFocus.cy];
    const mult = initialFocus.multiplier;
    const scale = Math.max(fitted.minScale, Math.min(4, fitted.minScale * mult));
    const tx = safe.x + safe.w / 2 - cx * scale;
    const ty = safe.y + safe.h / 2 - cy * scale - 24;
    applyState({ ...fitted, scale, tx, ty });
  }, [applyState, headerInset, footerInset, initialFocus, worldBounds]);

  useLayoutEffect(() => {
    layout();
  }, [layout]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => layout());
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout]);

  const hideHint = () => {
    try {
      sessionStorage.setItem(HINT_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const zoomAt = (x: number, y: number, factor: number) => {
    const maxScale = 4;
    const ns = Math.min(maxScale, Math.max(state.minScale, state.scale * factor));
    const r = ns / state.scale;
    const tx = x - (x - state.tx) * r;
    const ty = y - (y - state.ty) * r;
    applyState({ ...state, scale: ns, tx, ty });
  };

  const pan = (dx: number, dy: number) => {
    applyState({ ...state, tx: state.tx + dx, ty: state.ty + dy });
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    hideHint();
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    pointers.current.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    down.current = { x: e.clientX, y: e.clientY, moved: false };
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const a = pts[0]!;
      const b = pts[1]!;
      gesture.current = { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      down.current.moved = true;
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, p);
    if (down.current && Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 5) {
      down.current.moved = true;
    }
    if (pointers.current.size === 2 && gesture.current) {
      const pts = [...pointers.current.values()];
      const a = pts[0]!;
      const b = pts[1]!;
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      pan(x - gesture.current.x, y - gesture.current.y);
      zoomAt(x, y, d / gesture.current.d);
      gesture.current = { d, x, y };
    } else if (pointers.current.size === 1) {
      pan(p.x - prev.x, p.y - prev.y);
    }
  };

  const dbl = (x: number, y: number) => {
    if (state.scale >= 3.95) {
      const el = ref.current!;
      const safe = safeRect(el.getBoundingClientRect(), headerInset, footerInset);
      applyState(fitAll(safe, worldBounds));
    } else zoomAt(x, y, 2);
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (e.pointerType === 'touch' && p && down.current && !down.current.moved && pointers.current.size === 1) {
      const now = performance.now();
      if (now - lastTap.current < 320) {
        dbl(p.x, p.y);
        lastTap.current = -Infinity;
      } else lastTap.current = now;
    }
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    hideHint();
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (e.ctrlKey || e.metaKey) zoomAt(x, y, Math.exp(-e.deltaY * 0.008));
    else pan(-(e.shiftKey ? e.deltaY : e.deltaX), e.shiftKey ? 0 : -e.deltaY);
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{ touchAction: 'none' }}
      data-testid={rest['data-testid']}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => {
        const el = ref.current!;
        const r = el.getBoundingClientRect();
        dbl(e.clientX - r.left, e.clientY - r.top);
      }}
      onWheel={onWheel}
      tabIndex={0}
    >
      <div
        style={{
          transform: `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`,
          transformOrigin: '0 0',
          width: 0,
          height: 0,
        }}
        data-panzoom-scale={state.scale}
      >
        {children}
      </div>
    </div>
  );
}

export function panZoomHintSeen(): boolean {
  try {
    return sessionStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function usePanZoomControls(
  viewportRef: React.RefObject<HTMLDivElement | null>,
  worldBounds: PanZoomViewportProps['worldBounds'],
  headerInset = 56,
  footerInset = 88,
) {
  const fitAllNow = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const safe = safeRect(el.getBoundingClientRect(), headerInset, footerInset);
    const fitted = fitAll(safe, worldBounds);
    el.querySelector<HTMLElement>('[data-panzoom-scale]')?.style.setProperty('transform', `translate(${fitted.tx}px, ${fitted.ty}px) scale(${fitted.scale})`);
    el.dispatchEvent(new CustomEvent('hb-panzoom-fit', { detail: fitted }));
  }, [footerInset, headerInset, viewportRef, worldBounds]);

  return { fitAllNow };
}