import type { RecipesApi } from './api.js';

/**
 * AutoCook program names resolved by the backend, shared by the Recepty card and the Dnes
 * signal (one lookup per program id per page load; failures fall back to „AutoCook <id>“).
 */
const names = new Map<number, string | null>();
const pending = new Map<number, Promise<string | null>>();

export function cachedProgramName(program: number | null): string | null {
  return program ? (names.get(program) ?? null) : null;
}

export function resolveProgramName(
  api: Pick<RecipesApi, 'airfryerProgram'> | null | undefined,
  program: number | null,
): Promise<string | null> {
  if (!program || !api?.airfryerProgram) return Promise.resolve(null);
  if (names.has(program)) return Promise.resolve(names.get(program) ?? null);
  let p = pending.get(program);
  if (!p) {
    p = api
      .airfryerProgram(program)
      .catch(() => null)
      .then((name) => {
        names.set(program, name);
        pending.delete(program);
        return name;
      });
    pending.set(program, p);
  }
  return p;
}

/** Test helper. */
export function resetProgramNames() {
  names.clear();
  pending.clear();
}
