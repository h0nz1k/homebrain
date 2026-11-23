/**
 * Czech declension of member display names for short status lines
 * („Předáno Synovi“, „Převzato od Dcery“). Rule-based for common first names and family
 * role words; anything uncertain returns `null` so the caller can fall back to „Předáno: X“.
 */

type Case = 'dat' | 'gen';

/** Role words and names whose forms the rules below would get wrong. */
const IRREGULAR: Record<string, { dat: string; gen: string }> = {
  jiří: { dat: 'Jiřímu', gen: 'Jiřího' },
  zdeněk: { dat: 'Zdeňkovi', gen: 'Zdeňka' },
  pavel: { dat: 'Pavlovi', gen: 'Pavla' },
  karel: { dat: 'Karlovi', gen: 'Karla' },
  máma: { dat: 'Mámě', gen: 'Mámy' },
  dcera: { dat: 'Dceři', gen: 'Dcery' },
};

/** Masculine names / role words ending in -a (dative -ovi, not -e/-ě). */
const MASC_A = new Set([
  'děda',
  'táta',
  'brácha',
  'honza',
  'jirka',
  'kuba',
  'vojta',
  'franta',
  'pepa',
  'ota',
  'tonda',
  'jarda',
  'standa',
  'láďa',
  'mára',
  'jenda',
]);

/** -a names used for both genders: the dative would be a guess. */
const AMBIGUOUS_A = new Set([
  'míra',
  'saša',
  'míša',
  'péťa',
  'kája',
  'nikola',
  'sláva',
  'jára',
  'zbyňa',
]);

/** Feminine names ending in a consonant (indeclinable in everyday speech → no rule). */
const FEM_CONSONANT = new Set([
  'ester',
  'dagmar',
  'miriam',
  'karin',
  'ingrid',
  'carmen',
  'rút',
  'noemi',
]);

const SOFT = 'žščřcjďťňx';
const SOFT_DAT: Record<string, string> = { ď: 'dě', ť: 'tě', ň: 'ně' };

/** Keeps the capitalisation of the original (first letter) on the declined form. */
function withCase(original: string, declined: string): string {
  const first = original.charAt(0);
  return first === first.toLocaleUpperCase('cs')
    ? declined.charAt(0).toLocaleUpperCase('cs') + declined.slice(1)
    : declined;
}

/** Feminine -a dative: Dcera → Dceři, Anička → Aničce, Jana → Janě, Olga → Olze. */
function femDative(stem: string): string | null {
  const two = stem.slice(-2);
  if (two === 'ch') return `${stem.slice(0, -2)}še`;
  const last = stem.slice(-1);
  const head = stem.slice(0, -1);
  switch (last) {
    case 'k':
      return `${head}ce`;
    case 'h':
    case 'g':
      return `${head}ze`;
    case 'r':
      return `${head}ře`;
    case 'd':
    case 't':
    case 'n':
    case 'b':
    case 'p':
    case 'v':
    case 'm':
    case 'f':
      return `${stem}ě`;
    case 'l':
    case 's':
    case 'z':
      return `${stem}e`;
  }
  if (SOFT_DAT[last]) return `${head}${SOFT_DAT[last]}`;
  if ('žščřj'.includes(last)) return `${stem}e`;
  return null;
}

