import { createRoot, type Root } from 'react-dom/client';
import { createEntityStore, navigatePanel, type HassLike } from '@homebrain/ha-client';
import { App, isKioskPanel } from '../shell/App';
import { t } from '../shell/i18n/cs';
export class HomebrainPanel extends HTMLElement {
  private root?: Root;
  private currentHass?: HassLike;
  private currentNarrow = false;
  private currentRoute = { path: '' };
  private currentPanel?: { config?: { legacy?: boolean; module?: string; kiosk?: boolean } };
  readonly entityStore = createEntityStore();
  set hass(value: HassLike) {
    const previous = this.currentHass;
    this.currentHass = value;
    this.entityStore.update(value.states);
    if (
      !previous ||
      previous.connection !== value.connection ||
      previous.themes?.darkMode !== value.themes?.darkMode
    ) {
      this.render();
    }
  }
  get hass(): HassLike | undefined {
    return this.currentHass;
  }
  set narrow(value: boolean) {
    this.currentNarrow = value;
    this.render();
  }
  get narrow() {
    return this.currentNarrow;
  }
  set route(value: { path: string }) {
    this.currentRoute = value;
    this.render();
  }
  get route() {
    return this.currentRoute;
  }
  set panel(
    value: { config?: { legacy?: boolean; module?: string; kiosk?: boolean } } | undefined,
  ) {
    this.currentPanel = value;
    this.render();
  }
  get panel() {
    return this.currentPanel;
  }

  connectedCallback() {
    this.root ??= createRoot(this);
    this.render();
  }
  disconnectedCallback() {
    this.root?.unmount();
    this.root = undefined;
  }
  private render() {
    if (!this.root) return;
    if (this.currentPanel?.config?.legacy) {
      navigatePanel('/today', true);
      return;
    }
    const module = this.currentPanel?.config?.module || 'today';
    this.root?.render(
      this.currentHass ? (
        <App
          store={this.entityStore}
          connection={this.currentHass.connection}
          narrow={this.currentNarrow}
          moduleId={module}
          route={this.currentRoute}
          onToggleMenu={() =>
            this.dispatchEvent(new Event('hass-toggle-menu', { bubbles: true, composed: true }))
          }
          darkMode={this.currentHass.themes?.darkMode}
          kioskPanel={isKioskPanel(this.currentPanel)}
        />
      ) : (
        <p>{t('waiting')}</p>
      ),
    );
  }
}
export function defineHomebrainPanel() {
  if (!customElements.get('homebrain-panel'))
    customElements.define('homebrain-panel', HomebrainPanel);
}
