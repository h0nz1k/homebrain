import { sharedTestOptions } from '../../vitest.shared.js';
import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';
export default defineProject({
  plugins: [react()],
  test: {
    ...sharedTestOptions,
    name: '@homebrain/panel',
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
