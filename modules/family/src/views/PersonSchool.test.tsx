// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMockFamilyApi } from '../mock.js';
import type { SchoolScenario } from '../schoolMock.js';
import { PersonSchool } from './PersonSchool.js';

const now = new Date('2026-11-23T10:00:00+01:00');
afterEach(cleanup);

describe('Škola v detailu dítěte', () => {
  it.each([
    ['full', 5],
    ['holiday', 4],
    ['empty', 0],
    ['stale', 5],
  ] as Array<[SchoolScenario, number]>)('vykreslí stav %s', async (school, allergenRows) => {
    const api = createMockFamilyApi({ school, role: 'child', now: () => now });
    render(<PersonSchool api={api} member="syn" now={now} refreshedAt={0} />);
    const section = within(await screen.findByTestId('family-school'));
    expect(section.getAllByText(/^Alergeny: lepek, vejce$|^—$/)).toHaveLength(5);
    expect(section.queryAllByText('Alergeny: lepek, vejce')).toHaveLength(allergenRows);
    expect(section.getByText('Školní výstava')).toBeTruthy();
    expect(section.getByText('4. třída – divadlo')).toBeTruthy();
    expect(section.queryByText(/9. ročník/)).toBeNull();
    expect(section.queryByText('Třídní schůzky')).toBeNull();
    expect(
      section.getByText(school === 'stale' ? 'načteno 22. 11. 10:00' : 'načteno dnes 9:00'),
    ).toBeTruthy();
    if (school === 'full') expect(section.getByText(/ · polévka mrkvová$/)).toBeTruthy();
    expect(section.queryByRole('alert')).toBeNull();
  });

  it('skryje školu při vypnutém importu', async () => {
    const api = createMockFamilyApi({ now: () => now });
    await act(async () => {
      render(<PersonSchool api={api} member="syn" now={now} refreshedAt={0} />);
    });
    expect(screen.queryByTestId('family-school')).toBeNull();
  });
});
