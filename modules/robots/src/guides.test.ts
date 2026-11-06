import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extraGuideParts, guideFor, parseGuides } from './guides.js';
import { planResetCounter, runPlan } from './commands.js';

const example = JSON.parse(
  readFileSync(join(import.meta.dirname, '../guides.example.json'), 'utf8'),
) as unknown;

describe('maintenance guides', () => {
  it('parses the synthetic example', () => {
    const set = parseGuides(example)!;
    expect(Object.keys(set.parts)).toEqual(['main_brush', 'side_brush', 'dust_bag']);
    expect(set.parts.main_brush!.video?.src).toBe('main_brush.mp4');
  });
  it('drops only the invalid part', () => {
    const set = parseGuides({
      schema: 1,
      parts: {
        filter: { title: 'Filtr', steps: [{ text: 'Vyklepejte.' }] },
        mop: { title: 'Mop', steps: [{ text: 'x', image: '../escape.webp' }] },
        wheel: { title: 'Kolo', steps: [{ text: 'x' }], reset: 'vacuum.robot' },
      },
    })!;
    expect(Object.keys(set.parts)).toEqual(['filter']);
    expect(parseGuides({ schema: 2, parts: {} })).toBeNull();
  });
  it('falls back to generic text without pictures or video', () => {
    const guide = guideFor(null, 'main_brush');
    expect(guide.generic).toBe(true);
    expect(guide.steps.length).toBeGreaterThan(2);
    expect(guide.video).toBeUndefined();
    expect(guide.steps.every((step) => !step.image)).toBe(true);
  });
  it('offers extra parts only for private guides without a tile', () => {
    const set = parseGuides(example)!;
    expect(extraGuideParts(set, ['main_brush', 'side_brush'])).toEqual(['dust_bag']);
    expect(extraGuideParts(set, ['dust_bag'])).toEqual([]);
    expect(extraGuideParts(null, [])).toEqual([]);
  });
  it('reset presses the allowlisted button only', async () => {
    const sent: unknown[] = [];
    const connection = {
      sendMessagePromise: async <T>(message: unknown) => (sent.push(message), undefined as T),
    };
    await runPlan(connection, planResetCounter('button.demo_reset', 'Hlavní kartáč'));
    expect(sent).toEqual([
      {
        type: 'call_service',
        domain: 'button',
        service: 'press',
        service_data: {},
        target: { entity_id: 'button.demo_reset' },
      },
    ]);
  });
});
