import { expect, it } from 'vitest';
import { FIXTURES } from './fixtures.js';
import { buildDayRibbonModel } from './ribbonModel.js';
it('ends each range on a three-hour tick and keeps sunset as an unlabelled marker', () => {
  for (const data of Object.values(FIXTURES)) {
    const model = buildDayRibbonModel(data);
    expect(model.endHour % 3).toBe(0);
    expect(model.endHour).toBeGreaterThan(model.startHour);
    expect(
      model.items.find((item) => item.type === 'marker' && item.kind === 'sunset'),
    ).toMatchObject({ label: '' });
    expect(model.hourly.every((hour) => hour.hour % 3 === 0 && hour.hour <= model.endHour)).toBe(
      true,
    );
  }
});

it('without sun times (no sun.sun) omits the sunset marker and does not throw', () => {
  const data = { ...FIXTURES.a, sun: { sunrise: '', sunset: '' }, hourly: [], ribbon: [] };
  const model = buildDayRibbonModel(data);
  expect(model.items.some((item) => item.type === 'marker' && item.kind === 'sunset')).toBe(false);
  expect(Number.isFinite(model.sunriseHour) && Number.isFinite(model.sunsetHour)).toBe(true);
  expect(model.endHour % 3).toBe(0);
});
