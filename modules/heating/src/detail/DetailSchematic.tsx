import { useEffect, useId, useMemo, useRef } from 'react';
import { solarConfigured } from '../solar.js';
import type { HeatingSnapshot } from '../types.js';
import { bindSchematicValues, schematicScenarioId } from './bindSchematicValues.js';
import { DETAIL_SCHEMATIC_MODEL } from './buildDetailModel.js';
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
  hot: 9,
  cold: 9,
  solar: 9,
  ground: 7.2,
  pool: 9,
};

function pipeClass(kind: CircuitKind, id: string): string {
  const base = `ht-d1-route ht-d1-${kind}`;
  if (id === 'mix-bypass') return `${base} ht-d1-bypass`;
  if (id === 'dhw-draw') return `${base} ht-d1-draw`;
  if (id === 'cold-water') return `${base} ht-d1-mains`;
  return base;
}

function flowMarkers(points: [number, number][], minGap = 40): Array<{ x: number; y: number; angle: number }> {
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
}: {
  snap: HeatingSnapshot;
  scale: number;
  minScale: number;
}) {
  const uid = useId().replace(/:/g, '');
  const root = useRef<SVGSVGElement>(null);
  const model = DETAIL_SCHEMATIC_MODEL;
  const scenario = schematicScenarioId(snap);
  const values = useMemo(() => bindSchematicValues(model, snap), [model, snap]);
  const showSolar = solarConfigured(snap);
  const pool = snap.extras.pool;

  const activeKinds = useMemo(() => {
    const kinds = new Set<CircuitKind>();
    for (const p of model.pipes) {
      if (p.states.includes(scenario)) kinds.add(p.kind);
    }
    return kinds;
  }, [model.pipes, scenario]);

  useEffect(() => {
    if (!root.current || typeof matchMedia === 'undefined') return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const particles = Array.from(root.current.querySelectorAll<SVGCircleElement>('.ht-d1-particle'));
    let animations: Animation[] = [];
    const update = () => {
      animations.forEach((a) => a.cancel());
      animations = [];
      if (reduced.matches) return;
      for (const particle of particles) {
        const path = particle.parentElement?.querySelector('path.ht-d1-pipe');
        if (!path || typeof path.getTotalLength !== 'function') continue;
        const length = path.getTotalLength();
        if (length < 160) continue;
        const frames = Array.from({ length: 80 }, (_, i) => {
          const t = (16 + (length - 32) * i) / 79 / length;
          const point = path.getPointAtLength(t * length);
          return { transform: `translate(${point.x}px, ${point.y}px)`, opacity: 1, offset: i / 79 };
        });
        animations.push(
          particle.animate(frames, { duration: 2800, iterations: Infinity }),
        );
      }
    };
    update();
    reduced.addEventListener('change', update);
    return () => {
      animations.forEach((a) => a.cancel());
      reduced.removeEventListener('change', update);
    };
  }, [scenario, snap.updated_at]);

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
      role="img"
      aria-label="Plné schéma topení a přípravy teplé vody"
      data-detail-schematic=""
      data-scenario={scenario}
    >
      <DetailArchitecture />
      <DetailTankGlyph />
      <DetailHpGlyph snap={snap} />
      <DetailTapGlyph />
      <DetailRadiatorGlyph transform="translate(-16 -88) scale(3)" />
      <DetailSolarPanel show={showSolar} />
      <DetailRadiatorGlyph id="fish" transform="translate(14 332) scale(3)" />
      <PoolBasinGlyph uid={uid} />
      <PoolExchangerGlyph />
      <FloorHeatingLoop />
      <path d="M635 1000V670H600V653" className="ht-d1-internal" data-internal="dhw-cold" />
      <path d="M540 460V380" className="ht-d1-internal ht-d1-internal-hot" data-internal="dhw-hot" />
      <path d="M649.6 938H616V954H632V970H649.6" className="ht-c3-solar-coil" />

      {model.pipes.map((pipe) => {
        const active = pipe.states.includes(scenario);
        const markers = active ? flowMarkers(pipe.points) : [];
        return (
          <g
            key={pipe.id}
            data-pipe={pipe.id}
            data-circuit={pipe.kind}
            className={pipeClass(pipe.kind, pipe.id)}
            data-active={active ? '' : undefined}
          >
            <path className="ht-d1-pipe" d={pipe.d} style={{ strokeWidth: (PIPE_WEIGHT[pipe.kind] ?? 5) * (pipe.id === 'mix-bypass' ? 0.5 : pipe.id === 'cold-water' ? 0.3 : pipe.id === 'dhw-draw' ? 0.6 : 1) }} />
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
            <circle className="ht-d1-particle" r={3.5} style={{ display: active ? undefined : 'none' }} />
          </g>
        );
      })}

      {model.devices.map((d) => (
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
        const chip = values[label.id] ?? { caption: label.caption, value: label.value };
        const hideLeader =
          label.owner === 'tank' || label.tier === 2 || label.id === 'outdoor' || label.id === 'pool-hall-title';
        const [ax, ay] = label.anchor;
        const leader = `M${ax - label.x} ${ay - label.y}L0 0`;
        const isHp = label.id === 'hp';
        return (
          <g
            key={label.id}
            className="ht-d1-chip"
            data-label={label.id}
            data-tier={label.tier}
            transform={`translate(${label.x} ${label.y})`}
          >
            {!hideLeader ? <path className="ht-d1-chip-leader" d={leader} /> : null}
            <rect className="ht-d1-chip-bg" rx={10} x={-72} y={-26} width={144} height={isHp ? 110 : chip.value ? 54 : 36} />
            {chip.statusDot ? (
              <circle
                className={`ht-d1-chip-dot ht-d1-chip-dot-${chip.statusDot}`}
                cx={58}
                cy={-14}
                r={4}
              />
            ) : null}
            <text textAnchor="middle" className="ht-d1-chip-text">
              <tspan className="ht-d1-caption" x={0} dy={chip.value ? -6 : 4}>
                {chip.caption}
              </tspan>
              {chip.value ? (
                <tspan className="ht-d1-value" x={0} dy={22}>
                  {chip.value}
                </tspan>
              ) : null}
              {isHp && values['hp-pair'] ? (
                <>
                  <tspan className="ht-d1-caption" x={0} dy={28}>
                    {values['hp-pair'].caption}
                  </tspan>
                  <tspan className="ht-d1-value" x={0} dy={22}>
                    {values['hp-pair'].value}
                  </tspan>
                </>
              ) : null}
            </text>
          </g>
        );
      })}

      <g className="ht-d1-legend" transform={`translate(${model.bounds.x + 16} ${model.bounds.y + model.bounds.h - 40})`}>
        {(
          [
            ['hot', 'Topná / teplá'],
            ['cold', 'Zpátečka / studená'],
            ['solar', 'Solár'],
            ['ground', 'Země'],
            ['pool', 'Bazén'],
          ] as const
        ).map(([kind, name]) => (
          <g key={kind} transform={`translate(${kind === 'hot' ? 0 : kind === 'cold' ? 150 : kind === 'solar' ? 320 : kind === 'ground' ? 430 : 560} 0)`}>
            <rect
              className="ht-d1-legend-swatch"
              data-kind={kind}
              width={28}
              height={4}
              rx={2}
              style={{
                fill: activeKinds.has(kind)
                  ? `var(--ht-c3-${kind})`
                  : `color-mix(in srgb, var(--ht-c3-${kind}) 35%, transparent)`,
              }}
            />
            <text x={36} y={4} className="ht-d1-legend-label">
              {name}
            </text>
          </g>
        ))}
        <text x={720} y={4} className="ht-d1-legend-hint">
          Slabá barva = neaktivní
        </text>
      </g>
    </svg>
  );
}