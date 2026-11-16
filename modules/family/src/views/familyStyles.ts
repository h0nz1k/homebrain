export const familyStyles = `
.fam { color: var(--hb-t1); max-width: 1440px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--hb-sp-4); }
.fam * { box-sizing: border-box; }
.fam h1, .fam h2, .fam h3, .fam p, .fam ul { margin: 0; padding: 0; }
.fam ul { list-style: none; }
.fam :where(button) { color: inherit; font: inherit; }
.fam-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 14px; }
.fam-presence { flex-basis: 100%; margin-top: 6px; }
.fam-head h1 { font-size: var(--hb-type-headline); letter-spacing: -0.01em; font-weight: 650; }
.fam-head p { color: var(--hb-t2); font-size: var(--hb-type-body); }
.fam-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: var(--hb-sp-4); align-items: start; }
.fam-col { display: flex; flex-direction: column; gap: var(--hb-sp-4); min-width: 0; }
.fam-card { padding: var(--hb-sp-5); }
.fam-card-h { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.fam-card-h h2 { font-size: var(--hb-type-title); font-weight: 650; letter-spacing: -0.005em; }
.fam-card-h .fam-meta { margin-left: auto; color: var(--hb-t2); font-size: var(--hb-type-caption); }
/* Dnes v rodině */
.fam-next { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border-radius: var(--hb-radius-md);
  background: linear-gradient(135deg, color-mix(in srgb, var(--fam-src, var(--hb-ac)) 16%, var(--hb-s1)), var(--hb-s1));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fam-src, var(--hb-ac)) 22%, transparent); margin-bottom: 12px; }
.fam-next small { color: var(--hb-t2); font-size: var(--hb-type-caption); font-weight: 600; }
.fam-next strong { font-size: 22px; font-weight: 650; letter-spacing: -0.01em; }
.fam-next span { color: var(--hb-t2); font-size: var(--hb-type-body); }
.fam-events { display: flex; flex-direction: column; }
.fam-ev { display: grid; grid-template-columns: 92px 4px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--hb-edge); }
.fam-ev:first-child { border-top: 0; }
.fam-ev time { font-variant-numeric: tabular-nums; font-weight: 600; font-size: var(--hb-type-body); }
.fam-ev time small { display: block; color: var(--hb-t2); font-weight: 500; font-size: var(--hb-type-caption); }
.fam-ev i { align-self: stretch; border-radius: 4px; background: var(--fam-src); min-height: 30px; }
.fam-ev b { font-weight: 600; font-size: var(--hb-type-body); display: block; overflow-wrap: anywhere; }
.fam-ev p { color: var(--hb-t2); font-size: var(--hb-type-caption); }
.fam-ev[data-past] time, .fam-ev[data-past] b { color: var(--hb-t2); font-weight: 500; }
.fam-ev[data-past] i { background: color-mix(in srgb, var(--fam-src) 35%, transparent); }
.fam-ev-t { display: flex; align-items: center; gap: 10px; min-width: 0; }
.fam-ev-t > div { min-width: 0; }
.fam-next-t { display: flex; align-items: center; gap: 10px; min-width: 0; }
.fam-who { display: inline-flex; flex: 0 0 auto; }
.fam-who .fam-avatar-sm + .fam-avatar-sm { margin-left: -6px; }
.fam-avatar.fam-avatar-sm { width: 26px; height: 26px; flex: 0 0 26px; font-size: 13px; box-shadow: 0 0 0 2px var(--hb-s1); }
.fam-legend { margin-left: auto; display: flex; gap: 12px; color: var(--hb-t2); font-size: var(--hb-type-caption); }
.fam-legend span { display: inline-flex; align-items: center; gap: 6px; }
.fam-legend span::before { content: ''; width: 10px; height: 10px; border-radius: 3px; background: var(--fam-src); }
.fam-src { font-size: 13px; font-weight: 650; padding: 3px 9px; border-radius: 99px; white-space: nowrap;
  color: color-mix(in srgb, var(--fam-src) 80%, var(--hb-t1)); background: color-mix(in srgb, var(--fam-src) 14%, transparent); }
.fam-days { display: flex; flex-direction: column; gap: 2px; }
.fam-day { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 12px; padding: 10px 0; border-top: 1px solid var(--hb-edge); }
.fam-day:first-child { border-top: 0; }
.fam-day > div:first-child b { display: block; font-size: var(--hb-type-body); font-weight: 650; }
.fam-day > div:first-child small { color: var(--hb-t2); font-size: var(--hb-type-caption); }
.fam-day ul { display: flex; flex-direction: column; gap: 6px; }
.fam-day li { display: flex; align-items: baseline; gap: 8px; font-size: var(--hb-type-body); min-width: 0; }
.fam-day li::before { content: ''; flex: 0 0 8px; height: 8px; border-radius: 50%; background: var(--fam-src); transform: translateY(-1px); }
.fam-day li em { font-style: normal; min-width: 0; overflow-wrap: anywhere; }
.fam-day li .fam-who { align-self: center; }
.fam-day li > span:not(.fam-who) { color: var(--hb-t2); font-variant-numeric: tabular-nums; font-size: var(--hb-type-caption); white-space: nowrap; }
.fam-day li[data-allday] { font-weight: 600; }
.fam-free { color: var(--hb-t2); font-size: var(--hb-type-caption); }
/* Povinnosti */
.fam-kids { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.fam-kid { border-radius: var(--hb-radius-md); padding: 14px; background: color-mix(in srgb, var(--hb-t1) 4%, var(--hb-s1)); box-shadow: inset 0 0 0 1px var(--hb-edge); }
.fam-kid-h { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.fam-avatar { width: 40px; height: 40px; flex: 0 0 40px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 17px;
  color: #fff; background: linear-gradient(140deg, var(--fam-kid), color-mix(in srgb, var(--fam-kid) 60%, #000)); }
.fam-kid-h b { font-size: var(--hb-type-lead); font-weight: 650; display: block; }
.fam-kid-h small { color: var(--hb-t2); font-size: var(--hb-type-caption); }
.fam-points { margin-left: auto; text-align: right; }
.fam-points strong { color: var(--hb-ok); font-size: 24px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.fam-points small { display: block; color: var(--hb-t2); font-size: var(--hb-type-caption); font-weight: 600; }
.fam-points em { display: block; font-style: normal; color: var(--hb-warn); font-weight: 650; }
.fam-kid-h small span { white-space: nowrap; }
.fam-meta[data-tone='warn'] { color: var(--hb-warn) !important; font-weight: 650; }
.fam-bar { display: flex; height: 8px; border-radius: 99px; background: color-mix(in srgb, var(--hb-t1) 9%, transparent); overflow: hidden; margin-bottom: 8px; }
.fam-bar i { display: block; height: 100%; background: var(--fam-kid); }
.fam-bar i[data-pending] { background: color-mix(in srgb, var(--hb-warn) 55%, transparent); }
.fam-chores { display: flex; flex-direction: column; }
.fam-chore { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 6px 0; border-top: 1px solid var(--hb-edge); }
.fam-chore:first-child { border-top: 0; }
.fam-check { flex: 0 0 34px; width: 34px; height: 34px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--hb-t1) 28%, transparent);
  background: transparent; display: grid; place-items: center; cursor: pointer; padding: 0; }
.fam-check svg { width: 18px; height: 18px; opacity: 0; }
.fam-chore[data-state='done'] .fam-check { background: var(--hb-ok); border-color: var(--hb-ok); color: #fff; }
.fam-chore[data-state='done'] .fam-check svg, .fam-chore[data-state='claimed'] .fam-check svg { opacity: 1; }
.fam-chore[data-state='claimed'] .fam-check { border-color: var(--hb-warn); color: var(--hb-warn); }
.fam-chore-t { min-width: 0; flex: 1; }
.fam-chore-t b { display: block; font-weight: 600; font-size: var(--hb-type-body); }
.fam-chore[data-state='done'] .fam-chore-t b { color: var(--hb-t2); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--hb-t2) 60%, transparent); }
.fam-chore-t small { color: var(--hb-t2); font-size: var(--hb-type-caption); }
.fam-chore-t small[data-tone='warn'] { color: var(--hb-warn); font-weight: 600; }
.fam-chore-t small[data-tone='crit'] { color: var(--hb-crit); font-weight: 600; }
.fam-pts { font-size: 13px; font-weight: 650; font-variant-numeric: tabular-nums; color: var(--hb-t2); white-space: nowrap; }
.fam-chore-t .fam-approve { margin-top: 6px; }
.fam-approve { font-size: 13px; font-weight: 650; border: 0; border-radius: 99px; padding: 7px 12px; cursor: pointer;
  background: color-mix(in srgb, var(--hb-ok) 16%, transparent); color: var(--hb-ok) !important; white-space: nowrap; }
.fam-allgood { display: flex; align-items: center; gap: 8px; color: var(--hb-ok); font-weight: 600; font-size: var(--hb-type-caption); padding: 6px 0 2px; }
/* Nákup */
.fam-add { display: flex; gap: 8px; margin-bottom: 10px; }
.fam-add input { flex: 1; min-width: 0; height: 44px; border-radius: 12px; border: 0; padding: 0 14px; font: inherit; font-size: var(--hb-type-body); color: var(--hb-t1);
  background: color-mix(in srgb, var(--hb-t1) 6%, var(--hb-s1)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hb-t1) 12%, transparent); }
.fam-add button { height: 44px; border: 0; border-radius: 12px; padding: 0 18px; font-weight: 650; background: var(--hb-ac); color: #fff !important; cursor: pointer; }
.fam-items { display: flex; flex-direction: column; }
.fam-item { display: flex; align-items: center; gap: 12px; min-height: 46px; border-top: 1px solid var(--hb-edge); font-size: var(--hb-type-body); }
.fam-item:first-child { border-top: 0; }
.fam-box { flex: 0 0 24px; width: 24px; height: 24px; border-radius: 7px; border: 2px solid color-mix(in srgb, var(--hb-t1) 30%, transparent); display: grid; place-items: center; background: none; padding: 0; cursor: pointer; }
.fam-box svg { width: 14px; height: 14px; opacity: 0; }
.fam-item[data-done] { color: var(--hb-t2); }
.fam-item[data-done] span { text-decoration: line-through; }
.fam-item[data-done] .fam-box { background: color-mix(in srgb, var(--hb-t2) 30%, transparent); border-color: transparent; color: var(--hb-t1); }
.fam-item[data-done] .fam-box svg { opacity: 1; }
.fam-item span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.fam-done-h { color: var(--hb-t2); font-size: var(--hb-type-caption); font-weight: 600; padding: 16px 0 4px; }
/* phone */
@media (max-width: 760px) {
  .fam-grid { grid-template-columns: minmax(0, 1fr); }
  /* phone: Dnes → Nákup (in-store use) → Povinnosti → 7 dní */
  .fam-col { display: contents; }
  .fam-slot[data-slot='today'] { order: 1; }
  .fam-slot[data-slot='shop'] { order: 2; }
  .fam-slot[data-slot='chores'] { order: 3; }
  .fam-slot[data-slot='week'] { order: 4; }
  .fam-card { padding: 16px; }
  .fam-ev { grid-template-columns: 64px 4px minmax(0, 1fr); }
  .fam-ev .fam-src { grid-column: 3; justify-self: start; margin-top: -4px; }
  .fam-day { grid-template-columns: 58px minmax(0, 1fr); }
}
/* kitchen kiosk: three columns, larger type */
.fam[data-kiosk] { max-width: none; --hb-type-body: 17px; --hb-type-caption: 15px; gap: 12px; }
.fam[data-kiosk] .fam-head h1 { font-size: 26px; }
.fam[data-kiosk] .fam-grid { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.15fr) minmax(0, 0.8fr); gap: 14px; }
.fam[data-kiosk] .fam-kids { grid-template-columns: minmax(0, 1fr); }
.fam[data-kiosk] .fam-card { padding: 14px 18px; }
.fam[data-kiosk] .fam-src, .fam[data-kiosk] .fam-pts, .fam[data-kiosk] .fam-points small { font-size: 15px; }
.fam[data-kiosk] .fam-check { flex-basis: 48px; width: 48px; height: 48px; }
.fam[data-kiosk] .fam-check svg { width: 24px; height: 24px; }
.fam[data-kiosk] .fam-box { flex-basis: 48px; width: 48px; height: 48px; border-radius: 12px; }
.fam[data-kiosk] .fam-box svg { width: 22px; height: 22px; }
.fam[data-kiosk] .fam-item { min-height: 56px; }
.fam[data-kiosk] .fam-chore { min-height: 60px; }
.fam[data-kiosk] .fam-add input, .fam[data-kiosk] .fam-add button { height: 52px; }
.fam[data-kiosk] .fam-approve { min-height: 48px; }

.fam-slot:empty { display: none; }
.fam-chore-t > div { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fam-empty { color: var(--hb-t2); font-size: var(--hb-type-body); padding: 4px 0; }
.fam-err { color: var(--hb-crit); font-size: var(--hb-type-caption); margin-top: 8px; }
.fam-detail { color: var(--hb-t2); font-size: var(--hb-type-caption); }
.fam-check:disabled, .fam-box:disabled { cursor: default; }
.fam-check:focus-visible, .fam-box:focus-visible, .fam-approve:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; }
.fam[data-kiosk] .fam-days { gap: 0; }
.fam[data-kiosk] .fam-day { padding: 7px 0; }
@media (prefers-reduced-motion: no-preference) {
  .fam-check, .fam-box { transition: background-color var(--hb-dur-base, 160ms) var(--hb-ease-out, ease), border-color var(--hb-dur-base, 160ms) var(--hb-ease-out, ease); }
}
.fam[data-kiosk] .fam-next { margin-bottom: 6px; padding: 10px 14px; }
.fam[data-kiosk] .fam-ev { padding: 7px 0; }
.fam[data-kiosk] { padding: max(16px, env(safe-area-inset-top)) max(28px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(28px, env(safe-area-inset-left)); }
.fam-clock { font-size: 40px; line-height: 1; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.fam[data-kiosk] .fam-head { align-items: baseline; gap: 4px 16px; }
.fam[data-kiosk] .fam-head p { font-size: 22px; color: var(--hb-t2); font-weight: 550; }
.fam[data-kiosk] .fam-day { padding: 3px 0; grid-template-columns: 96px minmax(0, 1fr); }
.fam[data-kiosk] .fam-day > div:first-child { white-space: nowrap; }
.fam[data-kiosk] .fam-day > div:first-child { display: flex; gap: 6px; align-items: baseline; }
.fam[data-kiosk] .fam-day ul { gap: 2px; }
.fam[data-kiosk] .fam-ev-past-note { display: none; }
.fam[data-kiosk] .fam-card-h { margin-bottom: 8px; }
.fam[data-kiosk] .fam-ev[data-past] { padding: 4px 0; }
.fam[data-kiosk] .fam-ev[data-past] time small { display: none; }
.fam[data-kiosk] .fam-ev[data-past] i { min-height: 20px; }
.fam[data-kiosk] .fam-avatar.fam-avatar-sm { width: 24px; height: 24px; flex-basis: 24px; }
.fam-chore { min-height: 88px; }
.fam-chore[data-muted] { opacity: 0.55; }
.fam-chore-meta small[data-tone='warn'] { color: var(--hb-warn); font-weight: 650; }
.fam-overflow { min-width: 44px; min-height: 44px; color: color-mix(in srgb, var(--hb-t1) 72%, transparent); font-size: 22px; letter-spacing: 2px; }
.fam-total-link { background: none; border: 0; padding: 0; color: var(--hb-ac); font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.fam-approvals { margin-bottom: 12px; padding: 12px; border-radius: var(--hb-radius-md); background: var(--hb-s2); }
.fam-approvals h3 { font-size: var(--hb-type-body); margin-bottom: 8px; font-weight: 650; }
.fam-approval { display: grid; gap: 8px; padding: 10px 0; border-top: 1px solid var(--hb-edge); }
.fam-approval:first-child { border-top: 0; }
.fam-approval-type { font-size: var(--hb-type-caption); color: var(--hb-t2); font-weight: 650; }
.fam-approval-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.fam-points-sheet .fam-points-sticky { position: sticky; top: 0; background: var(--hb-s1); padding-bottom: 8px; z-index: 1; }
.fam-points-hero { font-size: 28px; font-weight: 700; }
.fam-points-month span { display: block; color: var(--hb-t2); font-size: var(--hb-type-caption); }
.fam-chart { display: flex; align-items: flex-end; gap: 4px; min-height: 120px; margin-top: 12px; }
.fam-chart span { flex: 1; background: var(--hb-ac); border-radius: 4px 4px 0 0; min-height: 4px; }
.fam-chart span[data-today] { background: var(--hb-ok); }
.fam-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.fam-chip { min-height: 44px; padding: 0 14px; border-radius: 99px; border: 1px solid var(--hb-edge); background: transparent; }
.fam-chip[aria-pressed="true"] { background: color-mix(in srgb, var(--hb-ac) 16%, transparent); border-color: var(--hb-ac); }
.fam-suffix { margin-left: 6px; color: var(--hb-t2); }
/* Family flows share the modal frame; content uses the same spacing and surfaces as cards. */
.fam-card-h { flex-wrap: wrap; }
.fam-card-h h2 { white-space: nowrap; }
.fam-kids { grid-template-columns: minmax(0, 1fr); gap: 24px; }
.fam-kid { padding: 0; background: transparent; box-shadow: none; }
.fam-kid + .fam-kid { padding-top: 24px; border-top: 1px solid var(--hb-edge); }
.fam-kid-h > div:first-of-type { flex: 1; min-width: 0; }
.fam-points { flex-shrink: 0; white-space: nowrap; }
.fam-points strong { color: var(--fam-kid); }
.fam-total-link { display: block; border: 1px solid var(--hb-edge); border-radius: 99px; padding: 8px 12px; margin-top: 8px; color: var(--fam-kid); text-decoration: none; font-weight: 600; }
.fam-check { flex-basis: 44px; width: 44px; height: 44px; border-color: var(--hb-t2); }
.fam-pts { align-self: center; }
.fam-overflow { padding: 0; border-radius: 50%; }
.fam-pending-tag { display: inline-block; padding: 3px 7px; border-radius: 6px; color: var(--hb-warn); background: color-mix(in srgb, var(--hb-warn) 10%, transparent); font-size: 12px; }
.fam-chore-t small { display: block; margin-top: 5px; }
.fam-approvals { padding: 0; background: transparent; margin-bottom: 24px; }
.fam-approval { background: color-mix(in srgb, var(--hb-ac) 5%, var(--hb-s1)); padding: 16px; margin-top: 10px; border: 1px solid var(--hb-edge); border-radius: var(--hb-radius-md); gap: 12px; }
.fam-approval:first-child { border: 1px solid var(--hb-edge); }
.fam-approval-body strong, .fam-approval-body small { display: block; }
.fam-approval-body small { margin-top: 5px; color: var(--hb-t2); }
.fam-approval-actions { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); }
.fam-approval-actions button { width: 100%; padding-inline: 8px; font-size: 13px; }
.fam-transfer { display: flex; gap: 10px; align-items: center; margin-top: 12px; }
.fam-person-pill { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; }
.fam-person-pill i, .fam-partner-avatar { font-style: normal; display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: color-mix(in srgb, var(--hb-ac) 20%, var(--hb-s1)); color: var(--hb-t1); }
.fam-hint { color: var(--hb-t2); font-size: 13px; line-height: 1.6; }
.fam-points-sheet, .fam-add-chore, .fam-swap-sheet { color: var(--hb-t1); display: flex; flex-direction: column; gap: 22px; }
.fam-points-sheet h3, .fam-swap-sheet h3 { font-size: 15px; font-weight: 650; }
.fam-points-intro { display: grid; gap: 8px; }
.fam-points-hero { font-size: 64px; line-height: 1.12; font-weight: 600; letter-spacing: -2px; color: var(--hb-t1); }
.fam-points-hero small { font-size: 25px; letter-spacing: 0; color: var(--hb-t2); }
.fam-earned { color: var(--hb-ok); font-weight: 600; }
.fam-spent { color: var(--hb-warn); font-weight: 600; }
.fam-points-stats { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; border-radius: 16px; overflow: hidden; background: var(--hb-edge); }
.fam-points-stats > div { padding: 12px 14px; background: var(--hb-s2); }
.fam-points-stats dt { font-size: 12px; color: var(--hb-t2); }
.fam-points-stats dd { margin: 4px 0 0; color: var(--hb-ok); font-size: 25px; font-weight: 650; }
.fam-points-stats dd small { font-size: 12px; font-weight: 500; }
.fam-chart-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.fam-chart-head .hb-seg-wrap { width: 160px; }
.fam-chart-wrap { position: relative; margin: -4px 0 0; padding-left: 30px; }
.fam-chart-axis { position: absolute; inset: 0 auto 32px 0; display: flex; flex-direction: column; justify-content: space-between; font-size: 10px; color: var(--hb-t2); }
.fam-chart { display: flex; height: 112px; min-height: 0; margin: 0 0 24px; gap: 6px; background: repeating-linear-gradient(to top, var(--hb-edge) 0 1px, transparent 1px 55px); }
.fam-chart-column { flex: 1; height: 100%; position: relative; display: flex; align-items: flex-end; min-width: 0; }
.fam-chart-column > span { width: 100%; min-height: 2px; border-radius: 3px 3px 0 0; background: var(--hb-ac); }
.fam-chart-column > span[data-today] { background: var(--hb-ok); }
.fam-chart-column small { position: absolute; top: calc(100% + 5px); font-size: 10px; color: var(--hb-t2); text-align: center; width: 100%; }
.fam-chart-wrap figcaption { color: var(--hb-t2); font-size: 11px; }
.fam-chart-wrap figcaption i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--hb-ok); margin-right: 5px; }
.fam-sources h3 { display: flex; justify-content: space-between; }
.fam-sources h3 small { font-size: 12px; color: var(--hb-t2); font-weight: 400; }
.fam-sources h4 { color: var(--hb-t2); font-size: 12px; margin: 16px 0 4px; }
.fam-points-sources li, .fam-history li { display: flex; align-items: center; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--hb-edge); font-size: 14px; }
.fam-points-sources strong, .fam-history strong { margin-left: auto; }
.fam-points-sources i { width: 8px; height: 8px; border-radius: 50%; background: var(--hb-ac); }
.fam-points-sources [data-source='Bonusy'] i { background: var(--hb-ok); }
.fam-points-sources [data-source='Odměny'] i { background: var(--hb-warn); }
.fam-history small { display: block; color: var(--hb-t2); }
.fam-info { display: flex; gap: 12px; border-radius: 16px; background: color-mix(in srgb, var(--hb-t1) 5%, transparent); padding: 18px; font-size: 14px; }
.fam-info:has(> h3) { display: grid; }
.fam-info p { color: var(--hb-t2); font-size: 13px; margin-top: 6px; }
.fam-info > svg { flex-shrink: 0; }
.fam-add-chore label { display: flex; flex-direction: column; gap: 8px; font-size: 13px; color: var(--hb-t2); }
.fam-add-chore input { width: 100%; height: 48px; padding: 0 14px; border: 1px solid var(--hb-edge); border-radius: 12px; background: color-mix(in srgb, var(--hb-t1) 5%, var(--hb-s1)); font: inherit; font-size: 16px; color: var(--hb-t1); }
.fam-add-chore fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.fam-add-chore legend { color: var(--hb-t2); font-size: 13px; padding: 0; margin-bottom: 10px; }
.fam-add-chore .fam-suffix { position: absolute; right: 36px; margin-top: 38px; }
.fam-add-chore .hb-seg button { font-size: 12px; padding-inline: 6px; }
.fam-chip { color: var(--hb-t1); font: inherit; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 10px; border-color: color-mix(in srgb, var(--hb-t1) 25%, transparent); }
.fam-chip[aria-pressed="true"] { background: color-mix(in srgb, var(--hb-ac) 26%, var(--hb-s1)); border-color: var(--hb-ac); box-shadow: inset 0 0 0 1px var(--hb-ac); color: var(--hb-t1); }
.fam-swap-chore { display: flex; align-items: center; gap: 16px; padding: 18px; border-radius: 16px; background: color-mix(in srgb, var(--hb-t1) 6%, transparent); }
.fam-swap-chore > svg { color: var(--hb-ac); flex-shrink: 0; }
.fam-swap-sheet > .fam-chips { flex-direction: column; }
.fam-swap-sheet .fam-chip { width: 100%; border-radius: 14px; padding: 14px; justify-content: flex-start; }
.fam-swap-sheet .fam-chip > svg { margin-left: auto; }
.fam .hb-sheet-foot button { width: 100%; }
.fam .hb-sheet-foot .fam-hint { margin-bottom: 12px; }
.fam-add-chore { gap: 18px; }
.fam-add-chore > label:first-child { grid-column: 1 / -1; }
.fam-chip { min-height: 44px; }
.fam-add-chore > .fam-chips:has(> :nth-child(7)) { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
.fam-add-chore > .fam-chips:has(> :nth-child(7)) .fam-chip { padding: 0; font-size: 12px; }
.fam-points-sheet { gap: 18px; }
.fam-points-intro { gap: 6px; }

.fam-add-chore { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px 12px; }
.fam-add-chore > * { grid-column: 1 / -1; }
.fam-add-chore > .fam-form-points { grid-column: 1; }
.fam-add-chore > fieldset:first-of-type { grid-column: 2; }
.fam-form-points > label { margin-bottom: 8px; }
.fam-stepper { height: 48px; display: flex; align-items: center; border: 1px solid var(--hb-edge); border-radius: 12px; overflow: hidden; background: color-mix(in srgb, var(--hb-t1) 5%, var(--hb-s1)); }
.fam-stepper input { width: 40px; padding: 0; background: transparent; border: 0; text-align: center; }
.fam-stepper > button { min-width: 44px; padding: 0; height: 46px; flex-shrink: 0; }
.fam-stepper > span { font-size: 12px; color: var(--hb-t2); }
.fam-icon-picker { position: relative; }
.fam-icon-picker summary { height: 48px; display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--hb-edge); border-radius: 12px; font-size: 14px; background: color-mix(in srgb, var(--hb-t1) 5%, var(--hb-s1)); cursor: pointer; list-style: none; }
.fam-icon-picker > .fam-chips { position: absolute; z-index: 3; right: 0; top: 54px; width: 220px; padding: 12px; border: 1px solid var(--hb-edge); border-radius: 14px; background: var(--hb-s2); box-shadow: var(--hb-elev-2); }
.fam-form-dates { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.fam-form-dates label { min-width: 0; }
.fam-form-dates input { font-size: 14px; }

.fam-chart-head h3 { white-space: nowrap; }
.fam-chart-head .hb-seg-wrap { flex: none; min-width: 0; max-width: 160px; }
.fam-points-stats > div { background: color-mix(in srgb, var(--hb-t1) 5%, var(--hb-s1)); }
.fam-add-chore input:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; }
.fam-partner-avatar { color: white; }
.fam-menu-list .hb-btn { width: 100%; justify-content: flex-start; }

.fam-check { position: relative; border: 0; background: none !important; }
.fam-check::before { content: ''; position: absolute; width: 28px; height: 28px; border: 1.5px solid var(--hb-t2); border-radius: 50%; }
.fam-chore[data-state='done'] .fam-check::before { background: var(--hb-ok); border-color: var(--hb-ok); }
.fam-chore[data-state='claimed'] .fam-check::before { border-color: var(--hb-warn); }
.fam-check svg { position: relative; width: 16px; height: 16px; }
.fam-transferred-icon { flex: 0 0 44px; text-align: center; font-size: 20px; color: var(--hb-t2); }

.fam[data-kiosk] .fam-kids { gap: 12px; }
.fam[data-kiosk] .fam-kid + .fam-kid { padding-top: 12px; }
.fam[data-kiosk] .fam-chore { min-height: 54px; }

/* r3 polish */
.fam-kid { border-radius: 0; }
.fam-kid + .fam-kid { border-top: 1px solid var(--hb-edge); }
.fam-points small { white-space: nowrap; }
.fam-points em { display: inline; }
.fam-kid-tools { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 4px 0 6px; }
.fam-total-link { display: inline-flex; align-items: center; gap: 2px; margin-top: 0; min-height: 36px; padding: 0 8px 0 14px; font-size: 13px; }
.fam-add-chore-btn { margin-left: auto; }
.fam-chore-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin-top: 5px; }
.fam-chore-meta small { margin-top: 0 !important; }
.fam-chore-meta .hb-pill { white-space: nowrap; }
.fam-chore[data-muted] { opacity: 1; }
.fam-chore[data-muted] .fam-chore-t b, .fam-chore[data-muted] .fam-pts { color: var(--hb-t2); font-weight: 500; }
.fam-transferred-icon { display: grid; place-items: center; width: 44px; height: 44px; color: var(--hb-t2); }
.fam-swap-note { display: inline-flex !important; align-items: center; flex-wrap: wrap; gap: 0 5px; color: var(--hb-t2); font-weight: 550; }
.fam-swap-note > span { white-space: nowrap; }
.fam-swap-note svg, .fam-swap-tag svg { flex: none; color: var(--hb-ac); }
.fam-swap-tag { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px 2px 6px; border-radius: 7px; font-size: 12px; font-weight: 600; white-space: nowrap;
  color: color-mix(in srgb, var(--hb-ac) 70%, var(--hb-t1)); background: color-mix(in srgb, var(--hb-ac) 13%, transparent); }
.fam-overflow.hb-btn { flex: 0 0 44px; width: 44px; min-width: 44px; min-height: 44px; padding: 0; color: var(--hb-t2); letter-spacing: 0; }
.fam-overflow-spacer { flex: 0 0 44px; width: 44px; }
.fam-done-sum .fam-done-sum-i { flex: 0 0 44px; height: 44px; display: grid; place-items: center; color: var(--hb-ok); }
.fam-done-sum .fam-done-sum-i svg { width: 22px; height: 22px; }
.fam-done-sum .fam-chore-t b { color: var(--hb-t1); }
.fam-done-sum small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; max-width: 100%; }
.fam-done-sum .fam-chore-meta { flex-wrap: nowrap; min-width: 0; }
.fam-viewer { display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px 4px 4px; border-radius: 99px; font-size: 14px; font-weight: 600;
  background: color-mix(in srgb, var(--fam-kid) 16%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fam-kid) 40%, transparent); }
.fam-card-h .fam-viewer + .fam-meta { margin-left: 0; }
.fam-card-h h2 + .fam-viewer { margin-left: auto; }
/* approvals */
.fam-approval-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.fam-approval-type { display: inline-flex; align-items: center; gap: 6px; }
.fam-approval-type svg { color: var(--hb-ac); }
.fam-approval-type[data-kind='completion'] svg { color: var(--hb-warn); }
.fam-approval-pts { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--hb-t1); }
.fam-approval-body strong { font-size: 17px; }
.fam-approval-actions { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
.fam-approval-actions button { font-size: 14px; }
/* points sheet */
.fam-points-stats > div[data-kind='streak'] dd { color: var(--hb-t1); }
.fam-points-stats dd small { color: var(--hb-t2); }
.fam-chart-column[data-today] small { color: var(--hb-t1); font-weight: 750; }
.fam-chart-axis { inset: 0 auto 32px 0; }
.fam-chart-wrap { padding-left: 36px; }
.fam-sources h4 span { font-weight: 500; }
/* add chore */
.fam-presets { gap: 8px; }
.fam-preset.hb-chip { min-height: 44px; min-width: 56px; justify-content: center; }
.fam-chip.hb-chip { min-height: 44px; }
.fam-weekdays.fam-chips { display: grid !important; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px !important; }
.fam-weekdays .fam-chip.hb-chip { min-height: 44px; padding: 0; font-size: 14px; font-weight: 600; border-radius: 12px; }
.fam-chip.hb-chip[data-toggle]:not([data-look='soft'])[aria-pressed="true"] { border-color: var(--hb-ac); box-shadow: none; font-weight: 650; }
.fam-stepper { padding: 0 6px; gap: 4px; justify-content: space-between; }
.fam-stepper > .hb-btn { min-width: 36px; width: 36px; height: 36px; min-height: 36px; }
.fam-stepper input { flex: 1; min-width: 0; font-weight: 650; font-size: 17px; }
.fam-input-icon { position: relative; display: block; }
.fam-input-icon input { padding-right: 44px; }
.fam-input-icon > svg { position: absolute; right: 14px; top: 50%; translate: 0 -50%; color: var(--hb-t2); pointer-events: none; }
.fam-summary { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; border-radius: 14px;
  background: color-mix(in srgb, var(--hb-ac) 9%, var(--hb-s1)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hb-ac) 22%, transparent); }
.fam-summary > svg { flex: none; color: var(--hb-ac); margin-top: 2px; }
.fam-summary strong { display: block; font-size: 14px; font-weight: 650; color: var(--hb-t1); }
.fam-summary .fam-hint { margin-top: 2px; margin-bottom: 0 !important; }
.fam .hb-sheet-foot .fam-summary { margin-bottom: 12px; padding: 10px 14px; }
.fam .hb-sheet-foot .fam-invalid { color: var(--hb-warn); font-weight: 600; }
.fam-chore-meta .hb-pill { white-space: normal; max-width: 100%; line-height: 1.3; padding-block: 3px; }
/* swap sheet */
.fam-swap-sheet > .fam-person-chips { flex-direction: row; flex-wrap: wrap; gap: 10px; }
.fam-swap-sheet .fam-person-chips .fam-chip { width: auto; border-radius: 99px; padding: 6px 16px 6px 6px; min-height: 52px; font-weight: 600; }
.fam-swap-sheet .fam-person-chips .fam-chip[aria-pressed="true"] { background: color-mix(in srgb, var(--hb-ac) 22%, var(--hb-s1)); border-color: var(--hb-ac); box-shadow: inset 0 0 0 1px var(--hb-ac); }
.fam-swap-sheet .fam-person-chips .fam-chip > svg.fam-chip-check { margin-left: 2px; color: var(--hb-ac); }
.fam-person-chips .fam-partner-avatar { width: 38px; height: 38px; font-weight: 700; }
.fam-icon-tile { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px;
  color: color-mix(in srgb, var(--fam-kid, var(--hb-ac)) 70%, white); background: color-mix(in srgb, var(--fam-kid, var(--hb-ac)) 24%, var(--hb-s1)); }
.fam-swap-chore strong { font-size: 17px; }
.fam-info[data-tone='accent'] { background: color-mix(in srgb, var(--hb-ac) 9%, var(--hb-s1)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hb-ac) 20%, transparent); }
.fam-info-icon { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; color: var(--hb-ac); background: color-mix(in srgb, var(--hb-ac) 18%, transparent); }
.fam-cta.hb-btn { font-weight: 650; }
/* kiosk: the grid fills the screen, chores scroll inside a bounded card */
.fam[data-kiosk] { height: 100dvh; overflow: hidden; }
.fam[data-kiosk] .fam-grid { flex: 1; min-height: 0; align-items: stretch; }
.fam[data-kiosk] .fam-col { min-height: 0; }
.fam[data-kiosk] .fam-slot[data-slot='chores'] { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.fam[data-kiosk] .fam-slot[data-slot='chores'] > .fam-card { flex: 0 1 auto; min-height: 0; max-height: 100%; overflow-y: auto; overscroll-behavior: contain; }
.fam[data-kiosk] .fam-chore { min-height: 56px; padding: 4px 0; }
.fam[data-kiosk] .fam-kid-h { margin-bottom: 8px; }
.fam[data-kiosk] .fam-chore-meta { margin-top: 3px; }
`;
