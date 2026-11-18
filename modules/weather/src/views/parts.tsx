import type { ReactNode } from 'react';

/** Shared formatting and card primitives of the Počasí view (cs-CZ). */
export const nf = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v)
    ? '—'
    : // normalise −0 (e.g. −0,3 rounded to 0 digits) so axes never show “-0°”
      (Number(v.toFixed(d)) === 0 ? 0 : v)
        .toLocaleString('cs-CZ', {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        })
        // cs-CZ ICU vrací spojovník; typograficky správné je znaménko minus (U+2212)
        .replace(/^-/, '−');
export const signed = (v: number, d = 1) =>
  `${v > 0 ? '+' : v < 0 ? '−' : '±'}${nf(Math.abs(v), d)}`;
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/\.$/, '');

export function Card({
  id,
  title,
  sub,
  right,
  className = '',
  children,
  testId,
}: {
  id?: string;
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section id={id} className={`wx-card ${className}`} aria-label={title} data-testid={testId}>
      <header className="wx-ch">
        <div className="wx-ch-l">
          <h2 className="wx-ct">{title}</h2>
          {sub && <span className="wx-cs">{sub}</span>}
        </div>
        {right && <div className="wx-ch-r">{right}</div>}
      </header>
      {children}
    </section>
  );
}
export function Cell({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
}) {
  return (
    <div className="wx-cell">
      <span className="wx-lbl">{label}</span>
      <span className="wx-val">
        {value}
        {unit && value !== '—' && <small> {unit}</small>}
      </span>
      {sub && <span className="wx-sub">{sub}</span>}
    </div>
  );
}
