export const moduleManifest = {
  id: 'family',
  titleCs: 'Rodina',
  icon: 'mdi:account-group',
  phase: 4,
} as const;

export const loadView = () => import('./views/FamilyView.js');
