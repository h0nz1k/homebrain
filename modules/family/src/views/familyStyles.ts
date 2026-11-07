export const familyStyles = `
.fam { color: var(--hb-t1); max-width: 1440px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--hb-sp-4); }
.fam * { box-sizing: border-box; }
.fam h1, .fam h2, .fam h3, .fam p, .fam ul { margin: 0; padding: 0; }
.fam ul { list-style: none; }
.fam :where(button) { color: inherit; font: inherit; }
.fam-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 14px; }
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
`;
