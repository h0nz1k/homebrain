import { useEffect, useLayoutEffect, useId, useMemo, useRef } from 'react';
import { placeSchematicChip, schematicObstacles, type ChipBox } from './placeSchematicChips.js';
import { solarConfigured } from '../solar.js';
import type { HeatingSnapshot } from '../types.js';
import {
  bindSchematicValues,
  schematicScenarioId,
  schematicPipeActive,
} from './bindSchematicValues.js';
import type { DetailSchematicModel } from './types.js';
import {
  DetailArchitecture,
  DetailHpGlyph,
  DetailRadiatorGlyph,
  DetailSolarPanel,
  DetailTapGlyph,
  DetailTankGlyph,
  DeviceGlyph,
  FloorHeatingLoop,
  PoolBasinGlyph,
  PoolExchangerGlyph,
} from './DetailGlyphs.js';
import { labelTierVisible } from './panZoomMath.js';
import type { CircuitKind } from './types.js';

const PIPE_WEIGHT: Record<CircuitKind, number> = {
  hot: 5,
  cold: 5,
  solar: 5,
  ground: 4,
  pool: 5,
  dhw: 6,
  mains: 6,
};

function pipeClass(kind: CircuitKind, id: string): string {
  const base = `ht-d1-route ht-d1-${kind}`;
  if (id === 'mix-bypass') return `${base} ht-d1-bypass`;
  if (id === 'dhw-draw') return `${base} ht-d1-draw`;
  if (id === 'cold-water') return `${base} ht-d1-mains`;
  return base;
}

function flowMarkers(
  points: [number, number][],
  minGap = 40,
): Array<{ x: number; y: number; angle: number }> {
  const markers: Array<{ x: number; y: number; angle: number }> = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < minGap) continue;
    const x = (a[0] + b[0]) / 2;
    const y = (a[1] + b[1]) / 2;
    if (markers.every((m) => Math.hypot(m.x - x, m.y - y) >= minGap)) {
      markers.push({ x, y, angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI });
    }
  }
  return markers;
}

