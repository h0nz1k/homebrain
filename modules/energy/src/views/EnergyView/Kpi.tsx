export function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return <div className="en-spark" aria-hidden="true" />;
  const max = Math.max(...points, 0.001);
  const d = points.map((v, i) => `${(i / (points.length - 1)) * 100},${30 - (v / max) * 27}`);
  return (
    <svg className="en-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,30 ${d.join(' ')} 100,30`} fill={color} opacity="0.16" />
      <polyline
        points={d.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Kpi(props: {
  label: string;
  value: string;
  unit: string;
  sub: string;
  color: string;
  spark?: number[];
  testId?: string;
  gauge?: number | null;
}) {
  return (
    <section className="en-card en-kpi" data-testid={props.testId}>
      <span className="en-lbl">{props.label}</span>
      <strong className="en-kpi-v">
        {props.value}
        <small>
          {'\u00a0'}
          {props.unit}
        </small>
      </strong>
      <span className="en-sub">{props.sub}</span>
      {props.gauge !== undefined ? (
        <div
          className="en-self-gauge"
          role="meter"
          aria-label="Soběstačnost"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={props.gauge ?? undefined}
        >
          <div className="en-track">
            <span style={{ width: `${props.gauge ?? 0}%`, background: 'var(--hb-ok)' }} />
          </div>
          <span className="en-sub">
            0 % <span>100 %</span>
          </span>
        </div>
      ) : (
        <>
          <Sparkline points={props.spark ?? []} color={props.color} />
          <span className="en-spark-time">posledních 24 h</span>
        </>
      )}
    </section>
  );
}
