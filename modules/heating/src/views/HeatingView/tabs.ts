export type TabId = 'ted' | 'mistnosti' | 'trendy' | 'sezony' | 'rezimy' | 'poruchy';
export const TABS: ReadonlyArray<readonly [TabId, string]> = [
  ['ted', 'Teď'],
  ['mistnosti', 'Místnosti'],
  ['trendy', 'Trendy'],
  ['sezony', 'Sezóny'],
  ['rezimy', 'Režimy'],
  ['poruchy', 'Poruchy a upozornění'],
];
export const tabFromRoute = (path: string | undefined): TabId => {
  const seg = (path ?? '').split('/').filter(Boolean).pop();
  return TABS.some(([id]) => id === seg) ? (seg as TabId) : 'ted';
};