export function DetailSchematic({
  snap,
  scale,
  minScale,
  model,
}: {
  snap: HeatingSnapshot;
  scale: number;
  minScale: number;
  model: DetailSchematicModel;
}) {
  const uid = useId().replace(/:/g, '');
  const root = useRef<SVGSVGElement>(null);

  const scenario = schematicScenarioId(snap);
  const values = useMemo(() => bindSchematicValues(model, snap), [model, snap]);
  const showSolar = solarConfigured(snap);
  const pool = snap.extras.pool;

  useLayoutEffect(() => {
    const measure = () => {
      const occupied: ChipBox[] = [];
      const obstacles = schematicObstacles(model);
      const chips = Array.from(root.current?.querySelectorAll<SVGGElement>('.ht-d1-chip') ?? []);
      // Reserve the widest status card before placing the smaller temperature pills.
      chips.sort((a, b) => Number(b.dataset.label === 'hp') - Number(a.dataset.label === 'hp'));
      for (const chip of chips) {
        const text = chip.querySelector('text');
        const rect = chip.querySelector('rect');
        if (!text || !rect) continue;
        const box = text.getBBox();
        rect.setAttribute('x', String(box.x - 3));
        rect.setAttribute('y', String(box.y - 3));
        rect.setAttribute('width', String(box.width + 6));
        rect.setAttribute('height', String(box.height + 6));
        const label = model.labels.find((l) => l.id === chip.dataset.label)!;
        const chipScale = Math.max(1, 1 / scale);
        const placed = placeSchematicChip(
          {
            x: label.x + (box.x - 3) * chipScale,
            y: label.y + (box.y - 3) * chipScale,
            w: (box.width + 6) * chipScale,
            h: (box.height + 6) * chipScale,
          },
          occupied,
          model,
          obstacles,
          scale,
        );
        occupied.push(placed);
        const x = placed.x - (box.x - 3) * chipScale;
        const y = placed.y - (box.y - 3) * chipScale;
        chip.setAttribute('transform', `translate(${x} ${y}) scale(${chipScale})`);
        chip
          .querySelector('path')
          ?.setAttribute(
            'd',
            `M${(label.anchor[0] - x) / chipScale} ${(label.anchor[1] - y) / chipScale}L0 0`,
          );
      }
    };
    measure();
    void document.fonts.ready.then(measure);
  }, [values, scale, minScale, model]);

  useEffect(() => {
    if (!root.current || typeof matchMedia === 'undefined') return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const particles = Array.from(
      root.current.querySelectorAll<SVGCircleElement>('.ht-d1-particle'),
    );
    let animations: Animation[] = [];
    const update = () => {
      animations.forEach((a) => a.cancel());
      animations = [];
      if (reduced.matches) return;
      for (const particle of particles) {
        const path = particle.parentElement?.querySelector<SVGPathElement>('path.ht-d1-pipe');
        if (!path || !particle.parentElement?.hasAttribute('data-active')) continue;
        const length = path.getTotalLength();
        if (length < 160) continue;
        const frames = Array.from({ length: 80 }, (_, i) => {
          const t = (16 + (length - 32) * i) / 79 / length;
          const point = path.getPointAtLength(t * length);
          return { transform: `translate(${point.x}px, ${point.y}px)`, opacity: 1, offset: i / 79 };
        });
        animations.push(particle.animate(frames, { duration: 2800, iterations: Infinity }));
      }
    };
    update();
    reduced.addEventListener('change', update);
    return () => {
      animations.forEach((a) => a.cancel());
      reduced.removeEventListener('change', update);
    };
  }, [scenario, snap, model]);

  const deviceOn = (id: string): boolean | null => {
    if (id === 'Nabíjení') return snap.pumps.secondary;
    if (id === 'Topení') return snap.pumps.heating;
    if (id === 'Solár') return snap.extras.solar?.pump ?? null;
    if (id === 'Natápění bazénu') return pool?.heating_pump ?? null;
    if (id === 'Filtrace') return pool?.filter_pump ?? null;
    return null;
  };

  return (
    <svg
      ref={root}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${model.bounds.x} ${model.bounds.y} ${model.bounds.w} ${model.bounds.h}`}
      className="ht-d1-svg"
      width={model.bounds.w}
      height={model.bounds.h}
      style={{ left: model.bounds.x, top: model.bounds.y }}
      role="img"
      aria-label="Plné schéma topení a přípravy teplé vody"
      data-detail-schematic=""
      data-scenario={scenario}
    >
      <DetailArchitecture model={model} />
      <DetailTankGlyph body={model.bodies.find((b) => b.id === 'tank')!} />
      <DetailHpGlyph
        body={model.bodies.find((b) => b.id === 'hp')!}
        on={snap.heat_pump.compressor_on}
      />
      <DetailTapGlyph model={model} />
      <DetailRadiatorGlyph body={model.bodies.find((b) => b.id === 'radiator')!} />
      <DetailSolarPanel model={model} show={showSolar} />
      <DetailRadiatorGlyph body={model.bodies.find((b) => b.id === 'fish')!} />
      <PoolBasinGlyph body={model.bodies.find((b) => b.id === 'pool')!} uid={uid} />
      <PoolExchangerGlyph body={model.bodies.find((b) => b.id === 'pool-exch')!} />
      <FloorHeatingLoop model={model} />

      {model.pipes
        .filter((p) => showSolar || !p.id.startsWith('solar-'))
        .map((pipe) => {
          const active = schematicPipeActive(pipe.id, snap);
          const markers = active ? flowMarkers(pipe.points) : [];
          return (
            <g
              key={pipe.id}
              data-pipe={pipe.id}
              data-circuit={pipe.kind}
              className={pipeClass(pipe.kind, pipe.id)}
              data-active={active ? '' : undefined}
            >
              <path
                className="ht-d1-pipe"
                d={pipe.d}
                style={{
                  strokeWidth:
                    (PIPE_WEIGHT[pipe.kind] ?? 5) *
                    (pipe.id === 'mix-bypass'
                      ? 0.5
                      : pipe.id === 'cold-water'
                        ? 1
                        : pipe.id === 'dhw-draw'
                          ? 1
                          : 1),
                }}
              />
              <g className="ht-d1-arrows" aria-hidden>
                {markers.map((m, i) => (
                  <path
                    key={i}
                    transform={`translate(${m.x} ${m.y}) rotate(${m.angle})`}
                    d="M-3 -2L0 0L-3 2"
                    className="ht-d1-direction"
                  />
                ))}
              </g>
              <circle
                className="ht-d1-particle"
                r={3.5}
                style={{ display: active ? undefined : 'none', opacity: 0 }}
              />
            </g>
          );
        })}

      {(['fish.branch', 'fish.return', 'heat.junction'] as const).map((id) => {
        const p = model.ports[id]!;
        return (
          <circle
            key={id}
            data-junction={id}
            cx={p.x}
            cy={p.y}
            r={5}
            fill={`var(--ht-c3-${id === 'fish.branch' ? 'hot' : 'cold'})`}
          />
        );
      })}

      {model.devices
        .filter((d) => showSolar || d.id !== 'Solár')
        .map((d) => (
          <DeviceGlyph
            key={d.id}
            id={d.id}
            x={d.x}
            y={d.y}
            angle={d.angle}
            kind={d.kind}
            on={deviceOn(d.id)}
          />
        ))}

      {model.labels.map((label) => {
        if (!labelTierVisible(label.tier, scale, minScale)) return null;
        if (label.id.startsWith('solar') && !showSolar) return null;
        if (label.tier === 2)
          return (
            <text
              key={label.id}
              x={label.x}
              y={label.y}
              textAnchor="middle"
              className="ht-d1-sensor-id"
              data-tier="2"
            >
              {label.caption}
            </text>
          );
        const chip = values[label.id] ?? { caption: label.caption, value: label.value };
        const [ax, ay] = label.anchor;
        const isHp = label.id === 'hp';
        const caption =
          scale < 0.6 && label.id === 'tank-title'
            ? 'Nahoře'
            : scale < 0.6 && label.id === 'bottom'
              ? 'Dole'
              : scale < 0.6
                ? ((
                    {
                      solar: 'Solár',
                      tap: 'Teplá voda',
                      pool: 'Bazén',
                      ground: 'Země',
                      'cold-water': 'Studená',
                    } as Record<string, string>
                  )[label.id] ?? chip.caption)
                : chip.caption;
        const chipScale = Math.max(1, 1 / scale);
        const leader = `M${(ax - label.x) / chipScale} ${(ay - label.y) / chipScale}L0 0`;
        return (
          <g
            key={label.id}
            className="ht-d1-chip"
            data-label={label.id}
            data-tier={label.tier}
            transform={`translate(${label.x} ${label.y}) scale(${chipScale})`}
          >
            <title>{`${chip.caption}: ${chip.value}`}</title>
            {label.id !== 'outdoor' ? <path className="ht-d1-chip-leader" d={leader} /> : null}
            <rect
              className="ht-d1-chip-bg"
              rx={10}
              x={-119}
              y={-26}
              width={238}
              height={isHp ? 114 : 66}
            />
            <text textAnchor="middle" className="ht-d1-chip-text">
              <tspan className={isHp ? 'ht-d1-value' : 'ht-d1-caption'} x={0} dy={-3}>
                {isHp ? chip.value : caption}
              </tspan>
              <tspan className="ht-d1-value" x={0} dy={17}>
                {isHp
                  ? values['hp-pair']?.value.replace(' / ', '/')
                  : scale < 0.6 && label.id === 'ground'
                    ? 'Kolektor'
                    : chip.value}
              </tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}
