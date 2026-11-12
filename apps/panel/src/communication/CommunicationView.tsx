import { useCallback, useEffect, useState } from 'react';
import {
  getRecentMessages,
  type CommunicationMessage,
  type ModuleViewProps,
} from '@homebrain/ha-client';
import { Button, Card, EmptyState, ErrorState } from '@homebrain/ui';

const statusLabels: Record<CommunicationMessage['status'], string> = {
  sent: 'Předáno službě',
  skipped: 'Přeskočeno',
  failed: 'Selhalo',
  queued: 'Čeká na odeslání',
  duplicate: 'Opakovaná zpráva',
  acknowledged: 'Potvrzeno: Beru',
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
        .comm-view h1 { font-size: 1.5rem; }
        .comm-view ol { list-style: none; padding: 0; display: grid; gap: 12px; }
        .comm-view .hb-card { padding: 16px; overflow-wrap: anywhere; }
        .comm-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: .875rem; opacity: .75; }
        .comm-text { white-space: pre-wrap; }
      `}</style>
      <div className="comm-heading">
        <h1>Komunikační centrum</h1>
        <Button onClick={reload}>Obnovit</Button>
      </div>
      <p>Poslední zprávy a potvrzení. Předání službě ještě nepotvrzuje doručení příjemci.</p>
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
          {messages.map((item) => (
            <li key={item.id}>
              <Card tone={item.priority === 'critical' ? 'critical' : undefined}>
                <div className="comm-meta">
                  <span>{priorityLabels[item.priority]}</span>
                  <span>{item.recipient}</span>
                  <time dateTime={item.at}>{new Date(item.at).toLocaleString('cs-CZ')}</time>
                </div>
                <h2>{item.title}</h2>
                <p className="comm-text">{item.message}</p>
                <div className="comm-meta">
                  <span>{channelLabels[item.channel] ?? item.channel}</span>
                  <strong>{statusLabels[item.status]}</strong>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
