import { Card, Pill, ProgressRing } from '@homebrain/ui';
import { fmtNum, fmtT, roomsModel } from '../../model.js';
import type { HeatingSnapshot } from '../../types.js';

export function RoomsTab({ snap }: { snap: HeatingSnapshot }) {
  const m = roomsModel(snap);
  const h = snap.house;
  return (
    <>
      <Card className="ht-ref" tone="calm" data-testid="heating-ref-room">
        <div>
          <div className="ht-pills">
            <Pill tone="accent">Referenční místnost · chodba</Pill>
            <Pill tone={h.circuit_on ? 'ok' : 'neutral'} dot data-testid="heating-circuit">
              {h.circuit_on ? 'Okruh domu topí' : 'Okruh domu stojí'}
            </Pill>
          </div>
          <p className="ht-big">
            {fmtT(h.ref_temp).replace(/\u202f°C$/u, '')}
            <small>{'\u202f°C'}</small>
          </p>
          <p className="ht-hero-sub">
            čidlo regulace TČ · cíl {fmtT(h.ref_target_effective ?? h.ref_target)} · hystereze{' '}
            {fmtNum(h.hysteresis)}
            {'\u202f°C'}
          </p>
          <p className="ht-hero-detail">
            Chodba řídí topení celého domu. Když dosáhne cílové teploty, čerpadlo topení se zastaví
            – i když je v jiném pokoji chladněji.
          </p>
        </div>
        <div className="ht-ref-notes">
          {m.rows.length === 0 && (
            <div className="ht-bind-help" data-testid="heating-rooms-empty">
              <h3>Přidejte přehled o pokojích</h3>
              <p>Uvidíte, kde je teplo a kde ještě přitopit.</p>
              <ol>
                <li>Spárujte teploměry Aqara nebo termostatické hlavice přes Zigbee2MQTT.</li>
                <li>
                  V Nastavení HomeBrain → Moduly → Topení vyberte čidla a hlavice pro jednotlivé
                  pokoje.
                </li>
              </ol>
              <p>Stačí i samotný teploměr. Pokoje se pak seřadí od nejchladnějšího.</p>
            </div>
          )}
          {m.insight && (
            <Card tone="notice" className="ht-note" data-testid="heating-rooms-insight">
              <b>Nejchladnější místnost</b>
              <p>{m.insight}</p>
            </Card>
          )}
          {m.throttle && (
            <Card tone="warning" className="ht-note" data-testid="heating-rooms-throttle">
              <b>Hlavice přiškrcují průtok</b>
              <p>{m.throttle}</p>
            </Card>
          )}
          {!m.insight && !m.throttle && m.rows.length > 0 && (
            <p className="ht-muted">Všechny místnosti jsou blízko cíle.</p>
          )}
        </div>
      </Card>
      {m.rows.length > 0 && (
        <Card className="ht-card" data-testid="heating-rooms">
          <header className="ht-ch">
            <h3>Místnosti</h3>
            <span className="ht-muted">
              podle odchylky od cíle · teplota · ventil hlavice · vlhkost
            </span>
          </header>
          <ul className="ht-rooms">
            {m.rows.map((r) => {
              const pos = r.delta === null ? 0.5 : Math.max(0, Math.min(1, 0.5 + r.delta / 4));
              return (
                <li
                  key={r.id}
                  data-testid="heating-room"
                  data-coldest={m.coldest?.id === r.id ? '' : undefined}
                >
                  <div className="ht-room-name">
                    <b>{r.name}</b>
                    <span className="ht-muted">{r.source === 'trv' ? 'hlavice' : 'čidlo'}</span>
                    {r.window_open && (
                      <Pill tone="warn" size="sm">
                        okno otevřeno
                      </Pill>
                    )}
                    {r.battery !== null && r.battery < 20 && (
                      <Pill tone="warn" size="sm">
                        baterie {fmtNum(r.battery, 0)}&nbsp;%
                      </Pill>
                    )}
                  </div>
                  <div className="ht-room-temp">
                    <b>{fmtT(r.temp)}</b>
                    <span className="ht-muted">
                      {r.target === null
                        ? 'bez cíle'
                        : `cíl ${fmtT(r.target, 0)} · ${r.delta! > 0 ? '+' : ''}${fmtNum(r.delta)}\u202f°C`}
                    </span>
                    <span
                      className="ht-track"
                      aria-hidden="true"
                      data-empty={r.delta === null ? '' : undefined}
                    >
                      <i
                        data-cold={r.delta !== null && r.delta < -0.3 ? '' : undefined}
                        style={{ left: `${pos * 100}%` }}
                      />
                    </span>
                  </div>
                  <div className="ht-room-valve">
                    {r.valve_pct !== null ? (
                      <ProgressRing
                        value={r.valve_pct / 100}
                        size={44}
                        tone="accent"
                        label={`Ventil ${r.valve_pct} %`}
                      >
                        <small>{fmtNum(r.valve_pct, 0)}&nbsp;%</small>
                      </ProgressRing>
                    ) : (
                      <span className="ht-muted" title="bez hlavice">
                        —
                      </span>
                    )}
                  </div>
                  <div className="ht-room-hum">
                    <span className="ht-k">vlhkost</span>
                    <b>{r.humidity === null ? '–' : `${fmtNum(r.humidity, 0)}\u00a0%`}</b>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
