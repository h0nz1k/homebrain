// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { revealInDetail } from './DetailLookup.js';
import { addStyles } from './addStyles.js';

function rect(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    height: bottom - top,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: top,
  } as DOMRect;
}

function mount(panel: [number, number]) {
  const box = document.createElement('div');
  box.className = 'wine-detail-scroll';
  const el = document.createElement('section');
  box.append(el);
  document.body.append(box);
  box.getBoundingClientRect = () => rect(0, 600);
  el.getBoundingClientRect = () => rect(...panel);
  const scrollTo = vi.fn();
  box.scrollTo = scrollTo as unknown as typeof box.scrollTo;
  return { el, scrollTo };
}

afterEach(() => {
  document.body.innerHTML = '';
});

it('scrolls the lookup panel (URL field included) clear of the action bar', () => {
  const { el, scrollTo } = mount([300, 760]);
  revealInDetail(el);
  expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 184 }));
});

it('keeps the panel header visible when the panel is taller than the scroller', () => {
  const { el, scrollTo } = mount([200, 1200]);
  revealInDetail(el);
  expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 176 }));
});

it('does not scroll when the panel already fits', () => {
  const { el, scrollTo } = mount([100, 500]);
  revealInDetail(el);
  expect(scrollTo).not.toHaveBeenCalled();
});

it('add sheet: opaque surface, content-sized results detent on mobile', () => {
  const sheet = /\.wine-sheet\{[^}]*\}/.exec(addStyles)?.[0] ?? '';
  expect(sheet).toMatch(/background:var\(--hb-s1\)/);
  expect(sheet).not.toMatch(/background:color-mix/);
  expect(addStyles).not.toMatch(/data-step=results\][^{]*\{height:/);
  expect(addStyles).toMatch(/\.wine-sheet\[data-step=form\]\{height:/);
});
