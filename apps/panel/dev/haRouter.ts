import {
  KIOSK_PANEL_PATH,
  LEGACY_PANEL_PATH,
  PANEL_PATHS_BY_MODULE,
  SETTINGS_PANEL_PATH,
} from '@homebrain/ha-client';
import type { HomebrainPanel } from '../src/host';

/**
 * Dev server only. Mimic HA's router: only the panels the integration registers exist (real url
 * paths from panels.json, e.g. /homebrain-pristup/test). The panel config selects the module and
 * route.path contains only its sub-route. Any other top-level path (also a module id such as
 * /access/test) is unknown to HA, which replaces it with the default dashboard; the harness
 * shows a visible marker there so e2e catches links that leave HomeBrain.
 */
export function installHaRouter(panel: HomebrainPanel): { mount(): void } {
  const moduleByPanel = new Map(
    Object.entries(PANEL_PATHS_BY_MODULE).map(([id, path]) => [path, id]),
  );
  const haHome = document.createElement('main');
  haHome.dataset.testid = 'ha-default-dashboard';
  haHome.innerHTML =
    '<h1>Home Assistant – výchozí přehled</h1><p>Dev harness: neznámá adresa panelu, HA by přesměroval sem.</p><ul>' +
    [...moduleByPanel.keys(), SETTINGS_PANEL_PATH, KIOSK_PANEL_PATH]
      .map((path) => `<li><a href="/${path}">/${path}</a></li>`)
      .join('') +
    '</ul>';
  let panelMounted = false;
  function updatePanelRoute() {
    const [prefix = '', ...rest] = location.pathname.split('/').filter(Boolean);
    const module = prefix === SETTINGS_PANEL_PATH ? 'settings' : moduleByPanel.get(prefix);
    if (prefix === KIOSK_PANEL_PATH) {
      panel.panel = { config: { kiosk: true } };
    } else if (prefix === LEGACY_PANEL_PATH) {
      panel.panel = { config: { legacy: true } };
    } else if (module) {
      panel.panel = { config: { module } };
    } else {
      if (prefix !== 'lovelace') history.replaceState(null, '', '/lovelace');
      panel.remove();
      if (!haHome.isConnected) document.body.append(haHome);
      return;
    }
    haHome.remove();
    panel.route = { path: rest.length ? '/' + rest.join('/') : '' };
    if (panelMounted && !panel.isConnected) document.body.append(panel);
  }
  window.top?.addEventListener('location-changed', updatePanelRoute);
  window.top?.addEventListener('popstate', updatePanelRoute);
  updatePanelRoute();
  return {
    /** First mount once `hass` is set; later route changes re-attach the panel themselves. */
    mount() {
      panelMounted = true;
      if (!haHome.isConnected) document.body.append(panel);
    },
  };
}
