import { Card, czCount } from '@homebrain/ui';
import { fmtNum, fmtT } from '../model.js';
import type { HeatingAdvisor } from '../types.js';

const CONFIDENCE = { low: 'nízká', medium: 'střední', high: 'vysoká' } as const;
const daysText = (n: number) => czCount(n, 'den', 'dny', 'dní');

export function AdvisorCard({ advisor }: { advisor: HeatingAdvisor | null | undefined }) {
  const model = advisor?.model;
  const curve = advisor?.curve;
  return (
    <Card className="ht-card ht-advisor" data-testid="heating-advisor" data-status={curve?.status}>
      <header className="ht-ch">
        <h3>Doporučení</h3>
      </header>
      <p className="ht-insight">{curve?.text ?? 'Doporučení zatím není k dispozici.'}</p>
      {curve && curve.days_used > 0 && (
        <ul className="ht-kv">
          {curve.circuit_duty_pct !== null && (
            <li>
              <span>Topný okruh běžel (průměr za {daysText(curve.days_used)})</span>
              <b>{fmtNum(curve.circuit_duty_pct, 0)} % dne</b>
            </li>
          )}
          {curve.ref_mean !== null && (
            <li>
              <span>Referenční místnost (průměr a cíl)</span>
              <b>
                {fmtT(curve.ref_mean)} / {fmtT(curve.ref_target)}
              </b>
            </li>
          )}
          {curve.attic_min !== null && (
            <li>
              <span>Podkroví (nejméně)</span>
              <b>{fmtT(curve.attic_min)}</b>
            </li>
          )}
        </ul>
      )}
      {model && (
        <>
          <h4>Odhad tepelné ztráty</h4>
          <p className="ht-muted">
            Jistota odhadu je {CONFIDENCE[model.confidence]}. Vychází z {model.days} dnů.
          </p>
          {model.slope_h_per_k !== null && (
            <ul className="ht-kv">
              <li>
                <span>Delší běh kompresoru při poklesu venkovní teploty o 1 °C</span>
                <b>{fmtNum(model.slope_h_per_k, 2)} h/den</b>
              </li>
              <li>
                <span>Odhad venkovní hranice topení</span>
                <b>{fmtT(model.balance_temp)}</b>
              </li>
              <li>
                <span>Shoda modelu s měřením (R²)</span>
                <b>{fmtNum(model.r2, 2)}</b>
              </li>
              {model.heat_loss_wk_low !== null && (
                <>
                  <li>
                    <span>Tepelná ztráta na stupeň</span>
                    <b>
                      {fmtNum(model.heat_loss_wk_low, 0)}–{fmtNum(model.heat_loss_wk_high, 0)} W/K
                    </b>
                  </li>
                  <li>
                    <span>Tepelná ztráta při {fmtT(model.design_temp, 0)}</span>
                    <b>
                      {fmtNum(model.design_loss_kw_low)}–{fmtNum(model.design_loss_kw_high)} kW
                    </b>
                  </li>
                </>
              )}
              {model.seasons.map((season) => (
                <li key={season.season}>
                  <span>
                    Sezóna {season.season} ({daysText(season.days)})
                  </span>
                  <b>
                    {season.slope_h_per_k === null
                      ? 'Málo dat'
                      : `${fmtNum(season.slope_h_per_k, 2)} h/den na 1 °C`}
                  </b>
                </li>
              ))}
            </ul>
          )}
          <p className="ht-muted">
            Odhad ztráty závisí na předpokládaném tepelném výkonu čerpadla
            {model.thermal_kw === null
              ? '. Výkon zatím není zadaný.'
              : ` (${fmtNum(model.thermal_kw)} kW).`}
          </p>
        </>
      )}
      <p className="ht-muted">Do regulace nic nezapisuji – změnu provedete na displeji regulace.</p>
    </Card>
  );
}
