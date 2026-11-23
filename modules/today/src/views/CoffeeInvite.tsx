import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@homebrain/ui';
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
  let message = reason ? REASONS[reason] : null;
  if (result?.ok) message = '✓ Pozvánka odeslána na TV';
  else if (countdown) message = `Znovu za ${seconds} s`;
  else if (result && !reason) message = REASONS[result.reason];

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
    <div className="today-coffee">
      <Button
        icon="☕"
        onClick={() => void invite(api)}
        disabled={Boolean(reason)}
        aria-describedby={message ? statusId : undefined}
      >
        Pozvat na kávu
      </Button>
      <span
        id={statusId}
        className="today-coffee-status"
        role="status"
        aria-live={countdown ? 'off' : 'polite'}
        data-success={result?.ok || undefined}
        hidden={!message}
      >
        {message}
      </span>
    </div>
  );
}
