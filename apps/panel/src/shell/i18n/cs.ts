export const cs = {
  navigation: 'Hlavní navigace',
  settings: 'Nastavení',
  disconnected: 'Odpojeno od Home Assistantu – zobrazená data mohou být zastaralá',
  loading: 'Načítání…',
  waiting: 'Čekání na Home Assistant…',
  loadError: 'Modul se nepodařilo načíst. Obnovte stránku.',
  moduleUnavailable:
    'Modul nedostupný – nepodařilo se ho spustit v Home Assistantu. Ostatní moduly fungují; podrobnosti najdete v Nastavení → Opravy.',
  noAccessTitle: 'Nemáte přístup',
  noAccessBody:
    'Tahle část HomeBrainu není pro váš účet zapnutá. Požádejte správce domácnosti, aby vám přidělil roli (Nastavení → Zařízení a služby → HomeBrain → Uživatelé a role).',
} as const;
export function t(key: keyof typeof cs) {
  return cs[key];
}
