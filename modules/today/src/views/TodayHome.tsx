import { useEffect, useState } from 'react';
import { navigatePanel } from '@homebrain/ha-client';
import { summarizeChores, type HomeApi, type KidChores, type MealsSnapshot } from '../data/home.js';

const REFRESH_MS = 5 * 60_000;

/**
 * Dnes household strip: „Co se dnes vaří“ (Mealie meal plan) + kids' chores today (Rodina).
 * Everyone incl. the kiosk sees the meals; recipe links open Recepty (not on the wall tablet,
 * which stays on Dnes/Rodina). The chores tile opens Rodina and is hidden without kids.
 */
export function TodayHome({ api, kiosk }: { api: HomeApi | null; kiosk: boolean }) {
  const [meals, setMeals] = useState<MealsSnapshot | 'error' | undefined>(undefined);
  const [kids, setKids] = useState<KidChores[]>([]);
  useEffect(() => {
    if (!api) return;
    let active = true;
    const load = () => {
      api.meals().then(
        (next) => active && setMeals(next),
        () => active && setMeals('error'),
      );
      api.family().then(
        (next) => active && setKids(summarizeChores(next)),
        () => active && setKids([]),
      );
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api]);
  if (!api || meals === undefined) return null;
  const rows = meals === 'error' ? [] : meals.meals;
  const hint = meals !== 'error' && meals.can_plan ? ' – naplánujte v Mealie' : '';
  return (
    <div className="today-home" data-testid="today-home">
      <section
        className="today-home-tile today-meals"
        data-testid="today-meals"
        aria-label="Co se dnes vaří"
      >
        <h3 className="today-home-title">Co se dnes vaří</h3>
        {rows.length ? (
          <ul className="today-meal-list">
            {rows.map((meal) => (
              <li key={meal.id} data-testid="today-meal" data-meal-type={meal.type}>
                <span className="today-meal-type">{meal.label}</span>
                {meal.recipe_id && !kiosk ? (
                  <button
                    type="button"
                    className="today-meal-name today-meal-link"
                    title="Otevřít v Receptech"
                    onClick={() => navigatePanel(`/recipes/${meal.recipe_id}`)}
                  >
                    {meal.title}
                  </button>
                ) : (
                  <span className="today-meal-name">{meal.title}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="today-home-empty" data-testid="today-meals-empty">
            Nic naplánováno{hint}
          </p>
        )}
      </section>
      {!!kids.length && (
        <button
          type="button"
          className="today-home-tile today-chores"
          data-testid="today-chores"
          onClick={() => navigatePanel('/family')}
        >
          <span className="today-home-title">Povinnosti dětí dnes</span>
          <span className="today-chore-list">
            {kids.map((kid) => (
              <span key={kid.id} className="today-chore-kid" data-testid="today-chore-kid">
                <span className="today-chore-name">{kid.name}</span>
                <b className="today-chore-count">
                  {kid.done}/{kid.total}
                </b>
                {kid.overdue > 0 && (
                  <small className="today-chore-late">{kid.overdue} po termínu</small>
                )}
                <span className="today-chore-bar" aria-hidden="true">
                  <span style={{ width: `${kid.total ? (100 * kid.done) / kid.total : 0}%` }} />
                </span>
              </span>
            ))}
          </span>
        </button>
      )}
    </div>
  );
}
