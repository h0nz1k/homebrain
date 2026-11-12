import { useCallback, useEffect, useState } from 'react';
import {
  getRecentMessages,
  type CommunicationMessage,
  type ModuleViewProps,
} from '@homebrain/ha-client';
import { Button, Card, EmptyState, ErrorState, Pill } from '@homebrain/ui';

const statusLabels: Record<CommunicationMessage['status'], string> = {
  sent: 'Předáno službě',
  skipped: 'Přeskočeno',
  failed: 'Selhalo',
  queued: 'Čeká na odeslání',
  duplicate: 'Opakovaná zpráva',
  acknowledged: 'Potvrzeno – odpověď „Beru“',
  digested: 'Zahrnuto v souhrnu',
};
const channelLabels: Record<string, string> = {
  push: 'Telefon',
  todo: 'Úkol',
  tts: 'Hlášení',
  telegram: 'Telegram',
  email: 'E-mail',
  router: 'Směrování',
};
const priorityLabels: Record<CommunicationMessage['priority'], string> = {
  info: 'Informace',
  normal: 'Běžná',
  high: 'Důležitá',
  critical: 'Kritická',
};

const recipientLabels: Record<string, string> = {
  demo: 'Ukázkový příjemce',
  other: 'Další příjemce',
  household: 'Domácnost',
};
const priorityTones = {
  info: 'neutral',
  normal: 'accent',
  high: 'warn',
  critical: 'crit',
} as const;
const timeFormat = new Intl.DateTimeFormat('cs-CZ', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
function delivery(item: CommunicationMessage) {
  if (item.status === 'acknowledged')
    return { tone: 'ok', icon: '✓', label: statusLabels.acknowledged } as const;
  if (item.status === 'failed')
    return { tone: 'crit', icon: '!', label: statusLabels.failed } as const;
  if (item.pending_ack) return { tone: 'warn', icon: '◷', label: 'Čeká na potvrzení' } as const;
  return { tone: 'neutral', icon: '○', label: statusLabels[item.status] ?? 'Ostatní' } as const;
}

export default function CommunicationView({ connection }: ModuleViewProps) {
  const [snapshot, setSnapshot] = useState<{
    connection: ModuleViewProps['connection'];
    messages: CommunicationMessage[] | null;
    failed: boolean;
  }>({ connection, messages: null, failed: false });
  const messages = snapshot.connection === connection ? snapshot.messages : null;
  const failed = snapshot.connection === connection && snapshot.failed;
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => {
    setSnapshot({ connection, messages: null, failed: false });
    setRefresh((n) => n + 1);
  }, [connection]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const recent = connection ? await getRecentMessages(connection) : await Promise.resolve([]);
        if (active) setSnapshot({ connection, messages: recent, failed: false });
      } catch {
        if (active) setSnapshot({ connection, messages: null, failed: true });
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [connection, refresh]);
  return (
    <div className="comm-view">
      <style>{`
        .comm-view { padding: clamp(12px, 3vw, 32px); max-width: 960px; margin: auto; }
        .comm-heading { display: flex; align-items: center; gap: 16px; justify-content: space-between; }
        .comm-view { color: var(--hb-t1); }
        .comm-view h1 { font-size: 1.5rem; margin: 0; }
        .comm-view h2 { font-size: 1.125rem; font-weight: 600; margin: 14px 0 8px; color: var(--hb-t1); }
        .comm-intro { color: var(--hb-t2); line-height: 1.6; margin: 10px 0 24px; }
        .comm-priority { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
        .comm-footer { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
        .comm-view ol { list-style: none; padding: 0; display: grid; gap: 12px; }
        .comm-view .hb-card { padding: 16px; overflow-wrap: anywhere; }
        .comm-meta { display: flex; flex-wrap: wrap; gap: 6px; font-size: .8125rem; color: var(--hb-t2); align-items: center; }
        .comm-meta > * + *::before { content: "·"; margin-right: 6px; }
        .comm-text { white-space: pre-wrap; line-height: 1.6; margin: 0; }
      `}</style>
      <div className="comm-heading">
        <h1>Zprávy</h1>
        <Button onClick={reload}>
          <span aria-hidden="true">↻</span> Obnovit
        </Button>
      </div>
      <p className="comm-intro">
        Poslední zprávy a potvrzení. Předání službě ještě nepotvrzuje doručení příjemci.
      </p>
      {failed ? (
        <ErrorState title="Zprávy se nepodařilo načíst" onRetry={reload}>
          Zkontrolujte připojení a oprávnění správce.
        </ErrorState>
      ) : messages === null ? (
        <p role="status">Načítání zpráv…</p>
      ) : messages.length === 0 ? (
        <EmptyState title="Zatím žádné zprávy">
          Nové zprávy se tu objeví po odeslání přes HomeBrain.
        </EmptyState>
      ) : (
        <ol aria-label="Poslední zprávy">
          {messages.map((item) => {
            const status = delivery(item);
            return (
              <li key={item.id}>
                <Card tone={item.priority === 'critical' ? 'critical' : undefined}>
                  <div className="comm-priority">
                    <Pill tone={priorityTones[item.priority] ?? 'neutral'} size="sm">
                      {priorityLabels[item.priority] ?? 'Ostatní'}
                    </Pill>
                    <div className="comm-meta">
                      {recipientLabels[item.recipient] ? (
                        <span>{recipientLabels[item.recipient]}</span>
                      ) : null}
                      <time dateTime={item.at}>{timeFormat.format(new Date(item.at))}</time>
                    </div>
                  </div>
                  <h2>{item.title}</h2>
                  <p className="comm-text">{item.message}</p>
                  <div className="comm-footer">
                    <Pill tone={status.tone} icon={status.icon} size="sm">
                      {status.label}
                    </Pill>
                    <span className="comm-meta">{channelLabels[item.channel] ?? 'Ostatní'}</span>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
