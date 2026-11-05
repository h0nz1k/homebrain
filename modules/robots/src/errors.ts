/**
 * Roborock robot / dock error codes (HA `roborock` enum sensors) → plain-Czech advice.
 * Keys are the enum option names published by HA core; numeric codes are not exposed there.
 */
export type RobotPart =
  | 'main_brush'
  | 'side_brush'
  | 'wheels'
  | 'lidar'
  | 'bumper'
  | 'cliff'
  | 'dustbin'
  | 'filter'
  | 'battery'
  | 'mop'
  | 'water_tank'
  | 'dock'
  | 'body';

export interface ErrorAdvice {
  code: string;
  source: 'robot' | 'dock';
  title: string;
  /** Short, ordered steps in plain Czech; first one is the most likely fix. */
  steps: string[];
  part: RobotPart;
  /** `info` = robot keeps working (e.g. low battery), `error` = needs a person. */
  severity: 'info' | 'error';
}

type Entry = [title: string, steps: string[], part: RobotPart, severity?: 'info' | 'error'];

const RESTART = 'Pokud chyba trvá, robota vypněte a zapněte (podržte vypínač 3 s).';

export const ROBOT_ERRORS: Record<string, Entry> = {
  lidar_blocked: [
    'Laserový senzor je zakrytý',
    [
      'Zkontrolujte, že na věžičce LiDARu nic neleží a nic ji nezasekává.',
      'Otřete kryt suchým hadříkem.',
    ],
    'lidar',
  ],
  bumper_stuck: [
    'Zaseknutý nárazník',
    [
      'Několikrát lehce zmáčkněte přední nárazník, až volně odskočí.',
      'Vyndejte, co je za ním zaklíněné.',
    ],
    'bumper',
  ],
  wheels_suspended: [
    'Kolo visí ve vzduchu',
    ['Postavte robota na rovnou podlahu.', 'Zkontrolujte, že kola volně pérují.'],
    'wheels',
  ],
  cliff_sensor_error: [
    'Senzory pádu jsou špinavé',
    [
      'Otočte robota a otřete senzory pádu na spodku suchým hadříkem.',
      'Pak ho postavte jinam, dál od schodů a tmavých koberců.',
    ],
    'cliff',
  ],
  main_brush_jammed: [
    'Zamotaný hlavní kartáč',
    [
      'Otočte robota, vyklopte kryt kartáče a kartáč vyndejte.',
      'Odstraňte namotané vlasy a provázky, vyčistěte i ložiska na koncích.',
      'Kartáč vraťte a kryt zacvakněte.',
    ],
    'main_brush',
  ],
  side_brush_jammed: [
    'Zamotaný boční kartáč',
    [
      'Sundejte boční kartáč (šroubek nebo zacvaknutí).',
      'Odmotejte vlasy z ramínek i z osičky a kartáč nasaďte zpět.',
    ],
    'side_brush',
  ],
  side_brush_error: [
    'Porucha bočního kartáče',
    ['Sundejte boční kartáč a vyčistěte osičku.', RESTART],
    'side_brush',
  ],
  wheels_jammed: [
    'Zaseknuté kolo',
    ['Otočte robota a protočte rukou obě kola.', 'Vyndejte vlasy a nečistoty z okolí kol.'],
    'wheels',
  ],
  robot_trapped: [
    'Robot se zasekl',
    [
      'Najděte robota (např. pod nábytkem) a přeneste ho na volné místo.',
      'Místo si můžete v aplikaci označit jako zakázanou zónu.',
    ],
    'body',
  ],
  no_dustbin: ['Chybí prachová nádoba', ['Vložte prachovou nádobu, až zacvakne.'], 'dustbin'],
  strainer_error: [
    'Ucpané sítko nebo filtr',
    [
      'Vyndejte prachovou nádobu, vysypte ji a vyklepejte filtr.',
      'Filtr nechte úplně vyschnout, než ho vrátíte.',
    ],
    'filter',
  ],
  filter_blocked: [
    'Ucpaný filtr',
    [
      'Vyklepejte filtr nad košem, případně ho propláchněte a nechte 24 h schnout.',
      'Starý filtr vyměňte.',
    ],
    'filter',
  ],
  compass_error: [
    'Robot je u silného magnetu',
    ['Přeneste robota dál od magnetů a reproduktorů.', RESTART],
    'body',
  ],
  low_battery: [
    'Téměř vybitá baterie',
    ['Postavte robota do doku, úklid dokončí po nabití.'],
    'battery',
    'info',
  ],
  charging_error: [
    'Robot se nenabíjí',
    ['Otřete nabíjecí kontakty na robotu i na doku.', 'Zkontrolujte, že je dok zapojený a svítí.'],
    'dock',
  ],
  battery_error: ['Problém s baterií', ['Nechte robota vychladnout v doku.', RESTART], 'battery'],
  wall_sensor_dirty: [
    'Špinavý boční senzor',
    ['Otřete boční senzor u stěny suchým hadříkem.'],
    'bumper',
  ],
  robot_tilted: [
    'Robot je nakloněný',
    ['Postavte robota na rovnou podlahu a spusťte znovu.'],
    'body',
  ],
  fan_error: [
    'Porucha sání',
    ['Vyndejte prachovou nádobu a vyčistěte filtr i otvor sání.', RESTART],
    'filter',
  ],
  dock: [
    'Robot hlásí problém s dokem',
    ['Zkontrolujte dok (nádoby, sáček, kontakty) a robota do něj vraťte.'],
    'dock',
  ],
  optical_flow_sensor_dirt: [
    'Špinavý senzor podlahy',
    ['Otočte robota a otřete optický senzor na spodku.'],
    'cliff',
  ],
  vertical_bumper_pressed: [
    'Zmáčknutý horní nárazník',
    ['Robot asi vjel pod nízký nábytek. Vytáhněte ho a lehce zmáčkněte kryt LiDARu.'],
    'lidar',
  ],
  dock_locator_error: [
    'Robot nenašel dok',
    [
      'Zkontrolujte, že dok stojí u zdi a před ním je volno (aspoň 0,5 m do stran, 1,5 m dopředu).',
      'Otřete okénko doku.',
    ],
    'dock',
  ],
  return_to_dock_fail: [
    'Robot se nevrátil do doku',
    ['Odneste robota do doku ručně.', 'Uvolněte cestu k doku a zkontrolujte, že je dok zapojený.'],
    'dock',
  ],
  nogo_zone_detected: [
    'Robot je v zakázané zóně',
    ['Přeneste robota mimo zakázanou zónu nebo neviditelnou zeď.'],
    'body',
  ],
  invisible_wall_detected: [
    'Robot narazil na neviditelnou zeď',
    ['Přeneste robota na povolené místo.'],
    'body',
  ],
  visual_sensor: ['Zakrytá kamera', ['Otřete přední kameru a senzory měkkým hadříkem.'], 'bumper'],
  light_touch: [
    'Problém s předním senzorem',
    ['Zkontrolujte, že se nárazník volně pohybuje, a otřete senzory.'],
    'bumper',
  ],
  vibrarise_jammed: [
    'Zaseknutý zvedací mop',
    [
      'Zkontrolujte mopovací desku a odstraňte, co ji blokuje.',
      'Desku znovu nasaďte, až zacvakne.',
    ],
    'mop',
  ],
  robot_on_carpet: [
    'Robot s mopem je na koberci',
    ['Sundejte mop nebo robota přeneste z koberce.'],
    'mop',
    'info',
  ],
  cannot_cross_carpet: [
    'Robot nemůže přes koberec',
    ['Při mopování se koberci vyhýbá. Přeneste ho, nebo uklízejte bez mopu.'],
    'mop',
    'info',
  ],
  internal_error: [
    'Vnitřní chyba robota',
    [RESTART, 'Aktualizujte firmware v aplikaci Roborock.'],
    'body',
  ],
  collect_dust_error_3: [
    'Dok nemůže vysypat robota',
    [
      'Zkontrolujte sáček v doku a průchod vysávání mezi robotem a dokem.',
      'Vyčistěte otvor na spodku prachové nádoby robota.',
    ],
    'dustbin',
  ],
  collect_dust_error_4: [
    'Ucpané vysypávání',
    ['Vyndejte sáček z doku a vyčistěte kanálek, kudy prach putuje.'],
    'dustbin',
  ],
  mopping_roller_1: [
    'Zaseknutý mopovací válec',
    ['Vyndejte mopovací válec, odstraňte nečistoty a nasaďte ho zpět.'],
    'mop',
  ],
  mopping_roller_error_2: [
    'Porucha mopovacího válce',
    ['Válec vyndejte, opláchněte a vraťte.', RESTART],
    'mop',
  ],
  mopping_roller_2: [
    'Porucha mopovacího válce',
    ['Válec vyndejte, opláchněte a vraťte.', RESTART],
    'mop',
  ],
  clear_water_box_hoare: [
    'Nádrž s čistou vodou chybí nebo je prázdná',
    ['Doplňte čistou vodu do nádrže v doku a vložte ji, až zacvakne.'],
    'water_tank',
  ],
  dirty_water_box_hoare: [
    'Nádrž na špinavou vodu je plná nebo chybí',
    ['Vylijte špinavou vodu, nádrž propláchněte a vraťte ji.'],
    'water_tank',
  ],
  sink_strainer_hoare: [
    'Sítko v doku je ucpané',
    ['Vyndejte sítko z vaničky doku a propláchněte ho.'],
    'dock',
  ],
  clear_water_box_exception: [
    'Problém s nádrží na čistou vodu',
    ['Nádrž vyndejte, zkontrolujte víčko a vložte ji zpět.'],
    'water_tank',
  ],
  clear_brush_exception: [
    'Zaseknutý čisticí kartáček doku',
    ['Vyčistěte vaničku doku a kartáček, odstraňte vlasy a nečistoty.'],
    'dock',
  ],
  clear_brush_exception_2: [
    'Zaseknutý čisticí kartáček doku',
    ['Vyčistěte vaničku doku a kartáček, odstraňte vlasy a nečistoty.'],
    'dock',
  ],
  filter_screen_exception: [
    'Ucpané sítko vaničky',
    ['Vyndejte a propláchněte sítko ve vaničce doku.'],
    'dock',
  ],
  up_water_exception: [
    'Dok nenasává čistou vodu',
    ['Zkontrolujte, že je v nádrži voda a nádrž správně sedí.'],
    'water_tank',
  ],
  drain_water_exception: [
    'Dok nemůže odčerpat vodu',
    ['Vylijte nádrž na špinavou vodu a vyčistěte vaničku i sítko doku.'],
    'water_tank',
  ],
  temperature_protection: [
    'Robot je přehřátý nebo prochladlý',
    ['Nechte robota chvíli při pokojové teplotě, pak úklid spusťte znovu.'],
    'battery',
    'info',
  ],
  clean_carousel_exception: [
    'Problém s mycí vaničkou doku',
    ['Vyndejte a vyčistěte mycí vaničku doku.'],
    'dock',
  ],
  clean_carousel_water_full: [
    'Mycí vanička je plná vody',
    ['Vylijte vodu z vaničky a zkontrolujte odtok do nádrže na špinavou vodu.'],
    'dock',
  ],
  water_carriage_drop: [
    'Uvolněná mopovací deska',
    ['Mopovací desku znovu nasaďte, až zacvakne.'],
    'mop',
  ],
  check_clean_carouse: [
    'Zkontrolujte mycí vaničku',
    ['Vyndejte mycí vaničku doku, vyčistěte ji a vraťte.'],
    'dock',
  ],
  audio_error: ['Porucha reproduktoru', [RESTART], 'body', 'info'],
};

