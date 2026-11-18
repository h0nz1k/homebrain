/** Frozen geometry of the full schematic (`geometry.gen.ts`, built from the approved p3i round). */
export type Pt = readonly [number, number];
export type Box = readonly [number, number, number, number];
export type Dir = 'l' | 'r' | 'u' | 'd';
export type Halo = 'none' | 'concrete2' | 'tech' | 'room' | 'soil2' | 'bg' | 'soil';
/** Pipe colour = medium of the circuit (`cool` = cooling water side of the passive cooling). */
export type PipeColour =
  'heat_supply' | 'heat_return' | 'solar' | 'coll' | 'dhw' | 'cold_water' | 'pool' | 'cool';

export interface GeoPipe {
  id: string;
  circuit: string;
  colour: PipeColour | string;
  from: string;
  to: string;
  certainty: string;
  d: string;
}

export interface GeoLabel {
  x: number;
  /** Baseline of the first line. */
  y: number;
  lines: string[];
  styles: string;
  anchor: 'start' | 'middle' | 'end';
  font: number;
  lh: number;
  box: number[];
  halo: Halo | string;
  of?: string;
  card?: boolean;
  ink?: string;
  sensor?: boolean;
  pipeSensor?: number[];
  compressorDependent?: boolean;
  /** The first line is followed by a live reading (°C). */
  reading?: boolean;
}

export interface FullGeometry {
  version: string;
  canvas: number[];
  arch: Record<
    | 'roof'
    | 'atticFloor'
    | 'plantTop'
    | 'blockR'
    | 'houseL'
    | 'houseR'
    | 'floor'
    | 'foundation'
    | 'stand'
    | 'grade'
    | 'grating'
    | 'shaftX',
    number
  >;
  regions: Record<string, number[]>;
  regionEdges: Array<[number, number, number, number, string] | (number | string)[]>;
  boxes: Record<string, number[]>;
  pipes: GeoPipe[];
  /** Static facts of the p3i round (owner): `normally_idle` cooling, `out_of_service` fish water. */
  staticStatus: Record<string, string>;
  bridges: Array<{
    over: string;
    under: string;
    at: number[];
    r: number;
    arc: string;
    halo: string;
  }>;
  chevrons: Array<{ route: string; x: number; y: number; angle: number; scale: number }>;
  junctions: Array<{ id: string; x: number; y: number; halo: string }>;
  marks: Array<{ x: number; y: number; orient: string }>;
  fittings: Array<{ port: string; x: number; y: number; orient: string }>;
  coils: { ground: string; poolFeed: string; poolMeander: string; meanderX: number[] };
  glyphs: {
    pumps: Record<string, { c: number[]; dir: string }>;
    valves: Record<string, { c: number[]; ports: string[]; act: string }>;
    valveMix: { c: number[] };
    sensors: Record<string, number[]>;
    fans: Record<string, number[]>;
    aquarium: number[];
    radiators: { box: number[]; ys: number[]; slab: number };
    hx: number[];
    hp: number[];
    ek: { x0: number; y0: number; x1: number };
    tank: number[];
    tankDhw: number[];
    tankCoil: number[];
    tap: number[];
    cold: number[];
    solar: { box: number[]; legsTo: number };
    filter: number[];
    ph: number[];
    salinator: number[];
    acid: number[];
    dehumidifier: number[];
    pool: number[];
    floorPool: number[];
    ground: number[];
  };
  labels: Record<string, GeoLabel>;
  badges: Array<{ of: string; text: string; x: number; y: number; r: number }>;
  leaders: Array<{ of: string; pts: number[][] }>;
  legend: {
    box: number[];
    seams: number[];
    items: Array<{ circuit: string | null; style: string; sample: number[][] }>;
  };
  questions: Array<{ id: string; text: string }>;
}
