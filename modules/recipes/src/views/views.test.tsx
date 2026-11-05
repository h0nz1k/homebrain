import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockRecipesApi, type RecipesApi } from '../api.js';
import { AirfryerStep, MusicBar } from './parts.js';
import { AddRecipe, parseIngredientLine, detectSeconds } from './AddRecipe.js';
import { parseRoute } from './RecipesView.js';
import type { RecipesConfig } from '../types.js';

afterEach(cleanup);

const cfg = (over: Partial<RecipesConfig['airfryer']> = {}, music = false): RecipesConfig => ({
  music: { configured: music, mediaSessionEntity: null },
  airfryer: { configured: true, allowed: true, entities: {}, methods: [], ...over },
  canEdit: true,
});
const action = { temperature: 180, minutes: 25, method: 'Maso' };

/** Mocked hass side: the API double records calls; no real device is ever reached. */
function mockApi() {
  const log: Array<{ kind: string; payload: unknown }> = [];
  const api = createMockRecipesApi(undefined, { airfryer: true, music: true, log });
  const spy = vi.spyOn(api, 'airfryer');
  return { api, log, spy };
}

describe('airfryer confirm flow', () => {
  it('sends nothing until the confirm dialog is accepted', async () => {
    const { api, spy, log } = mockApi();
    render(
      <AirfryerStep
        api={api}
        config={cfg()}
        action={action}
        drawer={{ state: 'off', attributes: {} }}
        remaining={undefined}
      />,
    );
    fireEvent.click(screen.getByTestId('recipes-airfryer-send'));
    expect(screen.getByTestId('recipes-airfryer-dialog')).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Zrušit'));
    expect(screen.queryByTestId('recipes-airfryer-dialog')).toBeNull();
    expect(spy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('recipes-airfryer-send'));
    await act(async () => fireEvent.click(screen.getByTestId('recipes-airfryer-confirm')));
    expect(spy).toHaveBeenCalledWith({
      temperature: 180,
      minutes: 25,
      method: 'Maso',
      confirmed: true,
    });
    expect(log).toEqual([
      {
        kind: 'airfryer',
        payload: { temperature: 180, minutes: 25, method: 'Maso', confirmed: true },
      },
    ]);
  });
  it.each([
    ['on', 'Zavřete zásuvku fritézy'],
    ['unknown', 'Stav fritézy není známý'],
    [undefined, 'Stav fritézy není známý'],
  ])('is disabled with drawer %s', (state, text) => {
    const { api } = mockApi();
    render(
      <AirfryerStep
        api={api}
        config={cfg()}
        action={action}
        drawer={state ? { state, attributes: {} } : undefined}
        remaining={undefined}
      />,
    );
    expect((screen.getByTestId('recipes-airfryer-send') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('recipes-airfryer-status').textContent).toBe(text);
  });
  it('shows remaining time from the sensor', () => {
    const { api } = mockApi();
    render(
      <AirfryerStep
        api={api}
        config={cfg()}
        action={action}
        drawer={{ state: 'off', attributes: {} }}
        remaining={{ state: '7', attributes: { unit_of_measurement: 'min' } }}
      />,
    );
    expect(screen.getByTestId('recipes-airfryer-status').textContent).toBe('Zbývá 7 min');
  });
  it('renders nothing when not configured', () => {
    const { api } = mockApi();
    const { container } = render(
      <AirfryerStep
        api={api}
        config={cfg({ configured: false })}
        action={action}
        drawer={undefined}
        remaining={undefined}
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('music bar', () => {
  it('is hidden when the tablet is not configured', () => {
    const api = createMockRecipesApi();
    const { container } = render(
      <MusicBar api={api} config={cfg({}, false)} session={undefined} videoPlaying={false} />,
    );
    expect(container.innerHTML).toBe('');
  });
  it('sends play/pause via the API when configured', async () => {
    const { api } = mockApi();
    const music = vi.spyOn(api as RecipesApi, 'music');
    render(
      <MusicBar
        api={api}
        config={cfg({}, true)}
        session={{ state: 'Paused', attributes: { title: 'Song' } }}
        videoPlaying={false}
      />,
    );
    expect(screen.getByText('Song')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByTestId('recipes-music-toggle')));
    expect(music).toHaveBeenCalledWith('play');
    await waitFor(() => expect(screen.getByLabelText('Pozastavit hudbu')).toBeTruthy());
  });
  it('changes volume only after the user adjusts it', async () => {
    const { api } = mockApi();
    const music = vi.spyOn(api, 'music');
    render(<MusicBar api={api} config={cfg({}, true)} session={undefined} videoPlaying={false} />);
    expect(music).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.change(screen.getByLabelText('Hlasitost hudby'), { target: { value: '7' } }),
    );
    expect(music).toHaveBeenCalledWith('volume', 7);
  });
  it('shows the ducked pill during video', () => {
    const { api } = mockApi();
    render(<MusicBar api={api} config={cfg({}, true)} session={undefined} videoPlaying />);
    expect(screen.getByTestId('recipes-music').dataset.mode).toBe('ducked');
  });
});

describe('step airfryer editor', () => {
  it('saves per-step temperature, time and method without operating a device', async () => {
    const { api, spy } = mockApi();
    const create = vi.spyOn(api, 'create');
    render(<AddRecipe api={api} config={cfg({ methods: ['Maso', 'Hranolky'] })} />);
    fireEvent.click(screen.getByText('Ručně'));
    fireEvent.change(screen.getByLabelText('Název'), { target: { value: 'Zkušební jídlo' } });
    fireEvent.change(screen.getByLabelText(/Postup \(krok/), {
      target: { value: 'Vložte do koše.' },
    });
    fireEvent.click(screen.getByLabelText('Fritéza u kroku 1'));
    fireEvent.change(screen.getByLabelText('Teplota kroku 1 (°C)'), { target: { value: '190' } });
    fireEvent.change(screen.getByLabelText('Doba kroku 1 (min)'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Program kroku 1'), { target: { value: 'Hranolky' } });
    await act(async () => fireEvent.click(screen.getByTestId('recipes-save')));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [
          expect.objectContaining({
            airfryer: { temperature: 190, minutes: 18, method: 'Hranolky' },
          }),
        ],
      }),
      undefined,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('form helpers + routes', () => {
  it('parses Czech ingredient lines', () => {
    expect(parseIngredientLine('2 lžíce hladké mouky')).toMatchObject({
      qty: 2,
      unit: 'lžíce',
      name: 'hladké mouky',
    });
    expect(parseIngredientLine('½ lžičky soli')).toMatchObject({ qty: 0.5, unit: 'lžička' });
    expect(parseIngredientLine('3 vejce')).toMatchObject({ qty: 3, unit: null, countable: true });
    expect(parseIngredientLine('sůl a pepř')).toMatchObject({ qty: null, name: 'sůl a pepř' });
  });
  it('detects step durations', () => {
    expect(detectSeconds('Vaříme 20 minut.')).toBe(1200);
    expect(detectSeconds('Dusíme půl hodiny')).toBe(1800);
    expect(detectSeconds('Pečeme 1,5 hodiny')).toBe(5400);
    expect(detectSeconds('Podáváme.')).toBeNull();
  });
  it('parses sub-routes', () => {
    expect(parseRoute('')).toEqual({ view: 'list' });
    expect(parseRoute('/pridat')).toEqual({ view: 'add' });
    expect(parseRoute('/abc')).toEqual({ view: 'detail', id: 'abc' });
    expect(parseRoute('/abc/varit/3')).toEqual({ view: 'cook', id: 'abc', step: 2 });
    expect(parseRoute('/abc/upravit')).toEqual({ view: 'edit', id: 'abc' });
  });
});
