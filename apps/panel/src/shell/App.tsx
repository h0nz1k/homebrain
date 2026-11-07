import {
  Component,
  Suspense,
  memo,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  getBindings,
  getSession,
  type BindingsByModule,
  type HomeBrainSession,
  type ConnectionLike,
  type EntityStore,
  type ModuleViewProps,
} from '@homebrain/ha-client';
import { Toaster } from '@homebrain/ui';
import { modules } from '../modules';
import { injectPanelFonts } from './injectFonts';
import { t } from './i18n/cs';
import { ConnectionLostOverlay, KioskAdminWarning } from './Reconnect';
import tokens from '@homebrain/ui/tokens.css?inline';
import components from '@homebrain/ui/components.css?inline';
import shellStyles from './shell.css?inline';

injectPanelFonts();

const STYLES_ID = 'homebrain-panel-styles';

let styleEl = document.getElementById(STYLES_ID) as HTMLStyleElement | null;
if (!styleEl) {
  styleEl = document.createElement('style');
  styleEl.id = STYLES_ID;
  document.head.append(styleEl);
}
styleEl.textContent = tokens + components + shellStyles;

/** The separate wall-tablet panel (`/homebrain-kiosk`) registers `config: { kiosk: true }`. */
const KIOSK_SESSION_MODULES: ReadonlySet<string> = new Set(['today', 'family']);

export function isKioskPanel(panel: unknown): boolean {
  if (typeof panel !== 'object' || panel === null) return false;
  const config = (panel as { config?: unknown }).config;
  return (
    typeof config === 'object' && config !== null && (config as { kiosk?: unknown }).kiosk === true
  );
}

export function isKioskRoute(path: string, search: string): boolean {
  if (new URLSearchParams(search).get('kiosk') === '1') return true;
  return path.split('/').filter(Boolean).includes('kiosk');
}

function getMatchMedia(query: string): MediaQueryList | null {
  if (typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(query);
}

function useMatchMedia(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const media = getMatchMedia(query);
      if (!media) return () => {};
      media.addEventListener('change', onStoreChange);
      return () => media.removeEventListener('change', onStoreChange);
    },
    () => getMatchMedia(query)?.matches ?? false,
    () => false,
  );
}

export interface AppProps {
  store: EntityStore;
  connection?: ConnectionLike;
  fetchWithAuth?: ModuleViewProps['fetchWithAuth'];
  narrow?: boolean;
  route?: { path: string };
  darkMode?: boolean;
  moduleId?: string;
  onToggleMenu?: () => void;
  /** Rendered inside the kiosk panel: always Dnes in kiosk layout, route is ignored. */
  kioskPanel?: boolean;
}

class ViewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p role="alert">{t('loadError')}</p> : this.props.children;
  }
}

const ModuleContent = memo(function ModuleContent({
  store,
  bindings,
  id,
  connection,
  fetchWithAuth,
  route,
  kiosk,
}: {
  store: EntityStore;
  bindings: BindingsByModule;
  connection?: ConnectionLike;
  fetchWithAuth?: ModuleViewProps['fetchWithAuth'];
  id: string;
  route?: { path: string };
  kiosk: boolean;
}) {
  const module =
    modules.find((module) => module.id === (id === 'settings' ? 'family' : id)) ?? modules[0]!;
  return (
    <ViewBoundary key={module.id}>
      <Suspense fallback={<p>{t('loading')}</p>}>
        <module.View
          store={store}
          bindings={bindings[module.id] ?? {}}
          connection={connection}
          fetchWithAuth={fetchWithAuth}
          route={route}
          kiosk={kiosk}
        />
      </Suspense>
    </ViewBoundary>
  );
});

function NoAccess() {
  return (
    <section className="hb-no-access" role="status" data-testid="hb-no-access">
      <h2>{t('noAccessTitle')}</h2>
      <p>{t('noAccessBody')}</p>
    </section>
  );
}

