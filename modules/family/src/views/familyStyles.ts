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
  .fam-slot[data-slot='free'] { order: 4; }
  .fam-slot[data-slot='week'] { order: 5; }
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
.fam[data-kiosk] { height: 100dvh; overflow: hidden; box-sizing: border-box; }
.fam[data-kiosk] .fam-grid { flex: 1; min-height: 0; align-items: stretch; }
.fam[data-kiosk] .fam-col { min-height: 0; }
.fam[data-kiosk] .fam-slot[data-slot='chores'] { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.fam[data-kiosk] .fam-slot[data-slot='chores'] > .fam-card { flex: 0 1 auto; min-height: 0; max-height: 100%; overflow-y: auto; overscroll-behavior: contain; }
.fam[data-kiosk] .fam-chore { min-height: 56px; padding: 4px 0; }
.fam[data-kiosk] .fam-kid-h { margin-bottom: 8px; }
.fam[data-kiosk] .fam-chore-meta { margin-top: 3px; }
/* r4 polish */
.fam-nowrap { white-space: nowrap; }
/* Dnes: start over end, no dangling dash; all-day muted */
.fam-ev time small { font-variant-numeric: tabular-nums; }
.fam-ev time[data-allday] { color: var(--hb-t2); font-weight: 500; font-size: var(--hb-type-caption); white-space: nowrap; }
.fam-src { display: inline-flex; align-items: center; gap: 4px; }
/* 7 dní: fixed time column, all-day items align with timed titles */
.fam-day li { display: grid; grid-template-columns: 62px 8px minmax(0, 1fr); align-items: center; gap: 8px; }
.fam-day li::before { content: none; }
.fam-day li > i { width: 8px; height: 8px; border-radius: 50%; background: var(--fam-src); }
.fam-day li > span.fam-wk-time { color: var(--hb-t2); font-weight: 500; font-size: var(--hb-type-caption); font-variant-numeric: tabular-nums; white-space: nowrap; }
.fam-day li[data-allday] > span.fam-wk-time { font-size: 12px; }
.fam-day li > span.fam-wk-t { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--hb-t1); font-size: var(--hb-type-body); white-space: normal; }
.fam-wk-school { display: inline-grid; place-items: center; flex: none; color: #e0a23a; }
.fam-free { color: var(--hb-t2); font-size: var(--hb-type-caption); padding-left: 78px; }
/* kid section: header toggles, pending summary as chips */
.fam-kid-toggle { width: 100%; border: 0; background: none; padding: 4px 0; margin: -4px 0 6px; text-align: left; cursor: pointer; border-radius: 12px; color: inherit; font: inherit; }
.fam-kid-toggle:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; }
.fam-kid-chev { flex: none; display: grid; place-items: center; width: 28px; height: 28px; color: var(--hb-t2); }
.fam-kid-chev svg { rotate: -90deg; transition: rotate var(--hb-dur-base, 160ms) var(--hb-ease-out, ease); }
.fam-kid[data-collapsed] .fam-kid-chev svg { rotate: 90deg; }
.fam-kid-pending { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.fam-wait-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px 4px 8px; border-radius: 99px; font-size: 13px; font-weight: 600; white-space: nowrap; }
.fam-wait-chip[data-tone='warn'] { color: color-mix(in srgb, var(--hb-warn) 82%, var(--hb-t1)); background: color-mix(in srgb, var(--hb-warn) 14%, transparent); }
.fam-wait-chip[data-tone='accent'] { color: color-mix(in srgb, var(--hb-ac) 62%, var(--hb-t1)); background: color-mix(in srgb, var(--hb-ac) 14%, transparent); }
.fam-kid-body[hidden] { display: none; }
/* rows */
.fam-chore { min-height: 64px; }
.fam-chore[data-state='done'] { min-height: 56px; }
.fam-chore-meta .hb-pill.fam-pending-pill { white-space: nowrap; max-width: 100%; flex: 0 1 auto; }
.fam-chore-meta .fam-due { color: var(--hb-t2); white-space: nowrap; }
.fam-chore-meta .fam-due[data-tone='crit'] { color: var(--hb-crit); }
.fam-pts { color: color-mix(in srgb, var(--hb-t1) 82%, transparent); }
.fam-chore[data-state='done'] .fam-pts, .fam-chore[data-muted] .fam-pts { color: color-mix(in srgb, var(--hb-t1) 70%, transparent); font-weight: 600; }
.fam-chore[data-muted] .fam-chore-t b { color: color-mix(in srgb, var(--hb-t1) 70%, transparent); }
.fam-handed-avatar.fam-avatar { flex: 0 0 30px; width: 30px; height: 30px; margin-inline: 7px; font-size: 13px; box-shadow: none; }
.fam-swap-tag { padding: 3px 9px 3px 7px; }
.fam-overflow.hb-btn { color: color-mix(in srgb, var(--hb-t1) 78%, transparent); border-radius: 50%; }
@media (hover: hover) {
  .fam-overflow.hb-btn { opacity: 0.7; }
  .fam-chore:hover .fam-overflow.hb-btn, .fam-overflow.hb-btn:focus-visible { opacity: 1; background: var(--hb-fill-strong); }
}
.fam-add-chore-btn.hb-btn { border-radius: 99px; font-weight: 650; color: color-mix(in srgb, var(--hb-ac) 50%, var(--hb-t1));
  background: color-mix(in srgb, var(--hb-ac) 16%, var(--hb-s1)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hb-ac) 45%, transparent); }
