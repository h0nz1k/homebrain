import type { PriceHistory, WineRecord } from '../domain/index.js';
import { czk, dateOnly } from './labels.js';

interface Pt {
  t: number;
  v: number;
}

const DAY = 86_400_000;
const toTime = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
const fmtDate = (date: string) => dateOnly.format(new Date(toTime(date)));

/** Monotone cubic (Fritsch–Carlson) path: smooth without overshooting real prices. */
export function smoothPath(points: Array<[number, number]>): string {
  const n = points.length;
  if (n === 0) return '';
  const f = (v: number) => Math.round(v * 100) / 100;
  if (n === 1) return `M${f(points[0]![0])},${f(points[0]![1])}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    dx.push(x1 - x0 || 1e-6);
    slope.push((y1 - y0) / (x1 - x0 || 1e-6));
  }
  const m: number[] = [slope[0]!];
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1]!;
    const b = slope[i]!;
    m.push(
      a * b <= 0
        ? 0
        : (3 * (dx[i - 1]! + dx[i]!)) /
            ((2 * dx[i]! + dx[i - 1]!) / a + (dx[i]! + 2 * dx[i - 1]!) / b),
    );
  }
  m.push(slope[n - 2]!);
  let d = `M${f(points[0]![0])},${f(points[0]![1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const h = dx[i]! / 3;
    d += `C${f(x0 + h)},${f(y0 + m[i]! * h)} ${f(x1 - h)},${f(y1 - m[i + 1]! * h)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

function history(wine: WineRecord, data: PriceHistory | undefined): PriceHistory {
  if (data && (data.purchases.length || data.shop.length)) return data;
  // Older server / manual wine: the stored purchase price is the only lot we know.
  if (wine.purchasePrice === null) return { purchases: [], shop: [] };
  return {
    purchases: [
      {
        date: wine.acquiredOn ?? wine.createdAt.slice(0, 10),
        unitPrice: wine.purchasePrice,
        quantity: null,
        orderRef: null,
      },
    ],
    shop: [],
  };
}

/** Detail-only price block: last purchase, e-shop now, smooth sparkline, purchase lots. */
export function PriceHistoryCard({
  wine,
  data,
}: {
  wine: WineRecord;
  data: PriceHistory | undefined;
}) {
  const { purchases, shop } = history(wine, data);
  if (!purchases.length && !shop.length) return null;
  const lastBuy = purchases[purchases.length - 1];
  const lastShop = shop[shop.length - 1];
  const line: Pt[] = (shop.length >= 2 ? shop : purchases).map((p) => ({
    t: toTime(p.date),
    v: p.unitPrice,
  }));
  const dots: Pt[] = purchases.map((p) => ({ t: toTime(p.date), v: p.unitPrice }));
  const all = [...line, ...dots];
  const t0 = Math.min(...all.map((p) => p.t));
  const t1 = Math.max(...all.map((p) => p.t), t0 + DAY);
  const lo = Math.min(...all.map((p) => p.v));
  const hi = Math.max(...all.map((p) => p.v));
  const pad = Math.max((hi - lo) * 0.25, hi * 0.04, 1);
  const vmin = lo - pad;
  const vmax = hi + pad;
  const x = (t: number) => ((t - t0) / (t1 - t0)) * 100;
  const y = (v: number) => (1 - (v - vmin) / (vmax - vmin)) * 100;
  const chart = all.length >= 2 && line.length >= 1;
  const path = smoothPath(line.map((p) => [x(p.t), y(p.v)]));
  const area =
    line.length >= 2 ? `${path}L${x(line[line.length - 1]!.t)},100L${x(line[0]!.t)},100Z` : '';
  const trend =
    lastShop && lastBuy
      ? Math.round(((lastShop.unitPrice - lastBuy.unitPrice) / lastBuy.unitPrice) * 100)
      : null;
  const totalBottles = purchases.reduce((sum, p) => sum + (p.quantity ?? 0), 0);
  return (
    <section className="wine-pricecard" aria-label="Cena a nákupy" data-testid="wine-price-history">
      <div className="wine-pricecard-head">
        {lastBuy && (
          <div className="wine-pricecard-kpi">
            <span className="wine-lbl">Naposledy koupeno</span>
            <strong className="wine-pricecard-big" data-testid="wine-price-last">
              {czk.format(lastBuy.unitPrice)}
            </strong>
            <span className="wine-muted">za lahev · {fmtDate(lastBuy.date)}</span>
          </div>
        )}
        {lastShop && (
          <div className="wine-pricecard-kpi wine-pricecard-kpi--shop">
            <span className="wine-lbl">E-shop Znovín</span>
            <strong className="wine-pricecard-mid" data-testid="wine-price-shop">
              {czk.format(lastShop.unitPrice)}
              {trend !== null && (
                <span
                  className="wine-pricechip"
                  data-trend={trend < 0 ? 'down' : trend > 0 ? 'up' : 'same'}
                  title="Proti poslední nákupní ceně"
                >
                  {trend === 0 ? 'stejně' : `${trend > 0 ? '+' : '−'}${Math.abs(trend)} %`}
                </span>
              )}
            </strong>
            <span className="wine-muted">
              {lastShop.regularPrice
                ? `akce, běžně ${czk.format(lastShop.regularPrice)}`
                : `k ${fmtDate(lastShop.date)}`}
            </span>
          </div>
        )}
      </div>
      {chart && (
        <div className="wine-spark" data-testid="wine-price-spark">
          <div className="wine-spark-plot">
            <i className="wine-spark-grid" style={{ top: `${y(hi)}%` }} />
            {hi !== lo && <i className="wine-spark-grid" style={{ top: `${y(lo)}%` }} />}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <linearGradient id={`wine-spark-${wine.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--hb-ac)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--hb-ac)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {area && <path d={area} fill={`url(#wine-spark-${wine.id})`} stroke="none" />}
              {line.length >= 2 && (
                <path
                  d={path}
                  fill="none"
                  className="wine-spark-line"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
            {dots.map((p, n) => (
              <span
                key={n}
                className="wine-spark-dot"
                style={{ left: `${x(p.t)}%`, top: `${y(p.v)}%` }}
                title={`Nákup ${czk.format(p.v)}`}
              />
            ))}
            {lastShop && shop.length >= 2 && (
              <span
                className="wine-spark-end"
                style={{ left: `${x(toTime(lastShop.date))}%`, top: `${y(lastShop.unitPrice)}%` }}
                title={`E-shop ${czk.format(lastShop.unitPrice)}`}
              />
            )}
          </div>
          <span className="wine-spark-ax" style={{ top: `calc(22px + ${y(hi) * 0.7}px)` }}>
            {czk.format(hi)}
          </span>
          {hi !== lo && (
            <span className="wine-spark-ax" style={{ top: `calc(22px + ${y(lo) * 0.7}px)` }}>
              {czk.format(lo)}
            </span>
          )}
          <span className="wine-spark-legend">
            {shop.length >= 2 && (
              <span>
                <i className="wine-spark-key wine-spark-key--line" /> e-shop
              </span>
            )}
            <span>
              <i className="wine-spark-key wine-spark-key--dot" /> nákup
            </span>
          </span>
        </div>
      )}
      {chart && (
        <div className="wine-spark-dates" aria-hidden="true">
          <span>{dateOnly.format(new Date(t0))}</span>
          <span>{dateOnly.format(new Date(t1))}</span>
        </div>
      )}
      {purchases.length > 0 && (
        <>
          <span className="wine-lbl">
            Nákupy · {purchases.length}× {totalBottles ? `· ${totalBottles} lahví` : ''}
          </span>
          <ol className="wine-lots" data-testid="wine-price-lots">
            {[...purchases].reverse().map((p, n) => (
              <li key={`${p.date}-${n}`}>
                <time dateTime={p.date}>{fmtDate(p.date)}</time>
                <span className="wine-lots-qty">{p.quantity ? `${p.quantity} ks` : '–'}</span>
                <strong>{czk.format(p.unitPrice)}</strong>
                <span className="wine-lots-ref" title="Objednávka (zkrácený otisk)">
                  {p.orderRef ? `obj. ${p.orderRef.slice(0, 4)}` : 'ručně'}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
