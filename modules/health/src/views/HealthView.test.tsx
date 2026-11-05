// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { adaptHealthEntities } from '../adapter';
import { createHealthDemo, HEALTH_SCENARIOS, type HealthScenario } from '../fixtures';
import type { WorkoutDays } from '../contract';
import { HealthScreen, type HealthTab } from './HealthView';

const SAT = Date.parse('2026-10-31T10:00:00+01:00');
function screenFor(
  scenario: HealthScenario,
  kiosk = false,
  initialTab: HealthTab = 'dnes',
  workoutDays: WorkoutDays | null = null,
) {
  const demo = createHealthDemo(SAT, scenario);
  const model = adaptHealthEntities({
    bindings: demo.bindings,
    getState: (id) => demo.states[id],
    now: SAT,
  });
  return render(
    <HealthScreen
      model={model}
      weight={{ status: 'unsupported', points: [] }}
      kiosk={kiosk}
      initialTab={initialTab}
      workoutDays={workoutDays}
    />,
  );
}
afterEach(cleanup);

describe('HealthScreen', () => {
  it.each(HEALTH_SCENARIOS)('scénář %s se vykreslí se stavem a patičkou', (scenario) => {
    const { container } = screenFor(scenario);
    expect(container.textContent).toContain('ne zdravotní doporučení');
    expect(screen.getByTestId('health-status').textContent).toBeTruthy();
  });

  it('HEA-001: chybějící integrace vysvětlí instalaci v0.7.0', () => {
    screenFor('missing');
    expect(screen.getByTestId('health-missing').textContent).toContain('v0.7.0');
    expect(screen.queryByTestId('health-hero')).toBeNull();
  });

  it('F-001: XP ani streak neukazují nulu jako historii', () => {
    screenFor('empty', false, 'odmeny');
    expect(screen.getByTestId('health-xp').textContent).toContain('Zatím bez historie');
    expect(screen.getByTestId('health-xp').textContent).not.toMatch(/\b0\s*XP/);
    expect(screen.getByTestId('health-streak').textContent).not.toContain('0');
    fireEvent.click(screen.getByTestId('health-tab-dnes'));
    expect(screen.getByTestId('health-hero').textContent).toContain(
      'Zatím žádné importované tréninky',
    );
    expect(screen.getByTestId('health-hero-pill').textContent).toBe('Čeká na první data');
  });

  it('F-002: Calm Coach Dnes – hero s kruhem, týden, spánek, trénink, trend', () => {
    screenFor('week', false, 'dnes', { status: 'ready', days: ['2026-10-28', '2026-10-30'] });
    const hero = screen.getByTestId('health-hero');
    expect(hero.textContent).toContain('Nejbližší správný krok');
    expect(hero.textContent).toContain('Dnes silový trénink');
    expect(hero.querySelector('.hl-ring')!.textContent).toContain('2/3');
    const week = screen.getByTestId('health-week');
    expect(week.textContent).toContain('2 / 3');
    const days = [...week.querySelectorAll('.hl-days li')].map((li) =>
      li.getAttribute('data-state'),
    );
    expect(days).toEqual(['rest', 'rest', 'trained', 'rest', 'trained', 'today', 'future']);
    for (const id of [
      'health-sleep',
      'health-last-workout',
      'health-weight',
      'health-reward-teaser',
      'health-sync',
    ])
      expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.queryByTestId('health-milestones')).toBeNull();
  });

  it('bez historie recorderu dny tréninků nehádá', () => {
    screenFor('week', false, 'dnes', { status: 'unsupported', days: [] });
    const states = [...screen.getByTestId('health-week').querySelectorAll('.hl-days li')].map(
      (li) => li.getAttribute('data-state'),
    );
    expect(states).not.toContain('rest');
    expect(states).not.toContain('trained');
  });

  it('záložky Progres / Odměny / Data a jen navigační tlačítka', () => {
    const { container } = screenFor('week');
    expect(container.querySelectorAll('button:not([data-nav])')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('health-tab-odmeny'));
    expect(screen.getByTestId('health-flex').textContent).toContain('k dispozici');
    expect(screen.getByTestId('health-milestones').querySelectorAll('li')).toHaveLength(5);
    expect(screen.getByTestId('health-streak').textContent).toContain('Stačí dokončit ještě');
    fireEvent.click(screen.getByTestId('health-tab-progres'));
    expect(screen.getByTestId('health-progress-gap').textContent).toContain('nedopočítáváme');
    fireEvent.click(screen.getByTestId('health-tab-data'));
    expect(screen.getByTestId('health-sources').textContent).toContain('Poslední úspěšný import');
    expect(screen.getByTestId('health-privacy')).toBeTruthy();
  });

  it('F-009: zdroj spánku není připojen', () => {
    screenFor('partial');
    expect(screen.getByTestId('health-sleep').textContent).toContain('Zdroj spánku není připojen');
    expect(screen.getByTestId('health-status').textContent).toBe('Částečná data');
  });

  it('F-010: zastaralá data jsou označena textem', () => {
    screenFor('stale');
    expect(screen.getByTestId('health-stale').textContent).toContain('Zastaralá data');
  });

  it('nedostupný zdroj ukazuje pomlčky, ne nuly', () => {
    screenFor('unavailable');
    expect(screen.getByTestId('health-error')).toBeTruthy();
    expect(screen.getByTestId('health-week').textContent).toContain('Nedostupné');
    fireEvent.click(screen.getByTestId('health-tab-odmeny'));
    expect(screen.getByTestId('health-xp').textContent).not.toMatch(/\d/);
  });

  it('kiosk: žádná zdravotní data', () => {
    screenFor('risk', true);
    const visible = screen.getByTestId('health-private').querySelector('section')!;
    expect(visible.textContent).toContain('nezobrazují');
    expect(visible.textContent).not.toMatch(/\d/);
    expect(screen.queryByTestId('health-week')).toBeNull();
  });
});
