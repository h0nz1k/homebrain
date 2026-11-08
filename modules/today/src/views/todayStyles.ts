/** Plain exported CSS survives both tsc package builds and the panel's Vite bundle. */
export const todayStyles = `
.hb-shell main:has(.hb-today){padding:0}
.hb-today{position:relative;isolation:isolate;overflow:hidden;min-width:0;min-height:100%;font-family:Inter,system-ui,sans-serif;color:var(--hb-t1);font-variant-numeric:tabular-nums;--hb-m-xfade:3s;--hb-m-night:20s}
.hb-today *{box-sizing:border-box}
.today-content{position:relative;z-index:1;display:flex;flex-direction:column;gap:16px;width:100%;height:100%;min-height:0;padding:28px 48px 22px}
.today-header{display:flex;justify-content:space-between;align-items:center;gap:16px;color:var(--hb-t2);text-transform:none;font-size:20px}
.today-header time::first-letter{text-transform:uppercase}
.today-presence{flex:none}
.today-kiosk .hb-presence[data-size='lg']{--hb-presence-avatar:36px}
.today-kiosk .hb-presence-avatar{font-size:max(16px,calc(var(--hb-presence-avatar) * .42))}
.today-kiosk .hb-presence[data-size='lg'] .hb-presence-list{flex-wrap:nowrap;gap:10px}
.today-kiosk .hb-presence[data-size='lg'] .hb-presence-person{gap:10px;padding-right:16px;background:rgba(17,25,35,.86);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12),0 2px 10px rgba(4,8,16,.25)}
.today-kiosk .hb-presence[data-size='lg'] .hb-presence-person[data-status='home']{background:rgba(32,43,58,.9);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 2px 10px rgba(4,8,16,.25)}
.today-kiosk .hb-presence[data-size='lg'] .hb-presence-name{font-size:20px}
.today-kiosk:not(.today-portrait) .today-hero{padding-bottom:72px}
.today-kiosk:not(.today-portrait) .today-hero>.today-presence{position:absolute;left:0;bottom:4px;z-index:1;max-width:calc(100% - 270px)}
.today-kiosk.today-busy:not(.today-portrait) .today-hero{padding-bottom:46px}
.today-kiosk.today-busy:not(.today-portrait) .today-hero>.today-presence{bottom:2px}
.today-kiosk.today-busy .hb-presence[data-size='lg']{--hb-presence-avatar:24px;--hb-presence-ring:2px}
.today-kiosk.today-busy .hb-presence[data-size='lg'] .hb-presence-text{flex-direction:row;align-items:baseline;gap:6px}
.today-kiosk.today-busy .hb-presence[data-size='lg'] .hb-presence-name{font-size:17px}
.today-kiosk.today-busy .hb-presence[data-size='lg'] .hb-presence-state{font-size:16px}
.today-kiosk.today-busy .hb-presence[data-size='lg'] .hb-presence-state::before{width:8px;height:8px}
.today-hero{position:relative;display:flex;justify-content:space-between;align-items:baseline;flex:none;min-height:200px;padding-bottom:60px}
.today-clock{font-size:clamp(96px,12vw,168px);font-weight:var(--hb-display-w,200);letter-spacing:-.055em;line-height:1.1;position:relative}
.today-weather{text-align:right;align-self:baseline;position:relative;--temp-size:clamp(70px,9vw,128px)}
.today-temperature{display:flex;align-items:baseline;justify-content:flex-end;gap:22px;font-size:var(--temp-size);font-weight:200;line-height:1.1;letter-spacing:-.05em}
.today-temperature sup{font-size:max(16px,.3em);vertical-align:super;letter-spacing:0;margin-left:4px}
.today-weather-icon{width:1em;height:1em;flex:none;vertical-align:middle}
.today-temperature .today-weather-icon{--hb-icon-stroke:var(--hb-icon-stroke-lg,2.5px)}
.today-temperature .today-weather-icon{align-self:center;height:.62em;width:.62em;color:var(--hb-weather-sun,#eac178);letter-spacing:0}
.today-condition{position:absolute;top:100%;right:0;white-space:nowrap;font-size:20px;color:var(--hb-t2);margin-top:8px}
.today-station{position:absolute;top:calc(100% + 36px);right:0;white-space:nowrap;font-size:14px;color:var(--hb-t2)}
.today-sun-band{position:absolute;inset:0;overflow:visible;pointer-events:none;color:var(--hb-t1)}
.today-sun-band svg{width:100%;height:100%}
.today-summary{font-size:22px;line-height:1.4;margin:0;flex:none;color:var(--hb-t2)}
.today-ribbon-card{min-height:0;flex:none;display:flex;flex-direction:column;background:var(--hb-glass,var(--hb-s1));border:1px solid var(--hb-glass-edge,var(--hb-b1));border-radius:var(--hb-radius-hero,18px);padding:18px 24px}
.today-ribbon-heading{display:flex;justify-content:space-between;gap:12px;font-size:16px;color:var(--hb-t2)}
.today-ribbon-heading span{font-size:14px;color:var(--hb-t2)}
.today-ribbon-card .hb-ribbon{border:0;background:transparent;padding:12px 48px 0}
.today-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;flex:none;min-height:0}
.today-cards .hb-signal{min-width:0;padding:16px;align-content:start}
.today-cards .hb-signal h3{font-size:18px}
/* auto-fill (#64): a lone chip keeps its own column instead of stretching into a full-width strip. */
.today-chips{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;width:100%;flex:none}
.today-chips .hb-chip{max-width:100%;white-space:normal;width:max-content;justify-self:start}
.today-home{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);align-items:start;gap:12px;flex:none;min-height:0}
.today-home-tile{display:flex;flex-direction:column;gap:8px;min-width:0;margin:0;padding:14px 20px;text-align:left;font:inherit;color:inherit;background:var(--hb-glass,var(--hb-s1));border:1px solid var(--hb-glass-edge,var(--hb-b1));border-radius:var(--hb-radius-hero,18px)}
.today-home-title{margin:0;font-size:15px;font-weight:600;color:var(--hb-t1)}
.today-meal-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px 24px}
.today-meal-list li{display:flex;flex-direction:column;gap:2px;min-width:0}
.today-meal-type{font-size:14px;color:var(--hb-t2)}
.today-meal-name{font-size:18px;font-weight:500;color:var(--hb-t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.today-meal-link{all:unset;cursor:pointer;font-size:18px;font-weight:500;color:var(--hb-ac);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;border-radius:6px}
.today-meal-link::after{content:' ›';color:var(--hb-t2)}
.today-meal-link:hover{text-decoration:underline}
.today-meal-link:focus-visible,.today-chores:focus-visible{outline:2px solid var(--hb-ac);outline-offset:2px}
.today-home-empty{margin:0;font-size:16px;color:var(--hb-t2)}
.today-chores{cursor:pointer}
.today-chores:hover{border-color:var(--hb-b2)}
.today-chore-list{display:flex;flex-direction:column;gap:8px}
.today-chore-kid{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:2px 10px}
.today-chore-name{font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.today-chore-count{font-size:16px;font-weight:600}
.today-chore-late{grid-column:1/-1;font-size:14px;font-weight:500;color:var(--hb-warn,#d99a3a)}
.today-chore-bar{grid-column:1/-1;height:6px;border-radius:3px;margin-top:2px;background:color-mix(in srgb,var(--hb-t1) 14%,transparent);overflow:hidden}
.today-chore-kid[data-late] .today-chore-bar{background:color-mix(in srgb,var(--hb-warn,#d99a3a) 30%,transparent)}
.today-chore-kid[data-late] .today-chore-count{color:var(--hb-warn,#d99a3a)}
.today-chore-bar>span{display:block;height:100%;border-radius:inherit;background:var(--hb-ok,#3fb27f)}
.today-mobile .today-home{grid-template-columns:1fr}
.today-mobile .today-home-tile{padding:12px 16px}
.today-mobile .today-meal-list{grid-template-columns:1fr;gap:10px}
.today-mobile .today-meal-name,.today-mobile .today-meal-link{font-size:17px}
/* Kiosk 1280×800: one-line strips (title + items in a row) so Dnes still fits without scroll. */
.today-kiosk .today-home{grid-template-columns:minmax(0,1fr) auto}
.today-kiosk .today-home-tile{flex-direction:row;align-items:baseline;gap:18px;padding:14px 22px;min-width:0}
.today-kiosk .today-chore-late::before{content:'· '}
.today-kiosk .today-home-title{flex:none;width:7.5em}
.today-kiosk .today-chores .today-home-title{width:auto}
.today-kiosk .today-home-title,.today-kiosk .today-meal-type,.today-kiosk .today-chore-late,.today-kiosk .today-home-empty,.today-kiosk .today-chore-name,.today-kiosk .today-chore-count{font-size:16px}
.today-kiosk .today-meal-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 24px;flex:1;min-width:0}
.today-kiosk .today-meal-list li{flex-direction:row;align-items:baseline;gap:8px}
.today-kiosk .today-meal-type{flex:none}
.today-kiosk .today-meal-name{font-size:19px}
.today-kiosk .today-chore-list{gap:2px}
.today-kiosk .today-chore-kid{display:flex;align-items:baseline;gap:6px;min-width:0}
.today-kiosk .today-chore-bar{display:none}
.today-footer{display:flex;flex-wrap:wrap;gap:16px;font-size:14px;color:var(--hb-t3);flex:none}
.today-footer a{color:var(--hb-ac)}
.today-desktop{height:calc(100dvh - 56px);min-height:0}
.today-busy .today-content{gap:12px;padding-top:20px}
.today-busy .today-hero{min-height:110px}
.today-busy .today-clock{font-size:96px}
.today-busy .today-weather{--temp-size:72px}
.today-busy .today-summary{font-size:18px}
.today-busy .today-ribbon-card{min-height:0;flex:none;padding:10px 20px}
.today-busy .hb-hero{padding:16px 22px;flex:none}
.today-busy .hb-hero h2{font-size:28px}
.today-busy .hb-signal-context{font-size:14px;margin:4px 0}
.today-busy .hb-signal-value strong{font-size:34px}
.today-busy .hb-signal-severity,.today-busy .hb-signal-also{font-size:13px}
.today-kiosk{--hb-s1:#111923;--hb-s2:#161e2c;--hb-s3:#1c2532;--hb-b1:#293443;--hb-b2:#344252;height:100dvh;min-height:0;--hb-t1:#E6EAF0;--hb-t2:#B8C1CE;--hb-t3:#97A2B3;color:var(--hb-t1);font-size:16px;--hb-glass:linear-gradient(180deg,rgba(20,28,44,.78),rgba(10,15,25,.82))}
.today-kiosk .today-content{padding:26px 44px 24px}
.today-kiosk.today-busy .today-content{gap:8px;padding:16px 44px 14px}

.today-kiosk.today-busy .today-hero{min-height:110px}
.today-kiosk .hb-signal-compact .hb-signal-severity{display:block}
.today-kiosk .hb-signal-value>span{font-size:16px}
.today-kiosk .today-cards{min-height:100px}
.today-kiosk .today-clock{font-size:160px}
.today-kiosk.today-busy .today-clock{font-size:96px}
.today-kiosk .today-footer,.today-kiosk .today-station,.today-kiosk .today-ribbon-heading span,.today-kiosk .hb-ribbon-label,.today-kiosk .hb-ribbon-tick,.today-kiosk .hb-ribbon-now>span,.today-kiosk .hb-signal-severity,.today-kiosk .hb-signal-context,.today-kiosk .hb-signal-also,.today-kiosk .hb-pill,.today-kiosk .hb-signal-value small,.today-kiosk button,.today-kiosk .hb-signal-action span{font-size:16px}
.today-kiosk .hb-signal-action{margin-top:4px}
.today-night .today-content{justify-content:center;align-items:center;color:#CDBFAF;--hb-t1:#CDBFAF;--hb-t2:#CDBFAF}
.today-night .today-hero{flex-direction:column;width:100%;gap:20px}
.today-night .today-clock{font-size:clamp(120px,18vw,220px)}
.today-night .today-weather{--temp-size:64px;text-align:center}
.today-tomorrow{font-size:22px;text-align:center;margin:20px 0}
.today-night-overlay{position:absolute;inset:0;z-index:2;pointer-events:none;background:#000;opacity:0;transition:opacity var(--hb-m-night) linear}
.today-night .today-night-overlay{opacity:.65}
.today-ambient,.today-ambient .scene{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.today-ambient .scene{background:linear-gradient(180deg,var(--sky-top),var(--sky-mid) 46%,var(--sky-horizon) 76%,#05070b);transition:opacity var(--hb-m-xfade) ease-in-out}
.today-ambient .scene>div{position:absolute;inset:0}
.today-clouds{inset:-30px;opacity:var(--cloud-opacity);background:radial-gradient(ellipse at 18% 20%,#8c9bb04d,transparent 38%),radial-gradient(ellipse at 78% 35%,#8c9bb055,transparent 36%),radial-gradient(ellipse at 40% 60%,#8c9bb033,transparent 30%)}
.today-clouds-far{animation:today-drift-far 240s ease-in-out infinite alternate}
.today-clouds-near{background-position:0 0;animation:today-drift-near 180s ease-in-out infinite alternate}
.today-glow{inset:64px 44px auto;height:130px;overflow:hidden;background:radial-gradient(140px 90px at var(--sun-x) var(--sun-y),#ffce8c18,transparent);animation:today-glow 90s ease-in-out infinite alternate}
.today-rain{inset:-40px;opacity:var(--rain-opacity);background:repeating-linear-gradient(112deg,transparent 0 17px,#8da6c712 18px 19px,transparent 20px 32px);animation:today-rain 60s linear infinite alternate}
.today-stars{inset:0 0 40%;background:radial-gradient(1px 1px at 12% 18%,#cfd6e4,transparent),radial-gradient(1px 1px at 33% 9%,#cfd6e4,transparent),radial-gradient(1px 1px at 57% 22%,#cfd6e4,transparent),radial-gradient(1px 1px at 71% 6%,#cfd6e4,transparent),radial-gradient(1px 1px at 88% 27%,#cfd6e4,transparent)}
.today-hills{inset:0;height:100%;background:#070c14;clip-path:polygon(0 94%,12% 91%,25% 92%,38% 94%,55% 90%,70% 93%,86% 91%,100% 94%,100% 100%,0 100%)}
.today-hills-near{height:100%;background:#04070c;clip-path:polygon(0 98%,20% 95%,45% 98%,70% 96%,100% 97%,100% 100%,0 100%);transform:scaleX(-1)}
.today-severity-light{inset:35% 0 0;background:radial-gradient(ellipse at 50% 110%,var(--severity-color),transparent 70%);opacity:var(--severity-opacity)}
.today-paused .today-ambient *,.today-night .today-clouds,.today-night .today-glow,.scene:not(:last-child)>div{animation-play-state:paused!important}
.today-reduced-motion *,.today-reduced-motion *::after{animation:none!important}
.today-reduced-motion{--hb-m-xfade:.2s}
@keyframes today-drift-far{from{transform:translateX(-16px)}to{transform:translateX(16px)}}
@keyframes today-drift-near{from{transform:translateX(0)}to{transform:translateX(28px)}}
@keyframes today-glow{from{opacity:.85}to{opacity:1}}
@keyframes today-rain{from{transform:translateY(0)}to{transform:translateY(40px)}}
@media(prefers-reduced-motion:reduce){.hb-today{--hb-m-xfade:.2s}.hb-today *,.hb-today *::after{animation:none!important}}
@media(max-width:760px){
.today-mobile .today-content{padding:20px 16px 24px;gap:16px}
.today-mobile .today-header{font-size:16px}
.today-mobile .today-hero{min-height:125px;align-items:baseline}
.today-mobile .today-clock{font-size:clamp(58px,17vw,92px)}
.today-mobile .today-weather{--temp-size:clamp(38px,10vw,64px)}
.today-mobile .today-temperature{gap:6px}
.today-mobile .today-condition{font-size:13px;max-width:62vw}
.today-mobile .today-station{font-size:13px}
.today-mobile .today-summary{font-size:17px}
.today-mobile .today-ribbon-card{min-height:0;padding:16px 8px}
.today-mobile .today-ribbon-heading{padding:0 8px}
.today-mobile .today-ribbon-heading span{display:none}
.today-mobile .hb-ribbon{padding-left:28px;padding-right:28px}
.today-mobile .hb-ribbon-tick{font-size:11px}
.today-mobile .hb-ribbon-hourly{font-size:12px;gap:2px}
.today-mobile .today-cards{grid-template-columns:1fr}
.today-mobile .today-cards .hb-signal{padding:12px}
.today-mobile .today-footer{font-size:13px;gap:8px}
.today-mobile .hb-hero{padding:16px}
}
.today-content::before{content:'';flex:1 1 0;min-height:0}
.today-header{order:-1;flex:none}
.today-sun-glow{position:absolute;width:160px;height:160px;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle,rgba(255,221,168,.32),rgba(255,221,168,0) 70%)}
.today-kiosk .today-cards{grid-template-columns:repeat(auto-fit,minmax(0,1fr))}
.today-kiosk .hb-ribbon-inner{--ribbon-label-size:16}
.today-kiosk .hb-ribbon-hourly{font-size:16px}
.today-kiosk .hb-signal-copy,.today-kiosk .hb-signal-value{min-width:0}
.today-kiosk[data-state-severity=critical] .today-clock{font-size:88px}
.today-kiosk[data-state-severity=critical] .today-weather{--temp-size:72px}
.today-kiosk[data-state-severity=critical] .hb-hero{background:rgba(80,14,18,.82);border:2px solid var(--hb-crit)}
.today-kiosk[data-state-severity=critical] .hb-hero h2{font-size:40px;font-weight:600}
.today-kiosk[data-state-severity=critical] .hb-hero .hb-signal-value strong{font-size:64px;font-weight:500}
.today-kiosk .hb-signal-severity,.today-kiosk .hb-signal-also,.today-kiosk .hb-signal-value>span{color:var(--hb-t2)}
.today-mobile .today-content::before,.today-night .today-content::before{display:none}
.today-mobile .today-chips{grid-template-columns:repeat(2,minmax(0,1fr))}
.today-mobile .today-station{top:calc(100% + 28px)}
.today-mobile .today-temperature .today-weather-icon{font-size:var(--temp-size)}
.today-busy .today-hero{padding-bottom:40px}
.today-busy .today-condition{font-size:16px;margin-top:4px}
.today-busy .today-station{top:calc(100% + 26px)}
.today-busy .hb-ribbon-inner{height:116px}
.today-busy .hb-ribbon-track,.today-busy .hb-ribbon-past,.today-busy .hb-ribbon-rain{top:34px}
.today-busy .hb-ribbon-item{top:29px}
.today-busy .hb-ribbon-cheap{top:51px}
.today-busy .hb-ribbon-now{top:21px}
.today-busy .hb-ribbon-tick{top:62px}
.today-busy .hb-ribbon-hourly{top:88px}
.today-busy .hb-ribbon-slim .hb-ribbon-inner{height:90px}
.today-busy .hb-signal{gap:8px}
.today-busy .today-cards .hb-signal{padding:12px}
.today-busy .hb-signal-action button{min-height:36px;padding:4px 12px}
.today-mobile .hb-ribbon-inner{height:140px}
.today-mobile .today-hero{padding-bottom:50px}
.today-kiosk.today-busy .today-station{font-size:16px}
/* Kiosk critical takeover: alert above the ribbon, 56 px title, secondary cards visibly subordinate. */
.today-kiosk[data-state-severity=critical] .hb-hero{padding:18px 26px}
.today-kiosk[data-state-severity=critical] .hb-hero h2{font-size:56px;line-height:1.1;letter-spacing:-.01em}
.today-kiosk[data-state-severity=critical] .hb-hero .hb-signal-context{font-size:20px;color:var(--hb-t1)}
.today-kiosk[data-state-severity=critical] .hb-hero .hb-signal-value strong{font-size:72px}
.today-kiosk[data-state-severity=critical] .today-cards{min-height:0}
.today-kiosk[data-state-severity=critical] .today-cards .hb-signal{padding:10px 14px;gap:4px 12px;opacity:.8;background:rgba(14,20,30,.55);border-color:var(--hb-b1);box-shadow:none}
.today-kiosk[data-state-severity=critical] .today-cards .hb-signal h3{font-size:18px;font-weight:500;color:var(--hb-t2)}
.today-kiosk[data-state-severity=critical] .today-cards .hb-signal-context{display:none}
.today-kiosk[data-state-severity=critical] .today-cards .hb-signal-value strong{font-size:22px}
.today-kiosk[data-state-severity=critical] .today-cards .hb-signal-action button{min-height:32px;padding:2px 10px}
/* Sun arc strokes follow the text colour, tuned per theme for contrast. */
.today-sun-band path{stroke:currentColor;stroke-width:1.5}
.today-sun-elapsed{stroke-opacity:.24}
.today-sun-remaining{stroke-opacity:.16}
[data-theme='light'] .today-sun-band{color:#4a5361}
[data-theme='light'] .today-sun-elapsed{stroke-opacity:1;stroke-width:2.5}
[data-theme='light'] .today-sun-remaining{stroke-opacity:.8;stroke-width:2;stroke-dasharray:4 6}
[data-theme='light'] .today-sun-glow{background:radial-gradient(circle,rgba(234,160,60,.38),rgba(234,160,60,0) 70%)}
/* Sunrise tick mirrors the sunset marker. */
.hb-ribbon-item.hb-ribbon-sun{z-index:1;top:38px;height:32px;width:3px;margin-left:-1px;background:var(--hb-weather-sun,#eac178);box-shadow:0 0 0 1.5px #0b111b}
.today-busy .hb-ribbon-item.hb-ribbon-sun{top:24px}
[data-theme='light'] .hb-ribbon-item.hb-ribbon-sun{background:#b86e00;box-shadow:0 0 0 1.5px #4a5361}
.hb-ribbon-item.hb-ribbon-event{width:4px;border-radius:2px}
.today-mobile .hb-signal-action{flex-wrap:wrap}
.today-mobile .hb-signal-action>span{white-space:normal;overflow:visible}
/* Fixed mobile tab bar: content must clear it (tab bar + safe area + breathing room). */
.hb-shell[data-narrow='true'] .hb-today .today-content,.hb-shell[data-layout-mobile='true'] .hb-today .today-content{padding-bottom:calc(var(--hb-tabbar-height,72px) + env(safe-area-inset-bottom,0px) + 24px)}
/* ── Ambient kiosk (#38): wall tablet readable from 3 m ── */
.today-kiosk{--hb-space-page:56px}
.today-kiosk.today-calm .today-content{padding:24px var(--hb-space-page) 32px;gap:14px}
.today-kiosk.today-calm .today-header{font-size:22px;color:var(--hb-t1)}
.today-kiosk.today-calm .today-summary{font-size:26px;color:var(--hb-t1);font-weight:300}

.today-kiosk.today-calm .today-ribbon-heading{font-size:18px}
.today-kiosk.today-calm .hb-ribbon-hourly{font-size:18px}
.today-kiosk .hb-ribbon-hourly[data-past='true']{opacity:.45}
.today-kiosk .today-chips .hb-chip{font-size:18px;padding:6px 14px}
.today-kiosk.today-calm .today-cards .hb-signal h3{font-size:22px}
/* Status pill: quiet when fresh, explicit when the data are old or HA is offline. */
.today-kiosk .today-kiosk-status-fresh{background:transparent;border-color:transparent;color:var(--hb-t3)}
.today-kiosk .today-kiosk-status-stale,.today-kiosk .today-kiosk-status-offline{font-size:20px!important;padding:8px 16px;font-weight:500}
.today-kiosk .today-kiosk-status-stale{background:rgba(245,165,36,.16);border-color:rgba(245,165,36,.55);color:#F7C77A}
.today-kiosk .today-kiosk-status-offline{background:rgba(245,165,36,.2);border-color:rgba(245,165,36,.7);color:#F7C77A}
.today-kiosk.today-stale::after{content:'';position:absolute;inset:0 0 auto;height:3px;z-index:3;background:var(--hb-warn);opacity:.7}
.today-stale .today-temperature,.today-stale .today-condition,.today-stale .today-summary,.today-stale .today-ribbon-card,.today-stale .today-chips{opacity:.45;filter:saturate(.3)}
.today-stale .today-station{color:#F7C77A}
.today-night .today-kiosk-status{margin-top:8px;opacity:.9}
/* Night: smaller, warm and centred – a calm clock, not a lamp. */
.today-kiosk.today-night .today-clock{font-size:clamp(120px,14vw,180px)}
.today-kiosk.today-night .today-hero{align-items:center;justify-content:center;padding:0}
.today-kiosk.today-night .today-weather{align-self:center;display:flex;flex-direction:column;align-items:center}
.today-kiosk.today-night .today-temperature{justify-content:center;color:#CDBFAF}
.today-kiosk.today-night .today-tomorrow{font-size:26px;color:#E0D3C3;max-width:80%;margin:12px auto 0}
/* Weather icon colour by meaning: warm only for sun/moon, cool for rain/snow/cloud. */
.today-kiosk .today-temperature .today-weather-icon[data-icon=rain],.today-kiosk .today-temperature .today-weather-icon[data-icon=snow]{color:#8EC5FF}
.today-kiosk .today-temperature .today-weather-icon[data-icon=cloudy],.today-kiosk .today-temperature .today-weather-icon[data-icon=wind]{color:#B8C1CE}
/* Portrait wall tablet (800×1280): stacked hero at the top, content fills the height. */
.today-portrait .today-content{padding:40px 40px 48px;gap:24px;justify-content:center}
.today-portrait .today-content::before{display:none}
.today-portrait .today-hero{flex-direction:column;align-items:center;min-height:0;padding:12px 0 0;gap:6px}
.today-portrait .today-clock{font-size:220px;line-height:1.15}
.today-portrait .today-weather{align-self:center;width:100%;display:flex;flex-direction:column;align-items:center;text-align:center;--temp-size:112px}
.today-portrait .today-temperature{justify-content:center}
.today-portrait .today-condition,.today-portrait .today-station{position:static;margin-top:0}
.today-portrait .today-condition{font-size:28px;color:var(--hb-t1)}
.today-portrait .today-summary{text-align:center;font-size:30px;margin:8px 0 6px}
.today-portrait .today-header{position:absolute;top:32px;left:40px;right:40px}
.today-portrait.today-calm .today-hero{margin-top:40px}
.today-portrait .today-chips{margin-top:4px}
.today-portrait.today-calm .today-chips{grid-template-columns:1fr;text-align:center}
.today-portrait .today-chips .hb-chip{justify-content:center;font-size:22px;padding:10px 16px;width:100%;justify-self:stretch}
.today-portrait .today-ribbon-heading{font-size:20px}
.today-portrait .today-ribbon-heading span{display:none}
.today-portrait .today-cards{grid-template-columns:1fr}
.today-portrait .today-cards .hb-signal h3{font-size:24px}
.today-portrait .today-chips{grid-template-columns:1fr 1fr}
.today-portrait.today-busy .today-content{padding-top:84px;gap:22px}
.today-portrait.today-busy .today-clock{font-size:132px}
.today-portrait.today-busy .today-hero{flex-direction:row;justify-content:space-between;align-items:center;padding:0}
.today-portrait.today-busy .today-weather{width:auto;align-items:flex-end;text-align:right}
.today-portrait.today-busy .today-summary{text-align:left;font-size:26px;margin:0}
.today-portrait.today-busy .today-weather{--temp-size:84px}
.today-portrait[data-state-severity=critical] .today-clock{font-size:120px}
.today-portrait[data-state-severity=critical] .today-ribbon-card{margin-top:0}
.today-portrait.today-night .today-clock{font-size:168px}
.today-portrait.today-night .today-header{display:none}
/* Calendar agenda under the ribbon: quiet pills, time first (Apple-style agenda). */
.today-agenda{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0;padding:14px 0 0;border-top:1px solid color-mix(in srgb,var(--hb-t1) 9%,transparent)}
.today-agenda li{display:inline-flex;align-items:center;gap:8px;min-width:0;max-width:100%;padding:6px 14px 6px 12px;border-radius:999px;font-size:14px;line-height:1.3;color:color-mix(in srgb,var(--hb-t1) 86%,transparent);background:color-mix(in srgb,var(--hb-t1) 7%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--hb-t1) 13%,transparent)}
.today-agenda li::before{content:'';flex:none;width:7px;height:7px;border-radius:50%;background:var(--hb-ac)}
.today-agenda time{flex:none;color:var(--hb-t1);font-weight:600}
.today-agenda span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hb-today .hb-ribbon-item.hb-ribbon-event{background:var(--hb-tone,var(--hb-ac))}
.today-busy .today-agenda{margin-top:10px;padding-top:10px}
.today-mobile .today-agenda{margin:12px 8px 0;gap:6px}
.today-mobile .today-agenda li{font-size:13px;padding:5px 12px 5px 10px}
`;
