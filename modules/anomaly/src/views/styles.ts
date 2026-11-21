/**
 * Hlídání domu styles (approved r3 mockups, #129). Scoped under `.aw`; uses `--hb-*` tokens.
 * Own inks: observation = teal (not the blue of primary buttons), suspicion = amber, fault = red.
 * Every ink used for text keeps ≥ 4.5:1 on the surfaces it sits on (see palette.test.ts).
 * The wall kiosk is always dark (Dnes kiosk surfaces), so its card always uses the dark inks.
 */
export const AW_PALETTE = {
  dark: {
    observe: '#74c4c6',
    suspect: '#ffd38c',
    fault: '#ff9c9e',
    barSuspect: '#f2b635',
    onSuspect: '#1f1500',
    /** 24 h strip bars (non-text, ≥ 3:1 on the card). */
    stripObserve: '#5fb3b6',
    stripSuspect: '#f2b635',
    stripFault: '#ea4b59',
  },
  light: {
    observe: '#126a72',
    suspect: '#783c0b',
    fault: '#a42339',
    barSuspect: '#e3a21a',
    onSuspect: '#1f1500',
    stripObserve: '#2f8a8f',
    stripSuspect: '#b97c0c',
    stripFault: '#c8283e',
  },
} as const;

const vars = (p: (typeof AW_PALETTE)['dark' | 'light'], dark: boolean) => `
  --aw-observe: ${p.observe};
  --aw-suspect: ${p.suspect};
  --aw-fault-ink: ${p.fault};
  --aw-bar-suspect: ${p.barSuspect};
  --aw-on-suspect: ${p.onSuspect};
  --aw-band-fill: ${dark ? '#3f5a6e' : '#9fb3c2'};
  --aw-bar-ok: color-mix(in srgb, var(--hb-ok) ${dark ? 52 : 60}%, var(--hb-s2));
  --aw-bar-observe: ${p.stripObserve};
  --aw-strip-suspect: ${p.stripSuspect};
  --aw-bar-fault: ${p.stripFault};
  --aw-fault-fill: #b5243d;
`;

