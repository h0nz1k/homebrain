import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createFakeHass } from '@homebrain/testing';
import { navigatePanel, panelUrl } from '@homebrain/ha-client';
import type { AppProps } from '../shell/App';
import { defineHomebrainPanel, type HomebrainPanel } from './index';

vi.mock('../shell/App', () => ({
  isKioskPanel: (panel: { config?: { kiosk?: boolean } } | undefined) =>
    panel?.config?.kiosk === true,
  App: ({ moduleId, route, onToggleMenu, kioskPanel }: AppProps) => (
    <button onClick={onToggleMenu}>{`${moduleId}:${route?.path}:${kioskPanel}`}</button>
  ),
}));

afterEach(() => {
  act(() => document.querySelectorAll('homebrain-panel').forEach((panel) => panel.remove()));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(config?: { module?: string; legacy?: boolean; kiosk?: boolean }) {
  defineHomebrainPanel();
  const panel = document.createElement('homebrain-panel') as HomebrainPanel;
  panel.panel = { config };
  panel.hass = createFakeHass();
  await act(async () => document.body.append(panel));
  return panel;
}

it('chooses the configured module and passes the HA sub-route without parsing the iframe URL', async () => {
  const push = vi.spyOn(window.history, 'pushState');
  const panel = await mount({ module: 'wine' });
  await act(async () => {
    panel.route = { path: '/demo-wine-7' };
  });
  expect(screen.getByRole('button').textContent).toBe('wine:/demo-wine-7:false');
  await act(async () => {
    panel.panel = { config: { module: 'settings' } };
  });
  expect(screen.getByRole('button').textContent).toBe('settings:/demo-wine-7:false');
  expect(push).not.toHaveBeenCalled();
});

it('defaults to today and preserves kiosk configuration', async () => {
  const panel = await mount();
  expect(screen.getByRole('button').textContent).toBe('today::false');
  await act(async () => {
    panel.panel = { config: { kiosk: true } };
  });
  expect(screen.getByRole('button').textContent).toBe('today::true');
});

it('dispatches the HA menu event from the panel element', async () => {
  const panel = await mount();
  const listener = vi.fn();
  panel.addEventListener('hass-toggle-menu', listener);
  fireEvent.click(screen.getByRole('button'));
  expect(listener).toHaveBeenCalledOnce();
  const event = listener.mock.calls[0]![0] as Event;
  expect(event.target).toBe(panel);
  expect(event.bubbles).toBe(true);
  expect(event.composed).toBe(true);
});

it('redirects legacy config even when HA supplies it after connection', async () => {
  const panel = await mount();
  const replaceState = vi.fn();
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', { top: { history: { replaceState }, dispatchEvent } });
  await act(async () => {
    panel.panel = { config: { legacy: true } };
  });
  expect(replaceState).toHaveBeenCalledWith(expect.any(Object), '', '/homebrain-dnes');
  expect(dispatchEvent.mock.calls[0]![0].type).toBe('location-changed');
});

it('navigates the top window without touching iframe history', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const iframeWindow = iframe.contentWindow!;
  const iframePush = vi.spyOn(iframeWindow.history, 'pushState');
  const topPush = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
  const changed = vi.fn();
  window.addEventListener('location-changed', changed);
  vi.stubGlobal('window', iframeWindow);
  navigatePanel('/wine/demo-wine-7');
  expect(iframePush).not.toHaveBeenCalled();
  expect(topPush).toHaveBeenCalledWith(
    expect.objectContaining({ hbFrom: expect.any(String) }),
    '',
    '/homebrain-vinoteka/demo-wine-7',
  );
  expect(changed.mock.calls[0]![0].detail).toEqual({ replace: false });
  vi.unstubAllGlobals();
  window.removeEventListener('location-changed', changed);
  iframe.remove();
});

it('maps family into the hidden settings panel', () => {
  expect(panelUrl('/family')).toBe('/homebrain-nastaveni/family');
});