.fam-done-sum b { font-weight: 600; }
.fam-done-more { flex: 0 0 44px; width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 50%; background: none; color: var(--hb-t2); cursor: pointer; }
.fam-done-more svg { rotate: 90deg; }
.fam-done-more:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; }
/* shopping: divider above bought items */
.fam-done-h { border-top: 1px solid var(--hb-edge); margin-top: 6px; padding-top: 12px; }
/* phone rows: keep pill single-line – tighter gutters around the 44 px targets */
@media (max-width: 760px) {
  .fam-chore { gap: 8px; }
  .fam-chore .fam-check { margin-left: -6px; }
  .fam-overflow.hb-btn, .fam-overflow-spacer, .fam-done-more { margin-right: -8px; }
  .fam-overflow-spacer { flex-basis: 36px; width: 36px; }
  .fam-free { padding-left: 0; }
  .fam-day li { grid-template-columns: 56px 8px minmax(0, 1fr); }
}
/* kiosk: same handoff tag, balanced column heights */
.fam[data-kiosk] .fam-swap-tag, .fam[data-kiosk] .fam-wait-chip { font-size: 14px; }
.fam[data-kiosk] .fam-day li { grid-template-columns: 60px 8px minmax(0, 1fr); gap: 6px; }
.fam[data-kiosk] .fam-free { padding-left: 68px; }
.fam[data-kiosk] .fam-col > .fam-slot:last-child { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.fam[data-kiosk] .fam-col > .fam-slot:last-child > .fam-card { flex: 1 1 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.fam[data-kiosk] .fam-slot[data-slot='chores'] > .fam-card { max-height: none; }
.fam[data-kiosk] .fam-day li > span.fam-wk-time { font-size: 14px; }
.fam[data-kiosk] .fam-day li[data-allday] > span.fam-wk-time { font-size: 16px; }
.fam-day li em { flex: 0 1 auto; }
.fam-day li em .fam-wk-school { display: inline-flex; vertical-align: -2px; }
/* one „needs a parent“ colour for every pending state (handover + completion); blue only for done handovers */
.fam { --fam-pending: color-mix(in srgb, var(--hb-warn) 82%, var(--hb-t1)); }
.fam [data-status='pending']:not(i) { color: var(--fam-pending) !important; }
.fam .hb-pill[data-status='pending'], .fam .fam-wait-chip[data-status='pending'] { background: color-mix(in srgb, var(--hb-warn) 14%, transparent); }
.fam .hb-pill[data-status='pending'] .hb-icon, .fam [data-status='pending'] svg { color: var(--fam-pending); }
.fam .fam-bar i[data-status='pending'] { background: var(--fam-pending); }
.fam-approval-type svg { color: var(--fam-pending); }
/* fixed trailing slot on every chore row: the points column ends at the same x */
.fam-menu-slot { flex: 0 0 44px; width: 44px; min-width: 44px; display: grid; place-items: center; }
.fam-menu-slot > .fam-overflow.hb-btn, .fam-menu-slot > .fam-done-more { margin: 0; }
@media (max-width: 760px) { .fam-menu-slot { margin-right: -8px; } }
.fam[data-kiosk] .fam-grid { grid-template-rows: minmax(0, 1fr); }
/* sheets: one selected style (solid fill) for chips, segments and toggles */
.fam .fam-chips .fam-chip.hb-chip[aria-pressed='true'] { background: var(--hb-ac-solid, var(--hb-ac)); color: #fff; border-color: transparent; box-shadow: none; font-weight: 650; }
.fam-chip-tick { flex: none; display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 5px; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--hb-t1) 45%, transparent); }
.fam-chip.hb-chip[aria-pressed='true'] .fam-chip-tick { box-shadow: none; background: rgb(255 255 255 / 22%); }
.fam-who-chip.hb-chip { padding: 0 12px 0 6px; }
.fam-info p { color: color-mix(in srgb, var(--hb-t1) 86%, transparent); font-size: 14px; line-height: 1.5; text-wrap: pretty; }
.fam-recipient { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 16px; background: color-mix(in srgb, var(--hb-t1) 5%, transparent); font-size: 16px; }
.fam-recipient-label { color: var(--hb-t2); font-size: 14px; min-width: 48px; }
.fam-recipient .fam-partner-avatar { width: 34px; height: 34px; font-weight: 700; }
.fam-icon-tile { color: color-mix(in srgb, var(--fam-kid, var(--hb-ac)) 55%, white); }
/* points sheet */
.fam-points-label { color: var(--hb-t2); font-size: 14px; font-weight: 600; }
.fam-points-intro .fam-earned { font-size: 17px; }
.fam-chart-wrap { padding-right: 10px; }
.fam-chart { margin-top: 6px; }
.fam-chart-column > span { position: relative; }
.fam-chart-value { position: absolute; left: 50%; bottom: calc(100% + 3px); translate: -50% 0; font-size: 12px; font-weight: 750; color: var(--hb-ok); white-space: nowrap; }
.fam-chart-axis { font-size: 11px; text-align: right; width: 24px; }
.fam-chart-wrap figcaption { margin-top: -10px; }
/* add chore */
.fam-add-chore > fieldset:first-of-type { grid-column: 1 / -1; }
.fam-add-chore > .fam-form-icon { grid-column: 2; }
.fam-field, .fam-form-icon { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.fam-field > label, .fam-label { font-size: 13px; color: var(--hb-t2); }
.fam-label small, .fam-add-chore legend small { font-size: 13px; color: var(--hb-t2); font-weight: 400; }
.fam-add-chore input[aria-invalid='true'] { border-color: var(--hb-crit); box-shadow: inset 0 0 0 1px var(--hb-crit); }
.fam-field-err { color: color-mix(in srgb, var(--hb-crit) 80%, var(--hb-t1)); font-size: 13px; font-weight: 600; margin-top: 6px; }
.fam-field > .fam-field-err { margin-top: -2px; }
.fam-form-dates > .fam-field-err { grid-column: 1 / -1; margin-top: -4px; }
.fam-icon-pick { height: 48px; display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--hb-edge); border-radius: 12px; font-size: 15px;
  background: color-mix(in srgb, var(--hb-t1) 5%, var(--hb-s1)); cursor: pointer; color: var(--hb-t1); }
.fam-icon-pick [data-empty] { color: var(--hb-t2); }
.fam-icon-pick > svg:last-child { color: var(--hb-t2); rotate: 90deg; }
.fam-icon-pick:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; }
.fam-stepper-val { flex: 1; display: inline-flex; align-items: baseline; justify-content: center; gap: 4px; min-width: 0; }
.fam-stepper-val b { font-size: 18px; font-weight: 650; color: var(--hb-t1); font-variant-numeric: tabular-nums; }
.fam-stepper-val span { font-size: 14px; color: var(--hb-t2); }
.fam-add-chore { padding-bottom: 8px; }
.fam .hb-sheet-body { scroll-padding-bottom: 24px; }
.fam-add-chore > .fam-summary { margin-top: 2px; }
/* add chore: assignee in the title + footer, errors pinned above Save (#chore-fix) */
.fam-title-who { color: var(--hb-t2); font-weight: 500; }
.fam-add-foot { display: flex; flex-direction: column; gap: 10px; }
.fam-foot-who { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin: 0; font-size: 14px; color: var(--hb-t2); min-width: 0; }
.fam-foot-label { font-weight: 600; }
.fam-foot-kid { display: inline-flex; align-items: center; gap: 6px; color: var(--hb-t1); }
.fam-foot-kid b { font-weight: 700; }
.fam-foot-kid .fam-partner-avatar { width: 24px; height: 24px; font-size: 12px; font-weight: 700; }
.fam-foot-none { color: var(--hb-crit); }
.fam-foot-when { margin-left: auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
.fam-save-err { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; outline: none;
  background: color-mix(in srgb, var(--hb-crit) 12%, var(--hb-s1)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hb-crit) 45%, transparent);
  color: var(--hb-t1); font-size: 14px; }
