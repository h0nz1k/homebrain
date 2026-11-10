import { execSync } from 'node:child_process';

/** Workspace packages export `dist`; dev panel resolves them. CI builds deps before Playwright. */
export default function globalSetup() {
  if (process.env.CI) return;
  execSync("pnpm --filter '@homebrain/panel^...' build", { stdio: 'inherit' });
}
