import { useBackClosable } from '@homebrain/ha-client';
import { Button, Sheet, panZoomHintSeen } from '@homebrain/ui';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { HeatingSnapshot } from '../types.js';
import { DETAIL_SCHEMATIC_MODEL } from './buildDetailModel.js';
import { DetailSchematic } from './DetailSchematic.js';
import { fitAllTransform, focusBoxTransform, labelTierVisible, zoomAtPoint, type PanZoomState } from './panZoomMath.js';

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
  const viewportRef = useRef<HTMLDivElement>(null);
  const [hintHidden, setHintHidden] = useState(panZoomHintSeen);
  const [state, setState] = useState<PanZoomState>({ scale: 1, tx: 0, ty: 0, minScale: 0.1 });
  const titleId = useId();

  const safeRect = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return { x: 16, y: 62, w: 360, h: 600 };
    const hdr = el.closest('.hb-sheet')?.querySelector<HTMLElement>('.hb-sheet-header');
    const headerH = hdr?.getBoundingClientRect().height ?? 56;
    return { x: 16, y: headerH + 6, w: el.clientWidth - 32, h: el.clientHeight - headerH - 96 };
  }, []);

  const applyLayout = useCallback(
    (mode: 'fit' | 'initial') => {
      const el = viewportRef.current;
      if (!el) return;
      const safe = safeRect();
      const world = DETAIL_SCHEMATIC_MODEL.bounds;
      const fitted = fitAllTransform(safe, world);
      if (mode === 'fit' || el.clientWidth >= 600) {
        setState(fitted);
        return;
      }
      const focused = focusBoxTransform(safe, DETAIL_SCHEMATIC_MODEL.focusBoxes.tank!, fitted.minScale, 2.5);
      setState({ ...fitted, ...focused, ty: focused.ty - 24 });
    },
    [safeRect],
  );

  useEffect(() => {
    if (!open) return;
    applyLayout(typeof window !== 'undefined' && window.innerWidth < 600 ? 'initial' : 'fit');
    const onResize = () => applyLayout(window.innerWidth < 600 ? 'initial' : 'fit');
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyLayout, open]);

  const hideHint = () => {
    setHintHidden(true);
    try {
      sessionStorage.setItem('hb-heating-detail-hint', '1');
    } catch {
      /* ignore */
    }
  };

  const zoom = (factor: number) => {
    const el = viewportRef.current;
    if (!el) return;
    hideHint();
    setState((prev) =>
      zoomAtPoint(prev, el.clientWidth / 2, el.clientHeight / 2, factor, el.clientWidth, el.clientHeight, DETAIL_SCHEMATIC_MODEL.bounds),
    );
  };

  if (!open) return null;

  return (
    <Sheet
      title="Plné schéma"
      onClose={onClose}
      width="lg"
      stickyFooter
      closeLabel="Zavřít plné schéma"
      data-testid="heating-full-schematic-sheet"
      footer={
        <div className="ht-d1-controls" role="toolbar" aria-label="Lupa a přehled">
          <Button type="button" variant="ghost" onClick={() => zoom(0.8)} aria-label="Oddálit">
            −
          </Button>
          <Button type="button" variant="ghost" onClick={() => zoom(1.25)} aria-label="Přiblížit">
            +
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              hideHint();
              applyLayout('fit');
            }}
          >
            Celé schéma
          </Button>
        </div>
      }
    >
      <div className="ht-d1-shell" aria-labelledby={titleId}>
        {!hintHidden ? (
          <p className="ht-d1-hint" id={`${titleId}-hint`}>
            Tažením posunete, dvěma prsty přiblížíte. Dvojité klepnutí vrátí přehled.
          </p>
        ) : null}
        <div
          ref={viewportRef}
          className="ht-d1-viewport"
          data-testid="heating-full-schematic-viewport"
          style={{ touchAction: 'none' }}
          tabIndex={0}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            hideHint();
          }}
        >
          <PanZoomSurface
            viewportRef={viewportRef}
            state={state}
            setState={setState}
            onGesture={hideHint}
            world={DETAIL_SCHEMATIC_MODEL.bounds}
          >
            <DetailSchematic snap={snap} scale={state.scale} minScale={state.minScale} />
          </PanZoomSurface>
        </div>
        <p className="ht-d1-lod-note" aria-live="polite">
          {labelTierVisible(2, state.scale, state.minScale)
            ? 'Zobrazují se i identifikátory čidel.'
            : labelTierVisible(1, state.scale, state.minScale)
              ? 'Zobrazují se sekundární údaje.'
              : 'Přibližte pro detail ventilů a čidel.'}
        </p>
      </div>
    </Sheet>
  );
}

function PanZoomSurface({
  children,
  viewportRef,
  state,
  setState,
  onGesture,
  world,
}: {
  children: React.ReactNode;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  state: PanZoomState;
  setState: React.Dispatch<React.SetStateAction<PanZoomState>>;
  onGesture: () => void;
  world: { x: number; y: number; w: number; h: number };
}) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ d: number; x: number; y: number } | null>(null);
  const lastTap = useRef(-Infinity);
  const down = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = viewportRef.current;
    if (!el) return;
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
    onGesture();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const el = viewportRef.current!;
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
      setState((s) => {
        const panned = { ...s, tx: s.tx + x - gesture.current!.x, ty: s.ty + y - gesture.current!.y };
        return zoomAtPoint(panned, x, y, d / gesture.current!.d, el.clientWidth, el.clientHeight, world);
      });
      gesture.current = { d, x, y };
    } else if (pointers.current.size === 1) {
      setState((s) => ({ ...s, tx: s.tx + p.x - prev.x, ty: s.ty + p.y - prev.y }));
    }
  };

  const dbl = (x: number, y: number) => {
    const el = viewportRef.current!;
    setState((s) => {
      if (s.scale >= s.minScale * 3.8) {
        const safe = { x: 16, y: 62, w: el.clientWidth - 32, h: el.clientHeight - 120 };
        return fitAllTransform(safe, world);
      }
      return zoomAtPoint(s, x, y, 2, el.clientWidth, el.clientHeight, world);
    });
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => {
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
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        gesture.current = null;
      }}
      onDoubleClick={(e) => {
        const el = viewportRef.current!;
        const r = el.getBoundingClientRect();
        dbl(e.clientX - r.left, e.clientY - r.top);
      }}
      onWheel={(e) => {
        e.preventDefault();
        onGesture();
        const el = viewportRef.current!;
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        setState((s) =>
          e.ctrlKey || e.metaKey
            ? zoomAtPoint(s, x, y, Math.exp(-e.deltaY * 0.008), el.clientWidth, el.clientHeight, world)
            : { ...s, tx: s.tx - (e.shiftKey ? e.deltaY : e.deltaX), ty: s.ty - (e.shiftKey ? 0 : e.deltaY) },
        );
      }}
      style={{
        transform: `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`,
        transformOrigin: '0 0',
      }}
      data-panzoom-scale={state.scale}
    >
      {children}
    </div>
  );
}