.fam-save-err:focus-visible { box-shadow: inset 0 0 0 2px var(--hb-crit); }
.fam-save-err > svg { flex: none; color: var(--hb-crit); margin-top: 1px; }
.fam-save-err strong { display: block; font-weight: 700; }
.fam-save-err p { margin: 2px 0 0; color: var(--hb-t2); font-size: 13px; line-height: 1.45; }
.fam-save-err-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.fam .hb-sheet-foot .fam-save-err-actions button { width: auto; min-height: 44px; }
.fam-times { display: flex; flex-direction: column; gap: 10px; border: 0; padding: 0; margin: 0; min-width: 0; }
.fam-times legend { font-size: 13px; color: var(--hb-t2); margin-bottom: 8px; padding: 0; }
.fam-times ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.fam-times li { display: flex; align-items: center; gap: 8px; }
.fam-times li .fam-input-icon { flex: 1; min-width: 0; max-width: 220px; }
.fam-times-n { width: 20px; color: var(--hb-t2); font-variant-numeric: tabular-nums; }
.fam-times > .hb-btn { align-self: flex-start; }
.fam-form-dates[data-multi] { grid-template-columns: 1fr; }
.fam-form-dates[data-multi] > label { max-width: 260px; }
/* upcoming chores: calm, read-only, under today's actionable rows */
.fam-upcoming { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--hb-edge); }
.fam-upcoming-h { display: flex; align-items: center; gap: 6px; margin: 0 0 4px; font-size: 13px; font-weight: 650; color: var(--hb-t2); text-transform: none; letter-spacing: 0; }
.fam-upcoming-h small { font-weight: 500; }
.fam-upcoming ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.fam-upcoming-row { display: grid; grid-template-columns: minmax(84px, auto) minmax(0, 1fr) auto; align-items: baseline; gap: 10px; padding: 6px 0; font-size: 14px; color: var(--hb-t2); border-radius: 8px; }
.fam-upcoming-when { white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 13px; }
.fam-upcoming-name { color: var(--hb-t1); min-width: 0; overflow-wrap: anywhere; }
.fam-upcoming-pts { white-space: nowrap; font-size: 13px; }
.fam-upcoming-more { margin: 2px 0 0; font-size: 13px; color: var(--hb-t2); }
.fam-upcoming[data-compact] .fam-upcoming-row { padding: 3px 0; font-size: 13px; }
.fam-upcoming-line { display: flex; align-items: center; gap: 6px; margin: 0; padding-top: 2px; font-size: 13px; line-height: 18px; border-top: 0; color: var(--hb-t2); white-space: nowrap; min-width: 0; }
.fam-upcoming-line > svg { flex: none; }
/* Kiosk: the plan line costs ~20 px per kid; take it back from the gaps between kids. */
.fam[data-kiosk] .fam-kids:has(.fam-upcoming-line) { gap: 6px; }
.fam[data-kiosk] .fam-kids:has(.fam-upcoming-line) .fam-kid + .fam-kid { padding-top: 8px; }
.fam-upcoming-line b { font-weight: 650; flex: none; }
.fam-upcoming-line > .fam-upcoming-items { color: var(--hb-t1); }
.fam-chore[data-highlight], .fam-upcoming-row[data-highlight] { background: color-mix(in srgb, var(--hb-ac) 16%, transparent); box-shadow: 0 0 0 6px color-mix(in srgb, var(--hb-ac) 16%, transparent); border-radius: 8px; }
@media (prefers-reduced-motion: no-preference) {
  .fam-chore[data-highlight], .fam-upcoming-row[data-highlight] { transition: background 0.6s, box-shadow 0.6s; }
}
/* ── round 2 (chore-fix UX polish) ─────────────────────────────────────────── */
/* Add-chore sheet: the footer floats over the scroll area; the body reserves its measured
   height + 16 px (JS sets --fam-foot-h), so the last field always scrolls fully above it. */
