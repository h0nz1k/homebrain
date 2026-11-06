import { useEffect, useState, type CSSProperties } from 'react';
import { Chip, Pill } from '@homebrain/ui';
import type { ConsumableInfo } from '../consumables.js';
import type { ErrorAdvice } from '../errors.js';
import {
  errorHotspot,
  loadPhotoManifest,
  maintenanceDots,
  type PhotoManifest,
  type PhotoView,
} from '../photo.js';

/** Manifest of the robot's photo set; `undefined` while loading, `null` = no photo set. */
export function usePhotoManifest(base: string | null): PhotoManifest | null | undefined {
  const [state, setState] = useState<{ base: string | null; manifest: PhotoManifest | null }>();
  useEffect(() => {
    if (!base) return;
    let live = true;
    loadPhotoManifest(base).then((manifest) => live && setState({ base, manifest }));
    return () => {
      live = false;
    };
  }, [base]);
  if (!base) return null;
  return state?.base === base ? state.manifest : undefined;
}

type Rect = [number, number, number, number];
const box = ([x0, y0, x1, y1]: Rect): CSSProperties => ({
  left: `${x0}%`,
  top: `${y0}%`,
  width: `${x1 - x0}%`,
  height: `${y1 - y0}%`,
});

/** A crop of the bottom photo that lies exactly over its own spot (mops, vibrating plate). */
function Crop({ src, rect, className }: { src: string; rect: Rect; className: string }) {
  const [x0, y0, x1, y1] = rect;
  const w = x1 - x0;
  const h = y1 - y0;
  return (
    <div className={`rbp-part rbp-crop ${className}`} style={box(rect)}>
      <img
        src={src}
        alt=""
        decoding="async"
        style={{
          width: `${10000 / w}%`,
          height: `${10000 / h}%`,
          left: `${(-x0 / w) * 100}%`,
          top: `${(-y0 / h) * 100}%`,
        }}
      />
    </div>
  );
}

/** Rolling-tread overlay (main roller, caster, wheels): soft-light stripes that scroll. */
function Tread({
  rect,
  period,
  speed,
  kind,
}: {
  rect: Rect;
  period: number;
  speed: number;
  kind: string;
}) {
  return (
    <div
      className="rbp-part rbp-tread"
      data-rbp-part={kind}
      style={{ ...box(rect), '--rbp-p': `${period}px`, '--rbp-t': `${speed}s` } as CSSProperties}
    />
  );
}

const at = ([x, y]: [number, number]): CSSProperties => ({ left: `${x}%`, top: `${y}%` });

export interface RobotPhotoProps {
  base: string;
  manifest: PhotoManifest;
  name: string;
  view: PhotoView;
  error: ErrorAdvice | null;
  parts: ConsumableInfo[];
  partsLow: boolean;
  maintenance: boolean;
  onMaintenance: (on: boolean) => void;
  onFail: () => void;
}

/**
 * Photo card visual: dock photo at rest, bottom photo with animated parts while cleaning
 * (side brush, roller, caster, wheels, round mops or vibrating plate), a „!“ on the faulty part
 * and consumable dots in the maintenance view. Reduced motion = no animation.
 */
export function RobotPhoto({
  base,
  manifest,
  name,
  view,
  error,
  parts,
  partsLow,
  maintenance,
  onMaintenance,
  onFail,
}: RobotPhotoProps) {
  const src = (fileName: string) => `${base}${fileName}`;
  const bottomSrc = src(manifest.images.bottom);
  const geo = manifest.bottom;
  const docked = view === 'dock';
  const hot = error && view === 'error' ? errorHotspot(manifest, error) : null;
  const dots = view === 'maintenance' ? maintenanceDots(manifest, parts) : [];
  const brush = geo.sideBrush;
  const bang = hot && (
    <div
      className="rbp-hs rbp-hs-err"
      style={at(hot.at)}
      data-edge={hot.at[0] < 30 ? 'start' : hot.at[0] > 70 ? 'end' : undefined}
      data-testid="robots-photo-error"
    >
      <span className="rbp-bang" aria-hidden="true">
        !
      </span>
      <span className="rbp-callout">{error!.title}</span>
    </div>
  );
  const dockLayer = docked || hot?.layer === 'dock';
  return (
    <div
      className="rbp"
      data-rbp-view={view}
      data-testid="robots-photo"
      role="img"
      aria-label={`${name}${manifest.model ? ` (${manifest.model})` : ''}`}
    >
      <div className="rbp-layer rbp-dock" data-on={dockLayer} aria-hidden="true">
        <div className="rbp-dock-wrap">
          <span className="rbp-shadow" />
          <img src={src(manifest.images.dock)} alt="" decoding="async" onError={onFail} />
          {hot?.layer === 'dock' && bang}
        </div>
      </div>
      <div className="rbp-layer rbp-bottom" data-on={!dockLayer} aria-hidden="true">
        <div className="rbp-wrap">
          <div className="rbp-disc">
            <img className="rbp-base" src={bottomSrc} alt="" decoding="async" onError={onFail} />
            {geo.roller && <Tread rect={geo.roller} period={9} speed={0.32} kind="roller" />}
            {geo.caster && <Tread rect={geo.caster} period={5} speed={0.22} kind="caster" />}
            {geo.wheels?.map((wheel, i) => (
              <Tread key={i} rect={wheel} period={7} speed={0.55} kind="wheel" />
            ))}
            {geo.mops?.map(([x, y, r], i) => (
              <Crop
                key={i}
                src={bottomSrc}
                rect={[x - r, y - r, x + r, y + r]}
                className={`rbp-mop${i % 2 ? ' rbp-ccw' : ''}`}
              />
            ))}
            {geo.plate && (
              <div className="rbp-plate-wrap" style={box(geo.plate)}>
                <Crop src={bottomSrc} rect={[0, 0, 100, 100]} className="rbp-plate" />
                <span className="rbp-sheen" />
              </div>
            )}
            {brush && manifest.images.sideBrush && (
              <div
                className="rbp-part rbp-brush"
                data-rbp-dir={brush.dir}
                style={box([
                  brush.box[0],
                  brush.box[1],
                  brush.box[0] + brush.box[2],
                  brush.box[1] + brush.box[2],
                ])}
              >
                <img src={src(manifest.images.sideBrush)} alt="" decoding="async" />
              </div>
            )}
            {hot?.layer === 'bottom' && bang}
            {dots.map((dot) => (
              <div
                key={dot.kind}
                className="rbp-hs rbp-dot"
                data-low={dot.low}
                style={at(dot.at)}
                data-testid={`robots-photo-part-${dot.kind}`}
              >
                <i aria-hidden="true" />
                <span className="rbp-dot-label">{dot.label}</span>
                <small>{dot.percent}&nbsp;%</small>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="rbp-badges">
        {view === 'error' ? (
          <Pill tone="crit" dot data-testid="robots-photo-badge-error">
            Chyba
          </Pill>
        ) : (
          <span />
        )}
        {parts.length > 0 && (
          <Chip
            pressed={maintenance}
            tone={partsLow ? 'warn' : 'neutral'}
            look="soft"
            data-testid="robots-photo-maintenance"
            onPressedChange={onMaintenance}
          >
            Údržba
          </Chip>
        )}
      </div>
    </div>
  );
}
