import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Statický build živého katalogu (dev nástroj, nikdy se nebalí do homebrain-panel.js).
// CI: `pnpm --filter @homebrain/panel build:catalog` → apps/panel/dist-catalog/.
export default defineConfig({
  base: './',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react()],
  build: {
    outDir: 'dist-catalog',
    emptyOutDir: true,
    rolldownOptions: { input: 'catalog.html' },
  },
});
