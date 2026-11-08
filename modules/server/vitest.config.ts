import { sharedTestOptions } from '../../vitest.shared.js';
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    ...sharedTestOptions,
    name: '@homebrain/module-server',
    environment: 'jsdom',
  },
});
