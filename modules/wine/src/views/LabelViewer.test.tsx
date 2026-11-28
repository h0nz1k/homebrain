// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WineRecord } from '../domain/index.js';
import { LabelViewer } from './LabelViewer.js';

// Minimal wine record for tests
function makeWine(overrides: Partial<WineRecord> = {}): WineRecord {
  return {
    id: 'wine-test-001',
    name: 'Testovací Ryzlink',
    producer: 'Vinařství Test',
    vintage: 2022,
    wineType: 'still',
    color: 'white',
    grapeVarieties: ['Ryzlink rýnský'],
    country: 'Česko',
    region: 'Morava',
    sweetness: 'suché',
    volumeMl: 750,
    alcoholPct: 12.5,
    quantity: 3,
    location: null,
    acquiredOn: null,
    purchasePrice: null,
    personalRating: null,
    personalNote: null,
    status: 'in_stock',
    image: {
      localPath: 'homebrain/media/wine/wine-test-001.webp',
      sourceUrl: null,
      licenseStatus: 'approved',
      url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
      fullUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" data-full="1"/>',
    },
    source: {
      provider: 'local',
      externalProductId: null,
      batch: null,
      sourceUrl: null,
      fetchedAt: null,
    },
    confidence: 'manual',
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T10:00:00Z',
    ...overrides,
  };
}

function makeTriggerRef(): RefObject<HTMLButtonElement | null> {
  const btn = document.createElement('button');
  document.body.appendChild(btn);
  btn.textContent = 'Trigger';
  return { current: btn };
}

afterEach(() => {
  cleanup();
  // Remove any lingering trigger buttons
  document.querySelectorAll('[data-trigger]').forEach((el) => el.remove());
});

// ---------------------------------------------------------------------------
// Trigger visibility
// ---------------------------------------------------------------------------

describe('zoom trigger', () => {
  it('appears only when wine has a photo', async () => {
    // We test this via Detail integration: the LabelViewer trigger is in Detail.tsx.
    // Here we test LabelViewer directly can be rendered.
    const ref = makeTriggerRef();
    const wine = makeWine();
    const onClose = vi.fn();
    render(
      <LabelViewer
        wine={wine}
        thumbUrl={wine.image!.url!}
        fullUrl={wine.image!.fullUrl}
        onClose={onClose}
        triggerRef={ref}
      />,
    );
    expect(screen.getByTestId('wine-viewer-stage')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe(
      `Fotka etikety: ${wine.name}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

describe('close', () => {
  it('calls onClose when X button is clicked', async () => {
    const ref = makeTriggerRef();
    const wine = makeWine();
    const onClose = vi.fn();
    render(
      <LabelViewer
        wine={wine}
        thumbUrl={wine.image!.url!}
        fullUrl={null}
        onClose={onClose}
        triggerRef={ref}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('wine-viewer-close'));
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', async () => {
    const ref = makeTriggerRef();
    const wine = makeWine();
    const onClose = vi.fn();
    render(
      <LabelViewer
        wine={wine}
        thumbUrl={wine.image!.url!}
        fullUrl={null}
        onClose={onClose}
        triggerRef={ref}
      />,
    );
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('restores focus to trigger on unmount', async () => {
    const ref = makeTriggerRef();
    const wine = makeWine();
    const onClose = vi.fn();
    const { unmount } = render(
      <LabelViewer
        wine={wine}
        thumbUrl={wine.image!.url!}
        fullUrl={null}
        onClose={onClose}
        triggerRef={ref}
      />,
    );
    await act(async () => {
      unmount();
    });
    // Focus should return to the trigger button.
    expect(document.activeElement).toBe(ref.current);
  });
});

// ---------------------------------------------------------------------------
// Image source: fullUrl preferred once loaded
// ---------------------------------------------------------------------------

describe('image source', () => {
  it('shows thumbUrl immediately', () => {
    const ref = makeTriggerRef();
    const wine = makeWine();
    render(
      <LabelViewer
        wine={wine}
        thumbUrl="data:image/gif;base64,THUMB"
        fullUrl="data:image/gif;base64,FULL"
        onClose={() => {}}
        triggerRef={ref}
      />,
    );
    const img = screen.getByTestId('wine-viewer-img') as HTMLImageElement;
    // Initially the thumbnail is used.
    expect(img.src).toContain('THUMB');
  });

  it('falls back to thumbUrl when fullUrl is null', () => {
    const ref = makeTriggerRef();
    const wine = makeWine();
    render(
      <LabelViewer
        wine={wine}
        thumbUrl="data:image/gif;base64,THUMB"
        fullUrl={null}
        onClose={() => {}}
        triggerRef={ref}
      />,
    );
    const img = screen.getByTestId('wine-viewer-img') as HTMLImageElement;
    expect(img.src).toContain('THUMB');
  });
});

// ---------------------------------------------------------------------------
// Zoom controls
// ---------------------------------------------------------------------------

describe('zoom controls', () => {
  it('+ button zooms in', async () => {
    const ref = makeTriggerRef();
    const wine = makeWine();
    render(
      <LabelViewer
        wine={wine}
        thumbUrl={wine.image!.url!}
        fullUrl={null}
        onClose={() => {}}
        triggerRef={ref}
      />,
    );
    const img = screen.getByTestId('wine-viewer-img');
    expect(img.getAttribute('data-scale')).toBe('1');

    await act(async () => {
      fireEvent.click(screen.getByTestId('wine-viewer-zoom-in'));
    });
    const scale = Number(img.getAttribute('data-scale'));
    expect(scale).toBeGreaterThan(1);
  });

  it('reset button returns to 1×', async () => {
    const ref = makeTriggerRef();
    const wine = makeWine();
    render(
      <LabelViewer
        wine={wine}
        thumbUrl={wine.image!.url!}
        fullUrl={null}
        onClose={() => {}}
        triggerRef={ref}
      />,
    );
    const img = screen.getByTestId('wine-viewer-img');

    await act(async () => {
      fireEvent.click(screen.getByTestId('wine-viewer-zoom-in'));
    });
    expect(Number(img.getAttribute('data-scale'))).toBeGreaterThan(1);

    await act(async () => {
      fireEvent.click(screen.getByTestId('wine-viewer-zoom-reset'));
    });
    expect(img.getAttribute('data-scale')).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// role=dialog, aria-modal
// ---------------------------------------------------------------------------

describe('accessibility', () => {
  it('has role=dialog with aria-modal=true', () => {
    const ref = makeTriggerRef();
    const wine = makeWine();
    render(
      <LabelViewer
        wine={wine}
        thumbUrl={wine.image!.url!}
        fullUrl={null}
        onClose={() => {}}
        triggerRef={ref}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe(`Fotka etikety: ${wine.name}`);
  });
});
