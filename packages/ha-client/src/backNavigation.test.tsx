import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  __resetBackNavigationForTests,
  navigatePanel,
  navigateTab,
  navigateUp,
  useBackClosable,
} from './backNavigation.js';

/** jsdom's history.back() is async (task) like browsers; wait for its popstate. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
async function back() {
  await act(async () => {
    window.history.back();
  });
  await settle();
}

function Sheet({ onClose }: { onClose: () => void }) {
  useBackClosable(onClose);
  return <div data-testid="sheet" />;
}
function Host() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button data-testid="open" onClick={() => setOpen(true)} />
      <button data-testid="close" onClick={() => setOpen(false)} />
      {open && <Sheet onClose={() => setOpen(false)} />}
    </>
  );
}

beforeEach(() => {
  __resetBackNavigationForTests();
  window.history.replaceState(null, '', '/homebrain-energie');
});
afterEach(() => {
  cleanup();
  __resetBackNavigationForTests();
  vi.restoreAllMocks();
});

it('back closes an open sheet and stays on the same URL', async () => {
  const view = render(<Host />);
  const push = vi.spyOn(window.history, 'pushState');
  await act(async () => view.getByTestId('open').click());
  await settle();
  expect(push).toHaveBeenCalledTimes(1);
  expect(window.history.state.hbSheet).toBeTypeOf('number');
  await back();
  expect(view.queryByTestId('sheet')).toBeNull();
  expect(location.pathname).toBe('/homebrain-energie');
  expect(window.history.state?.hbSheet).toBeUndefined();
});

it('closing via UI takes the entry back so one back does not land on a dead entry', async () => {
  const view = render(<Host />);
  await act(async () => view.getByTestId('open').click());
  await settle();
  const afterOpen = window.history.length;
  const backSpy = vi.spyOn(window.history, 'back');
  await act(async () => view.getByTestId('close').click());
  await settle();
  expect(backSpy).toHaveBeenCalledTimes(1);
  expect(window.history.state?.hbSheet).toBeUndefined();
  // reopen → push again (forward entry replaced, no growth)
  await act(async () => view.getByTestId('open').click());
  await settle();
  expect(window.history.length).toBe(afterOpen);
});

it('navigation right after a UI close waits for the pending back', async () => {
  const view = render(<Host />);
  await act(async () => view.getByTestId('open').click());
  await settle();
  await act(async () => {
    view.getByTestId('close').click();
    navigatePanel('/wine/w1');
  });
  await settle();
  expect(location.pathname).toBe('/homebrain-vinoteka/w1');
  expect(window.history.state.hbFrom).toBe('/homebrain-energie');
  await back();
  expect(location.pathname).toBe('/homebrain-energie');
  expect(window.history.state?.hbSheet).toBeUndefined();
});

it('navigateUp goes back to the list it was opened from, replaces after a deep link', async () => {
  window.history.replaceState(null, '', '/homebrain-vinoteka');
  navigatePanel('/wine/w1');
  await settle();
  const backSpy = vi.spyOn(window.history, 'back');
  navigateUp('/wine');
  await settle();
  expect(backSpy).toHaveBeenCalledTimes(1);
  expect(location.pathname).toBe('/homebrain-vinoteka');
  // deep link: no hbFrom → replace, no push
  window.history.replaceState(null, '', '/homebrain-vinoteka/w2');
  const length = window.history.length;
  navigateUp('/wine');
  expect(location.pathname).toBe('/homebrain-vinoteka');
  expect(window.history.length).toBe(length);
});

it('tabs: one entry above the root tab, replaced on switches, popped by the root tab', async () => {
  window.history.replaceState(null, '', '/homebrain-zdravi');
  const changed = vi.fn();
  window.addEventListener('location-changed', changed);
  const push = vi.spyOn(window.history, 'pushState');
  navigateTab('/health/progres', false);
  navigateTab('/health/odmeny', false);
  navigateTab('/health/data', false);
  expect(push).toHaveBeenCalledTimes(1);
  expect(location.pathname).toBe('/homebrain-zdravi/data');
  expect(window.history.state.hbTab).toBe(true);
  await back();
  expect(location.pathname).toBe('/homebrain-zdravi');
  navigateTab('/health/progres', false);
  navigateTab('/health', true);
  await settle();
  expect(location.pathname).toBe('/homebrain-zdravi');
  expect(changed).toHaveBeenCalled();
  window.removeEventListener('location-changed', changed);
});

it('drops a stale sheet marker after reload and skips forward into a closed sheet', async () => {
  window.history.replaceState({ hbSheet: 99, hbDepth: 1 }, '', '/homebrain-energie');
  const view = render(<Host />);
  await act(async () => view.getByTestId('open').click());
  await settle();
  // the stale marker on the base entry was cleaned when listening started
  await back();
  expect(window.history.state?.hbSheet).toBeUndefined();
  expect(view.queryByTestId('sheet')).toBeNull();
});