.hb-scrim .hb-sheet[data-fam-float-foot] { position: relative; }
.hb-scrim .hb-sheet[data-fam-float-foot] .hb-sheet-body { padding-bottom: calc(var(--fam-foot-h, 0px) + 16px); scroll-padding-bottom: calc(var(--fam-foot-h, 0px) + 16px); }
.hb-scrim .hb-sheet[data-fam-float-foot] .hb-sheet-foot { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; box-shadow: 0 -10px 18px -12px rgb(0 0 0 / 45%); transition: box-shadow 0.2s; }
.hb-scrim .hb-sheet[data-fam-float-foot] .hb-sheet-foot::before { content: ''; position: absolute; left: 0; right: 0; bottom: 100%; height: 36px; pointer-events: none;
  background: linear-gradient(to bottom, color-mix(in srgb, var(--hb-s1) 0%, transparent), var(--hb-s1)); transition: opacity 0.2s; }
.hb-scrim .hb-sheet[data-fam-float-foot][data-fam-scroll-end] .hb-sheet-foot { box-shadow: none; }
.hb-scrim .hb-sheet[data-fam-float-foot][data-fam-scroll-end] .hb-sheet-foot::before { opacity: 0; }
.fam-add-chore { padding-bottom: 0; }
/* Duplicate error: one line + the two ways forward (≤ ~120 px on a 360 px phone). */
.fam-save-err { flex-direction: column; align-items: stretch; gap: 6px; padding: 8px 12px; }
.fam-save-err strong { display: flex; align-items: center; gap: 8px; line-height: 20px; }
.fam-save-err strong > svg { flex: none; color: var(--hb-crit); }
.fam-save-err-actions { align-items: center; gap: 4px 8px; margin-top: 0; }
.fam .hb-sheet-foot .fam-save-err-actions button { min-height: 40px; }
.fam .hb-sheet-foot .fam-save-err-actions .fam-save-err-alt { min-height: 32px; padding-inline: 8px; color: var(--hb-t1); text-decoration: underline; text-underline-offset: 3px; font-weight: 600; max-width: 100%; }
.fam-save-err-alt > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fam .hb-sheet-foot .fam-cta[data-demoted] { font-weight: 600; }
/* Opakování: one row, four equal segments; long labels wrap inside their segment. */
.fam-add-chore .fam-recurrence .hb-seg { grid-auto-flow: column; grid-template-columns: none; grid-auto-columns: minmax(0, 1fr); overflow: visible; }
.fam-add-chore .fam-recurrence .hb-seg button { white-space: normal; text-wrap: balance; line-height: 1.2; min-height: 48px; padding: 4px; font-size: 13px; }
/* Vícekrát denně */
.fam-times legend { margin-bottom: 2px; }
.fam-times-hint { margin: -6px 0 2px; line-height: 1.4; }
.fam-times li .fam-input-icon { max-width: 200px; }
.fam-times-remove.hb-btn { flex: none; width: 44px; min-height: 44px; }
.fam-times-remove.hb-btn:disabled { opacity: 0.45; }
.fam-times[data-flash] { border-radius: 12px; box-shadow: 0 0 0 8px color-mix(in srgb, var(--hb-ac) 18%, transparent); background: color-mix(in srgb, var(--hb-ac) 18%, transparent); }
@media (prefers-reduced-motion: no-preference) { .fam-times { transition: background 0.5s, box-shadow 0.5s; } }

