import { useId } from 'react';
import type { FryerPhase } from '../domain/fryerLive.js';

/**
 * Generic basket airfryer drawn in SVG (front view, no brand details). The phase drives the
 * scene: warm glow while heating, drawer slid out with jumping food for shake, plain at rest.
 * Decorative only (aria-hidden); colours come from the card tone + theme tokens in styles.ts.
 */
export function FryerArt({ phase, className }: { phase: FryerPhase; className?: string }) {
  const id = useId().replace(/:/g, '');
  const out = phase === 'action' || phase === 'drawer';
  return (
    <svg
      className={`rc-fa${className ? ` ${className}` : ''}`}
      viewBox="0 0 140 150"
      data-phase={phase}
      data-out={out || undefined}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}g`} cx="50%" cy="62%" r="50%">
          <stop offset="0" className="rc-fa-glow0" />
          <stop offset="1" className="rc-fa-glow1" />
        </radialGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="rc-fa-top" />
          <stop offset="1" className="rc-fa-bot" />
        </linearGradient>
      </defs>
      <ellipse className="rc-fa-heat" cx="70" cy="86" rx="70" ry="62" fill={`url(#${id}g)`} />
      <ellipse className="rc-fa-shadow" cx="70" cy="143" rx="46" ry="4.5" />
      {/* body: slightly tapered shell */}
      <path
        className="rc-fa-body"
        fill={`url(#${id}b)`}
        d="M46 10h48c16 0 23 8 24 22l4 86c1 14-7 22-21 22H39c-14 0-22-8-21-22l4-86c1-14 8-22 24-22z"
      />
      {/* soft studio light: left sheen + top rim */}
      <path
        className="rc-fa-sheen"
        d="M30 26c2-9 7-12 16-12h6c-9 3-14 10-15 22l-5 84c-1 6 0 10 2 13-8-3-11-9-10-17z"
      />
      <path className="rc-fa-rim" d="M44 11.5h52" />
      <rect className="rc-fa-foot" x="34" y="138" width="14" height="4" rx="2" />
      <rect className="rc-fa-foot" x="92" y="138" width="14" height="4" rx="2" />
      {/* control panel + status light */}
      <rect className="rc-fa-panel" x="50" y="21" width="40" height="13" rx="6.5" />
      <circle className="rc-fa-led" cx="59" cy="27.5" r="2.6" />
      <rect className="rc-fa-panel-bar" x="65" y="26" width="17" height="3" rx="1.5" />
      {/* drawer cavity (visible once the drawer slides out) */}
      <rect className="rc-fa-cavity" x="23" y="62" width="94" height="14" rx="4" />
      {/* heat slit at the drawer seam (lit while heating) */}
      <rect className="rc-fa-slit" x="34" y="61.5" width="72" height="2.5" rx="1.25" />
      <g className="rc-fa-drawer">
        <path className="rc-fa-front" d="M22 64h96l3 52c1 11-6 17-17 17H36c-11 0-18-6-17-17z" />
        <rect className="rc-fa-handle" x="45" y="84" width="50" height="11" rx="5.5" />
      </g>
      {out ? (
        <g className="rc-fa-bits">
          <rect x="44" y="52" width="6" height="15" rx="3" transform="rotate(-24 47 59)" />
          <rect x="66" y="46" width="6" height="16" rx="3" transform="rotate(8 69 54)" />
          <rect x="88" y="51" width="6" height="14" rx="3" transform="rotate(30 91 58)" />
        </g>
      ) : null}
    </svg>
  );
}
