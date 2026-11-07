import { useEffect, useLayoutEffect, useRef } from 'react';
import { PANEL_PATHS_BY_MODULE, SETTINGS_PANEL_PATH } from './panels.generated.js';

/**
 * Back navigation inside HomeBrain panels (Android/iOS back gesture, browser back).
 *
 * HA's frontend owns the main window history: `navigate()` pushes an entry and fires
 * `location-changed`, dialogs push `{ dialog }` entries and close on `popstate`
 * (`make-dialog-manager.ts`, `url-sync-mixin.ts`). The Companion app's back button is
 * `WebView.goBack()` while the previous entry is same-origin. So anything that should be
 * closed by "back" needs its own history entry. We follow HA's protocol with our own
 * state keys (never `dialog`/`opensDialog`, which HA's url-sync would treat as its own):
 *
 * - `hbSheet`/`hbDepth`: an entry pushed when a sheet/dialog opens (same URL). Back pops
 *   it and closes the sheet; closing via UI goes `history.back()` so no dead entry stays.
 * - `hbTab`: a tab entry pushed from the module's root view. Further tab switches replace
 *   it, so back from any tab returns to the root tab and the history cannot grow.
 * - `hbFrom`: the URL an entry was pushed from (like HA's `from`), lets "close detail"
 *   go back instead of pushing the list URL again.
 * - `hbScroll`: scroll position of the entry, restored when it becomes current again.
 */

export interface HbHistoryState {
  hbSheet?: number;
  hbDepth?: number;
  hbTab?: boolean;
  hbFrom?: string;
  hbScroll?: { win: number; main: number };
  [key: string]: unknown;
}

type TopLike = Pick<
  Window,
  'history' | 'location' | 'addEventListener' | 'removeEventListener' | 'dispatchEvent'
>;

const pathOf = (url: string | undefined) => url?.split(/[?#]/)[0];

/** HA's window; the panel may run in an (embedded) iframe with its own useless history. */
export function hostWindow(): TopLike {
  try {
    const top = window.top;
    if (top && top.location.href !== undefined) return top;
  } catch {
    // cross-origin top: fall back to our own window
  }
  return window;
}

function stateOf(win: TopLike = hostWindow()): HbHistoryState {
  const s: unknown = win.history.state;
  return typeof s === 'object' && s !== null ? (s as HbHistoryState) : {};
}

function currentUrl(win: TopLike): string {
  const { pathname, search, hash } = win.location;
  return `${pathname}${search}${hash}`;
}

interface SheetEntry {
  id: number;
  depth: number;
  onClose: () => void;
  closedByPop?: boolean;
  releaseTimer?: ReturnType<typeof setTimeout>;
}

const stack: SheetEntry[] = [];
let nextId = 1;
let pendingBacks = 0;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
let queued: (() => void)[] = [];
let listening: TopLike | null = null;

function flushQueue() {
  const run = queued;
  queued = [];
  run.forEach((fn) => fn());
}

/** Our own `history.back()`; navigation requested meanwhile waits for its popstate. */
function goBack(win: TopLike) {
  pendingBacks++;
  clearTimeout(pendingTimer);
  // Safety net: a back that never lands (no entry, blocked) must not freeze navigation.
  pendingTimer = setTimeout(() => {
    pendingBacks = 0;
    flushQueue();
  }, 600);
  win.history.back();
}

function afterPendingBack(fn: () => void) {
  if (pendingBacks > 0) queued.push(fn);
  else fn();
}

function saveScroll(win: TopLike) {
  const main = document.querySelector<HTMLElement>('.hb-shell main');
  const hbScroll = { win: window.scrollY || 0, main: main?.scrollTop ?? 0 };
  try {
    win.history.replaceState({ ...stateOf(win), hbScroll }, '');
  } catch {
    // history quota / sandbox: scroll restore is best effort
  }
}

function restoreScroll(state: HbHistoryState) {
  const pos = state.hbScroll;
  if (!pos) return;
  // Wait for the restored view to render (route prop → React commit).
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const main = document.querySelector<HTMLElement>('.hb-shell main');
      if (main) main.scrollTop = pos.main;
      if (window.scrollY !== pos.win) window.scrollTo(0, pos.win);
    }),
  );
}

function onPopState() {
  const win = hostWindow();
  if (pendingBacks > 0) {
    pendingBacks--;
    if (pendingBacks === 0) {
      clearTimeout(pendingTimer);
      flushQueue();
    }
  }
  const state = stateOf(win);
  const depth = state.hbDepth ?? 0;
  // Close every sheet above the entry we landed on, topmost first.
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i]!;
    if (entry.depth <= depth) break;
    stack.splice(i, 1);
    entry.closedByPop = true;
    entry.onClose();
  }
  if (state.hbSheet !== undefined && !stack.some((e) => e.id === state.hbSheet)) {
    // "Forward" into a sheet entry whose sheet is gone (same as HA's url-sync for dialogs).
    goBack(win);
    return;
  }
  restoreScroll(state);
}

function ensureListening() {
  const win = hostWindow();
  if (listening === win || typeof win.addEventListener !== 'function') return;
  listening = win;
  win.addEventListener('popstate', onPopState);
  // A reload while a sheet was open leaves a sheet entry without a sheet: drop the marker.
  const state = stateOf(win);
  if (state.hbSheet !== undefined && stack.length === 0) {
    const rest = { ...state };
    delete rest.hbSheet;
    delete rest.hbDepth;
    win.history.replaceState(rest, '');
  }
}