/* Kid list: „Dnes“ / „Naplánované“ sub-headings */
.fam-list-h { display: flex; align-items: baseline; gap: 6px; margin: 10px 0 2px; font-size: 13px; font-weight: 650; color: var(--hb-t2); }
.fam-list-h small { font-size: 13px; font-weight: 500; color: var(--hb-t2); }
.fam-list-h > svg { align-self: center; flex: none; }
.fam-upcoming .fam-list-h { margin-top: 0; }
/* Upcoming: fixed day + time columns, so the titles line up. */
.fam-upcoming-row { grid-template-columns: 76px 40px minmax(0, 1fr) auto; gap: 8px; align-items: baseline; }
.fam-upcoming-when { font-size: 13px; color: var(--hb-t2); }
.fam-upcoming-time { font-size: 13px; color: var(--hb-t2); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.fam-upcoming-pts { color: var(--hb-t2); font-weight: 600; font-variant-numeric: tabular-nums; }
.fam[data-kiosk] .fam-upcoming-row { grid-template-columns: 84px 44px minmax(0, 1fr) auto; }
/* Rows: deadline always first in the meta line, points centred in their column. */
.fam-chore { align-items: center; }
.fam-chore > .fam-pts { align-self: center; text-align: right; }
.fam-pts[data-out] { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 1px; line-height: 1.2; }
.fam-pts[data-out] s { color: var(--hb-t2); font-weight: 500; text-decoration-thickness: 1.5px; }
.fam-pts[data-out] span { font-size: 12px; font-weight: 600; color: var(--hb-t2); }
.fam-chore[data-muted] .fam-chore-t b { color: var(--hb-t2); }
/* Narrow rows: status chips wrap inside the text column instead of running under the points. */
.fam-chore-meta .fam-swap-tag { display: inline; white-space: normal; max-width: 100%; line-height: 1.15; padding: 2px 4px; }
.fam-chore-meta .fam-swap-tag svg { vertical-align: -2px; margin-inline-end: 3px; }
.fam-chore-meta .hb-pill.fam-pending-pill { white-space: normal; line-height: 1.25; text-wrap: balance; }
/* Contrast: kid-coloured text/segments mix toward the text colour (darker in light, lighter in dark). */
.fam-kid { --fam-kid-ink: color-mix(in oklab, var(--fam-kid) 62%, var(--hb-t1)); --fam-kid-bar: color-mix(in oklab, var(--fam-kid) 78%, var(--hb-t1)); }
.fam-points strong, .fam-total-link { color: var(--fam-kid-ink); }
.fam-bar { background: color-mix(in srgb, var(--hb-t1) 12%, transparent); }
.fam-bar i { background: var(--fam-kid-bar); }
.fam-bar i + i { box-shadow: inset 2px 0 0 var(--hb-s1); }
/* Kiosk plan line: whole items only, the rest as „+N další“ (no mid-word ellipsis). */
.fam-upcoming-line > .fam-upcoming-items { overflow: hidden; text-overflow: clip; display: flex; min-width: 0; flex: 0 1 auto; }
.fam-upcoming-item { flex: none; white-space: nowrap; }
.fam-upcoming-item[data-hidden] { display: none; }
.fam-upcoming-item + .fam-upcoming-item::before { content: ' · '; white-space: pre; color: var(--hb-t2); }
.fam-upcoming-more-inline { flex: none; margin-left: 6px; color: var(--hb-t2); font-weight: 600; }
/* ── round 3 ──────────────────────────────────────────────────────────────── */
/* Upcoming rows: a lead column as wide as today's tick box, title first, date/time under it,
   so upcoming titles share the left edge of today's titles. */
.fam-upcoming-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; min-height: 52px; }
.fam-upcoming-lead { flex: 0 0 44px; width: 44px; display: grid; place-items: center; color: var(--hb-t2); }
.fam[data-kiosk] .fam-upcoming-lead { flex-basis: 48px; width: 48px; }
.fam-upcoming-t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.fam-upcoming-name { font-size: var(--hb-type-body); font-weight: 600; color: var(--hb-t1); }
.fam-upcoming-meta { font-size: var(--hb-type-caption); color: var(--hb-t2); font-variant-numeric: tabular-nums; }
.fam-upcoming-meta .fam-upcoming-when, .fam-upcoming-meta .fam-upcoming-time { font-size: inherit; color: inherit; white-space: nowrap; text-align: left; }
.fam-upcoming-row > .fam-upcoming-pts { align-self: center; }
.fam-upcoming[data-compact] .fam-upcoming-row { padding: 4px 0; min-height: 44px; }
@media (max-width: 760px) {
  .fam-upcoming-row { gap: 8px; }
  .fam-upcoming-lead { margin-left: -6px; }
}
/* Handed-off row: full-contrast title; only the points are struck. */
.fam-chore[data-muted] .fam-chore-t b { color: var(--hb-t1); font-weight: 600; }
.fam-pts[data-out] s, .fam-pts[data-out] span { color: var(--hb-t2); }
/* Kiosk plan line: readable from across the kitchen (18 px, full text colour). */
.fam-upcoming-line { font-size: 18px; line-height: 24px; color: var(--hb-t1); }
.fam-upcoming-line b, .fam-upcoming-more-inline { color: var(--hb-t1); }
.fam-upcoming-line > svg { width: 18px; height: 18px; }
/* Add-chore form, round 3 */
.fam-add-chore .fam-recurrence .hb-seg { display: flex; }
.fam-add-chore .fam-recurrence .hb-seg button { flex: 1 1 auto; white-space: nowrap; text-wrap: nowrap; min-height: 44px; padding: 4px 6px; font-size: 14px; }
.fam-recurrence-hint { margin: -12px 0 0; }
.fam-times-hint { margin: 0; }
.fam-times:focus { outline: none; }
.fam-times[data-flash] { box-shadow: none; background: none; outline: 2px solid color-mix(in srgb, var(--hb-ac) 70%, transparent); outline-offset: 6px; }
.fam-times li { gap: 8px; }
.fam-times-remove.hb-btn { width: 44px; height: 44px; min-height: 44px; color: var(--hb-t1); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hb-t1) 45%, transparent); border-radius: 12px; }
.fam-times-remove.hb-btn:disabled { opacity: 1; color: var(--hb-t2); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hb-t2) 70%, transparent); cursor: not-allowed; }
.fam-dup-wait { margin: 0; font-size: 13px; color: var(--hb-t2); text-align: center; }
.fam .hb-sheet-foot .fam-cta[aria-disabled='true'] { opacity: 0.5; cursor: not-allowed; transition-property: background-color, transform; }

