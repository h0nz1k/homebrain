import { useEffect, useState, type CSSProperties } from 'react';
import { useBackClosable } from '@homebrain/ha-client';
import { Button, Pill, Sheet, Stepper } from '@homebrain/ui';
import { guidesBase, loadGuides, type Guide, type GuidePart, type GuideSet } from '../guides.js';
import type { PhotoManifest } from '../photo.js';

/** Private guides.json of the robot; null while loading or when missing (generic fallback). */
export function useGuides(base: string | null): GuideSet | null {
  const [state, setState] = useState<{ base: string; set: GuideSet | null } | null>(null);
  useEffect(() => {
    if (!base) return;
    let live = true;
    loadGuides(base).then((set) => live && setState({ base, set }));
    return () => {
      live = false;
    };
  }, [base]);
  return base && state?.base === base ? state.set : null;
}

export interface GuideSheetProps {
  part: GuidePart;
  guide: Guide & { generic: boolean };
  robotName: string;
  /** Robot photo folder (`…/robots/<robot>/`) or null without a photo set. */
  base: string | null;
  manifest: PhotoManifest | null | undefined;
  /** Reset entity exists in HA → the final action is enabled. */
  resetReady: boolean;
  canAct: boolean;
  onReset: () => void;
  onClose: () => void;
}

/** Owner's photo with the part highlighted (spot ring + dimmed surroundings). */
function PartPhoto({
  guide,
  base,
  manifest,
}: Pick<GuideSheetProps, 'guide' | 'base' | 'manifest'>) {
  const photo = guide.photo;
  if (!photo || !base) return null;
  const file = photo.image ?? (photo.view && manifest ? manifest.images[photo.view] : undefined);
  if (!file) return null;
  const [x, y] = photo.spot ?? [50, 50];
  const style = {
    '--rbg-x': `${x}%`,
    '--rbg-y': `${y}%`,
    '--rbg-r': `${photo.r ?? 12}%`,
  } as CSSProperties;
  return (
    <figure
      className="rbg-photo"
      data-testid="robots-guide-photo"
      data-rbg-spot={photo.spot ? '' : undefined}
      style={style}
    >
      <img src={`${base}${file}`} alt={`${guide.title} – kde ho najdete`} decoding="async" />
      {photo.spot && <span className="rbg-ring" aria-hidden="true" />}
    </figure>
  );
}

/** „Údržba → díl“: highlighted photo, numbered steps, inline video, source link, counter reset. */
export function GuideSheet({
  part,
  guide,
  robotName,
  base,
  manifest,
  resetReady,
  canAct,
  onReset,
  onClose,
}: GuideSheetProps) {
  useBackClosable(onClose);
  const dir = base ? guidesBase(base) : null;
  const media = (name?: string) => (name && dir ? `${dir}${name}` : undefined);
  const video = guide.video && dir && (
    <figure className="rbg-video">
      <video
        data-testid="robots-guide-video"
        src={`${dir}${guide.video.src}`}
        poster={media(guide.video.poster)}
        controls
        playsInline
        preload="metadata"
      />
      <figcaption>Oficiální video výrobce</figcaption>
    </figure>
  );
  const footer = guide.reset ? (
    <div className="rbg-foot">
      <Button onClick={onClose}>Zavřít</Button>
      <Button
        variant="primary"
        data-testid="robots-guide-reset"
        disabled={!resetReady || !canAct}
        onClick={onReset}
      >
        Hotovo, vynulovat počítadlo
      </Button>
    </div>
  ) : (
    <div className="rbg-foot">
      <Button variant="primary" onClick={onClose}>
        Hotovo
      </Button>
    </div>
  );
  return (
    <Sheet
      title={guide.title}
      onClose={onClose}
      width="lg"
      stickyFooter
      data-testid="robots-guide"
      footer={footer}
    >
      <div className="rbg" data-part={part} data-generic={guide.generic || undefined}>
        <p className="rbg-sub">
          {robotName}
          {guide.generic ? ' · obecný postup – návod pro tento model zatím chybí' : ''}
        </p>
        {guide.interval && (
          <Pill tone="accent" className="rbg-interval" data-testid="robots-guide-interval">
            {guide.interval}
          </Pill>
        )}
        <div className="rbg-hero">
          <PartPhoto guide={guide} base={base} manifest={manifest} />
          {video}
        </div>
        <Stepper
          variant="instructions"
          label={`${guide.title} – postup`}
          steps={guide.steps.map((step, i) => ({
            key: String(i + 1),
            title: step.text,
            state: 'todo',
            media: media(step.image) ? (
              <img src={media(step.image)} alt={`Krok ${i + 1}`} loading="lazy" decoding="async" />
            ) : undefined,
          }))}
        />
        {guide.source && (
          <p className="rbg-source">
            Zdroj:{' '}
            <a href={guide.source.url} target="_blank" rel="noreferrer noopener">
              {guide.source.label}
            </a>
          </p>
        )}
        {guide.reset && !resetReady && (
          <p className="rbg-note" data-testid="robots-guide-reset-missing">
            Počítadlo nejde vynulovat: v Home Assistantu povolte entitu <code>{guide.reset}</code>.
          </p>
        )}
      </div>
    </Sheet>
  );
}