export const DOCK_ERRORS: Record<string, Entry> = {
  no_dustbin_or_filter: [
    'V doku chybí sáček nebo filtr',
    ['Vložte do doku prachový sáček a zavřete víko.'],
    'dock',
  ],
  no_dustbin: ['V doku chybí sáček', ['Vložte nový prachový sáček a zavřete víko.'], 'dock'],
  auto_empty_dock_fan_error: [
    'Porucha sání doku',
    [
      'Zkontrolujte sáček a kanálek vysávání v doku.',
      'Dok odpojte ze zásuvky na 10 s a zapojte zpět.',
    ],
    'dock',
  ],
  duct_blockage: [
    'Ucpaný kanálek doku',
    ['Vyndejte sáček a vyčistěte kanálek mezi robotem a sáčkem.'],
    'dock',
  ],
  auto_empty_dock_voltage_error: [
    'Problém s napájením doku',
    ['Zkontrolujte zásuvku a kabel doku.', 'Dok odpojte na 10 s a zapojte zpět.'],
    'dock',
  ],
  water_empty: ['Došla čistá voda', ['Doplňte nádrž s čistou vodou v doku.'], 'water_tank'],
  waste_water_tank_full: [
    'Plná nádrž na špinavou vodu',
    ['Vylijte špinavou vodu a nádrž propláchněte.'],
    'water_tank',
  ],
  maintenance_brush_jammed: [
    'Zaseknutý kartáček doku',
    ['Vyčistěte mycí vaničku a kartáček doku.'],
    'dock',
  ],
  dirty_tank_latch_open: [
    'Nádrž na špinavou vodu není zavřená',
    ['Dovřete víčko nádrže na špinavou vodu, až zacvakne.'],
    'water_tank',
  ],
  cleaning_tank_full_or_blocked: [
    'Vanička doku je plná nebo ucpaná',
    ['Vyčistěte mycí vaničku a sítko doku.', 'Vylijte nádrž na špinavou vodu.'],
    'dock',
  ],
};

const NO_ERROR = new Set(['none', 'ok', '', 'unknown', 'unavailable']);

function humanize(code: string) {
  return code.replace(/_/g, ' ');
}

export function describeError(
  source: 'robot' | 'dock',
  code: string | null | undefined,
): ErrorAdvice | null {
  const key = (code ?? '').trim().toLowerCase();
  if (NO_ERROR.has(key)) return null;
  const entry = (source === 'robot' ? ROBOT_ERRORS : DOCK_ERRORS)[key];
  if (!entry)
    return {
      code: key,
      source,
      title: source === 'robot' ? 'Robot hlásí chybu' : 'Dok hlásí chybu',
      steps: [
        `Kód „${humanize(key)}“ zatím neumíme přeložit. Podívejte se do aplikace Roborock.`,
        RESTART,
      ],
      part: source === 'robot' ? 'body' : 'dock',
      severity: 'error',
    };
  const [title, steps, part, severity = 'error'] = entry;
  return { code: key, source, title, steps, part, severity };
}
