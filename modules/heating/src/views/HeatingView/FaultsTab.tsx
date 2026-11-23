import { Card, Pill, czCount } from '@homebrain/ui';
import { fmtNum } from '../../model.js';
import type { HeatingSnapshot } from '../../types.js';

function alertSince(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

export function FaultsTab({ snap }: { snap: HeatingSnapshot }) {
  const f = snap.faults;
  const critical = f.fatal || f.compressor_block;
  const alerts = snap.alerts ?? [];
  return (
    <>
      {alerts.length > 0 && (
        <Card className="ht-card" data-testid="heating-alerts-list">
          <header className="ht-ch">
            <h3>Upozornění</h3>
          </header>
          <ul className="ht-alerts">
            {alerts.map((a) => (
              <li key={a.id} data-severity={a.severity}>
                <strong>{a.title}</strong>
                <p>{a.body}</p>
                <span className="ht-muted">od {alertSince(a.since)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {f.active.length === 0 && !critical ? (
        <Card className="ht-hero ht-ok" tone="calm" data-testid="heating-faults-ok">
          <div className="ht-hero-copy">
            <Pill tone="ok" dot>
              Bez poruch
            </Pill>
            <h2>Vše v pořádku.</h2>
            <p className="ht-hero-detail">
              Regulace hlídá{' '}
              {czCount(f.monitored, 'čidlo a ochranu', 'čidla a ochrany', 'čidel a ochran')} –
              tlaky, teploty, průtok i kompresor. Jakmile se něco stane, uvidíte to tady i ve Dnes.
            </p>
          </div>
        </Card>
      ) : f.active.length > 0 ? (
        <div className="ht-faults">
          {f.active.map((x) => (
            <Card
              key={x.key}
              tone={critical ? 'critical' : 'warning'}
              className="ht-fault"
              data-testid="heating-fault"
            >
              <Pill tone={critical ? 'crit' : 'warn'} dot>
                {f.fatal ? 'Porucha – topení stojí' : 'Porucha'}
              </Pill>
              <h2>{x.label}</h2>
              {x.since && (
                <p className="ht-muted">
                  od{' '}
                  {new Date(x.since).toLocaleString('cs-CZ', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: 'numeric',
                    month: 'numeric',
                  })}
                </p>
              )}
              {critical ? (
                <>
                  <p>
                    {f.compressor_block
                      ? 'Kompresor je zablokovaný, aby se nepoškodil. '
                      : 'Regulace kompresor hlídá a podle potřeby ho sama zastaví. '}
                    {!snap.backup_heater.available
                      ? ''
                      : snap.backup_heater.on
                        ? 'Dům teď hřeje záložní elektrické topení – je to dražší, ale doma bude teplo. '
                        : 'Kdyby kompresor stál dlouho, zapne se záložní elektrické topení. '}
                  </p>
                  <p>
                    <b>Co dělat:</b> nic neresetujte. Pokud porucha nezmizí do hodiny nebo se
                    opakuje, zavolejte servis tepelného čerpadla a řekněte mu text poruchy.
                  </p>
                </>
              ) : (
                <p>Potvrďte poruchu na panelu čerpadla.</p>
              )}
            </Card>
          ))}
        </div>
      ) : null}
      <Card className="ht-card">
        <header className="ht-ch">
          <h3>Co hlídáme</h3>
        </header>
        <ul className="ht-kv">
          <li>
            <span>Poruchové lampy regulace</span>
            <b>{f.monitored}</b>
          </li>
          <li>
            <span>Blokace kompresoru</span>
            <b data-on={f.compressor_block ? '' : undefined}>{f.compressor_block ? 'ano' : 'ne'}</b>
          </li>
          {snap.backup_heater.available && (
            <li>
              <span>Záložní elektrické topení</span>
              <b>{snap.backup_heater.on ? 'hřeje' : 'vypnuto (zapne se jen při poruše)'}</b>
            </li>
          )}
          <li>
            <span>Motohodiny kompresoru</span>
            <b>{fmtNum(snap.heat_pump.motohours, 0)}&nbsp;h</b>
          </li>
        </ul>
      </Card>
    </>
  );
}
