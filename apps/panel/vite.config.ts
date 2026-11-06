import react from '@vitejs/plugin-react';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Dev only: serve a LOCAL robot photo folder (`HB_ROBOT_PHOTOS_DIR`, one subfolder per robot with
 * manifest.json) at the same URL Home Assistant uses (`/local/homebrain/robots/…`). The photos are
 * never part of the repo or the build output.
 */
function robotPhotosDev(): Plugin {
  const root = process.env.HB_ROBOT_PHOTOS_DIR;
  const prefix = '/local/homebrain/robots/';
  const types: Record<string, string> = {
    json: 'application/json',
    webp: 'image/webp',
    png: 'image/png',
  };
  return {
    name: 'hb-robot-photos-dev',
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
  plugins: [react(), robotPhotosDev()],
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
