import { useEffect, useId, useRef, useState } from 'react';
import { Button, Icon } from '@homebrain/ui';
import type { CoffeeApi, CoffeeBlock, CoffeeResult } from '../data/coffee.js';

const REASONS: Record<CoffeeBlock | 'send_failed', string> = {
  not_configured: 'Pozvánka na kávu není nastavená',
  script_missing: 'Skript pozvánky v HA chybí',
  tv_off: 'TV v obýváku neběží',
  cooldown: 'Pozvánka běží',
  send_failed: 'Pozvánku se nepodařilo odeslat',
};

export function CoffeeInvite({ api }: { api: CoffeeApi | null }) {
  const statusId = useId();
  const [status, setStatus] = useState<{
    api: CoffeeApi;
    reason: CoffeeBlock | null;
    seconds: number;
  }>();
  const [feedback, setFeedback] = useState<{ api: CoffeeApi; result: CoffeeResult }>();
  const sending = useRef(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!api) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = api.subscribe(({ reason, cooldown_until }) => {
      clearTimeout(timer);
      const deadline = cooldown_until ? Date.parse(cooldown_until) : 0;
      const update = () => {
        const remaining = Math.max(0, deadline - Date.now()) || 0;
        const seconds = Math.ceil(remaining / 1000);
        setStatus({ api, reason, seconds });
        if (seconds > 0) timer = setTimeout(update, remaining - (seconds - 1) * 1000);
      };
      update();
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [api]);

  useEffect(() => {
    if (!feedback?.result.ok) return;
    const timer = setTimeout(() => setFeedback(undefined), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  if (!api || status?.api !== api || status.reason === 'not_configured') return null;

  const result = feedback?.api === api ? feedback.result : undefined;
  const seconds = status.reason === 'cooldown' ? status.seconds : 0;
  const reason = status.reason ?? (pending ? 'cooldown' : null);
  const countdown = !result?.ok && seconds > 0;
  const error = result?.ok === false && !reason;
  let message = reason ? REASONS[reason] : null;
  if (result?.ok) message = '✓ Pozvánka odeslána na TV';
  else if (countdown) message = `Znovu za ${seconds} s`;
  else if (error) message = `${REASONS[result.reason]}. Zkusit znovu.`;

  async function invite(api: CoffeeApi) {
    if (reason || sending.current) return;
    sending.current = true;
    setPending(true);
    setFeedback(undefined);
    try {
      setFeedback({ api, result: await api.invite() });
    } catch {
      setFeedback({ api, result: { ok: false, reason: 'send_failed' } });
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return (
    <div className="today-coffee" data-error={error || undefined}>
      <Button
        icon={
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            data-hb-icon=""
            focusable="false"
          >
            <path d="M3 8h13v6a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zM16 9h2.5a2.5 2.5 0 0 1 0 5H16M2 22h17M7 2v3m5-3v3" />
          </svg>
        }
        onClick={() => void invite(api)}
        disabled={Boolean(reason)}
        aria-describedby={message ? statusId : undefined}
      >
        Pozvat na kávu
      </Button>
      <span
        id={statusId}
        className="today-coffee-status"
        role={error ? 'alert' : 'status'}
        aria-live={countdown ? 'off' : undefined}
        data-success={result?.ok || undefined}
        data-countdown={countdown || undefined}
        hidden={!message}
      >
        {error && <Icon name="alert" size={16} />}
        {message}
      </span>
    </div>
  );
}
