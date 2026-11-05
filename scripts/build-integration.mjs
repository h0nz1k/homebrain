import { cp, mkdir, rm } from 'node:fs/promises';
const source = new URL('../apps/panel/dist/', import.meta.url);
const target = new URL('../custom_components/homebrain/frontend/', import.meta.url);
// Start clean so stale hashed chunks from older builds never ship.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
console.log('Frontend zkopírován do integračního balíčku.');
