import { describe, expect, it } from 'vitest';
import { labelBox, placeMapLabels, type LabelCandidate } from './labels.js';

const overlap = (a: ReturnType<typeof labelBox>, b: ReturnType<typeof labelBox>, gap: number) =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

describe('umístění popisků mapy', () => {
  // A crowded corner (like Kraj zoom around Praha): many towns within a few px.
  const crowd: LabelCandidate[] = [
    { name: 'Kladno', x: 40, y: 60, rank: 1 },
    { name: 'Praha', x: 60, y: 70, rank: 0 },
    { name: 'Slaný', x: 30, y: 52, rank: 1 },
    { name: 'Beroun', x: 50, y: 90, rank: 1 },
    { name: 'Mělník', x: 90, y: 55, rank: 1 },
    { name: 'Kralupy nad Vltavou', x: 62, y: 62, rank: 1 },
    { name: 'Brandýs', x: 120, y: 66, rank: 1 },
    { name: 'Říčany', x: 110, y: 100, rank: 1 },
  ];
  it('drží minimální rozestup a přednost má vyšší řád (Praha)', () => {
    const kept = placeMapLabels(crowd, { width: 360, height: 270, gap: 14 });
    expect(kept[0]!.name).toBe('Praha');
    expect(kept.map((k) => k.name)).not.toContain('Kralupy nad Vltavou');
    for (let i = 0; i < kept.length; i++)
      for (let j = i + 1; j < kept.length; j++)
        expect(overlap(labelBox(kept[i]!), labelBox(kept[j]!), 13.9)).toBe(false);
  });
  it('vyhne se rezervovaným plochám (čip času, měřítko) a okraji', () => {
    const kept = placeMapLabels(crowd, {
      width: 360,
      height: 270,
      reserved: [{ x: 0, y: 0, w: 190, h: 80 }],
    });
    for (const k of kept) expect(labelBox(k).y).toBeGreaterThanOrEqual(76);
    const edge = placeMapLabels([{ name: 'Aš', x: 355, y: 100, rank: 0 }], {
      width: 360,
      height: 270,
    });
    expect(edge).toEqual([]);
  });
  it('limit počtu, ale připnutý domov se nevynechá', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `Obec ${i}`,
      x: 10 + (i % 5) * 70,
      y: 20 + Math.floor(i / 5) * 40,
      rank: 2,
    }));
    const home = { name: 'Domov', x: 200, y: 140, rank: 2, pinned: true };
    const kept = placeMapLabels([...many, home], { width: 400, height: 300, max: 5 });
    expect(kept.length).toBeLessThanOrEqual(6);
    expect(kept[0]!.name).toBe('Domov');
  });
});
