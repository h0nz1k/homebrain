/** Synthetic recipes + generated SVG plate placeholders (no third-party photos). */
import type { Ingredient, Recipe, RecipeDraft, Step } from './types.js';

const PALETTES: Record<string, [string, string, string, string]> = {
  svickova: ['#e9d3b0', '#c98a4b', '#f4ede1', '#7a4a24'],
  bramboraky: ['#f0cf8a', '#c58b2e', '#f6efe3', '#8a5a16'],
  palacinky: ['#f6dfb1', '#e0a14a', '#f8f2e8', '#b4553c'],
  stehna: ['#e8b07a', '#b5602a', '#f3ece2', '#6f8f3a'],
  polevka: ['#f3c66b', '#d98a1f', '#f6f0e6', '#4f7d3a'],
};

/** Top-down plate on a linen table, as a data URL (deterministic per seed). */
export function plateArt(seed: string): string {
  const [food, crust, plate, accent] = PALETTES[seed] ?? PALETTES.polevka!;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const blobs = Array.from({ length: 6 }, (_, i) => {
    const a = ((h >> (i * 3)) % 360) * (Math.PI / 180) + i;
    const r = 60 + ((h >> i) % 40);
    return `<circle cx="${(300 + Math.cos(a) * r).toFixed(0)}" cy="${(200 + Math.sin(a) * r * 0.8).toFixed(0)}" r="${26 + ((h >> (i + 2)) % 18)}" fill="${i % 2 ? crust : food}" opacity=".92"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice">
<defs><radialGradient id="t" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="#d9c7ae"/><stop offset="1" stop-color="#8f7558"/></radialGradient>
<radialGradient id="p" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="${plate}"/><stop offset="1" stop-color="#d8cfc2"/></radialGradient>
<filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter></defs>
<rect width="600" height="400" fill="url(#t)"/>
<ellipse cx="312" cy="214" rx="150" ry="150" fill="#3b2a1a" opacity=".35" filter="url(#s)"/>
<circle cx="300" cy="200" r="142" fill="url(#p)"/><circle cx="300" cy="200" r="112" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3"/>
<g>${blobs}</g><circle cx="270" cy="170" r="16" fill="${accent}" opacity=".85"/><ellipse cx="330" cy="165" rx="34" ry="10" fill="#fff" opacity=".22"/>
<rect x="490" y="40" width="22" height="320" rx="11" fill="#efe6d8" opacity=".9"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const ing = (
  qty: number | null,
  unit: string | null,
  name: string,
  group: string | null = null,
  countable = false,
  note: string | null = null,
): Ingredient => ({
  qty,
  unit,
  name,
  group,
  countable,
  note,
});
const step = (
  text: string,
  timerSeconds: number | null = null,
  videoTs: number | null = null,
  airfryer: Step['airfryer'] = null,
  group: string | null = null,
): Step => ({
  text,
  timerSeconds,
  videoTs,
  airfryer,
  group,
});

function recipe(id: string, seed: string, data: Omit<Recipe, 'id' | 'photo'>): Recipe {
  const url = plateArt(seed);
  return { id, photo: { fullUrl: url, thumbUrl: url }, ...data };
}

export function createSyntheticRecipes(): Recipe[] {
  const base = {
    description: null,
    notes: null,
    sourceName: null,
    sourceUrl: null,
    youtubeId: null,
    rating: null,
    lastCookedAt: null,
    prepSeconds: null,
    cookSeconds: null,
  };
  return [
    recipe('a1'.padEnd(32, '0'), 'svickova', {
      ...base,
      title: 'Svíčková na smetaně',
      description: 'Syntetický nedělní recept pro vývoj.',
      servings: 4,
      totalSeconds: 3 * 3600,
      prepSeconds: 40 * 60,
      cookSeconds: 140 * 60,
      favourite: true,
      rating: 5,
      lastCookedAt: '2026-10-30T17:00:00Z',
      sourceUrl: 'https://recepty.example.org/svickova',
      sourceName: 'recepty.example.org',
      youtubeId: 'AbCdEfGhIjK',
      tags: ['hlavní jídlo', 'česká', 'omáčka'],
      ingredients: [
        ing(800, 'g', 'hovězí svíčková', 'Maso'),
        ing(2, null, 'mrkev', 'Maso', true),
        ing(1, null, 'celer', 'Maso', true, 'menší'),
        ing(1, null, 'cibule', 'Maso', true),
        ing(250, 'ml', 'smetana ke šlehání', 'Omáčka'),
        ing(2, 'lžíce', 'hladká mouka', 'Omáčka'),
        ing(1, 'lžička', 'cukr', 'Omáčka'),
        ing(1, 'špetka', 'sůl', 'Omáčka'),
      ],
      steps: [
        step('Maso očistíme, osolíme a ze všech stran opečeme dozlatova.', null, 12, null, 'Maso'),
        step('Mrkev, celer a cibuli orestujeme asi 10 minut.', 600, 95, null, 'Maso'),
        step('Podlijeme vývarem a dusíme pod pokličkou 2 hodiny.', 7200, 240),
        step('Zeleninu rozmixujeme, vmícháme smetanu a necháme 5 minut probublat.', 300, 410),
        step('Maso nakrájíme na plátky a podáváme s knedlíkem.'),
      ],
    }),
    recipe('b2'.padEnd(32, '0'), 'bramboraky', {
      ...base,
      title: 'Bramboráky',
      servings: 4,
      totalSeconds: 45 * 60,
      favourite: false,
      lastCookedAt: '2026-10-20T17:00:00Z',
      tags: ['vegetariánské', 'rychlé'],
      ingredients: [
        ing(1, 'kg', 'brambory'),
        ing(2, null, 'vejce', null, true),
        ing(3, 'stroužek', 'česnek', null, true),
        ing(10, 'dkg', 'hladká mouka'),
        ing(1, 'lžíce', 'majoránka'),
        ing(null, null, 'olej na smažení'),
      ],
      steps: [
        step('Brambory nastrouháme najemno a vymačkáme.'),
        step('Přidáme vejce, prolisovaný česnek, majoránku a mouku.'),
        step('Smažíme z obou stran 4 minuty dozlatova.', 240),
      ],
    }),
    recipe('c3'.padEnd(32, '0'), 'palacinky', {
      ...base,
      title: 'Palačinky',
      servings: 8,
      totalSeconds: 30 * 60,
      favourite: true,
      tags: ['sladké', 'rychlé'],
      ingredients: [
        ing(2, 'hrnek', 'polohrubá mouka'),
        ing(0.5, 'l', 'mléko'),
        ing(2, null, 'vejce', null, true),
        ing(1.5, 'lžíce', 'olej'),
        ing(1, 'špetka', 'sůl'),
      ],
      steps: [
        step('Vše prošleháme na hladké těstíčko.'),
        step('Necháme čtvrt hodiny odpočinout.', 900),
        step('Pečeme na rozpálené pánvi asi 1 minutu z každé strany.', 60),
      ],
    }),
    recipe('d4'.padEnd(32, '0'), 'stehna', {
      ...base,
      title: 'Kuřecí stehna z fritézy',
      servings: 2,
      totalSeconds: 40 * 60,
      favourite: false,
      tags: ['hlavní jídlo', 'fritéza'],
      ingredients: [
        ing(4, null, 'kuřecí stehna', null, true),
        ing(2, 'lžíce', 'olej'),
        ing(1, 'lžička', 'uzená paprika'),
        ing(200, 'ml', 'bílý jogurt'),
      ],
      steps: [
        step('Stehna potřeme olejem a kořením.'),
        step('Pečeme ve fritéze na 180 °C 25 minut.', 1500, null, {
          temperature: 180,
          minutes: 25,
          method: 'Maso',
        }),
        step('Necháme 5 minut odpočinout a podáváme s jogurtem.', 300),
      ],
    }),
  ];
}

export function syntheticPreview(url: string): RecipeDraft {
  return {
    title: 'Dýňová polévka',
    description: 'Synteticky naimportovaný recept (dev mock).',
    notes: null,
    servings: 4,
    prepSeconds: 15 * 60,
    cookSeconds: 30 * 60,
    totalSeconds: 45 * 60,
    sourceUrl: url,
    sourceName: new URL(url).hostname,
    youtubeId: null,
    tags: ['polévka', 'podzim'],
    photoUrl: plateArt('polevka'),
    ingredients: [
      ing(1, 'kg', 'dýně hokkaido'),
      ing(1, null, 'cibule', null, true),
      ing(2, 'stroužek', 'česnek', null, true),
      ing(1, 'l', 'zeleninový vývar'),
      ing(200, 'ml', 'kokosové mléko'),
    ],
    steps: [
      step('Cibuli a česnek orestujeme 5 minut.', 300),
      step('Přidáme dýni a vývar a vaříme 20 minut doměkka.', 1200),
      step('Rozmixujeme a vmícháme kokosové mléko.'),
    ],
  };
}

/** Dev/e2e scenarios for the live fryer card (synthetic `demo_fryer` entities only). */
export type FryerDemoScenario =
  'preheat' | 'cooking' | 'action' | 'drawer' | 'paused' | 'done' | 'warm' | 'error' | 'off';

export function fryerDemoStates(
  scenario: FryerDemoScenario,
  now: Date,
): Record<
  string,
  {
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
    last_changed: string;
    last_updated: string;
  }
> {
  const status: Record<FryerDemoScenario, string> = {
    preheat: 'cooking',
    cooking: 'cooking',
    action: 'user_action',
    drawer: 'user_action',
    paused: 'pause',
    done: 'finish',
    warm: 'maintain',
    error: 'cooking',
    off: 'standby',
  };
  const running = scenario !== 'off';
  const values: Array<[string, string]> = [
    ['sensor.demo_fryer_cooking_status', status[scenario]],
    [
      'sensor.demo_fryer_time_remaining',
      scenario === 'done' || scenario === 'warm' ? '0' : scenario === 'preheat' ? '1080' : '522',
    ],
    ['sensor.demo_fryer_total_cook_time', running ? '19' : '0'],
    [
      'sensor.demo_fryer_current_temperature',
      scenario === 'preheat' ? '142' : scenario === 'warm' ? '68' : running ? '189' : '24',
    ],
    ['sensor.demo_fryer_target_temperature', running ? (scenario === 'warm' ? '65' : '200') : '0'],
    ['sensor.demo_fryer_current_stage', running ? '2' : '0'],
    ['sensor.demo_fryer_autocook_program', running ? '14' : '0'],
    ['sensor.demo_fryer_autocook_amount', running ? '3' : '0'],
    ['select.demo_fryer_cooking_method', running ? 'auto_cook' : 'no_selection'],
    ['sensor.demo_fryer_preheat_status', scenario === 'preheat' ? 'True' : 'False'],
    ['binary_sensor.demo_fryer_drawer', scenario === 'drawer' ? 'on' : 'off'],
    ['sensor.demo_fryer_error_code', scenario === 'error' ? '3' : '0'],
    ['switch.demo_fryer_power', running ? 'on' : 'off'],
    ['button.demo_fryer_pause', 'unknown'],
    ['button.demo_fryer_stop', 'unknown'],
    ['button.demo_fryer_keep_warm', 'unknown'],
  ];
  const stamp = now.toISOString();
  return Object.fromEntries(
    values.map(([entity_id, state]) => [
      entity_id,
      { entity_id, state, attributes: {}, last_changed: stamp, last_updated: stamp },
    ]),
  );
}