/* Family identity and person detail. */
.fam {
  --fam-person-1: #6897fa; --fam-person-2: #d76ae6; --fam-person-3: #a884fc; --fam-person-4: #35bfaf;
  --fam-person-surface: var(--hb-s1);
  --fam-task-lead: 44px;
  --fam-task-point: 68px;
}
[data-theme='light'] .fam {
  --fam-person-1: #265ac2; --fam-person-2: #a52fb4; --fam-person-3: #6744c6; --fam-person-4: #008376;
}
.fam-settings-link { margin-left: auto; }
.fam-persons { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.fam-person-tile, .fam-person-tabs button {
  color: var(--hb-t1); border: 0; text-align: left; cursor: pointer;
}
.fam-person-tile {
  min-width: 0; display: grid; gap: 8px; padding: 12px; border-radius: 20px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--person-color) 13%, var(--fam-person-surface)), var(--fam-person-surface) 72%);
  box-shadow: var(--hb-elev-1);
}
.fam-person-tile:hover { box-shadow: inset 0 0 0 1px var(--person-color); }
.fam-person-tile:focus-visible, .fam-person-tabs button:focus-visible, .fam-person-finished summary:focus-visible {
  outline: 2px solid var(--hb-ac); outline-offset: 2px;
}
.fam-person-identity { display: flex; align-items: center; gap: 12px; min-width: 0; }
.fam-person-avatar {
  display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 50%;
  color: var(--hb-t1); font-size: 19px; font-weight: 700;
  background: color-mix(in srgb, var(--person-color) 32%, var(--fam-person-surface));
}
.fam-person-name { min-width: 0; overflow-wrap: anywhere; }
.fam-person-name strong { display: block; font-size: 17px; font-weight: 700; }
.fam-person-presence {
  width: fit-content; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; margin-top: 3px;
  border-radius: 99px; padding: 2px 8px; color: var(--hb-t1);
  background: color-mix(in srgb, var(--hb-t1) 6%, var(--fam-person-surface)); font-size: 13px; font-weight: 600;
}
.fam-person-presence > span { width: 8px; height: 8px; border: 1.5px solid currentColor; border-radius: 50%; }
.fam-person-presence > span[data-home] { background: currentColor; }
.fam-person-meter { display: flex; height: 6px; border-radius: 99px; overflow: hidden; background: color-mix(in srgb, var(--hb-t1) 16%, transparent); }
.fam-person-meter i { flex: none; background: var(--person-color); }
.fam-person-meter i[data-waiting] {
  background: repeating-linear-gradient(135deg, var(--person-color) 0 3px, transparent 3px 6px);
}
.fam-person-progress { display: flex; flex-wrap: wrap; align-items: center; column-gap: 8px; color: var(--hb-t2); font-size: 13px; }
.fam-person-wait { display: inline-flex; gap: 3px; align-items: center; color: var(--fam-pending); white-space: nowrap; }
.fam-now {
  align-self: flex-start; display: flex; align-items: baseline; gap: 8px;
  color: var(--hb-t1); font-size: 14px; font-weight: 550; padding: 5px 9px !important; margin-top: 6px !important;
  border-radius: 14px; background: color-mix(in srgb, var(--hb-t1) 7%, var(--hb-s1));
}
.fam-now i { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--hb-crit); }
.fam-person-view { --fam-person-title: 21px; min-width: 0; display: grid; gap: 16px; }
.fam-person-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.fam-person-back.hb-btn { justify-self: start; padding-inline: 9px; font-weight: 650; }
.fam-person-head .fam-person-avatar { width: 48px; height: 48px; font-size: 23px; }
.fam-person-head .fam-person-name > div { display: flex; flex-wrap: wrap; align-items: center; column-gap: 9px; }
.fam-person-head h1, .fam-person-settings h1 { font-size: 25px; line-height: 1.15; }
.fam-person-name p, .fam-person-settings p { color: var(--hb-t2); font-size: 14px; margin-top: 3px; }
.fam-person-tabs {
  position: sticky; top: 0; z-index: 1; padding: 3px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px; border-radius: 15px; background-color: var(--hb-s1);
}
.fam-person-tabs button { text-align: center; min-height: 42px; border-radius: 12px; background: transparent; font-weight: 600; color: var(--hb-t2); }
.fam-person-tabs button[aria-selected='true'] { color: var(--hb-t1); background: var(--hb-s2); box-shadow: var(--hb-elev-1); }
.fam-person-columns, .fam-person-side { display: grid; gap: 20px; align-content: start; min-width: 0; }
.fam-person-side:empty { display: none; }
.fam-person-section-head {
  display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; margin: 0 3px 8px;
}
.fam-person-section-head h2 { font-size: var(--fam-person-title, 20px); font-weight: 700; letter-spacing: -0.02em; }
.fam-person-section-head small, .fam-person-group h3, .fam-person-finished summary { color: var(--hb-t2); font-size: 14px; }
.fam .fam-person-surface {
  background: var(--fam-person-surface); border-radius: 20px; padding: 4px 12px; box-shadow: var(--hb-elev-1);
}
.fam-person-group + .fam-person-group { margin-top: 3px; }
.fam-person-group h3 {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 10px 0 4px; font-weight: 650;
}
.fam-person-group h3 > span:last-child { white-space: nowrap; font-weight: 500; }
.fam-person-group[data-late] h3, .fam-person-task-text small.fam-person-overdue, .fam-person-task[data-missed] small { color: var(--hb-crit); }
.fam-person-task {
  display: grid; align-items: center; grid-template-columns: var(--fam-task-lead) minmax(0, 1fr) auto;
  gap: 8px; padding: 8px 0; min-height: 53px;
}
.fam-person-task + .fam-person-task, .fam-person-event + .fam-person-event,
.fam-person-finished, .fam-person-day + .fam-person-day { border-top: 1px solid var(--hb-edge); }
.fam-person-task-text { min-width: 0; overflow-wrap: anywhere; }
.fam-person-task-text strong { display: block; font-size: 16px; font-weight: 650; }
.fam-person-task-text small, .fam-person-event small { color: var(--hb-t2); display: block; font-size: 14px; margin-top: 2px; }
.fam-person-task-text small[data-pending] { color: var(--fam-pending); }
.fam-person-task[data-muted] strong, .fam-person-task[data-state='done'] strong { color: var(--hb-t2); }
.fam-person-task[data-state='done'] strong { text-decoration: line-through; }
.fam-person-points { min-width: var(--fam-task-point); white-space: nowrap; text-align: right; font-size: 14px; font-weight: 650; }
.fam-person-mark {
  color: var(--hb-t2); display: grid; place-items: center; justify-self: center;
  border-radius: 50%; width: 28px; height: 28px; border: 1.5px solid currentColor;
}
.fam-person-task[data-state='done'] .fam-person-mark { color: var(--hb-ok); }
.fam-person-task[data-state='claimed'] .fam-person-mark {
  color: var(--fam-pending); border-color: transparent; border-radius: 8px;
  background: color-mix(in srgb, var(--hb-warn) 17%, var(--fam-person-surface));
}
.fam-person-task[data-missed] .fam-person-mark, .fam-person-task[data-state='overdue'] .fam-person-mark { color: var(--hb-crit); }
.fam-person-free .fam-person-mark { border-style: dashed; }
.fam-person-free > .hb-btn { grid-column: 2 / -1; justify-self: end; }
.fam-person-finished summary { padding: 12px 0; min-height: 44px; cursor: pointer; }
.fam-person-day { padding-bottom: 6px; }
.fam-person-day[data-today] h3 { color: var(--hb-t1); }
.fam-person-event {
  display: grid; grid-template-columns: 76px minmax(0, 1fr); padding: 10px 0; gap: 6px; font-weight: 600;
}
.fam-person-event > span { border-inline-start: 3px solid var(--person-color); padding-inline-start: 10px; }
.fam .fam-person-empty { color: var(--hb-t2); padding: 12px 0; }
.fam-person-settings form { display: grid; gap: 12px; justify-items: start; }
.fam-person-settings fieldset {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; min-width: 0; gap: 12px; border: 0; margin: 0;
}
.fam-person-settings legend { font-weight: 700; padding: 6px; }
.fam-person-settings legend i { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-inline-end: 6px; }
.fam-person-settings label { display: grid; min-width: 0; gap: 4px; font-weight: 600; }
.fam-person-settings select {
  min-height: 44px; width: 100%; color: var(--hb-t1); background: var(--hb-s2); padding: 6px;
  border: 1px solid var(--hb-edge); border-radius: 9px; font: inherit;
}
.fam-person-settings small { color: var(--hb-t2); }
.fam-list-detail.hb-btn { margin-inline-end: auto; }

