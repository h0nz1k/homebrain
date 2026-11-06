export const cs = {
  navigation: 'Hlavní navigace',
  settings: 'Nastavení',
  disconnected: 'Odpojeno od Home Assistantu – zobrazená data mohou být zastaralá',
  loading: 'Načítání…',
  waiting: 'Čekání na Home Assistant…',
  loadError: 'Modul se nepodařilo načíst. Obnovte stránku.',
  moduleUnavailable:
    'Modul nedostupný – nepodařilo se ho spustit v Home Assistantu. Ostatní moduly fungují; podrobnosti najdete v Nastavení → Opravy.',
} as const;
export function t(key: keyof typeof cs) {
  return cs[key];
}