export const App = memo(function App({
  store,
  connection,
  fetchWithAuth,
  narrow = false,
  route,
  darkMode,
  moduleId = 'today',
  onToggleMenu,
  kioskPanel = false,
}: AppProps) {
  const [bindings, setBindings] = useState<BindingsByModule>({});
  const layoutMobile = useMatchMedia('(max-width: 760px)');
  const path = route?.path ?? '/today';
  const search = typeof window !== 'undefined' ? window.location.search : '';
  // undefined = not answered yet; null = no session (older backend) -> server-side checks only.
  const [session, setSession] = useState<HomeBrainSession | null | undefined>(undefined);
  // ADR-0002: the kiosk role always gets the kiosk shell on Dnes; `?kiosk=1` alone is layout only.
  // The kiosk panel always shows only Dnes, whatever the route or role.
  const kiosk = kioskPanel || isKioskRoute(path, search) || session?.kiosk === true;
  // A kiosk session may also open Rodina (kitchen tablet: family overview + shopping list).
  const id =
    kioskPanel || (session?.kiosk && !KIOSK_SESSION_MODULES.has(moduleId)) ? 'today' : moduleId;
  const activeModule =
    modules.find((module) => module.id === (id === 'settings' ? 'family' : id)) ?? modules[0]!;

  const subscribe = useCallback(
    (notify: () => void) => {
      connection?.addEventListener?.('disconnected', notify);
      connection?.addEventListener?.('ready', notify);
      return () => {
        connection?.removeEventListener?.('disconnected', notify);
        connection?.removeEventListener?.('ready', notify);
      };
    },
    [connection],
  );
  const connected = useSyncExternalStore(
    subscribe,
    () => connection?.connected !== false,
    () => true,
  );
  useEffect(() => {
    let active = true;
    if (connection && connected)
      getBindings(connection)
        .then((value) => {
          if (active) setBindings(value);
        })
        .catch(() => {
          if (active) setBindings({});
        });
    return () => {
      active = false;
    };
  }, [connection, connected]);

  // ADR-0002 Fáze 4: a non-admin only gets the modules its role sees; unmapped users (guest)
  // and modules outside the role get a calm „Nemáte přístup“ before any module data loads.
  const sessionPending = session === undefined && Boolean(connection) && connected;
  const noAccess =
    !!session && !session.isAdmin && (id === 'settings' || !session.visibleModules.includes(id));

  useEffect(() => {
    let active = true;
    if (connection && connected)
      void getSession(connection).then((value) => {
        if (active) setSession(value);
      });
    return () => {
      active = false;
    };
  }, [connection, connected]);

  return (
    <div
      className="hb-shell"
      data-narrow={narrow ? 'true' : undefined}
      data-layout-mobile={layoutMobile && !narrow ? 'true' : undefined}
      data-kiosk={kiosk ? 'true' : undefined}
      data-theme={darkMode === undefined ? 'system' : darkMode ? 'dark' : 'light'}
    >
      <div className="hb-frame">
        {!kiosk && (
          <header className="hb-topbar">
            {narrow && (
              <button
                type="button"
                className="hb-menu-button"
                aria-label="Otevřít nabídku"
                onClick={onToggleMenu}
              >
                ☰
              </button>
            )}
            <p className="hb-topbar-title">
              {id === 'settings' ? 'Nastavení' : activeModule.titleCs}
            </p>
            <div id="hb-topbar-slot" className="hb-topbar-slot" />
          </header>
        )}
        <main>
          {kiosk && session?.isAdmin ? <KioskAdminWarning /> : null}
          {!connected && !kiosk && (
            <p className="hb-disconnected" role="status">
              {t('disconnected')}
            </p>
          )}
          {sessionPending ? (
            <p>{t('loading')}</p>
          ) : noAccess ? (
            <NoAccess />
          ) : session?.unavailableModules.includes(id) ? (
            <p className="hb-module-unavailable" role="alert">
              {t('moduleUnavailable')}
            </p>
          ) : (
            <ModuleContent
              store={store}
              bindings={bindings}
              id={id}
              connection={connection}
              fetchWithAuth={fetchWithAuth}
              route={route}
              kiosk={kiosk}
            />
          )}
        </main>
      </div>
      {kiosk ? (
        <ConnectionLostOverlay
          connected={connected}
          reconnect={connection?.reconnect ? () => connection.reconnect?.(true) : undefined}
        />
      ) : null}
      <Toaster />
    </div>
  );
});
