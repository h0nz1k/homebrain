import { SEVERITY_RANK } from './types.js';
import type { Signal } from './types.js';

export interface MergedSignal extends Signal {
  also: MergedSignal[];
}

type MergeInput = Signal & { also?: readonly MergeInput[] };
const cloneMember = (signal: MergeInput): MergedSignal => ({
  ...signal,
  also: signal.also?.map(cloneMember) ?? [],
});

/** A replacement host retains the group's first position and its earlier host tree. */
export function mergeGroups(signals: readonly Signal[]): MergedSignal[] {
  const out: MergedSignal[] = [];
  const byGroup = new Map<string, number>();
  for (const signal of signals) {
    const member = cloneMember(signal);
    const index = signal.group ? byGroup.get(signal.group) : undefined;
    if (index !== undefined) {
      const host = out[index]!;
      if (SEVERITY_RANK[member.severity] > SEVERITY_RANK[host.severity]) {
        member.also.push(host);
        out[index] = member;
      } else host.also.push(member);
    } else {
      if (signal.group) byGroup.set(signal.group, out.length);
      out.push(member);
    }
  }
  return out;
}
