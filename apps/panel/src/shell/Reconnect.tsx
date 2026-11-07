import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@homebrain/ui';

/** Short blips (HA reconnects within a second) must not flash a full-screen overlay. */
export const RECONNECT_GRACE_MS = 2_000;
const MAX_DELAY_MS = 30_000;

/** Exponential backoff for the kiosk's own reconnect attempts: 2, 4, 8, 16, 30, 30 … s. */
export function retryDelayMs(attempt: number): number {
  return Math.min(MAX_DELAY_MS, 2_000 * 2 ** Math.max(0, attempt));
}

/**
 * Kiosk only: after an HA restart the wall tablet shows a calm overlay instead of stale data
 * pretending to be live, keeps retrying on its own and disappears once the WS is back – no reload.
 */
export function ConnectionLostOverlay({
  connected,
  reconnect,
}: {
  connected: boolean;
  /** `Connection.reconnect(true)` of home-assistant-js-websocket (HA also retries by itself). */
  reconnect?: () => void;
}) {
  const titleId = useId();
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [nextAt, setNextAt] = useState(0);
  const [now, setNow] = useState(0);
  const reconnectRef = useRef(reconnect);
  useEffect(() => {
    reconnectRef.current = reconnect;
  }, [reconnect]);

  // Grace period, then show; reset everything as soon as the connection is back.
  useEffect(() => {
    if (connected) return;
    const t = window.setTimeout(() => {
      const at = Date.now();
      setVisible(true);
      setAttempt(0);
      setNow(at);
      setNextAt(at + retryDelayMs(0));
    }, RECONNECT_GRACE_MS);
    return () => {
      window.clearTimeout(t);
      setVisible(false);
    };
  }, [connected]);

  // Auto-retry with backoff while the overlay is shown.
  useEffect(() => {
    if (connected || !visible) return;
    const t = window.setTimeout(
      () => {
        const at = Date.now();
        reconnectRef.current?.();
        setAttempt((n) => n + 1);
        setNow(at);
        setNextAt(at + retryDelayMs(attempt + 1));
      },
      Math.max(0, nextAt - Date.now()),
    );
    return () => window.clearTimeout(t);
  }, [connected, visible, attempt, nextAt]);

  // Countdown text (1 s tick, no animation – kiosk e2e checks that nothing runs forever).
  useEffect(() => {
    if (connected || !visible) return;
    const t = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(t);
  }, [connected, visible]);

  if (connected || !visible) return null;
  const seconds = Math.max(1, Math.ceil((nextAt - now) / 1000));
  return (
    <div className="hb-reconnect" data-testid="kiosk-reconnect">
      <div
        className="hb-reconnect-card"
        role="alertdialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-live="polite"
      >
        <span className="hb-reconnect-dot" aria-hidden="true" />
        <h2 id={titleId}>Spojení s Home Assistantem se přerušilo</h2>
        <p>
          Nejspíš se restartuje. Připojím se znovu sám a obrazovka se vrátí bez obnovení stránky.
        </p>
        <p className="hb-reconnect-meta" data-testid="kiosk-reconnect-status">
          {attempt > 0 ? `pokus ${attempt} · ` : ''}další pokus za {seconds} s
        </p>
        <Button
          size="lg"
          onClick={() => {
            const at = Date.now();
            reconnectRef.current?.();
            setAttempt((n) => n + 1);
            setNow(at);
            setNextAt(at + retryDelayMs(attempt + 1));
          }}
        >
          Zkusit hned
        </Button>
      </div>
    </div>
  );
}

/** ADR-0002 §7: the wall tablet must run as a dedicated non-admin user. Admin-facing text. */
export function KioskAdminWarning() {
  return (
    <p className="hb-kiosk-admin" role="alert" data-testid="kiosk-admin-warning">
      <b>Kiosk je přihlášen jako administrátor.</b> Kdokoli u tabletu má plný přístup k Home
      Assistantu. Přihlaste tablet vlastním uživatelem bez administrátorských práv a v Nastavení
      HomeBrain mu přiřaďte roli Kiosk.
    </p>
  );
}