.fam-chore, .fam-upcoming-row {
  display: grid; grid-template-columns: var(--fam-task-lead) minmax(0, 1fr) var(--fam-task-point) 36px; gap: 8px;
}
.fam-chore > :first-child, .fam-upcoming-row > :first-child { justify-self: center; }
.fam-chore .fam-check, .fam-upcoming-row .fam-upcoming-lead, .fam-done-sum .fam-done-sum-i,
.fam-handed-avatar.fam-avatar { margin-inline: 0; }
.fam-handed-avatar.fam-avatar { width: 28px; height: 28px; }
.fam-done-sum .fam-done-sum-i { width: 44px; }
.fam-done-sum .fam-done-sum-i svg { width: 28px; height: 28px; }
.fam-pts, .fam-upcoming-pts { min-width: 0; text-align: right; font-size: 13px; white-space: nowrap; font-weight: 650; }
.fam-menu-slot { width: 36px; min-width: 36px; margin-inline: 0; }
.fam-chore-meta .hb-pill.fam-pending-pill { white-space: nowrap; text-wrap: nowrap; }
.fam-handover-pending { font-size: 12px; font-weight: 650; overflow-wrap: anywhere; line-height: 1.2; }

@media (min-width: 761px) {
  .fam-person-columns { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); }
  .fam-person-free:has(button) { grid-template-columns: var(--fam-task-lead) minmax(0, 1fr) auto auto; }
  .fam-person-free > .hb-btn { grid-column: auto; }
}
@media (max-width: 760px) {
  .fam-persons { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fam-person-head { align-items: start; flex-direction: column; }
  .fam-person-settings fieldset { grid-template-columns: minmax(0, 1fr); }
  .fam-chore, .fam-upcoming-row { grid-template-columns: 36px minmax(0, 1fr) 59px 32px; gap: 4px; }
  .fam-menu-slot { width: 32px; min-width: 32px; }
  .fam-chore-meta .hb-pill.fam-pending-pill { font-size: 11px; gap: 3px; padding-inline: 3px; }
}
.fam[data-kiosk] { --fam-task-lead: 48px; --fam-task-point: 84px; --hb-type-caption: 16px; }
.fam[data-kiosk]:has(.fam-person-view) { height: auto; min-height: 0; overflow: visible; }
.fam[data-kiosk] .fam-person-tile { padding: 10px 14px; gap: 6px; }
.fam[data-kiosk] .fam-person-avatar { width: 48px; height: 48px; font-size: 24px; }
.fam[data-kiosk] .fam-person-name strong, .fam[data-kiosk] .fam-person-head h1 { font-size: 25px; }
.fam[data-kiosk] .fam-person-head .fam-person-avatar { width: 64px; height: 64px; }
.fam[data-kiosk] .fam-person-view { --fam-person-title: 26px; }
.fam[data-kiosk] .fam-person-task { min-height: 64px; }
.fam[data-kiosk] .fam-person-task-text strong, .fam[data-kiosk] .fam-person-event { font-size: 21px; }
.fam[data-kiosk] .fam-person-mark { width: 34px; height: 34px; }
.fam[data-kiosk] .fam-chore { grid-template-columns: var(--fam-task-lead) minmax(0, 1fr) var(--fam-task-point); }
.fam[data-kiosk] .fam-person-task-text small, .fam[data-kiosk] .fam-person-presence,
.fam[data-kiosk] .fam-person-event small, .fam[data-kiosk] .fam-person-section-head small,
.fam[data-kiosk] .fam-person-progress, .fam[data-kiosk] .fam-person-name p,
.fam[data-kiosk] .fam-person-group h3, .fam[data-kiosk] .fam-person-finished summary,
.fam[data-kiosk] .fam-person-tabs button, .fam[data-kiosk] .fam-person-free > .hb-btn,
.fam[data-kiosk] .fam-person-points, .fam[data-kiosk] .fam-pts, .fam[data-kiosk] .fam-pts[data-out] span,
.fam[data-kiosk] .fam-pending-pill, .fam[data-kiosk] .fam-handover-pending,
.fam[data-kiosk] .fam-swap-tag, .fam[data-kiosk] .fam-wait-chip, .fam[data-kiosk] .fam-now,
.fam[data-kiosk] .fam-day li > span.fam-wk-time, .fam[data-kiosk] .fam-src,
.fam[data-kiosk] .fam-wk-school, .fam[data-kiosk] .fam-points small { font-size: 16px; }
.fam[data-kiosk] .fam-upcoming-line { font-weight: 500; }
.fam[data-kiosk] .fam-upcoming-more-inline { margin-inline-start: 0; font-weight: inherit; }
.fam[data-kiosk] .fam-slot[data-slot='chores'] > .fam-card { scrollbar-gutter: stable; }
.fam[data-kiosk] .fam-kid-h .fam-avatar, .fam[data-kiosk] .fam-kid-h small,
.fam[data-kiosk] .fam-kid-h .fam-points, .fam[data-kiosk] .fam-kid > .fam-bar,
.fam[data-kiosk] .fam-kid-pending { display: none; }
.fam[data-kiosk] .fam-kid-h { margin-bottom: 4px; }
.fam[data-kiosk] .fam-chore { min-height: 52px; padding-block: 2px; }
.fam[data-kiosk] .fam-kids:has(.fam-upcoming-line) .fam-kid + .fam-kid { padding-top: 5px; }
`;
