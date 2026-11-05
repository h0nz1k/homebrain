/**
 * Společné volby všech vitest projektů (projekty nedědí root `vitest.config.ts`).
 * Výchozích 5 s nestačí na přetíženém hostu (4 CPU, souběžné buildy): renderové testy
 * TodayView/WeatherView pak padají na timeout, ne na chybu.
 */
export const sharedTestOptions = { testTimeout: 20000, hookTimeout: 20000 };
