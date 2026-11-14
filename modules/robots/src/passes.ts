/** Public Roborock model ids from HA (not owner device names). */
export const MODEL_A27 = 'roborock.vacuum.a27';
export const MODEL_A187 = 'roborock.vacuum.a187';
export const MODEL_A144 = 'roborock.vacuum.a144';

export const MAX_PASSES_ABSOLUTE = 3;
export const MAX_PASSES_DEFAULT = 2;

const BY_MODEL: Record<string, number> = {
  [MODEL_A27]: 3,
  [MODEL_A187]: 2,
  [MODEL_A144]: 2,
};

/** Max passes per room for this model; unknown models fall back to 2. */
export function maxPassesForModel(model: string | null | undefined): number {
  if (model && model in BY_MODEL) return BY_MODEL[model]!;
  return MAX_PASSES_DEFAULT;
}