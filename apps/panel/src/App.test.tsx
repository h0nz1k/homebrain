import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it, onTestFinished, vi } from 'vitest';
import { createEntityStore } from '@homebrain/ha-client';
import { createMockConnection } from '@homebrain/testing';
import { App, isKioskPanel, isKioskRoute } from './shell/App';
import { panelFontFaceCss } from './shell/injectFonts';

it('renders the configured module without internal navigation', async () => {
  render(<App store={createEntityStore()} moduleId="waste" />);
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(await screen.findByText('Každá nádoba má svůj den', {}, { timeout: 10000 })).toBeDefined();
});

it('shows the HA menu button in narrow mode', () => {
  render(<App store={createEntityStore()} narrow />);
  expect(screen.getByRole('button', { name: 'Otevřít nabídku' })).toBeDefined();
  expect(screen.queryByRole('navigation')).toBeNull();
});

it('loads Inter via resolved font asset URLs in the shell', () => {
  const css = panelFontFaceCss();
  expect(css).toContain('font-weight:200');
  expect(css).toContain('font-weight:400');
  expect(css).not.toContain("url('./");
  expect(css).toMatch(/url\('[^']+'\)/);
  const style = document.getElementById('homebrain-panel-fonts');
  expect(style?.textContent ?? '').not.toContain("url('./");
});

it('exposes the top bar portal slot', () => {
  render(<App store={createEntityStore()} route={{ path: '/today' }} />);
  expect(document.getElementById('hb-topbar-slot')).not.toBeNull();
});

it('hides chrome in kiosk mode', () => {
  render(<App store={createEntityStore()} route={{ path: '/today/kiosk' }} />);
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(document.querySelector('.hb-shell')?.getAttribute('data-kiosk')).toBe('true');
  expect(document.getElementById('hb-topbar-slot')).toBeNull();
});

it('detects kiosk via query string', () => {
  expect(isKioskRoute('/today', '?kiosk=1')).toBe(true);
  expect(isKioskRoute('/today', '')).toBe(false);
});

it('reacts to disconnection and ready events', async () => {
  const connection = createMockConnection();
  const { unmount } = render(<App store={createEntityStore()} connection={connection} />);
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  act(() => connection.emit('disconnected'));
  expect(
    screen.getByText('Odpojeno od Home Assistantu – zobrazená data mohou být zastaralá'),
  ).toBeDefined();
  act(() => connection.emit('ready'));
  expect(screen.queryByRole('status')).toBeNull();
  unmount();
});

it('falls back to today for unknown routes', () => {
  render(<App store={createEntityStore()} moduleId="unknown" />);
  expect(document.querySelector('.hb-topbar-title')?.textContent).toBe('Dnes');
});

it('passes the waste module bindings to its view (Refs #5)', async () => {
  // Dopoledne v den svozu: po 14:00 se dnešní svoz bere jako vyvezený a hero přejde jinam,
  // takže test nesmí záviset na hodině běhu.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-07-18T08:00:00+02:00'));
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const store = createEntityStore();
  store.update({
    'sensor.demo_waste_next': {
      entity_id: 'sensor.demo_waste_next',
      state: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(new Date()),
      last_updated: new Date().toISOString(),
      attributes: { waste_type: 'Papír' },
    },
  });
  render(
    <App
      store={store}
      connection={createMockConnection({
        'homebrain/bindings/get': { waste: { waste_next: 'sensor.demo_waste_next' } },
      })}
      moduleId="waste"
    />,
  );
  expect(await screen.findByRole('heading', { name: 'Papír' }, { timeout: 10000 })).toBeDefined();
  expect(screen.getByLabelText('dnes', { selector: '.wb-countdown' })).toBeDefined();
  expect(screen.queryByTestId('waste-today')).toBeNull();
  expect(screen.queryByText('Není nastavena vazba na entitu odpadů')).toBeNull();
});

it('kiosk role (server session) forces the kiosk shell on Dnes and sends no admin-only commands', async () => {
  const connection = createMockConnection({
    'homebrain/bindings/get': {},
    'homebrain/session/get': {
      role: 'kiosk',
      visible_modules: ['energy', 'family', 'today', 'waste', 'weather'],
      is_admin: false,
      kiosk: true,
    },
  });
  const sent: string[] = [];
  const original = connection.sendMessagePromise.bind(connection);
  connection.sendMessagePromise = <T,>(message: { type: string }) => {
    sent.push(message.type);
    return original<T>(message);
  };
  const { container } = render(
    <App store={createEntityStore()} connection={connection} moduleId="wine" />,
  );
  await waitFor(() =>
    expect(container.querySelector('.hb-shell')?.getAttribute('data-kiosk')).toBe('true'),
  );
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(sent).toContain('homebrain/session/get');
  const adminOnly = sent.filter(
    (type) => type === 'homebrain/bindings/set' || type.startsWith('homebrain/wine'),
  );
  expect(adminOnly).toEqual([]);
}, 15000);

it('shows "Modul nedostupný" when the module backend failed to start (#28)', async () => {
  const connection = createMockConnection({
    'homebrain/bindings/get': {},
    'homebrain/session/get': {
      role: 'owner',
      visible_modules: ['wine', 'waste'],
      is_admin: true,
      kiosk: false,
      unavailable_modules: ['wine'],
    },
  });
  render(<App store={createEntityStore()} connection={connection} moduleId="wine" />);
  expect((await screen.findByRole('alert')).textContent).toContain('Modul nedostupný');
});

it('kiosk panel (config.kiosk) always renders Dnes in kiosk layout, ignoring the route', () => {
  expect(isKioskPanel({ config: { kiosk: true } })).toBe(true);
  expect(isKioskPanel({ config: {} })).toBe(false);
  expect(isKioskPanel(undefined)).toBe(false);
  const { container } = render(<App store={createEntityStore()} moduleId="wine" kioskPanel />);
  expect(container.querySelector('.hb-shell')?.getAttribute('data-kiosk')).toBe('true');
  expect(screen.queryByRole('navigation')).toBeNull();
});

it('production modules wire the live Dnes adapter (not the stub or fixtures)', async () => {
  const { getTodayAdapterFactory } = await import('@homebrain/module-today');
  const { buildMockSnapshot } = await import('@homebrain/module-weather');
  const store = createEntityStore();
  const connection = createMockConnection({
    'homebrain/bindings/get': {},
    'homebrain/session/get': { role: 'owner', visible_modules: ['today'], is_admin: true },
    'homebrain/weather/get': buildMockSnapshot('default'),
  });
  const adapter = getTodayAdapterFactory()({ store, bindings: {}, connection });
  const seen: number[] = [];
  const stop = adapter.subscribe((data) => seen.push(data.station.tempC));
  expect(adapter.get().ha.connected).toBe(true);
  await waitFor(() => expect(Number.isFinite(seen.at(-1))).toBe(true));
  expect(seen.at(-1)).toBe(buildMockSnapshot('default').station.values.t2m!.v);
  stop();
});

it('renders Dnes with live HA data: temperature shown, never „odpojeno“ while connected', async () => {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  try {
    const { buildMockSnapshot } = await import('@homebrain/module-weather');
    const store = createEntityStore();
    store.update({
      'sun.sun': {
        entity_id: 'sun.sun',
        state: 'above_horizon',
        last_updated: new Date().toISOString(),
        attributes: {
          next_rising: new Date(Date.now() + 20 * 3_600_000).toISOString(),
          next_setting: new Date(Date.now() + 3_600_000).toISOString(),
        },
      },
    });
    const connection = createMockConnection({
      'homebrain/bindings/get': {},
      'homebrain/session/get': { role: 'owner', visible_modules: ['today'], is_admin: true },
      'homebrain/weather/get': buildMockSnapshot('default'),
    });
    render(<App store={store} connection={connection} route={{ path: '/today' }} />);
    const temp = await screen.findByTestId('today-temp', {}, { timeout: 10000 });
    await waitFor(() => expect(temp.textContent).toMatch(/\d/));
    expect(document.body.textContent).not.toContain('odpojeno');
    expect(screen.getByTestId('ha-freshness').textContent).toMatch(/HA · (před|připojeno)/);
  } finally {
    window.matchMedia = original;
  }
}, 15000);

it('renders family inside the hidden settings panel', async () => {
  render(<App store={createEntityStore()} moduleId="settings" route={{ path: '/family' }} />);
  expect(document.querySelector('.hb-topbar-title')?.textContent).toBe('Nastavení');
  expect(await screen.findByRole('heading', { name: 'Rodina' })).toBeDefined();
  expect(screen.queryByRole('navigation', { name: 'Hlavní navigace' })).toBeNull();
});

it('kiosk panel opened by an admin shows the ADR-0002 warning; a non-admin kiosk user does not', async () => {
  const session = (isAdmin: boolean) =>
    createMockConnection({
      'homebrain/bindings/get': {},
      'homebrain/session/get': {
        role: isAdmin ? 'owner' : 'kiosk',
        visible_modules: ['today'],
        is_admin: isAdmin,
        kiosk: !isAdmin,
      },
    });
  const admin = render(<App store={createEntityStore()} connection={session(true)} kioskPanel />);
  const warning = await screen.findByTestId('kiosk-admin-warning');
  expect(warning.textContent).toContain('administrátor');
  expect(warning.getAttribute('role')).toBe('alert');
  admin.unmount();
  const kiosk = render(<App store={createEntityStore()} connection={session(false)} kioskPanel />);
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByTestId('kiosk-admin-warning')).toBeNull();
  kiosk.unmount();
  // Admin on the normal (non-kiosk) panel: no warning.
  const normal = render(<App store={createEntityStore()} connection={session(true)} moduleId="family" />);
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByTestId('kiosk-admin-warning')).toBeNull();
  normal.unmount();
}, 15000);
