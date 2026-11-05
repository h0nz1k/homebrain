/**
 * Přístup – layout only. All visual primitives (Card, Pill, StatusRow, Tile, SignalCard, Button, Switch,
 * SegmentedControl, Sheet, Stepper, LiveStatus, EmptyState, Stat) come from @homebrain/ui; this file only places
 * them on the page and draws the enrolment illustrations.
 */
export const accessLayout = String.raw`
.ac{display:flex;flex-direction:column;gap:var(--hb-sp-4);padding:var(--hb-space-page,var(--hb-sp-5));max-width:1240px;margin:0 auto;color:var(--hb-t1)}
.ac-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:var(--hb-sp-3)}
.ac-head h1{margin:0;font-size:var(--hb-type-headline);font-weight:var(--hb-font-display-weight,650);letter-spacing:var(--hb-tracking-display)}
.ac-head p,.ac-muted{margin:0;color:var(--hb-t2);font-size:var(--hb-font-sm)}
.ac-pills,.ac-chips{display:flex;flex-wrap:wrap;align-items:center;gap:var(--hb-sp-2)}
.ac-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--hb-sp-3)}
.ac-hero{display:flex;flex-wrap:wrap;align-items:center;gap:var(--hb-sp-4)}
.ac-hero>div{flex:1;min-width:240px}
.ac-hero h2{margin:0 0 var(--hb-sp-1);font-size:var(--hb-font-lg,1.125rem);font-weight:650}
.ac-hero p{margin:0;color:var(--hb-t2)}
.ac-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.ac-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:var(--hb-sp-4)}
.ac-person{display:flex;flex-direction:column;gap:var(--hb-sp-1);container-type:inline-size}
.ac-person-head{display:flex;align-items:center;gap:var(--hb-sp-2);min-height:40px}
.ac-person-title{display:flex;flex:1;flex-direction:column;gap:2px;min-width:0}
.ac-person-title small{color:var(--hb-t2);font-size:var(--hb-font-sm)}
.ac-off{color:var(--hb-t1);font-weight:600}
.ac-person-title h3{margin:0 var(--hb-sp-1) 0 0;font-size:var(--hb-type-title);font-weight:650;letter-spacing:var(--hb-tracking-display);overflow-wrap:anywhere}
.ac-person-menu{margin-left:var(--hb-sp-2);margin-right:calc(-1 * var(--hb-sp-2));color:var(--hb-t2)}
.ac-creds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--hb-sp-2)}
.ac-creds[data-cols='2']{grid-template-columns:repeat(2,minmax(0,1fr))}
.ac-person[data-allowed='false'] .ac-creds .hb-tile-icon{filter:grayscale(1);opacity:.7}
.ac-person[data-allowed='false'] .ac-avatar{filter:grayscale(1)}
.ac-h{margin:0 0 var(--hb-sp-2);font-size:var(--hb-type-title);font-weight:650}
.ac-next{color:var(--hb-t2);font-size:var(--hb-font-sm)}
.ac-attn .hb-signal{margin:0}
.ac-attn .hb-signal-copy h3{white-space:normal;overflow:visible}
.ac-avatar{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:50%;font-weight:650;font-size:var(--hb-font-md);color:var(--av);background:color-mix(in srgb,var(--av) 16%,var(--hb-s1))}
.ac-avatar[data-hue='0']{--av:var(--hb-ac)}.ac-avatar[data-hue='1']{--av:#0f9d8a}.ac-avatar[data-hue='2']{--av:#8b5cf6}.ac-avatar[data-hue='3']{--av:#d9480f}.ac-avatar[data-hue='4']{--av:#c2255c}
.ac-person-head{margin-bottom:var(--hb-sp-1)}
.ac-rows{display:flex;flex-direction:column}
.ac-rows .hb-status-row{flex-wrap:wrap;align-items:center;row-gap:var(--hb-sp-2)}
.ac-rows .hb-status-row-copy{flex:1 1 0;min-width:0}
.ac-rows .hb-status-row-label{font-weight:600}
.ac-rows .hb-status-row strong{display:flex;flex:none}
.ac-state{display:grid;place-items:center}
.ac-state svg{width:22px;height:22px}
.ac-rows .hb-status-row:has([data-testid=access-reenroll-chip]) .hb-status-row-copy{flex:1 0 auto;min-width:min-content}
.ac-rows .hb-status-row-copy .hb-pill{align-self:flex-start;margin-top:2px}
.ac-rows .hb-status-row-action{margin-left:auto}
.ac-rows .hb-status-row-label .hb-pill{font-weight:600}
.ac-hero-icon{display:grid;place-items:center;flex:none;width:48px;height:48px;border-radius:var(--hb-radius-md);color:var(--hb-warn);background:color-mix(in srgb,var(--hb-warn) 14%,transparent)}
.ac-hero-icon[data-tone='ok']{color:var(--hb-ok);background:color-mix(in srgb,var(--hb-ok) 14%,transparent)}
.ac-hero-icon svg{width:26px;height:26px}
.ac-rows>:last-child,.ac-section>.hb-status-row:last-child{border-bottom:0}
.ac-section{display:flex;flex-direction:column;gap:var(--hb-sp-2)}
.ac-split{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:var(--hb-sp-4);align-items:start}
.ac-hands{display:grid;grid-template-columns:1fr 1fr;gap:var(--hb-sp-3)}
.ac-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--hb-sp-4)}
.ac-tiles-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.ac-tiles>*{display:flex;flex-direction:column;align-items:flex-start;gap:var(--hb-sp-3)}
.ac-center{display:flex;justify-content:center}
.ac-mt{margin-top:var(--hb-sp-3)}
.ac-grow{flex:1}
.ac-chip-btn{padding:0;border:0;background:none;cursor:pointer;font:inherit}
.ac-field{display:flex;flex-direction:column;gap:var(--hb-sp-2);color:var(--hb-t2);font-size:var(--hb-font-sm)}
.ac-field input{min-height:52px;padding:0 var(--hb-sp-4);border:1px solid var(--hb-b2);border-radius:var(--hb-radius-chip);background:var(--hb-s2);color:var(--hb-t1);font:inherit;font-size:var(--hb-font-md)}
.ac-field input:focus{outline:2px solid var(--hb-ac);outline-offset:1px}
.ac-wiz{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:var(--hb-sp-5);align-items:center;color:var(--hb-t1)}
.ac-wiz-copy{display:flex;flex-direction:column;gap:var(--hb-sp-3)}
.ac-wiz-copy h3{margin:0;font-size:var(--hb-type-title);font-weight:650}
.ac-tips{display:flex;flex-direction:column;gap:var(--hb-sp-2);margin:0;padding-left:0;list-style:none;counter-reset:tip}
.ac-tips li{position:relative;display:flex;flex-direction:column;padding-left:36px;counter-increment:tip}
.ac-tips li::before{content:counter(tip);position:absolute;left:0;top:0;display:grid;place-items:center;width:24px;height:24px;border-radius:var(--hb-radius-sm,8px);font-size:var(--hb-font-sm);font-weight:650;color:var(--hb-t2);background:color-mix(in srgb,var(--hb-t1) 8%,transparent)}
.ac-tips span{color:var(--hb-t2);font-size:var(--hb-font-sm)}
.ac-illu{position:relative;border-radius:var(--hb-radius-card);background:var(--hb-fill);overflow:hidden}
.ac-illu svg{display:block;width:100%;height:auto}
.ac-illu-lbl{position:absolute;left:50%;bottom:var(--hb-sp-2);transform:translateX(-30%)}
.ac-scan{position:absolute;left:52%;top:14%;width:34%;height:2px;background:var(--hb-ac);box-shadow:0 0 12px var(--hb-ac);animation:ac-scan 2.2s ease-in-out infinite alternate}
@keyframes ac-scan{to{top:72%}}
@media (prefers-reduced-motion:reduce){.ac-scan{animation:none}}
.ac-enrol{display:flex;flex-direction:column;gap:var(--hb-sp-2)}
.ac-enrol .hb-live{max-width:760px}
.ac-enrol-who{display:block;margin-top:2px;font-size:var(--hb-type-caption,12px);font-weight:600;letter-spacing:.01em}
.ac-enrol [data-testid='access-enrol-hint']{display:block}
.ac-log{display:flex;flex-direction:column;gap:var(--hb-sp-3)}
.ac-log-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--hb-sp-2)}
.ac-log-range{color:var(--hb-t2);font-size:var(--hb-font-sm)}
.ac-log-day .ac-h{position:sticky;top:0}
.ac-log-src{font-weight:600;color:var(--hb-t2)}
@media (max-width:1000px){.ac-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.ac-split{grid-template-columns:1fr}}
@media (max-width:600px){.ac{padding:var(--hb-sp-3)}.ac-bar>.hb-btn{flex:1 1 100%}.ac-grid{grid-template-columns:1fr}.ac-wiz{grid-template-columns:1fr}.ac-illu{max-height:180px}}
`;
