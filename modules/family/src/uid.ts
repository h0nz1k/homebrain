/**
 * Request id for idempotent family operations.
 *
 * `crypto.randomUUID()` exists only in secure contexts (HTTPS or localhost). The kitchen
 * tablet and phones on the home LAN open Home Assistant over plain http://<ip>:8123, where
 * it is undefined and calling it crashed the add-chore sheet. `getRandomValues` is available
 * in every context, so build an RFC 4122 v4 id from it.
 */
export function newRequestId(): string {
  const c = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
