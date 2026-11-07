// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  createMockHomeApi,
  summarizeChores,
  type FamilyLike,
  type HomeApi,
  type MealsSnapshot,
} from '../data/home.js';
import { TodayHome } from './TodayHome.js';

const nav = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('@homebrain/ha-client', async (orig) => ({
  ...(await orig<typeof import('@homebrain/ha-client')>()),
  navigatePanel: (path: string) => nav.calls.push(path),
}));

afterEach(() => {
  cleanup();
  nav.calls = [];
});

const family = (kids: FamilyLike['kids']): FamilyLike => ({ kids });

describe('summarizeChores', () => {
  it('counts done (approved or waiting for approval) of today per kid', () => {
    const summary = summarizeChores(
      family([
        {
          id: 'a',
          name: 'Dcera',
          chores: [
            { state: 'done' },
            { state: 'claimed' },
            { state: 'todo' },
            { state: 'overdue' },
          ],
        },
        { id: 'b', name: 'Syn', chores: [] },
      ]),
    );
    expect(summary).toEqual([
      { id: 'a', name: 'Dcera', done: 2, total: 4, overdue: 1 },
      { id: 'b', name: 'Syn', done: 0, total: 0, overdue: 0 },
    ]);
  });

  it('is empty without kids', () => {
    expect(summarizeChores(family([]))).toEqual([]);
    expect(summarizeChores(null)).toEqual([]);
  });
});

function api(meals: MealsSnapshot | Error, fam: FamilyLike | null | Error = null): HomeApi {
  return {
    meals: () => (meals instanceof Error ? Promise.reject(meals) : Promise.resolve(meals)),
    family: () => (fam instanceof Error ? Promise.reject(fam) : Promise.resolve(fam)),
  };
}

const snapshot = (over: Partial<MealsSnapshot> = {}): MealsSnapshot => ({
  date: '2026-06-02',
  configured: true,
  can_plan: false,
  meals: [],
  errors: [],
  ...over,
});

describe('TodayHome', () => {
  it('lists meals in plan order and links a known recipe to Recepty', async () => {
    render(
      <TodayHome
        api={api(
          snapshot({
            meals: [
              {
                id: '1',
                type: 'lunch',
                label: 'Oběd',
                title: 'Kuřecí vývar',
                slug: 'v',
                recipe_id: 'r1',
              },
              {
                id: '2',
                type: 'dinner',
                label: 'Večeře',
                title: 'Rizoto',
                slug: null,
                recipe_id: null,
              },
            ],
          }),
        )}
        kiosk={false}
      />,
    );
    const rows = await screen.findAllByTestId('today-meal');
    expect(rows.map((row) => row.textContent)).toEqual(['ObědKuřecí vývar', 'VečeřeRizoto']);
    fireEvent.click(screen.getByRole('button', { name: /Kuřecí vývar/ }));
    expect(nav.calls).toEqual(['/recipes/r1']);
    expect(screen.queryByRole('button', { name: /Rizoto/ })).toBeNull();
  });

  it('kiosk shows meal names without links', async () => {
    render(
      <TodayHome
        api={api(
          snapshot({
            meals: [
              { id: '1', type: 'lunch', label: 'Oběd', title: 'Vývar', slug: 'v', recipe_id: 'r1' },
            ],
          }),
        )}
        kiosk
      />,
    );
    await screen.findByTestId('today-meal');
    expect(screen.queryByRole('button', { name: /Vývar/ })).toBeNull();
  });

  it('empty plan is calm; the Mealie hint is for admins only', async () => {
    const { unmount } = render(<TodayHome api={api(snapshot())} kiosk={false} />);
    expect((await screen.findByTestId('today-meals-empty')).textContent).toContain(
      'Nic naplánováno',
    );
    expect(screen.getByTestId('today-meals-empty').textContent).not.toMatch(/Mealie/);
    unmount();
    render(<TodayHome api={api(snapshot({ can_plan: true }))} kiosk={false} />);
    expect((await screen.findByTestId('today-meals-empty')).textContent).toContain(
      'Nic naplánováno – naplánujte v Mealie',
    );
  });

  it('a Mealie error keeps the tile calm', async () => {
    render(<TodayHome api={api(new Error('down'))} kiosk={false} />);
    expect((await screen.findByTestId('today-meals-empty')).textContent).toContain(
      'Nic naplánováno',
    );
  });

  it('kids chores summary opens Rodina; hidden without kids', async () => {
    const fam = family([
      { id: 'a', name: 'Dcera', chores: [{ state: 'done' }, { state: 'todo' }] },
      { id: 'b', name: 'Syn', chores: [{ state: 'overdue' }] },
    ]);
    const { unmount } = render(<TodayHome api={api(snapshot(), fam)} kiosk />);
    const tile = await screen.findByTestId('today-chores');
    expect(tile.textContent).toContain('Dcera1/2');
    expect(tile.textContent).toContain('Syn0/11 po termínu');
    fireEvent.click(screen.getByRole('button', { name: /Povinnosti dětí dnes/ }));
    expect(nav.calls).toEqual(['/family']);
    unmount();
    render(<TodayHome api={api(snapshot(), family([]))} kiosk={false} />);
    await screen.findByTestId('today-meals');
    await waitFor(() => expect(screen.queryByTestId('today-chores')).toBeNull());
  });

  it('mock api scenarios', async () => {
    const full = createMockHomeApi('full', 'owner');
    expect((await full.meals()).meals.length).toBeGreaterThan(1);
    expect((await full.family())?.kids.length).toBe(2);
    const empty = createMockHomeApi('empty', 'kiosk');
    expect(await empty.meals()).toMatchObject({ meals: [], can_plan: false });
  });
});
