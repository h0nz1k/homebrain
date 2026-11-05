export interface Ingredient {
  group: string | null;
  qty: number | null;
  qtyMax?: number | null;
  unit: string | null;
  name: string;
  note: string | null;
  countable: boolean;
}
export interface AirfryerAction {
  temperature: number;
  minutes: number;
  method: string | null;
}
export interface Step {
  group: string | null;
  text: string;
  timerSeconds: number | null;
  videoTs: number | null;
  airfryer: AirfryerAction | null;
}
export interface Photo {
  width?: number;
  height?: number;
  fullUrl?: string;
  thumbUrl?: string;
}
export interface RecipeSummary {
  id: string;
  title: string;
  description: string | null;
  servings: number | null;
  prepSeconds: number | null;
  cookSeconds: number | null;
  totalSeconds: number | null;
  sourceUrl: string | null;
  sourceName: string | null;
  youtubeId: string | null;
  photo: Photo | null;
  favourite: boolean;
  rating: number | null;
  lastCookedAt: string | null;
  tags: string[];
  ingredientCount?: number;
}
export interface Recipe extends RecipeSummary {
  notes: string | null;
  ingredients: Ingredient[];
  steps: Step[];
}
export type RecipeDraft = Omit<
  Recipe,
  'id' | 'photo' | 'favourite' | 'rating' | 'lastCookedAt' | 'ingredientCount'
> & { photoUrl?: string | null };
export interface RecipesConfig {
  music: { configured: boolean; mediaSessionEntity: string | null };
  airfryer: {
    configured: boolean;
    allowed: boolean;
    entities: Partial<
      Record<'start' | 'temperature' | 'cook_time' | 'method' | 'drawer' | 'remaining', string>
    >;
    methods: string[];
  };
  canEdit: boolean;
}
export interface ImportPreview {
  preview: RecipeDraft;
  duplicateOf: string | null;
}
