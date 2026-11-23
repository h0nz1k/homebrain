import { useEffect, useId, useRef, useState } from 'react';
import { Button, toast } from '@homebrain/ui';
import type { CoffeeApi, CoffeeBlock } from '../data/coffee.js';

const REASONS: Record<CoffeeBlock | 'send_failed', string> = {
  not_configured: 'Pozvánka na kávu není nastavená',
  script_missing: 'Skript pozvánky v HA chybí',
  tv_off: 'TV v obýváku neběží',
  cooldown: 'Pozvánka běží',
  send_failed: 'Pozvánku se nepodařilo odeslat',
};
const TOAST_ID = 'today-coffee-invite';

export function CoffeeInvite({ api }: { api: CoffeeApi | null }) {
  const reasonId = useId();
  const [status, setStatus] = useState<{
    api: CoffeeApi;
    reason: CoffeeBlock | null;
  }>();
  const sending = useRef(false);
  const [pending, setPending] = useState(false);

  useEffect(() => api?.subscribe((reason) => setStatus({ api, reason })), [api]);

  if (!api || status?.api !== api || status.reason === 'not_configured') return null;
  const reason = status.reason ? REASONS[status.reason] : pending ? REASONS.cooldown : null;

  async function invite(api: CoffeeApi) {
    if (reason || sending.current) return;
    sending.current = true;
    setPending(true);
    try {
      const result = await api.invite();
      if (result.ok) toast.success('Pozvánka odeslána na TV.', { id: TOAST_ID });
      else toast.error(`${REASONS[result.reason]}.`, { id: TOAST_ID });
    } catch {
      toast.error(`${REASONS.send_failed}.`, { id: TOAST_ID });
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return (
    <div className="today-coffee">
      <Button
        onClick={() => void invite(api)}
        disabled={Boolean(reason)}
        aria-describedby={reason ? reasonId : undefined}
      >
        Pozvat na kávu
      </Button>
      {reason && <span id={reasonId}>{reason}</span>}
    </div>
  );
}