export const anomalyStyles = `
.aw { ${vars(AW_PALETTE.light, false)} color: var(--hb-t1); }
[data-theme='dark'] .aw,
.aw-watch[data-layout='kiosk'] { ${vars(AW_PALETTE.dark, true)} }
@media (prefers-color-scheme: dark) {
  [data-theme='system'] .aw { ${vars(AW_PALETTE.dark, true)} }
}
.aw * { box-sizing: border-box; }
.aw :where(h1, h2, h3, p, ul, ol, figure) { margin: 0; }
.aw :where(p, li, small) { text-wrap: pretty; }
.aw .hb-step :where(span, small, strong) { text-wrap: balance; }
.aw-page {
  max-width: 1440px;
  margin: 0 auto;
  display: grid;
  gap: 20px;
}
.aw-muted { color: var(--hb-t2); font-size: var(--hb-type-caption, 14px); }
.aw-h2 { margin: 0 0 12px; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }

/* tinted icon square */
.aw-orb {
  --t: var(--hb-t2);
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  /* glyph in the text ink of the tier (≥ 3:1 on the tint, palette.test.ts), tint from the hue */
  color: var(--ink, var(--t));
  background: color-mix(in srgb, var(--t) 14%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--t) 18%, transparent);
}
.aw-orb[data-tone='ok'] { --t: var(--hb-ok); }
.aw-orb[data-tone='warn'] { --t: var(--hb-warn); --ink: var(--aw-suspect); }
.aw-orb[data-tone='crit'] { --t: var(--hb-crit); --ink: var(--aw-fault-ink); }
.aw-orb[data-tone='accent'] { --t: var(--aw-observe); }
.aw .hb-status-row[data-tone='warn'] .hb-status-row-icon { color: var(--aw-suspect); }
.aw .hb-status-row[data-tone='crit'] .hb-status-row-icon { color: var(--aw-fault-ink); }
.aw-orb-lg { width: 64px; height: 64px; border-radius: 20px; }

.aw .hb-pill[data-tone='accent'],
.aw .hb-chip[data-tone='accent'],
.aw .hb-tile[data-tone='accent'],
.aw .hb-status-row[data-tone='accent'] { --hb-tone: var(--aw-observe); }
.aw .hb-pill[data-tone='warn'],
.aw .hb-tile[data-tone='warn'] .hb-tile-status { color: var(--aw-suspect); }
.aw .hb-tile[data-tone='crit'] .hb-tile-status { color: var(--aw-fault-ink); }
.aw .hb-pill[data-tone='crit'] { background: var(--aw-fault-fill); color: #fff; }

/* ------------------------------------------------------------- Dnes card */
.aw-watch {
  display: grid;
  gap: 14px 32px;
  padding: 22px 26px;
  border-radius: var(--hb-radius-hero, 18px);
}
.aw-watch[data-tier='confirmed'] {
  background:
    radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, var(--hb-crit) 12%, transparent), transparent 60%),
    var(--hb-glass);
  border-color: color-mix(in srgb, var(--hb-crit) 42%, var(--hb-edge, transparent));
  box-shadow: inset 4px 0 var(--aw-fault-ink);
}
.aw-watch[data-tier='suspicion'] {
  background:
    radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, var(--hb-warn) 10%, transparent), transparent 60%),
    var(--hb-glass);
  border-color: color-mix(in srgb, var(--hb-warn) 34%, var(--hb-edge, transparent));
  box-shadow: inset 4px 0 var(--aw-bar-suspect);
}
.aw-watch-primary { min-width: 0; }
.aw-watch-head { display: flex; align-items: center; gap: 12px; }
/* hierarchy: title (largest) > section heading of the side list > eyebrow (small caps label) */
.aw-eyebrow { flex: 1; color: var(--hb-t2); font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.aw-watch-titlerow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 12px 0 4px; }
.aw-watch-title { margin: 0; font-size: 28px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.2; }
.aw-watch-context { color: var(--hb-t2); font-size: 15px; }
.aw-watch-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; }
.aw-watch-list {
  display: grid;
  align-content: start;
  margin-top: 4px;
  border-top: 1px solid color-mix(in srgb, var(--hb-t1) 8%, transparent);
}
.aw-watch-list h3 { margin: 12px 0 2px; font-size: 17px; font-weight: 600; color: var(--hb-t1); }
.aw-watch-list .hb-status-row { padding: 10px 0; border-bottom: 1px solid color-mix(in srgb, var(--hb-t1) 6%, transparent); }
.aw-watch-list .hb-status-row:last-child { border-bottom: 0; }
.aw-watch-list .hb-status-row-label { font-weight: 450; }
.aw-watch-list .hb-status-row-detail,
.aw-watch-list .hb-status-row-copy > :last-child:not(.hb-status-row-label) { color: var(--hb-t2); }
/* tappable row (opens the detail): whole row is the target, chevron says so */
.aw .aw-watch-row {
  width: 100%;
  min-height: 56px;
  margin: 0;
  padding: 10px 8px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--hb-t1) 6%, transparent);
  border-radius: 10px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.aw .aw-watch-row:hover { background: color-mix(in srgb, var(--hb-t1) 6%, transparent); }
.aw .aw-watch-row:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; }
.aw-row-chevron { flex: none; color: var(--hb-t2); }

/* the anomaly outranks every chore on Dnes */
.aw .hb-btn.aw-cta { min-height: 52px; padding-inline: 26px; font-size: 17px; font-weight: 700; box-shadow: 0 4px 14px color-mix(in srgb, #000 22%, transparent); }
.aw .aw-cta[data-tone='confirmed'] { background: var(--aw-fault-fill); color: #fff; border: 0; }
.aw .aw-cta[data-tone='confirmed']:hover:not(:disabled) { background: #9d1f35; }
/* suspicion: tonal button – clearly the action of the card, but not an alarm (a fault is red) */
.aw .hb-btn.aw-cta[data-tone='suspicion'] {
  min-height: 48px;
  background: color-mix(in srgb, var(--hb-warn) 16%, var(--hb-s1));
  color: var(--aw-suspect);
  border: 1px solid color-mix(in srgb, var(--hb-warn) 55%, transparent);
  box-shadow: none;
}
.aw .hb-btn.aw-cta[data-tone='suspicion']:hover:not(:disabled) {
  background: color-mix(in srgb, var(--hb-warn) 26%, var(--hb-s1));
}

@media (min-width: 920px) {
  .aw-watch[data-has-list] { grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); }
  .aw-watch-list {
    grid-area: 1 / 2 / span 2;
    align-self: center;
    margin: 0;
    padding-left: 28px;
    border-top: 0;
    border-left: 1px solid color-mix(in srgb, var(--hb-t1) 14%, transparent);
  }
  .aw-watch-list h3 { margin-top: 0; }
  .aw-watch-foot { justify-content: start; gap: 16px; }
  /* tablet landscape / desktop: compact card – the icon sits beside the copy instead of on its
     own row, tighter padding (≈ 80 px lower than r2, e2e) */
  .aw-watch:not([data-layout='kiosk']) { padding: 14px 22px; gap: 10px 28px; }
  .aw-watch:not([data-layout='kiosk']) .aw-watch-primary { display: grid; grid-template-columns: 44px minmax(0, 1fr); column-gap: 14px; align-content: center; }
  .aw-watch:not([data-layout='kiosk']) .aw-watch-head { display: contents; }
  .aw-watch:not([data-layout='kiosk']) .aw-watch-head .aw-orb { grid-row: 1 / span 3; align-self: start; margin-top: 2px; }
  .aw-watch:not([data-layout='kiosk']) .aw-watch-head .aw-eyebrow { grid-column: 2; }
  .aw-watch:not([data-layout='kiosk']) :is(.aw-watch-titlerow, .aw-watch-context, .aw-watch-foot) { grid-column: 2; }
  .aw-watch:not([data-layout='kiosk']) .aw-watch-titlerow { margin: 0; }
  .aw-watch:not([data-layout='kiosk']) .hb-btn.aw-cta[data-tone='suspicion'] { min-height: 44px; }
  .aw-watch:not([data-layout='kiosk']) .aw-watch-foot { margin-top: 10px; }
  .aw-watch:not([data-layout='kiosk']) .aw-watch-row { min-height: 48px; padding-block: 6px; }
}
/* tablet portrait (800 px): Dnes card reads like the mockup, larger copy */
@media (min-width: 761px) and (max-width: 919px) {
  .aw-watch { padding: 26px 30px; gap: 16px; }
  .aw-watch-title { font-size: 34px; }
  .aw-watch-context { font-size: 19px; }
  .aw-watch-list .hb-status-row-label { font-size: 18px; }
  .aw-watch-list h3 { font-size: 17px; }
  .aw .hb-btn.aw-cta { min-height: 52px; font-size: 17px; padding-inline: 26px; }
}
@media (max-width: 760px) {
  .aw-watch { padding: 16px; }
  .aw-watch-title { font-size: 24px; }
}

/* Wall kiosk (1280×800, read from ~2 m): a fault is the loudest thing after the clock; the
   suspicions column is visibly subordinate – narrower, regular-weight heading, muted single-line
   items – and every text on the card is ≥ 22 px (e2e). Parts of the context line stack instead
   of wrapping mid-phrase (no orphans). */
.aw-watch[data-layout='kiosk'] { padding: 16px 28px; }
.aw-watch[data-layout='kiosk'] .aw-eyebrow { font-size: 22px; }
.aw-watch[data-layout='kiosk'] .aw-watch-title { font-size: 56px; line-height: 1.05; text-wrap: balance; }
/* detail line and the side column ≥ 32 px (read from ~2 m) */
.aw-watch[data-layout='kiosk'] .aw-watch-context { font-size: 32px; line-height: 1.25; }
.aw-watch[data-layout='kiosk'] .aw-watch-context > .aw-part { display: block; }
.aw-watch[data-layout='kiosk'] .aw-watch-context .aw-sep { display: none; }
.aw-watch[data-layout='kiosk'] .aw-muted { font-size: 22px; }
.aw-watch[data-layout='kiosk'] .aw-watch-foot { margin-top: 8px; }
.aw-watch[data-layout='kiosk'][data-has-list] { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 10px 28px; }
.aw-watch[data-layout='kiosk'] .aw-watch-list { min-width: 0; padding-left: 24px; border-left-color: color-mix(in srgb, var(--hb-t1) 10%, transparent); }
.aw-watch[data-layout='kiosk'] .aw-watch-list h3 { font-size: 26px; font-weight: 400; color: var(--hb-t2); margin-bottom: 2px; }
.aw-watch[data-layout='kiosk'] .aw-watch-list .hb-status-row { padding: 4px 0; gap: 12px; }
/* no icon tiles on the kiosk side list: muted text rows, the heading carries the tier */
.aw-watch[data-layout='kiosk'] .aw-watch-list .hb-status-row-icon { display: none; }
.aw-watch[data-layout='kiosk'] .aw-watch-list .hb-status-row-copy > * {
  font-size: 32px;
  line-height: 1.2;
  text-wrap: balance;
}
.aw-watch[data-layout='kiosk'] .aw-watch-list .hb-status-row-label { font-weight: 400; color: color-mix(in srgb, var(--hb-t1) 70%, var(--hb-t2)); }
.aw-watch[data-layout='kiosk'] .aw-watch-head .hb-pill { min-height: 34px; padding: 4px 16px; font-size: 22px; font-weight: 650; }

.aw-watch-note { justify-self: start; }

/* ------------------------------------------------------------- detail page */
.aw-top { display: flex; align-items: center; gap: 12px; }
.aw-top h1 { font-size: 28px; font-weight: 650; letter-spacing: -0.02em; }
.aw-top p { margin-top: 2px; }
.aw-layout { display: grid; gap: 20px; grid-template-columns: minmax(0, 1fr) minmax(340px, 31%); align-items: start; }
.aw-main, .aw-rail, .aw-issues { display: grid; gap: 16px; min-width: 0; }
.aw-issues { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; }
.aw-status {
  display: grid;
  grid-template-columns: auto 1fr minmax(240px, 340px);
  align-items: center;
  gap: 20px;
  padding: 24px;
  border-radius: var(--hb-radius-hero, 18px);
}
.aw-status[data-tone='confirmed'] { background: radial-gradient(80% 120% at 0% 0%, color-mix(in srgb, var(--hb-crit) 11%, transparent), transparent 60%), var(--hb-glass); }
.aw-status[data-tone='suspicion'] { background: radial-gradient(80% 120% at 0% 0%, color-mix(in srgb, var(--hb-warn) 10%, transparent), transparent 60%), var(--hb-glass); }
.aw-status[data-tone='ok'] { background: radial-gradient(80% 120% at 0% 0%, color-mix(in srgb, var(--hb-ok) 9%, transparent), transparent 60%), var(--hb-glass); }
.aw-status[data-tone='observation'] { background: linear-gradient(105deg, color-mix(in srgb, var(--aw-observe) 8%, var(--hb-s1)), var(--hb-s1)); }
.aw-status-copy h2 { font-size: 30px; font-weight: 600; letter-spacing: -0.02em; }
.aw-status-copy p { margin-top: 4px; font-size: 15px; color: var(--hb-t1); }
.aw-status-copy p.aw-muted { color: var(--hb-t2); font-size: var(--hb-type-caption, 14px); }

.aw-strip { display: grid; gap: 6px; }
.aw-strip-bars { display: grid; grid-template-columns: repeat(24, 1fr); gap: 3px; height: 36px; }
.aw-strip-bars { align-items: end; }
/* not by colour alone: height grows with the tier, plus a pattern per tier */
.aw-strip [data-tier] { border-radius: 4px; background-color: var(--aw-bar-ok); }
.aw-strip-bars [data-tier='ok'] { height: 40%; }
.aw-strip-bars [data-tier='observation'] { height: 60%; }
.aw-strip-bars [data-tier='suspicion'] { height: 80%; }
.aw-strip-bars [data-tier='confirmed'] { height: 100%; }
.aw-strip [data-tier='observation'] {
  background-color: var(--aw-bar-observe);
  background-image: radial-gradient(circle, color-mix(in srgb, var(--hb-s1) 70%, transparent) 1.2px, transparent 1.6px);
  background-size: 5px 5px;
}
.aw-strip [data-tier='suspicion'] {
  background-color: var(--aw-strip-suspect);
  background-image: repeating-linear-gradient(135deg, color-mix(in srgb, var(--hb-s1) 55%, transparent) 0 2px, transparent 2px 5px);
}
.aw-strip [data-tier='confirmed'] {
  background-color: var(--aw-bar-fault);
  background-image: linear-gradient(var(--hb-s1), var(--hb-s1));
  background-size: 60% 3px;
  background-position: 50% 4px;
  background-repeat: no-repeat;
}
.aw-strip-axis, .aw-strip-legend { display: flex; justify-content: space-between; color: var(--hb-t2); font-size: 13px; }
.aw-strip-legend { display: grid; grid-template-columns: repeat(2, max-content); justify-content: start; gap: 5px 20px; }
.aw-strip-legend span { display: inline-flex; gap: 5px; align-items: center; }
.aw-strip-legend i { width: 12px; height: 12px; border-radius: 3px; }

.aw .hb-btn, .aw .hb-seg button, .aw summary { min-height: 44px; }
.aw .aw-affected summary { width: fit-content; min-width: 44px; padding-right: 8px; }
.aw .hb-seg button { min-width: 44px; }
.aw-back svg { transform: rotate(180deg); }
.aw-affected summary { display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--hb-t1); font-size: 14px; font-weight: 550; list-style: none; }
.aw-affected summary::-webkit-details-marker { display: none; }
.aw-chevron { color: var(--hb-t2); transition: transform 0.2s; }
.aw-affected[open] .aw-chevron { transform: rotate(180deg); }
/* tertiary text action, still a 44 px target */
.aw .aw-link {
  min-height: 44px;
  min-width: 44px;
  padding: 0 10px;
  border: 0;
  background: none;
  color: var(--hb-t2);
  font: inherit;
  font-size: 14px;
  font-weight: 550;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: color-mix(in srgb, var(--hb-t2) 50%, transparent);
  cursor: pointer;
}
.aw .aw-link:disabled { opacity: 0.6; cursor: default; }

.aw-issue { display: grid; container-type: inline-size; gap: 14px; padding: 20px; }
.aw-issue[data-tier='confirmed'], .aw-issue[data-wide] { grid-column: 1 / -1; }
.aw-issue[data-tier='confirmed'] { border-color: color-mix(in srgb, var(--hb-crit) 30%, var(--hb-edge, transparent)); }
.aw-issue[data-tier='suspicion'] { border-color: color-mix(in srgb, var(--hb-warn) 24%, var(--hb-edge, transparent)); }
.aw-issue-head { display: flex; align-items: flex-start; gap: 14px; }
.aw-issue-copy { flex: 1; min-width: 0; }
.aw-issue-copy h3 { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.3; }
.aw-issue-copy p { margin-top: 3px; color: var(--hb-t2); font-size: 14px; }
.aw-why { font-size: 15px; line-height: 1.5; color: var(--hb-t1); max-width: 70ch; }
.aw-entities { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.aw-entity { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: var(--hb-radius-pill, 999px); background: var(--hb-s2); color: var(--hb-t2); font-size: var(--hb-type-caption, 14px); }
.aw-entity-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--hb-t3); }
.aw-issue-foot { align-self: end; padding-top: 12px; border-top: 1px solid color-mix(in srgb, var(--hb-t1) 8%, transparent); }
.aw-actions { display: flex; gap: 8px 10px; flex-wrap: wrap; align-items: flex-start; }
/* the caption belongs to Vyřešeno: directly under that button, as wide as it allows */
.aw-resolve-group { display: grid; gap: 4px; justify-items: start; max-width: 30ch; }
.aw-hint { color: var(--hb-t2); font-size: 13px; line-height: 1.35; }
.aw-next { display: flex; gap: 8px; align-items: flex-start; font-size: 15px; font-weight: 600; line-height: 1.45; color: var(--hb-t1); }
.aw-next svg { flex: none; margin-top: 2px; color: var(--hb-ac); }
.aw-status-copy p.aw-status-names { color: var(--hb-t1); font-weight: 550; }
.aw-issue .hb-btn[data-variant='primary'] { background: var(--hb-ac-solid); }
.aw-issue .hb-btn[data-variant='primary']:hover:not(:disabled) { background: var(--hb-ac-solid-hover); }
.aw-issue .hb-step { --step-ink: var(--aw-observe); }
.aw-issue .hb-step:nth-child(2) { --step-ink: var(--aw-suspect); }
.aw-issue .hb-step:nth-child(3) { --step-ink: var(--aw-fault-ink); }
/* a progress display, not buttons: flat steps, no border or shadow; the active one only tinted */
.aw-issue .hb-step { box-shadow: none; border: 0; background: transparent; padding-inline: 4px; }
.aw-issue .hb-step[data-state='active'] { background: color-mix(in srgb, var(--step-ink) 9%, transparent); box-shadow: none; }
.aw-issue .hb-step[data-state='done'] .hb-step-n,
.aw-issue .hb-step[data-state='active'] .hb-step-n { background: color-mix(in srgb, var(--step-ink) 16%, var(--hb-s1)); color: var(--step-ink); }
.aw-issue .hb-step .hb-step-t { display: flex; }
.aw-issue .hb-step-t small { display: block; white-space: normal; font-size: 13px; }

.aw-band { --aw-chart-ink: var(--aw-suspect); position: relative; padding: 14px; border-radius: var(--hb-radius-nested, 12px); background: var(--hb-s2); }
.aw-issue[data-tier='observation'] .aw-band { --aw-chart-ink: var(--aw-observe); }
.aw-band svg { display: block; width: 100%; height: 104px; }
.aw-band-usual { fill: var(--aw-band-fill); }
.aw-band-today { fill: none; stroke: var(--aw-chart-ink); stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.aw-band-now { stroke: var(--hb-t2); stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
.aw-band-grid { stroke: var(--hb-t2); opacity: 0.16; vector-effect: non-scaling-stroke; }
.aw-band-ahead { opacity: 0.35; }
.aw-band-edge { fill: none; stroke: var(--aw-band-fill); stroke-width: 1.5; stroke-dasharray: 4 4; vector-effect: non-scaling-stroke; }
.aw-band-chart { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 8px; }
.aw-band-y { display: flex; flex-direction: column; justify-content: space-between; text-align: right; font-size: 13px; color: var(--hb-t2); white-space: nowrap; }
.aw-band-plot { position: relative; }
.aw-band-dot { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: var(--aw-chart-ink); box-shadow: 0 0 0 3px var(--hb-s2); translate: -50% -50%; }
.aw-band-tag { position: absolute; top: 0; white-space: nowrap; translate: 5px 0; padding: 1px 5px; border-radius: 4px; background: var(--hb-s2); color: var(--hb-t1); font-size: 13px; font-weight: 650; }
.aw-band-axis { grid-column: 2; display: flex; justify-content: space-between; color: var(--hb-t2); font-size: 13px; margin-top: 4px; }
.aw-band figcaption { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 8px; color: var(--hb-t2); font-size: var(--hb-type-caption, 14px); }
.aw-band figcaption i { display: inline-block; width: 14px; height: 8px; margin-right: 6px; border-radius: 3px; vertical-align: middle; }
.aw-key-usual { background: var(--aw-band-fill); }
.aw-key-today { background: var(--aw-chart-ink); height: 3px !important; }

.aw-gap { --gap-ink: var(--aw-suspect); display: grid; gap: 8px; padding: 14px; border-radius: var(--hb-radius-nested, 12px); background: var(--hb-s2); }
.aw-issue[data-tier='observation'] .aw-gap { --gap-ink: var(--aw-observe); }
.aw-issue[data-tier='confirmed'] .aw-gap { --gap-ink: var(--aw-fault-ink); }
.aw-gap figcaption { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; font-size: 14px; color: var(--hb-t1); font-weight: 600; }
.aw-gap figcaption span { color: var(--hb-t2); font-size: 13px; font-weight: 400; }
.aw-gap-scale { display: grid; gap: 6px; margin-top: 2px; }
.aw-gap-events, .aw-gap-hours { position: relative; height: 20px; color: var(--hb-t2); font-size: 13px; white-space: nowrap; }
.aw-gap-events span, .aw-gap-hours span { position: absolute; top: 0; translate: -50% 0; }
.aw-gap-events [data-align='start'] { translate: -6px 0; }
.aw-gap-events [data-align='end'] { translate: calc(-100% + 6px) 0; }
.aw-gap-events b { color: var(--hb-t1); font-size: 15px; }
.aw-gap-hours .aw-gap-now { left: auto; right: 0; translate: 0 0; }
.aw-gap-hours b { color: var(--hb-t1); }
.aw-gap-track { position: relative; height: 22px; }
.aw-gap-track > * { position: absolute; }
.aw-gap-data, .aw-gap-missing { top: 9px; height: 4px; border-radius: 2px; }
.aw-gap-data { left: 0; background: color-mix(in srgb, var(--hb-t2) 55%, transparent); }
.aw-gap-missing { right: 0; background: color-mix(in srgb, var(--gap-ink) 22%, transparent); }
.aw-gap-hour { top: -2px; bottom: -4px; width: 1.5px; background: var(--hb-t2); }
.aw-gap-got, .aw-gap-miss { top: 7px; width: 2px; height: 8px; translate: -1px 0; border-radius: 1px; }
.aw-gap-got { background: color-mix(in srgb, var(--hb-t2) 70%, transparent); }
.aw-gap-miss { background: var(--gap-ink); opacity: 0.85; }
.aw-gap-last { top: 5px; width: 12px; height: 12px; translate: -6px 0; border-radius: 50%; background: var(--hb-t1); box-shadow: 0 0 0 3px var(--hb-s2); }

.aw-tiles { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.aw-main .aw-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.aw-tiles .hb-tile { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 1px 8px; align-content: start; align-items: center; padding: 9px; min-height: 58px; }
.aw-tiles .hb-tile-icon { grid-row: span 2; width: 28px; height: 28px; margin: 0; }
.aw-tiles .hb-tile-label, .aw-tiles .hb-tile-status, .aw-tiles .hb-tile-detail { grid-column: 2; font-size: 13px; overflow-wrap: normal; }
.aw-tiles .hb-tile[data-tone='accent'] { background: color-mix(in srgb, var(--aw-observe) 9%, var(--hb-s1)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--aw-observe) 36%, var(--hb-s1)); }

.aw-side { padding: 20px; }
.aw-pad { margin: 0 0 8px; }
.aw-how { display: grid; gap: 14px; margin: 0 0 16px; padding: 0; list-style: none; }
.aw-how li { display: grid; grid-template-columns: max-content 1fr; align-items: start; gap: 10px; font-size: 14px; line-height: 1.45; color: var(--hb-t2); }
.aw-how .hb-pill { justify-self: start; }
.aw-privacy { display: flex; gap: 8px; align-items: flex-start; padding-top: 14px; border-top: 1px solid color-mix(in srgb, var(--hb-t1) 8%, transparent); color: var(--hb-t2); font-size: var(--hb-type-caption, 14px); line-height: 1.45; }
.aw-privacy svg { flex: none; margin-top: 1px; }
.aw-hidden-list { display: grid; gap: 4px; }
.aw-hidden-list .hb-status-row-detail { color: var(--hb-t2); }
.aw-excluded { margin-top: 8px; }
.aw-excluded ul { list-style: none; margin: 0 0 8px; padding: 0; }
.aw-excluded li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; column-gap: 8px; }
.aw-excluded li > span { min-width: 0; overflow-wrap: anywhere; }
.aw-excluded small { display: block; color: var(--hb-t2); }

@media (max-width: 1180px) {
  .aw-layout { grid-template-columns: minmax(0, 1fr); }
  .aw-rail { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
  .aw-rail .aw-devices { grid-row: 1; grid-column: 1 / -1; }
  .aw-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .aw-status { grid-template-columns: auto 1fr; }
  .aw-status .aw-strip { grid-column: 1 / -1; }
}
@media (max-width: 760px) {
  .aw-page { gap: 16px; }
  .aw-top h1 { font-size: 24px; }
  .aw-status { gap: 14px; padding: 18px; }
  .aw-status-copy h2 { font-size: 24px; }
  .aw-orb-lg { width: 52px; height: 52px; border-radius: 16px; }
  .aw-issue, .aw-side { padding: 16px; }
  .aw-rail, .aw-issues { grid-template-columns: minmax(0, 1fr); }
  .aw-tiles, .aw-main .aw-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .aw-tiles .hb-tile { grid-template-columns: 20px minmax(0, 1fr); gap: 1px 5px; padding: 8px 6px; }
  .aw-tiles .hb-tile-icon { width: 20px; height: 24px; }
  .aw-tiles .hb-tile-label { overflow-wrap: anywhere; }
  .aw .hb-seg button { padding-inline: 8px; }
  .aw-actions .aw-open { flex: 1 1 100%; }
  .aw-resolve-group { flex: 1; max-width: none; }
  .aw-resolve-group .hb-btn { width: 100%; }
  .aw-how li { grid-template-columns: 1fr; gap: 6px; }
}
@container (max-width: 460px) {
  .aw-issue-head { flex-wrap: wrap; }
  .aw-issue-head .hb-pill { order: -1; margin-left: auto; }
  .aw-issue-head .aw-issue-copy { flex-basis: 100%; }
  .aw-issue-head .aw-orb { order: -2; }
  .aw-issue .hb-step { flex-direction: column; align-items: flex-start; padding: 6px; }
}
`;
