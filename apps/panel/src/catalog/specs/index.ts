import type { Spec } from '../types';
import { controlSpecs } from './controls';
import { feedbackSpecs } from './feedback';
import { liveSpecs } from './live';
import { rowSpecs } from './rows';
import { settingsSpecs } from './settings';
import { signalSpecs } from './signals';
import { stateSpecs } from './states';
import { surfaceSpecs } from './surfaces';

/** Pořadí sekcí v katalogu (navigace i stránka). */
export const specs: Spec[] = [
  ...settingsSpecs,
  ...surfaceSpecs,
  ...rowSpecs,
  ...stateSpecs,
  ...signalSpecs,
  ...feedbackSpecs,
  ...controlSpecs,
  ...liveSpecs,
];
