import type { RobotTone } from '../status.js';

/**
 * Neutral top-down robot illustration (no vendor artwork). Owners can replace it per robot
 * with their own picture (integration option „Obrázek robota“).
 */
export function RobotArt({ tone, image, name }: { tone: RobotTone; image: string; name: string }) {
  if (image)
    return (
      <div className="rb-art rb-art-photo" data-rb-art-tone={tone}>
        <img src={image} alt={name} />
      </div>
    );
  return (
    <div className="rb-art" data-rb-art-tone={tone} role="img" aria-label={`Robot ${name}`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <radialGradient id="rb-body" cx="38%" cy="30%" r="80%">
            <stop offset="0" stopColor="var(--rb-body-hi)" />
            <stop offset=".62" stopColor="var(--rb-body)" />
            <stop offset="1" stopColor="var(--rb-body-lo)" />
          </radialGradient>
          <radialGradient id="rb-turret" cx="40%" cy="32%" r="75%">
            <stop offset="0" stopColor="var(--rb-turret-hi)" />
            <stop offset="1" stopColor="var(--rb-turret)" />
          </radialGradient>
          <radialGradient id="rb-shadow" cx="50%" cy="50%" r="50%">
            <stop offset=".55" stopColor="#000" stopOpacity=".32" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="104" cy="112" rx="92" ry="88" fill="url(#rb-shadow)" />
        <g className="rb-art-brush" transform="translate(46 50)">
          <g>
            {[0, 120, 240].map((angle) => (
              <path
                key={angle}
                d="M0 0 C-4 -8 -10 -14 -19 -18"
                transform={`rotate(${angle})`}
                fill="none"
                stroke="var(--rb-brush)"
                strokeWidth="2.6"
                strokeLinecap="round"
                opacity=".9"
              />
            ))}
            <circle r="6.5" fill="var(--rb-turret)" stroke="var(--rb-rim)" />
          </g>
        </g>
        <circle cx="100" cy="100" r="80" fill="url(#rb-body)" />
        <path
          d="M34 72 A72 72 0 0 1 166 72"
          fill="none"
          stroke="var(--rb-bumper)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M70 34 A72 72 0 0 1 130 34"
          fill="none"
          stroke="var(--rb-window)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <ellipse
          cx="78"
          cy="58"
          rx="40"
          ry="20"
          fill="#fff"
          opacity=".06"
          transform="rotate(-28 78 58)"
        />
        <circle cx="100" cy="100" r="80" fill="none" stroke="var(--rb-rim)" strokeWidth="1.5" />
        <circle cx="100" cy="78" r="22" fill="url(#rb-turret)" />
        <circle cx="100" cy="78" r="22" fill="none" stroke="var(--rb-rim)" strokeWidth="1" />
        <path d="M84 132 h32" stroke="var(--rb-seam)" strokeWidth="3" strokeLinecap="round" />
        <circle className="rb-art-led" cx="100" cy="150" r="5" fill="var(--rb-tone)" />
      </svg>
    </div>
  );
}
