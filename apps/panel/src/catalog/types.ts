import type { ReactNode } from 'react';

export type ThemeMode = 'both' | 'light' | 'dark';

export interface Spec {
  id: string;
  name: string;
  summary: string;
  importName: string;
  states: string[];
  doText: string;
  dontText: string;
  notes: string;
  render: () => ReactNode;
}
