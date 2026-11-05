import type { WineColorCode, WineRecord, WineType } from './domain/index.js';

/** 50 deterministic synthetic wines (no real inventory, producers or notes). */
const VARIETIES: Array<[string, WineColorCode, WineType]> = [
  ['Ryzlink rýnský', 'white', 'still'],
  ['Veltlínské zelené', 'white', 'still'],
  ['Pálava', 'white', 'still'],
  ['Sauvignon', 'white', 'still'],
  ['Chardonnay', 'white', 'still'],
  ['Muškát moravský', 'white', 'still'],
  ['Rulandské modré', 'red', 'still'],
  ['Frankovka', 'red', 'still'],
  ['Svatovavřinecké', 'red', 'still'],
  ['Zweigeltrebe', 'red', 'still'],
  ['Cabernet Moravia', 'red', 'still'],
  ['Zweigeltrebe rosé', 'rose', 'still'],
  ['Ryzlink vlašský', 'orange', 'still'],
  ['Chardonnay brut', 'white', 'sparkling'],
  ['Muškát frizzante', 'white', 'semi_sparkling'],
];
const STYLES = [
  'kabinetní víno',
  'pozdní sběr',
  'výběr z hroznů',
  'jakostní víno',
  'moravské zemské víno',
];
const LABELS = [
  'z Ukázkové trati',
  'Ukázka Cryo 3,14 °C',
  null,
  'Ukázková řada',
  'z Dívčího kopce',
];
const PRODUCERS = ['A', 'B', 'C', 'D', 'E', 'F'].map((x) => `Vinařství Synthetic ${x}`);
const ZONES = ['Zóna A', 'Zóna B', 'Zóna C'];

export function createSyntheticWines(
  referenceYear = new Date().getFullYear(),
  count = 50,
): WineRecord[] {
  return Array.from({ length: count }, (_, i) => {
    const [variety, color, wineType] = VARIETIES[i % VARIETIES.length]!;
    const vintage = referenceYear - 1 - ((i * 7) % 9);
    const quantity = [6, 3, 1, 0, 12, 2, 4, 1, 5, 8][i % 10]!;
    const rating = i % 6 === 5 ? null : [4.5, 4, 3.5, 5, 3, 4.2][i % 6]!;
    const span = color === 'red' ? 8 : 4;
    const drinkFrom = vintage + (color === 'red' ? 3 : 1);
    const id = `wine-${String(i + 1).padStart(3, '0')}`;
    const created = `${referenceYear - 1}-0${(i % 9) + 1}-1${i % 10}T10:00:00.000Z`;
    return {
      id,
      name: variety,
      labelName:
        i % LABELS.length === 1
          ? LABELS[1]!
          : LABELS[i % LABELS.length]
            ? `${variety.split(' ')[0]} ${LABELS[i % LABELS.length]}`
            : null,
      predicate: STYLES[i % STYLES.length]!,
      producer: PRODUCERS[i % PRODUCERS.length]!,
      vintage: wineType === 'sparkling' && i % 2 ? null : vintage,
      wineType,
      color,
      grapeVarieties: [variety.replace(/ (rosé|brut|frizzante)$/, '')],
      country: 'Česko',
      region: i % 5 === 4 ? 'Čechy' : 'Morava',
      // Synthetic sugar data: label term, g/l only, both, or nothing (→ Neuvedeno).
      sweetness:
        wineType === 'sparkling'
          ? ['Brut', 'Extra Brut', 'Demi-sec'][Math.floor(i / 15) % 3]!
          : i % 7 === 3
            ? null
            : ['suché', 'polosuché', 'polosladké', 'suché', null, 'sladké'][i % 6]!,
      residualSugarGl: i % 7 === 3 ? null : [2.1, 9.8, 28, 3.4, 6.5, 62, 1.2][i % 7]!,
      acidsGl: i % 2 ? 6.8 : null,
      volumeMl: i % 11 === 10 ? 375 : 750,
      alcoholPct: 11.5 + (i % 5) * 0.5,
      quantity,
      location: {
        zone: ZONES[i % ZONES.length]!,
        shelf: String((i % 6) + 1),
        position: String((i % 8) + 1),
      },
      acquiredOn: created.slice(0, 10),
      purchasePrice: 150 + ((i * 37) % 400),
      personalRating: rating,
      personalNote: i % 4 === 0 ? 'Syntetická poznámka pro ukázku.' : null,
      status: quantity === 0 ? 'consumed' : 'in_stock',
      image: null,
      source: {
        provider: 'local',
        externalProductId: null,
        batch: null,
        sourceUrl: null,
        fetchedAt: null,
      },
      confidence: 'manual',
      createdAt: created,
      updatedAt: created,
      drinkWindow: { from: drinkFrom, to: drinkFrom + span },
    } satisfies WineRecord;
  });
}
