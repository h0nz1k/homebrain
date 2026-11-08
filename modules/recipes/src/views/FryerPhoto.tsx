import { useState, type CSSProperties } from 'react';
import { useAssetManifest } from '@homebrain/ui';
import type { FryerPhase } from '../domain/fryerLive.js';
import {
  FRYER_PHOTO_ROOT,
  fryerPhotoView,
  parseFryerPhotoManifest,
  type FryerPhotoManifest,
  type PhotoRect,
} from '../fryerPhoto.js';
import { FryerArt } from './FryerArt.js';

const box = ([x0, y0, x1, y1]: PhotoRect): CSSProperties => ({
  left: `${x0}%`,
  top: `${y0}%`,
  width: `${x1 - x0}%`,
  height: `${y1 - y0}%`,
});

/**
 * Owner's product photo of the airfryer (decorative, like FryerArt). The phase only adds light:
 * warm glow at the drawer seam while heating, the display lit in the card tone, dimmed when
 * paused, red outline glow on error, desaturated when off. `data-finish` (manifest) adapts the
 * display glass and backdrop to a white or black appliance. Loops are opacity-only and stop under
 * reduced motion (styles.ts).
 */
export function FryerPhoto({
  base,
  manifest,
  phase,
  className,
  onFail,
}: {
  base: string;
  manifest: FryerPhotoManifest;
  phase: FryerPhase;
  className?: string;
  onFail: () => void;
}) {
  const view = fryerPhotoView(manifest, phase);
  const src = `${base}${view.image}`;
  const front = !view.drawerOut;
  const { display, drawer } = manifest.hotspots;
  // Tint layers follow the photo silhouette (alpha mask), so they never colour the card behind it.
  const mask = { maskImage: `url("${src}")`, WebkitMaskImage: `url("${src}")` } as CSSProperties;
  return (
    <div
      className={`rc-fp${className ? ` ${className}` : ''}`}
      data-phase={phase}
      data-finish={manifest.finish ?? 'dark'}
      data-out={view.drawerOut || undefined}
      data-nudge={view.nudge || undefined}
      aria-hidden="true"
      data-testid="recipes-fryer-photo"
    >
      <div className="rc-fp-frame">
        <img className="rc-fp-img" src={src} alt="" decoding="async" onError={onFail} />
        {front && drawer ? <span className="rc-fp-heat" style={box(drawer)} /> : null}
        <span className="rc-fp-tint" style={mask} />
        {front && display ? <span className="rc-fp-display" style={box(display)} /> : null}
      </div>
    </div>
  );
}

/**
 * The one fryer picture used everywhere (live card, Fritéza page hero): the owner's product photo
 * from HA `/local/homebrain/airfryer/` when a manifest exists, else the generic SVG. Nothing is
 * drawn while the manifest is still loading, so the SVG never flashes before the photo.
 */
export function FryerVisual({ phase, className }: { phase: FryerPhase; className?: string }) {
  const manifest = useAssetManifest(FRYER_PHOTO_ROOT, parseFryerPhotoManifest);
  const [failed, setFailed] = useState(false);
  if (manifest === undefined) return <span className={className} aria-hidden="true" />;
  return manifest && !failed ? (
    <FryerPhoto
      base={FRYER_PHOTO_ROOT}
      manifest={manifest}
      phase={phase}
      className={className}
      onFail={() => setFailed(true)}
    />
  ) : (
    <FryerArt phase={phase} className={className} />
  );
}
