import type { SchematicPipe } from './types.js';

/** Orthogonal path with small bridge hops where pipes cross (r3 gen.py parity). */
export function buildPipePath(pipe: SchematicPipe): string {
  const pts = pipe.points;
  if (pts.length < 2) return '';
  let path = `M${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const crossings = (pipe.bridges ?? [])
      .filter((q) => q[0] === a[0] && q[0] === b[0] && q[1]! > Math.min(a[1], b[1]) + 9 && q[1]! < Math.max(a[1], b[1]) - 9)
      .sort((p, q) => Math.abs(p[1]! - a[1]) - Math.abs(q[1]! - a[1]));
    const direction = b[1] > a[1] ? 1 : -1;
    for (const [x, y] of crossings) {
      path += `L${x} ${y - 6 * direction}Q${x + 12} ${y} ${x} ${y + 6 * direction}`;
    }
    path += `L${b[0]} ${b[1]}`;
  }
  return path;
}

export function computeBridges(pipes: SchematicPipe[]): SchematicPipe[] {
  return pipes.map((pipe, i) => {
    const bridges: [number, number][] = [];
    for (let j = 1; j < pipe.points.length; j++) {
      const a = pipe.points[j - 1]!;
      const b = pipe.points[j]!;
      if (a[0] !== b[0]) continue;
      for (const other of pipes.slice(0, i)) {
        for (let k = 1; k < other.points.length; k++) {
          const c = other.points[k - 1]!;
          const d = other.points[k]!;
          if (c[1] !== d[1]) continue;
          const x = a[0];
          const y = c[1];
          if (
            Math.min(a[1], b[1]) + 9 < y &&
            y < Math.max(a[1], b[1]) - 9 &&
            Math.min(c[0], d[0]) + 9 < x &&
            x < Math.max(c[0], d[0]) - 9
          ) {
            bridges.push([x, y]);
          }
        }
      }
    }
    return { ...pipe, bridges, d: buildPipePath({ ...pipe, bridges }) };
  });
}