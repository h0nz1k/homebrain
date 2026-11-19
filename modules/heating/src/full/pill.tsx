import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Live values of the full schematic (r3): every reading is a pill – bold, larger than its name,
 * on a tinted rounded plate – so a value never reads like a label. Missing values are an italic
 * "–" (or a short wording) in an outlined pill. Widths are measured after layout (an estimate
 * first, so the first paint and jsdom stay sensible).
 */
export const LABEL_FONT = 15;
export const VALUE_FONT = 17;
const PAD_X = 0.5;
const GAP = 0.4;

/** Width estimate for Inter (tabular digits) before the browser measured the text. */
export const estimateW = (text: string, font: number, bold = false) =>
  text.length * font * (bold ? 0.6 : 0.56);

/** Measured text widths of `refs` (falls back to the estimates). */
function useWidths(estimates: number[], deps: unknown[]) {
  const refs = useRef<Array<SVGTextElement | null>>([]);
  const [widths, setWidths] = useState<number[] | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const next = refs.current.map((el, i) => {
        const w =
          el && typeof el.getComputedTextLength === 'function' ? el.getComputedTextLength() : 0;
        return w > 0 ? w : estimates[i]!;
      });
      setWidths((prev) =>
        prev && prev.length === next.length && prev.every((v, i) => Math.abs(v - next[i]!) < 0.5)
          ? prev
          : next,
      );
    };
    measure();
    let alive = true;
    void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(() => {
      if (alive) measure();
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  const bind = (i: number) => (el: SVGTextElement | null) => {
    refs.current[i] = el;
  };
  return { bind, widths: widths ?? estimates };
}

export interface PillProps {
  /** Left edge (anchor start), centre (middle) or right edge (end) of the pill. */
  x: number;
  /** Vertical centre of the pill. */
  cy: number;
  value: string | null | undefined;
  /** Shown instead of "–" when the value is missing (e.g. "bez čidla"). */
  missing?: string;
  anchor?: 'start' | 'middle' | 'end';
  font?: number;
  k?: string;
  className?: string;
}

/** A single value pill. */
export function Pill({
  x,
  cy,
  value,
  missing = '–',
  anchor = 'start',
  font = VALUE_FONT,
  k,
  className,
}: PillProps) {
  const text = value ?? missing;
  const { bind, widths } = useWidths([estimateW(text, font, true)], [text, font]);
  const w = widths[0]! + 2 * PAD_X * font;
  const h = font * 1.42;
  const x0 = anchor === 'start' ? x : anchor === 'middle' ? x - w / 2 : x - w;
  return (
    <g
      className={`fs-pill-g${value ? '' : ' fs-pill-none'}${className ? ` ${className}` : ''}`}
      data-pill={k}
      data-reading={value ? '' : 'none'}
    >
      <rect x={x0} y={cy - h / 2} width={w} height={h} rx={h / 2} className="fs-vpill" />
      <text
        ref={bind(0)}
        x={x0 + PAD_X * font}
        y={cy + font * 0.36}
        fontSize={font}
        className={value ? 'fs-t fs-pv' : 'fs-t fs-pv-none'}
        data-value={k}
      >
        {text}
      </text>
    </g>
  );
}

export interface ValueLabelProps {
  k: string;
  x: number;
  /** Baseline of the name. */
  y: number;
  name: string;
  value: string | null | undefined;
  missing?: string;
  anchor?: 'start' | 'middle' | 'end';
  /** inline: name + pill on one line; stack: pill under the name. */
  layout?: 'inline' | 'stack';
  nameClass?: string;
  font?: number;
  valueFont?: number;
  halo?: string;
  /** Rendered before the name (sensor glyph etc.), `lead` units wide. */
  lead?: number;
  children?: (box: { x0: number; w: number }) => ReactNode;
}

/** Name + value pill as one unit; the whole group honours `anchor`. */
export function ValueLabel({
  k,
  x,
  y,
  name,
  value,
  missing = '–',
  anchor = 'start',
  layout = 'inline',
  nameClass = 'fs-t-s',
  font = LABEL_FONT,
  valueFont = VALUE_FONT,
  halo,
  lead = 0,
  children,
}: ValueLabelProps) {
  const text = value ?? missing;
  const { bind, widths } = useWidths(
    [estimateW(name, font), estimateW(text, valueFont, true)],
    [name, text, font, valueFont],
  );
  const nw = widths[0]!;
  const pw = widths[1]! + 2 * PAD_X * valueFont;
  const h = valueFont * 1.42;
  const inline = layout === 'inline';
  const total = inline ? lead + nw + GAP * font + pw : lead + Math.max(nw, pw);
  const x0 = anchor === 'start' ? x : anchor === 'middle' ? x - total / 2 : x - total;
  const nameX = inline
    ? x0 + lead
    : anchor === 'end'
      ? x0 + total - nw
      : anchor === 'middle'
        ? x0 + lead + (total - lead - nw) / 2
        : x0 + lead;
  const pillX = inline
    ? x0 + lead + nw + GAP * font
    : anchor === 'end'
      ? x0 + total - pw
      : anchor === 'middle'
        ? x0 + lead + (total - lead - pw) / 2
        : x0 + lead;
  const cy = inline ? y - font * 0.34 : y + font * 0.5 + h / 2;
  return (
    <g data-label-group={k} data-value-label={layout}>
      {children?.({ x0, w: total })}
      <text
        ref={bind(0)}
        x={nameX}
        y={y}
        fontSize={font}
        className={`fs-t ${nameClass}`}
        stroke={halo ?? 'none'}
        strokeWidth={halo ? 4 : 0}
        data-label={k}
      >
        {name}
      </text>
      <g
        className={`fs-pill-g${value ? '' : ' fs-pill-none'}`}
        data-pill={k}
        data-reading={value ? '' : 'none'}
      >
        <rect x={pillX} y={cy - h / 2} width={pw} height={h} rx={h / 2} className="fs-vpill" />
        <text
          ref={bind(1)}
          x={pillX + PAD_X * valueFont}
          y={cy + valueFont * 0.36}
          fontSize={valueFont}
          className={value ? 'fs-t fs-pv' : 'fs-t fs-pv-none'}
          data-value={k}
        >
          {text}
        </text>
      </g>
    </g>
  );
}
