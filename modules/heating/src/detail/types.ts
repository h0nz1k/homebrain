export type CircuitKind = 'hot' | 'cold' | 'solar' | 'ground' | 'pool';

export interface SchematicPort {
  x: number;
  y: number;
  owner: string;
}

export interface SchematicPipe {
  id: string;
  start: string;
  end: string;
  points: [number, number][];
  kind: CircuitKind;
  states: number[];
  d: string;
  bridges?: [number, number][];
}

export interface SchematicBody {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  polygon?: [number, number][];
}

export interface SchematicDevice {
  id: string;
  x: number;
  y: number;
  pipe: string;
  kind: 'pump' | 'valve';
  angle: number;
}

export interface SchematicLabel {
  id: string;
  x: number;
  y: number;
  caption: string;
  value: string;
  tier: 0 | 1 | 2;
  owner: string | null;
  anchor: [number, number];
  box?: { x: number; y: number; w: number; h: number };
}

export interface DetailLayoutParams {
  /** When true, the pool hall shares a wall with the main house (assumption – owner to confirm). */
  poolHallAttached: boolean;
  /** Left edge of the hall in world coordinates. */
  poolHallX: number;
  /** World Y where the floor-heating branch leaves the main heating riser (tunable). */
  floorBranchY: number;
}

export interface DetailSchematicModel {
  architectures: Array<{
    id: string;
    kind: string;
    label?: string;
    radiator?: string;
    supply?: string;
    returnPipe?: string;
    valve?: string;
    evidence?: string[];
  }>;
  circuitLegend: Record<string, string | number>;
  bounds: { x: number; y: number; w: number; h: number };
  ports: Record<string, SchematicPort>;
  pipes: SchematicPipe[];
  bodies: SchematicBody[];
  devices: SchematicDevice[];
  labels: SchematicLabel[];
  regions: Record<string, [number, number]>;
  layout: DetailLayoutParams;
  focusBoxes: Record<string, { x: number; y: number; w: number; h: number }>;
}
