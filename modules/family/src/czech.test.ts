import { describe, expect, it } from 'vitest';
import { handedToLabel, nameDative, nameGenitive, pointsWord, takenFromLabel } from './czech.js';

describe('Czech member names', () => {
  it.each([
    ['Syn', 'Synovi', 'Syna'],
    ['Dcera', 'Dceři', 'Dcery'],
    ['Maminka', 'Mamince', 'Maminky'],
    ['Táta', 'Tátovi', 'Táty'],
    ['Děda', 'Dědovi', 'Dědy'],
    ['Jan', 'Janovi', 'Jana'],
    ['Tomáš', 'Tomášovi', 'Tomáše'],
    ['Marek', 'Markovi', 'Marka'],
    ['Matěj', 'Matějovi', 'Matěje'],
    ['Honza', 'Honzovi', 'Honzy'],
    ['Jana', 'Janě', 'Jany'],
    ['Klára', 'Kláře', 'Kláry'],
    ['Anička', 'Aničce', 'Aničky'],
    ['Olga', 'Olze', 'Olgy'],
    ['Eva', 'Evě', 'Evy'],
    ['Soňa', 'Soně', 'Soni'],
    ['Tereza', 'Tereze', 'Terezy'],
    ['Marie', 'Marii', 'Marie'],
    ['Alice', 'Alici', 'Alice'],
    ['Jiří', 'Jiřímu', 'Jiřího'],
    ['Babi', 'Babi', 'Babi'],
  ])('%s → %s / %s', (name, dat, gen) => {
    expect(nameDative(name)).toBe(dat);
    expect(nameGenitive(name)).toBe(gen);
  });

  it('returns null when unsure (ambiguous gender, foreign endings, several words)', () => {
    expect(nameDative('Saša')).toBeNull();
    expect(nameDative('Mia')).toBeNull();
    expect(nameDative('Hugo')).toBeNull();
    expect(nameDative('Dagmar')).toBeNull();
    expect(nameDative('Babi Nová')).toBeNull();
    expect(nameDative('')).toBeNull();
  });

  it('keeps lower-case role words lower-case', () => {
    expect(nameDative('syn')).toBe('synovi');
  });

  it('builds handover labels and falls back to a colon for unknown names', () => {
    expect(handedToLabel('Syn')).toBe('Předáno Synovi · jen dnes');
    expect(takenFromLabel('Dcera')).toBe('Převzato od Dcery · jen dnes');
    expect(handedToLabel('Mia')).toBe('Předáno: Mia · jen dnes');
    expect(takenFromLabel('Hugo')).toBe('Převzato od: Hugo · jen dnes');
    expect(handedToLabel(undefined)).toBe('Předáno · jen dnes');
  });
});

describe('pointsWord', () => {
  it.each([
    [1, 'bod'],
    [2, 'body'],
    [3, 'body'],
    [4, 'body'],
    [5, 'bodů'],
    [0, 'bodů'],
    [12, 'bodů'],
    [2.5, 'bodu'],
    [-3, 'body'],
  ])('%d → %s', (n, word) => expect(pointsWord(n)).toBe(word));
});
