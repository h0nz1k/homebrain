// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { computeScene } from '../data/scene.js';
import { fixtureFor } from '../data/fixtures.js';
import { SunArc } from './SunArc.js';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('uses measured pixel geometry and a symmetric arc with a clear horizon', () => {
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: (entries: unknown[]) => void) {}
      observe = (target: Element) =>
        this.callback([{ target, contentRect: { width: 800, height: 200 } }]);
      disconnect = disconnect;
    },
  );
  const data = fixtureFor('a');
  const scene = computeScene(data, data.now);
  scene.sun.x = 0.5;
  const { container, rerender, unmount } = render(<SunArc scene={scene} />);
  expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 800 200');
  expect(container.querySelector('svg')?.getAttribute('preserveAspectRatio')).toBeNull();
  const paths = container.querySelectorAll('path');
  expect(paths[0]?.getAttribute('d')).toBe('M400 8 Q594 8 788 176');
  expect(paths[1]?.getAttribute('d')).toBe('M12 176 Q206 8 400 8');
  expect(container.querySelector('.today-sun-glow')).toBeTruthy();
  rerender(<SunArc scene={scene} hideGlow />);
  expect(container.querySelector('.today-sun-glow')).toBeNull();
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
