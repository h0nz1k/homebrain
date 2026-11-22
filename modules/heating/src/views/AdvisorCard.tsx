import { Card, czCount } from '@homebrain/ui';
import { fmtNum, fmtT } from '../model.js';
import type { HeatingAdvisor } from '../types.js';

const CONFIDENCE = { low: 'nízká', medium: 'střední', high: 'vysoká' } as const;
const daysText = (n: number) => czCount(n, 'den', 'dny', 'dní').replace(' ', '\u00a0');

export function AdvisorCards({ advisor }: { advisor: HeatingAdvisor | null | undefined }) {
  const curve = advisor?.curve;
  return (
    <div className="ht-advisor-cards">
      <Card className="ht-card" data-testid="heating-advisor" data-status={curve?.status}>
        <header className="ht-ch">
          <h3>Doporučení</h3>
        </header>
        <p className="ht-insight ht-advisor-callout">
          {curve?.text ?? 'Doporučení zatím není k dispozici.'}
        </p>
        {curve && curve.days_used > 0 && (
          <ul className="ht-kv">
            {curve.circuit_duty_pct !== null && (
              <li>
                <span>Běh topného okruhu (průměr za {daysText(curve.days_used)})</span>
                <b>
                  {fmtNum(curve.circuit_duty_pct, 0)}
                  {'\u00a0% času'}
                </b>
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
        <footer className="ht-muted ht-advisor-notes">Změnu proveďte na displeji regulace.</footer>
      </Card>
      {advisor?.model && <HeatLossCard model={advisor.model} />}
    </div>
  );
}

function HeatLossCard({ model }: { model: HeatingAdvisor['model'] }) {
  return (
    <Card className="ht-card" data-testid="heating-heat-loss">
      <header className="ht-ch">
        <h3>Tepelná ztráta</h3>
      </header>
      <p className="ht-muted">
        {model.days === 0
          ? 'Pro odhad tepelné ztráty zatím chybí data.'
          : `Jistota odhadu je ${CONFIDENCE[model.confidence]}.`}
        {model.days > 0 && model.slope_h_per_k === null
          ? ` Odhad vychází z údajů za ${daysText(model.days)}.`
          : null}
      </p>
      {model.slope_h_per_k !== null && (
        <>
          <ul className="ht-kv">
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
                    {fmtNum(model.heat_loss_wk_low, 0)}–{fmtNum(model.heat_loss_wk_high, 0)}
                    {'\u00a0W/K'}
                  </b>
                </li>
                <li>
                  <span>Tepelná ztráta při {fmtT(model.design_temp, 0)}</span>
                  <b>
                    {fmtNum(model.design_loss_kw_low)}–{fmtNum(model.design_loss_kw_high)}
                    {'\u00a0kW'}
                  </b>
                </li>
              </>
            )}
          </ul>
          <div className="ht-advisor-runtime">
            <h4>Prodloužení běhu kompresoru při ochlazení venku o 1{'\u00a0°C'}</h4>
            <ul className="ht-kv">
              <li>
                <span>Celkem za {daysText(model.days)}</span>
                <b>
                  {fmtNum(model.slope_h_per_k, 2)}
                  {'\u00a0h/den'}
                </b>
              </li>
              {model.seasons.map((season) => (
                <li key={season.season}>
                  <span>
                    Sezóna {season.season} ({daysText(season.days)})
                  </span>
                  <b>
                    {season.slope_h_per_k === null
                      ? 'Málo dat'
                      : `${fmtNum(season.slope_h_per_k, 2)}\u00a0h/den`}
                  </b>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <footer className="ht-muted ht-advisor-notes">
        {model.days > 0 && (
          <p>Odhad je orientační. Doba běhu kompresoru zahrnuje i ohřev teplé vody.</p>
        )}
        <p>
          Odhad ztráty závisí na předpokládaném tepelném výkonu čerpadla
          {model.thermal_kw === null
            ? '. Výkon zatím není zadaný. Zadejte ho v nastavení HomeBrain → Topení.'
            : ` (${fmtNum(model.thermal_kw)}\u00a0kW).`}
        </p>
      </footer>
    </Card>
  );
}