/** Push a same-URL entry for a sheet; returns the handle for {@link releaseBackEntry}. */
export function openBackEntry(onClose: () => void): SheetEntry {
  ensureListening();
  const win = hostWindow();
  const entry: SheetEntry = { id: nextId++, depth: stack.length + 1, onClose };
  stack.push(entry);
  afterPendingBack(() => {
    if (!stack.includes(entry)) return;
    saveScroll(win);
    win.history.pushState(
      { hbSheet: entry.id, hbDepth: entry.depth, hbFrom: currentUrl(win) } satisfies HbHistoryState,
      '',
      currentUrl(win),
    );
  });
  return entry;
}

/** The sheet closed: if it closed via UI, take its history entry back (no double back). */
export function releaseBackEntry(entry: SheetEntry) {
  const index = stack.indexOf(entry);
  if (index !== -1) stack.splice(index, 1);
  if (entry.closedByPop) return;
  const win = hostWindow();
  afterPendingBack(() => {
    // Only when our entry is still current: if HA or a navigation pushed on top, leave it
    // (popping would undo that navigation instead).
    if (stateOf(win).hbSheet === entry.id) goBack(win);
  });
}

/**
 * Close a sheet/dialog/drawer with back. Call it inside the component that is mounted
 * while the sheet is open (or pass `open`). Back closes it through `onClose`; closing via
 * UI (button, Escape, scrim) removes the entry again.
 */
export function useBackClosable(onClose: () => void, open = true) {
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  const entryRef = useRef<SheetEntry | null>(null);
  useEffect(() => {
    if (!open) return;
    let entry = entryRef.current;
    if (entry?.releaseTimer !== undefined) {
      // StrictMode/dev remount of the same sheet: keep the entry instead of back+push.
      clearTimeout(entry.releaseTimer);
      entry.releaseTimer = undefined;
    } else {
      entry = openBackEntry(() => closeRef.current());
      entryRef.current = entry;
    }
    const current = entry;
    return () => {
      current.releaseTimer = setTimeout(() => {
        current.releaseTimer = undefined;
        if (entryRef.current === current) entryRef.current = null;
        releaseBackEntry(current);
      }, 0);
    };
  }, [open]);
}

/** Module links use HA's top-level router, including when rendered in an iframe. */
// Panel paths come from custom_components/homebrain/panels.json (shared with the integration):
// a module missing here sent its links to an unknown HA url, which HA answers with the default
// dashboard (Přístup tabs in rc.17).
export const MODULE_PANEL_PATHS: Readonly<Record<string, string>> = {
  ...PANEL_PATHS_BY_MODULE,
  settings: SETTINGS_PANEL_PATH,
  // System signals ('Diagnostika', HA connection) open HomeBrain settings – there is no system panel.
  system: SETTINGS_PANEL_PATH,
};
export function panelUrl(path: string): string {
  const [pathname = '', fragment] = path.split('#');
  const [id = 'today', ...rest] = pathname.replace(/^\//, '').split('/');
  const base = MODULE_PANEL_PATHS[id === 'pocasi' ? 'weather' : id];
  return base
    ? `/${base}${rest.length ? '/' + rest.join('/') : ''}${fragment ? '#' + fragment : ''}`
    : path;
}

/**
 * HA-style navigation (`history.pushState` + `location-changed` on HA's window). Pushed
 * entries remember where they came from (`hbFrom`) and the scroll position is saved on
 * the entry being left. Waits for a pending sheet `back()` so the two cannot race.
 */
export function navigatePanel(path: string, replace = false, extra: HbHistoryState = {}): void {
  const url = panelUrl(path);
  afterPendingBack(() => {
    try {
      const top = window.top;
      if (!top) return;
      try {
        ensureListening();
      } catch {
        // listening is an optimisation for back/scroll; navigation must still happen
      }
      if (replace) {
        const { hbFrom, hbTab } = stateOf(top);
        top.history.replaceState({ hbFrom, hbTab, ...extra }, '', url);
      } else {
        saveScroll(top);
        top.history.pushState({ hbFrom: currentUrl(top), ...extra }, '', url);
      }
      top.dispatchEvent(new CustomEvent('location-changed', { detail: { replace } }));
    } catch {
      // Cross-origin top window (unusual proxy setups): fall back to a full navigation.
      try {
        window.top!.location.href = url;
      } catch {
        window.location.assign(url);
      }
    }
  });
}

/**
 * "Close detail / go up" to `path`: when the current entry was pushed from exactly that
 * URL, go back (no duplicate list entry, back afterwards leaves as expected); after a deep
 * link replace the entry instead.
 */
export function navigateUp(path: string): void {
  const win = hostWindow();
  if (pathOf(stateOf(win).hbFrom) === pathOf(panelUrl(path))) afterPendingBack(() => goBack(win));
  else navigatePanel(path, true);
}

/**
 * Switch a module tab/section kept in the URL. The first switch away from the root tab
 * pushes one entry; further switches replace it; returning to the root tab pops it. Back
 * from any tab therefore lands on the root tab, and a second back leaves the module.
 */
export function navigateTab(path: string, isRootTab: boolean): void {
  const win = hostWindow();
  const state = stateOf(win);
  const onTabEntry = state.hbTab === true;
  // Keep the query (dev scenarios, filters); the tab itself lives in the path.
  const full = path.includes('?') ? path : `${path}${win.location.search}`;
  if (onTabEntry && isRootTab && pathOf(state.hbFrom) === pathOf(panelUrl(path)))
    afterPendingBack(() => goBack(win));
  else if (onTabEntry || isRootTab) navigatePanel(full, true, { hbTab: onTabEntry });
  else navigatePanel(full, false, { hbTab: true });
}

/** Test helper: reset module state between tests. */
export function __resetBackNavigationForTests() {
  stack.length = 0;
  pendingBacks = 0;
  clearTimeout(pendingTimer);
  queued = [];
  listening?.removeEventListener('popstate', onPopState);
  listening = null;
  nextId = 1;
}
