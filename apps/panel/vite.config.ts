import react from '@vitejs/plugin-react';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const panelDir = fileURLToPath(new URL('.', import.meta.url));

/**
 * Dev only: serve a LOCAL photo folder at the same URL Home Assistant uses (`/local/homebrain/…`):
 * `HB_ROBOT_PHOTOS_DIR` (one subfolder per robot with manifest.json) → `/local/homebrain/robots/`,
 * `HB_AIRFRYER_PHOTOS_DIR` (manifest.json + pictures) → `/local/homebrain/airfryer/`,
 * `HB_HEATING_LOGOS_DIR` → `/local/homebrain/heating/` (else built-in dev mock under
 * `apps/panel/dev/mocks/heating/`). The photos are never part of the repo or the build output.
 */
function localPhotosDev(env: string | undefined, prefix: string, fallback?: string): Plugin {
  const root = process.env[env ?? ''] ?? fallback;
  const types: Record<string, string> = {
    json: 'application/json',
    webp: 'image/webp',
    png: 'image/png',
    svg: 'image/svg+xml',
  };
  return {
    name: `hb-photos-dev:${prefix}`,
    apply: 'serve',
    configureServer(server) {
      if (!root) return;
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        if (!url.startsWith(prefix)) return next();
        const rel = normalize(decodeURIComponent(url.slice(prefix.length)));
        const path = join(root, rel);
        if (rel.startsWith('..') || !existsSync(path) || !statSync(path).isFile()) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader(
          'Content-Type',
          types[path.split('.').pop() ?? ''] ?? 'application/octet-stream',
        );
        createReadStream(path).pipe(res);
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  base: './',
  define: {
    'process.env.NODE_ENV': JSON.stringify(command === 'build' ? 'production' : 'development'),
  },
  plugins: [
    react(),
    localPhotosDev('HB_ROBOT_PHOTOS_DIR', '/local/homebrain/robots/'),
    localPhotosDev('HB_AIRFRYER_PHOTOS_DIR', '/local/homebrain/airfryer/'),
    localPhotosDev(
      'HB_HEATING_LOGOS_DIR',
      '/local/homebrain/heating/',
      join(panelDir, 'dev/mocks/heating'),
    ),
  ],
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'homebrain-panel.js' },
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        assetFileNames: (asset) =>
          asset.names.some((name) => name.endsWith('.webp'))
            ? 'assets/[name]-[hash][extname]'
            : '[name][extname]',
      },
    },
  },
}));
