import { useEffect, useRef, useState } from 'react';
import type { ComputedScene } from '../data/scene.js';

/** Pixel geometry keeps the path and circular glow independent of aspect ratio. Refs #37. */
export function SunArc({ scene, hideGlow = false }: { scene: ComputedScene; hideGlow?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 180 });
  // Clear zone = horizontal gap between the clock and the weather block, so the arc never crosses text.
  const [zone, setZone] = useState<{ left: number; right: number } | null>(null);
  useEffect(() => {
    const band = ref.current;
    const hero = band?.parentElement;
    if (!band || !hero || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const heroRect = hero.getBoundingClientRect();
      const clock = hero.querySelector('.today-clock')?.getBoundingClientRect();
      const weather = hero.querySelector('.today-weather')?.getBoundingClientRect();
      if (clock && weather && heroRect.width > 0) {
        const left = clock.right - heroRect.left + 24;
        const right = heroRect.right - weather.left + 24;
        if (heroRect.width - left - right > 160) setZone({ left, right });
        else setZone(null);
      }
    };
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === band && entry.contentRect.width > 0 && entry.contentRect.height > 0)
          setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
      measure();
    });
    observer.observe(band);
    observer.observe(hero);
    measure();
    return () => observer.disconnect();
  }, []);
  const body = scene.sun.visible ? scene.sun : scene.moon;
  const { width, height } = size;
  const inset = 12;
  const horizon = height - 24;
  const apex = 8;
  const f = Math.max(0, Math.min(1, body.x));
  const x = inset + f * (width - inset * 2);
  const y = horizon - 4 * (horizon - apex) * f * (1 - f);
  const controlY = 2 * apex - horizon;
  const leftControl = { x: inset + (width / 2 - inset) * f, y: horizon + (controlY - horizon) * f };
  const rightControl = {
    x: width / 2 + (width / 2 - inset) * f,
    y: controlY + (horizon - controlY) * f,
  };
  const elapsed = `M${inset} ${horizon} Q${leftControl.x} ${leftControl.y} ${x} ${y}`;
  const remaining = `M${x} ${y} Q${rightControl.x} ${rightControl.y} ${width - inset} ${horizon}`;
  return (
    <div
      ref={ref}
      className="today-sun-band"
      aria-hidden="true"
      data-testid="sun-band"
      style={zone ? { left: zone.left, right: zone.right } : undefined}
    >
      <svg viewBox={`0 0 ${width} ${height}`}>
        <path className="today-sun-remaining" d={remaining} fill="none" strokeDasharray="2 7" />
        <path className="today-sun-elapsed" d={elapsed} fill="none" />
        {!scene.sun.visible && <circle cx={x} cy={y} r="7" fill="#c8d0df" opacity=".4" />}
      </svg>
      {scene.sun.visible && !hideGlow && (
        <div className="today-sun-glow" style={{ left: x, top: y }} />
      )}
    </div>
  );
}
