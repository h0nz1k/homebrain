import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(root, '../../..');
const panel = resolve(process.env.ANOMALY_WORKSPACE_DEPS ?? repo, 'apps/panel');
const requirePanel = createRequire(resolve(panel, 'package.json'));
const load = (id) => import(/* @vite-ignore */ pathToFileURL(requirePanel.resolve(id)).href);
const { default: react } = await load('@vitejs/plugin-react');
const packageFile = (id, file) =>
  resolve(dirname(requirePanel.resolve(`${id}/package.json`)), file);
const ui = resolve(repo, 'packages/ui/src');

export default {
  root,
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@homebrain/ui/tokens.css', replacement: resolve(ui, 'tokens.css') },
      { find: '@homebrain/ui/fonts.css', replacement: resolve(ui, 'fonts.css') },
      { find: '@homebrain/ui/components.css', replacement: resolve(ui, 'components.css') },
      { find: '@homebrain/ui', replacement: resolve(ui, 'index.ts') },
      {
        find: '@homebrain/contracts',
        replacement: resolve(repo, 'packages/contracts/src/index.ts'),
      },
      { find: '@fontsource/inter', replacement: packageFile('@fontsource/inter', '.') },
      { find: 'react', replacement: packageFile('react', '.') },
      { find: 'react-dom', replacement: packageFile('react-dom', '.') },
    ],
  },
};
