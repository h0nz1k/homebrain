import { useBackClosable } from '@homebrain/ha-client';
import { Button, Sheet } from '@homebrain/ui';
import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import type { HeatingSnapshot } from '../types.js';
import { DETAIL_SCHEMATIC_MODEL, WIDE_SCHEMATIC_MODEL } from './buildDetailModel.js';
import { DetailSchematic } from './DetailSchematic.js';
import {
  fitAllTransform,
  focusBoxTransform,
  clampPan,
  zoomAtPoint,
  type PanZoomState,
} from './panZoomMath.js';

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
  const [hintHidden, setHintHidden] = useState(() => {
    try {
      return localStorage.getItem('hb-heating-detail-hint') === '1';
    } catch {
      return false;
    }
  });
  const [state, setState] = useState<PanZoomState>({ scale: 1, tx: 0, ty: 0, minScale: 0.1 });
  const titleId = useId();
  const [wide, setWide] = useState(() => window.innerWidth > window.innerHeight);
  const model = wide ? WIDE_SCHEMATIC_MODEL : DETAIL_SCHEMATIC_MODEL;
  const [region, setRegion] = useState<string | null>(null);

  const safeRect = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return { x: 16, y: 62, w: 360, h: 600 };
    return { x: 8, y: 8, w: el.clientWidth - 16, h: el.clientHeight - 76 };
  }, []);

  const applyLayout = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const safe = safeRect();
    const world = model.bounds;
    const fitted = fitAllTransform(safe, world);
    setState(fitted);
    setRegion(null);
  }, [safeRect, model]);

  useLayoutEffect(() => {
    if (!open) return;
    applyLayout();
    const onResize = () => {
      setWide(window.innerWidth > window.innerHeight);
      applyLayout();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyLayout, open]);

  const hideHint = () => {
    setHintHidden(true);
    try {
      localStorage.setItem('hb-heating-detail-hint', '1');
    } catch {
      /* ignore */
    }
  };

  const zoom = (factor: number) => {
    const el = viewportRef.current;
    if (!el) return;
    hideHint();
    setState((prev) =>
      zoomAtPoint(
        prev,
        el.clientWidth / 2,
        el.clientHeight / 2,
        factor,
        el.clientWidth,
        el.clientHeight,
        model.bounds,
      ),
    );
  };

  if (!open) return null;

  return (
    <Sheet
      title="Plné schéma"
      onClose={onClose}
      width="lg"
      closeLabel="Zavřít plné schéma"
      data-testid="heating-full-schematic-sheet"
    >
      <div className="ht-d1-shell" aria-label="Topné okruhy">
        <div className="ht-d1-legend" aria-label="Legenda okruhů">
          {(
            [
              ['hot', 'Topná voda'],
              ['cold', 'Zpátečka'],
              ['solar', 'Solár'],
              ['ground', 'Země'],
              ['pool', 'Bazén'],
              ['dhw', 'Teplá voda'],
              ['mains', 'Studená voda'],
            ] as const
          ).map(([kind, name]) => (
            <span key={kind}>
              <i style={{ background: `var(--ht-c3-${kind})` }} />
              {name}
            </span>
          ))}
          <span className="ht-d1-legend-note">Čárkovaně = neaktivní</span>
        </div>
        <p
          className="ht-d1-hint"
          id={`${titleId}-hint`}
          aria-hidden={hintHidden}
          style={{ visibility: hintHidden ? 'hidden' : undefined }}
        >
          <span className="ht-d1-touch-hint">
            Tažením posunete, dvěma prsty přiblížíte. Dvojité klepnutí vrátí přehled.
          </span>
          <span className="ht-d1-mouse-hint">
            Tažením posunete, kolečkem myši přiblížíte, dvojklik vrátí přehled.
          </span>
        </p>
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
            world={model.bounds}
          >
            <DetailSchematic
              model={model}
              snap={snap}
              scale={state.scale}
              minScale={state.minScale}
            />
          </PanZoomSurface>
        </div>
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
              applyLayout();
            }}
          >
            Celé schéma
          </Button>
        </div>
        <nav className="ht-d1-regions" aria-label="Detail části schématu">
          {(
            [
              ['tank', 'Nádrž'],
              ['hp', 'TČ'],
              ['pool', 'Bazén'],
            ] as const
          ).map(([id, name]) => (
            <Button
              key={id}
              aria-pressed={region === id}
              variant="ghost"
              onClick={() => {
                hideHint();
                setRegion(id);
                const el = viewportRef.current!;
                const focused = focusBoxTransform(
                  safeRect(),
                  model.focusBoxes[id]!,
                  state.minScale,
                  4,
                );
                setState((s) => ({
                  ...s,
                  ...focused,
                  ...clampPan({ ...s, ...focused }, el.clientWidth, el.clientHeight, model.bounds),
                }));
              }}
            >
              {name}
            </Button>
          ))}
        </nav>
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
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    pointers.current.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    down.current = { x: e.clientX, y: e.clientY, moved: false };
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const a = pts[0]!;
      const b = pts[1]!;
      gesture.current = {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      };
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
      const previousGesture = gesture.current;
      setState((s) => {
        const panned = { ...s, tx: s.tx + x - previousGesture.x, ty: s.ty + y - previousGesture.y };
        return zoomAtPoint(
          panned,
          x,
          y,
          d / previousGesture.d,
          el.clientWidth,
          el.clientHeight,
          world,
        );
      });
      gesture.current = { d, x, y };
    } else if (pointers.current.size === 1) {
      setState((s) => ({
        ...s,
        ...clampPan(
          { ...s, tx: s.tx + p.x - prev.x, ty: s.ty + p.y - prev.y },
          el.clientWidth,
          el.clientHeight,
          world,
        ),
      }));
    }
  };

  const reset = () => {
    const el = viewportRef.current!;
    setState(
      fitAllTransform({ x: 8, y: 8, w: el.clientWidth - 16, h: el.clientHeight - 76 }, world),
    );
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => {
        const p = pointers.current.get(e.pointerId);
        if (
          e.pointerType === 'touch' &&
          p &&
          down.current &&
          !down.current.moved &&
          pointers.current.size === 1
        ) {
          const now = performance.now();
          if (now - lastTap.current < 320) {
            reset();
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
      onDoubleClick={reset}
      onWheel={(e) => {
        e.preventDefault();
        onGesture();
        const el = viewportRef.current!;
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        setState((s) =>
          zoomAtPoint(s, x, y, Math.exp(-e.deltaY * 0.008), el.clientWidth, el.clientHeight, world),
        );
      }}
      onKeyDown={(e) => {
        const el = viewportRef.current!;
        const moves: Record<string, [number, number]> = {
          ArrowLeft: [40, 0],
          ArrowRight: [-40, 0],
          ArrowUp: [0, 40],
          ArrowDown: [0, -40],
        };
        if (e.key === '0')
          setState(
            fitAllTransform({ x: 8, y: 8, w: el.clientWidth - 16, h: el.clientHeight - 76 }, world),
          );
        else if (['+', '=', '-'].includes(e.key))
          setState((s) =>
            zoomAtPoint(
              s,
              el.clientWidth / 2,
              el.clientHeight / 2,
              e.key === '-' ? 0.8 : 1.25,
              el.clientWidth,
              el.clientHeight,
              world,
            ),
          );
        else if (moves[e.key]) {
          const [dx, dy] = moves[e.key]!;
          setState((s) => ({
            ...s,
            ...clampPan(
              { ...s, tx: s.tx + dx, ty: s.ty + dy },
              el.clientWidth,
              el.clientHeight,
              world,
            ),
          }));
        } else return;
        e.preventDefault();
        onGesture();
      }}
      tabIndex={0}
      role="group"
      aria-label="Posun a přiblížení schématu"
      style={{ position: 'absolute', inset: 0 }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
        }}
        data-panzoom-scale={state.scale}
      >
        {children}
      </div>
    </div>
  );
}
