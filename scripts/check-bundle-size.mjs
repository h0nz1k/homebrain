import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const bundle = await readFile(new URL('../apps/panel/dist/homebrain-panel.js', import.meta.url));
const gzipBytes = gzipSync(bundle).byteLength;
const budgetBytes = 250 * 1024;
console.log(`homebrain-panel.js: ${bundle.byteLength} bytes raw, ${gzipBytes} bytes gzip`);
console.log(`Gzip budget: ${budgetBytes} bytes (250 KiB)`);
if (gzipBytes > budgetBytes) {
  console.error(`Bundle exceeds gzip budget by ${gzipBytes - budgetBytes} bytes.`);
  process.exitCode = 1;
}

// Dev-only katalog komponent (apps/panel/catalog.html) se nesmí dostat do produkčního bundlu.
const distDir = new URL('../apps/panel/dist/', import.meta.url);
for (const name of await readdir(distDir)) {
  if (!name.endsWith('.js')) continue;
  const text = await readFile(new URL(name, distDir), 'utf8');
  if (text.includes('hb-catalog')) {
    console.error(`${name} obsahuje katalog komponent (hb-catalog) – patří jen do dist-catalog/.`);
    process.exitCode = 1;
  }
}