function decline(name: string, kase: Case): string | null {
  const raw = name.trim();
  if (!raw || /\s/u.test(raw) || !/^\p{L}+$/u.test(raw)) return null;
  const low = raw.toLocaleLowerCase('cs');
  const irregular = IRREGULAR[low];
  if (irregular) return withCase(raw, irregular[kase]);
  const last = low.slice(-1);
  // Babi, Mimi, Gabi, Elly: indeclinable – the plain name is correct Czech.
  if ('iyý'.includes(last)) return raw;
  if (last === 'a') {
    const stem = low.slice(0, -1);
    const before = stem.slice(-1);
    if (!before || 'aeiouyáéíóúůýě'.includes(before)) return null; // Mia, Andrea
    const soft = SOFT.includes(before);
    if (kase === 'gen') {
      // ď/ť/ň lose the háček before -i in writing: Soňa → Soni, Táňa → Táni.
      const plain = stem.replace(/[ďťň]$/u, (c) => ({ ď: 'd', ť: 't', ň: 'n' })[c]!);
      return withCase(raw, soft ? `${plain}i` : `${stem}y`);
    }
    if (AMBIGUOUS_A.has(low)) return null;
    if (MASC_A.has(low)) return withCase(raw, `${stem}ovi`);
    const dat = femDative(stem);
    return dat ? withCase(raw, dat) : null;
  }
  if (low.endsWith('ie')) {
    // Marie, Lucie, Natálie
    return withCase(raw, kase === 'dat' ? `${low.slice(0, -1)}i` : low);
  }
  if (low.endsWith('ce')) {
    // Alice, Beatrice
    return withCase(raw, kase === 'dat' ? `${low.slice(0, -1)}i` : low);
  }
  if ('eéoóuúůíáě'.includes(last)) return null;
  // Consonant: masculine (Syn, Jan, Tomáš, Marek, Dědeček); a few feminine names excluded.
  if (FEM_CONSONANT.has(low)) return null;
  let stem = low;
  // Mobile -e-: Marek → Markovi, Dědeček → Dědečka.
  if (/[^aeiouyáéíóúůý]ek$/u.test(low)) stem = `${low.slice(0, -2)}k`;
  if (kase === 'dat') return withCase(raw, `${stem}ovi`);
  return withCase(raw, `${stem}${SOFT.includes(stem.slice(-1)) ? 'e' : 'a'}`);
}

export function nameAccusative(name: string): string | null {
  const first = name.trim();
  if (/^\p{L}+a$/iu.test(first)) return `${first.slice(0, -1)}u`;
  return first.toLocaleLowerCase('cs').endsWith('e') ? null : nameGenitive(first);
}

export function reassignedToLabel(name: string, day = 'dnes'): string {
  const recipient = nameAccusative(name);
  const when = day === 'dnes' ? ' na dnes' : ` · ${day}`;
  return recipient ? `Přeřazeno na ${recipient}${when}` : `Přeřazeno ${name} · ${day}`;
}

/** 3. pád (komu): „Synovi“, „Dceři“, „Babi“; `null` when unsure. */
export function nameDative(name: string): string | null {
  return decline(name, 'dat');
}

/** 2. pád (od koho): „Syna“, „Dcery“, „Babi“; `null` when unsure. */
export function nameGenitive(name: string): string | null {
  return decline(name, 'gen');
}

/** „Předáno Synovi · jen dnes“ – or „Předáno: X · jen dnes“ for names we cannot decline. */
export function handedToLabel(name: string | null | undefined): string {
  if (!name) return 'Předáno · jen dnes';
  const dat = nameDative(name);
  return dat ? `Předáno ${dat} · jen dnes` : `Předáno: ${name} · jen dnes`;
}

/** „Převzato od Dcery · jen dnes“ – or „Převzato od: X · jen dnes“ as a fallback. */
export function takenFromLabel(name: string | null | undefined): string {
  if (!name) return 'Převzato · jen dnes';
  const gen = nameGenitive(name);
  return gen ? `Převzato od ${gen} · jen dnes` : `Převzato od: ${name} · jen dnes`;
}

/** Kid-facing unit: 1 bod, 2–4 body, 0 / 5+ bodů, 2,5 bodu. */
export function pointsWord(points: number): string {
  const abs = Math.abs(points);
  if (!Number.isInteger(abs)) return 'bodu';
  if (abs === 1) return 'bod';
  return abs >= 2 && abs <= 4 ? 'body' : 'bodů';
}

export function pendingHandoverLabel(name?: string): string {
  if (!name) return 'Předání čeká na\u00a0schválení';
  const recipient = nameDative(name);
  return recipient
    ? `Předání ${recipient} čeká na\u00a0schválení`
    : `Předání pro ${nameGenitive(name) ?? name} čeká na\u00a0schválení`;
}
