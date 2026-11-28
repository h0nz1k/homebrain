import type { WineColorCode, WineRecord, WineImage, WineType } from './domain/index.js';

/** Synthetic label SVG for mock wine-001 (fine text visible after zoom). */
const MOCK_LABEL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect width="600" height="800" fill="#f8f4e8"/><rect x="60" y="80" width="480" height="640" fill="none" stroke="#8b6914" stroke-width="3"/><rect x="70" y="90" width="460" height="620" fill="none" stroke="#8b6914" stroke-width="1"/><text x="300" y="180" font-family="serif" font-size="36" fill="#2c1810" text-anchor="middle" font-weight="bold">VINAŘSTVÍ</text><text x="300" y="225" font-family="serif" font-size="32" fill="#2c1810" text-anchor="middle" font-weight="bold">SYNTHETIC A</text><line x1="100" y1="250" x2="500" y2="250" stroke="#8b6914" stroke-width="2"/><text x="300" y="320" font-family="serif" font-size="42" fill="#1a0a05" text-anchor="middle" font-weight="bold">RYZLINK</text><text x="300" y="375" font-family="serif" font-size="38" fill="#1a0a05" text-anchor="middle" font-weight="bold">RÝNSKÝ</text><text x="300" y="440" font-family="serif" font-size="52" fill="#8b6914" text-anchor="middle" font-weight="bold">2023</text><text x="300" y="510" font-family="sans-serif" font-size="16" fill="#555" text-anchor="middle">Pozdní sběr · Morava · Vinařství Synthetic A</text><text x="300" y="535" font-family="sans-serif" font-size="16" fill="#555" text-anchor="middle">Obsah: 750 ml · Alkohol: 12,5 % vol.</text><text x="300" y="565" font-family="sans-serif" font-size="14" fill="#666" text-anchor="middle">Šarže 2023/001 · Suché víno</text><text x="300" y="590" font-family="sans-serif" font-size="14" fill="#666" text-anchor="middle">Zbytkový cukr: 2,8 g/l · Kyseliny: 6,4 g/l</text><text x="300" y="615" font-family="sans-serif" font-size="12" fill="#888" text-anchor="middle">Vyrobeno a plněno v ČR · Výrobce: Synthetic A</text><text x="300" y="640" font-family="sans-serif" font-size="12" fill="#888" text-anchor="middle">Spotřebujte do: viz čelo láhve</text><line x1="100" y1="668" x2="500" y2="668" stroke="#8b6914" stroke-width="2"/><text x="300" y="690" font-family="serif" font-size="13" fill="#888" text-anchor="middle">Obsahuje siřičitany</text></svg>`;

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Synthetic image.url for mock wine-001 (served as the thumbnail in mock). */
export const MOCK_WINE_THUMB_URL = svgDataUrl(MOCK_LABEL_SVG);
/** Synthetic image.fullUrl for mock wine-001 (served as the full copy in mock). */
export const MOCK_WINE_FULL_URL = svgDataUrl(
  MOCK_LABEL_SVG.replace('width="600" height="800"', 'width="1500" height="2000"'),
);

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
      // wine-001 (index 0) has a synthetic photo to demonstrate the zoom viewer.
      image:
        i === 0
          ? ({
              localPath: `homebrain/media/wine/${id}.webp`,
              sourceUrl: null,
              licenseStatus: 'approved',
              url: MOCK_WINE_THUMB_URL,
              fullUrl: MOCK_WINE_FULL_URL,
            } satisfies WineImage)
          : null,
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
