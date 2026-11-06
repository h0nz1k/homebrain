#!/usr/bin/env node
// Kontrola kompatibility HomeBrain se skutečným testovacím HA (issue #26).
// Pouze proti lokálnímu/CI testovacímu HA. Předpoklad: `node ha-test/onboard.mjs` proběhl.
// HB_COMPAT_LOGS_ONLY=1 zkontroluje jen system_log (po Playwright sadě).
import { readFile } from 'node:fs/promises';

const auth = JSON.parse(await readFile(new URL('./.auth/admin.json', import.meta.url), 'utf8'));
const panels = JSON.parse(
  await readFile(new URL('../custom_components/homebrain/panels.json', import.meta.url), 'utf8'),
);
const baseUrl = auth.hassUrl;
if (!/^http:\/\/(127\.0\.0\.1|localhost|homeassistant)(:\d+)?$/.test(baseUrl)) {
  throw new Error(`Odmítnuto: ${baseUrl} není lokální testovací HA.`);
}
const logsOnly = process.env.HB_COMPAT_LOGS_ONLY === '1';
const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.log(`::error title=HA compat::${msg}`);
};
const ok = (msg) => console.log(`ok   ${msg}`);

async function http(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${auth.access_token}` },
  });
  return {
    status: response.status,
    type: response.headers.get('content-type') ?? '',
    body: await response.text(),
  };
}

function connect() {
  const url = new URL('/api/websocket', baseUrl);
  url.protocol = 'ws:';
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  const ready = new Promise((resolve, reject) => {
    socket.onerror = () => reject(new Error('Chyba spojení WebSocket.'));
    socket.onmessage = ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.type === 'auth_required')
        socket.send(JSON.stringify({ type: 'auth', access_token: auth.access_token }));
      else if (msg.type === 'auth_ok') resolve();
      else if (msg.type === 'auth_invalid') reject(new Error('WebSocket odmítl přihlášení.'));
      else pending.get(msg.id)?.(msg);
    };
  });
  // Vrací výsledek a (u subscribe) první událost.
  function call(type, extra = {}, { event = false, timeoutMs = 20_000 } = {}) {
    const id = nextId++;
    return new Promise((resolve) => {
      let result;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({
          success: false,
          error: { code: 'timeout', message: `bez odpovědi do ${timeoutMs} ms` },
          ...result,
        });
      }, timeoutMs);
      pending.set(id, (msg) => {
        if (msg.type === 'result') {
          result = msg;
          if (!event || !msg.success) {
            clearTimeout(timer);
            pending.delete(id);
            resolve(msg);
          }
        } else if (msg.type === 'event' && event) {
          clearTimeout(timer);
          pending.delete(id);
          resolve({ ...result, event: msg.event });
        }
      });
      socket.send(JSON.stringify({ id, type, ...extra }));
    });
  }
  return { ready, call, close: () => socket.close() };
}

const ws = connect();
await ws.ready;

if (!logsOnly) {
  const config = await ws.call('get_config');
  ok(`Home Assistant ${config.result?.version}`);

  // 1) Config entry HomeBrain je načtená.
  const entries = JSON.parse(
    (await http('/api/config/config_entries/entry?domain=homebrain')).body,
  );
  if (entries.length !== 1) fail(`očekávána 1 config entry homebrain, je ${entries.length}`);
  else if (entries[0].state !== 'loaded')
    fail(`config entry homebrain ve stavu ${entries[0].state}: ${entries[0].reason ?? ''}`);
  else ok('config entry homebrain: loaded');

  // 2) Panely registrované přesně podle panels.json (moduly + nastavení + legacy + kiosk).
  const expected = [
    ...panels.modules.map((p) => p.url_path),
    panels.settings.url_path,
    panels.legacy.url_path,
    panels.kiosk.url_path,
  ].sort();
  const got = await ws.call('get_panels');
  const registered = Object.keys(got.result ?? {})
    .filter((p) => p.startsWith('homebrain'))
    .sort();
  if (JSON.stringify(registered) !== JSON.stringify(expected)) {
    fail(
      `panely: očekáváno ${expected.length} [${expected}], registrováno ${registered.length} [${registered}]`,
    );
  } else ok(`get_panels: ${registered.length} panelů homebrain`);

  // 3) Panely i bundle odpovídají HTTP 200.
  const moduleUrls = new Set();
  for (const path of registered) {
    const page = await http(`/${path}`);
    if (page.status !== 200) fail(`GET /${path} → HTTP ${page.status}`);
    const url = got.result[path]?.config?._panel_custom?.module_url;
    if (url) moduleUrls.add(url);
  }
  if (!moduleUrls.size) fail('panely nemají module_url');
  for (const url of moduleUrls) {
    const bundle = await http(url);
    if (bundle.status !== 200 || !/javascript/.test(bundle.type))
      fail(`GET ${url} → HTTP ${bundle.status} ${bundle.type}`);
    else ok(`bundle ${url}: 200 (${bundle.body.length} B)`);
  }
  if (registered.length) ok(`panely HTTP 200: ${registered.length}`);

  // 4) Klíčová WS API odpovídají.
  const checks = [
    [
      'homebrain/bindings/get',
      {},
      {},
      (r) =>
        JSON.stringify(r.result).includes('sensor.demo_waste_next') ||
        'chybí demo vazba waste_next',
    ],
    ['homebrain/robots/get', {}, {}, () => true],
    [
      'homebrain/recipes/timers/subscribe',
      {},
      { event: true },
      (r) => r.event !== undefined || 'chybí úvodní snapshot časovačů',
    ],
    ['homebrain/access/state', {}, {}, () => true],
    ['homebrain/session/get', {}, {}, () => true],
  ];
  for (const [type, extra, opts, validate] of checks) {
    const r = await ws.call(type, extra, opts);
    if (!r.success) {
      fail(`${type}: ${r.error?.code} ${r.error?.message}`);
      continue;
    }
    const verdict = validate(r);
    if (verdict !== true) fail(`${type}: ${verdict}`);
    else ok(`${type}`);
  }
}

// 5) system_log: žádná ERROR z HomeBrain, žádné blocking call v HomeBrain.
const log = await ws.call('system_log/list');
if (!log.success) fail(`system_log/list: ${log.error?.message}`);
for (const entry of log.result ?? []) {
  const text = [
    entry.name,
    ...(entry.message ?? []),
    entry.exception ?? '',
    ...(entry.source ?? []),
  ].join(' ');
  const ours = /homebrain/i.test(text);
  const blocking = /blocking call/i.test(text);
  const line = `[${entry.level}] ${entry.name}: ${(entry.message ?? []).join(' | ').slice(0, 400)}`;
  if (ours && blocking) fail(`blocking call v HomeBrain: ${line}`);
  else if (ours && ['ERROR', 'CRITICAL'].includes(entry.level)) fail(`log: ${line}`);
  else if (ours || blocking) console.log(`::warning title=HA log::${line}`);
  else console.log(`info ${line}`);
}
ws.close();

if (failures.length) {
  console.error(`\nHA compat: ${failures.length} chyb.`);
  process.exit(1);
}
console.log(logsOnly ? 'HA compat: log po e2e čistý.' : 'HA compat: vše v pořádku.');
