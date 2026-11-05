#!/usr/bin/env node
// Neinteraktivní onboarding testovacího Home Assistantu (issue #8).
// Pouze pro lokální/CI testovací HA – NIKDY nepoužívat proti produkčnímu HA.
// Použití: HB_HA_URL=http://127.0.0.1:8123 node ha-test/onboard.mjs
// Výstup: ha-test/.auth/admin.json (gitignored) s tokeny pro Playwright.
import { mkdir, writeFile } from 'node:fs/promises';

const baseUrl = (process.env.HB_HA_URL ?? 'http://127.0.0.1:8123').replace(/\/$/, '');
const username = process.env.HB_HA_USERNAME ?? 'admin';
const password = process.env.HB_HA_PASSWORD ?? 'homebrain-test-only';
const clientId = `${baseUrl}/`;
const output = new URL('./.auth/admin.json', import.meta.url);

if (!/^http:\/\/(127\.0\.0\.1|localhost|homeassistant)(:\d+)?$/.test(baseUrl)) {
  throw new Error(`Odmítnuto: ${baseUrl} není lokální testovací HA.`);
}

async function request(path, { token, json, form } = {}) {
  const headers = {};
  let body;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = new URLSearchParams(form);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: body ? 'POST' : 'GET',
    headers,
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

async function waitForHa(timeoutMs = Number(process.env.HB_HA_TIMEOUT_MS ?? 180_000)) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await request('/api/onboarding');
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function token(form) {
  return request('/auth/token', { form: { client_id: clientId, ...form } });
}

async function login() {
  const flow = await request('/auth/login_flow', {
    json: {
      client_id: clientId,
      handler: ['homeassistant', null],
      redirect_uri: `${clientId}?auth_callback=1`,
    },
  });
  const result = await request(`/auth/login_flow/${flow.flow_id}`, {
    json: { client_id: clientId, username, password },
  });
  if (result.type !== 'create_entry') throw new Error('Přihlášení se nezdařilo.');
  return token({ grant_type: 'authorization_code', code: result.result });
}

const steps = await waitForHa();
const done = new Set(steps.filter((step) => step.done).map((step) => step.step));
let tokens;
if (!done.has('user')) {
  const { auth_code } = await request('/api/onboarding/users', {
    json: { client_id: clientId, name: 'HomeBrain Admin', username, password, language: 'cs' },
  });
  tokens = await token({ grant_type: 'authorization_code', code: auth_code });
} else {
  tokens = await login();
}
const auth = { token: tokens.access_token };
if (!done.has('core_config')) await request('/api/onboarding/core_config', { ...auth, json: {} });
if (!done.has('analytics')) await request('/api/onboarding/analytics', { ...auth, json: {} });
if (!done.has('integration')) {
  await request('/api/onboarding/integration', {
    ...auth,
    json: { client_id: clientId, redirect_uri: `${clientId}?auth_callback=1` },
  });
}

const entries = await request('/api/config/config_entries/entry?domain=homebrain', auth);
if (!entries.length) {
  const flow = await request('/api/config/config_entries/flow', {
    ...auth,
    json: { handler: 'homebrain', show_advanced_options: false },
  });
  const result = await request(`/api/config/config_entries/flow/${flow.flow_id}`, {
    ...auth,
    json: {},
  });
  if (result.type !== 'create_entry') throw new Error(`Integrace HomeBrain: ${result.type}`);
}

// Uložení syntetických vazeb přes admin WS API (Refs #5, Refs #8).
let bindingsByModule;
try {
  bindingsByModule = JSON.parse(
    process.env.HB_HA_BINDINGS ??
      JSON.stringify({
        waste: { waste_next: 'sensor.demo_waste_next' },
      }),
  );
} catch {
  throw new Error('HB_HA_BINDINGS neobsahuje platný JSON.');
}
if (!bindingsByModule || typeof bindingsByModule !== 'object' || Array.isArray(bindingsByModule)) {
  throw new Error('HB_HA_BINDINGS musí být JSON objekt modulů a jejich vazeb.');
}
await new Promise((resolve, reject) => {
  const wsUrl = new URL('/api/websocket', baseUrl);
  wsUrl.protocol = 'ws:';
  const socket = new WebSocket(wsUrl);
  const modules = Object.entries(bindingsByModule);
  let index = 0;
  const timeout = setTimeout(() => finish(new Error('Vypršel čas pro nastavení vazeb.')), 30_000);
  function finish(error) {
    clearTimeout(timeout);
    socket.onclose = null;
    socket.close();
    if (error) reject(new Error(`Nastavení vazeb HomeBrain selhalo: ${error.message}`));
    else resolve();
  }
  function sendNext() {
    if (index === modules.length) return finish();
    const [module, bindings] = modules[index];
    socket.send(
      JSON.stringify({
        id: index + 1,
        type: 'homebrain/bindings/set',
        module,
        bindings,
        replace: true,
      }),
    );
  }
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === 'auth_required') {
      socket.send(JSON.stringify({ type: 'auth', access_token: tokens.access_token }));
    } else if (message.type === 'auth_ok') {
      sendNext();
    } else if (message.type === 'auth_invalid') {
      finish(new Error('WebSocket odmítl přihlášení.'));
    } else if (message.type === 'result' && message.id === index + 1) {
      if (!message.success) {
        finish(new Error(message.error?.message ?? 'Příkaz bindings/set byl odmítnut.'));
      } else {
        index++;
        sendNext();
      }
    }
  };
  socket.onerror = () => finish(new Error('Chyba spojení WebSocket.'));
  socket.onclose = () => finish(new Error('WebSocket byl předčasně uzavřen.'));
});

await mkdir(new URL('./.auth/', import.meta.url), { recursive: true });
await writeFile(
  output,
  JSON.stringify(
    {
      hassUrl: baseUrl,
      clientId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type,
      expires_in: tokens.expires_in,
      expires: Date.now() + tokens.expires_in * 1000,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  'Onboarding hotový, integrace HomeBrain přidána a vazby nastaveny, tokeny v ha-test/.auth/.',
);
