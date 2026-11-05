# UX zásady HomeBrain

Závazné pro všechny moduly. Živé ukázky: `apps/panel/catalog.html`
(`pnpm --filter @homebrain/panel dev` → `/catalog.html`). Revize: `docs/architecture/review-2026-11.md`.

## 1. Hlas a tón (česky)

- **Výsledek nebo sloveso první, krátce.** „Uloženo“, „Lahev odepsána“, „Připomínka zapnuta“,
  „Import dokončen“. Ne „Vaše změny byly úspěšně uloženy“.
- **Bez vykřičníků a bez tečky** na konci jednovětých oznámení a popisků. Tečka jen ve vícevětém
  textu.
- **Chyba = co se stalo + co dál.** „Nepodařilo se uložit – zkusit znovu“, „Spojení s Home
  Assistantem se přerušilo“. Nikdy technické kódy („Error 500“, „WS timeout“) – ty patří do logu.
- **Vykání jen tam, kde je výzva** („Vyvezte popelnici“, „Přidejte první víno“), jinak neosobně.
- **Čísla česky:** desetinná čárka, mezera před jednotkou (`12,4 kWh`, `7 °C`, `64 %`), čas
  `14:05`, relativně „před 5 min“, „zítra“.
- **Sentence case** v nadpisech a popiscích, žádné VERZÁLKY.
- **Pomlčka** „–“ (en dash) s mezerami pro spojení věty a akce, ne „-“.

| Situace | Ano | Ne |
| --- | --- | --- |
| úspěch | Uloženo | Úspěšně uloženo! |
| úspěch s detailem | Hodnocení uloženo: 4 z 5 | Hodnocení bylo uloženo. |
| chyba | Nepodařilo se uložit – zkusit znovu | Chyba! Request failed |
| vratná akce | Lahev odepsána · Vrátit | Opravdu chcete odepsat lahev? (u vratné akce) |
| prázdný stav | Zatím žádná vína · Přidejte první lahev | Žádná data |

## 2. Zpětná vazba na akce

| Typ akce | Prvek | Pravidlo |
| --- | --- | --- |
| Uložení pole, uživatel zůstává ve formuláři | `SaveState` | „Ukládám…“ → „Uloženo ✓“ (2 s) → nic; chyba zůstává s „zkusit znovu“ |
| Uložení, které zavře formulář/sheet | `toast.success` | jedno oznámení, `id` podle akce (opakování nahradí, nehromadí) |
| Vratná destruktivní akce | `toast.undo` | 6 s s ukazatelem průběhu; potvrzovací dialog nepoužívat |
| Nevratná destruktivní akce | potvrzovací dialog | „Smazat víno?“ + tlačítko se slovesem („Smazat“) |
| Chyba zápisu | `toast.error` (+ `action: Zkusit znovu`) nebo `SaveState` error | čtečky: `aria-live="assertive"` |
| Informace na pozadí | `toast.info` | jen pokud uživatel akci spustil (import, synchronizace) |

**Nikdy** pro tutéž akci `SaveState` i toast současně. Nikdy vlastní `.x-toast` v modulu.

### API

```ts
import { toast, useToast, SaveState, useSaveState } from '@homebrain/ui';

toast.success('Uloženo', { id: 'wine' });
toast.error('Nepodařilo se uložit', { action: { label: 'Zkusit znovu', onAction: retry } });
toast.info('Import dokončen', { description: 'Přidáno 12 vín' });
toast.undo('Lahev odepsána', () => api.undo(op));

const save = useSaveState();
await save.run(() => api.update(id, patch)); // <SaveState status={save.status} onRetry={…} />
```

`<Toaster />` montuje jednou shell (`apps/panel/src/shell/App.tsx`); unit testy modulů ho
vykreslí vedle view (`render(<><View/><Toaster/></>)`) a v `afterEach` volají `toastStore.reset()`.

### Chování oznámení

- Mobil: dole uprostřed nad tab barem a `safe-area-inset-bottom`; desktop: vpravo dole.
- Max. 3 nad sebou, nejstarší se zavře. Nové je dole (nejblíž okraji).
- Auto-zavření 4 s; chyby a „Vrátit“ 6 s (WCAG 2.2.1 – dost času přečíst a reagovat).
- Pauza při najetí myší i fokusu klávesnicí; křížek „Zavřít oznámení“.
- Vzhled: poloprůhledný povrch `--hb-s1` s blur 20 px, jemná elevace, ikona v tónovaném kruhu
  (úspěch `--hb-ok`, chyba `--hb-crit`, info `--hb-ac`), radius 16 px, žádné tvrdé rámečky.
- Pohyb: vjezd 12 px + fade (`--hb-dur-slow`, `--hb-ease-out`), odjezd 200 ms; reduced motion
  = bez animací.

## 3. Vizuální pravidla

- Tokeny místo literálů: barvy `--hb-*`, mezery `--hb-sp-1…8`, zaoblení `--hb-radius-xs…xl`,
  typografie `--hb-type-*`, pohyb `--hb-dur-*` + `--hb-ease-out`.
- Žádné „krabice v krabici“: jedna úroveň karty, uvnitř mezera nebo hairline
  (`color-mix(in srgb, var(--hb-t1) 8%, transparent)`).
- Min. písmo 13 px (11 px jen popisky os), kiosk 16 px. Dotykové cíle ≥ 44 px na mobilu
  (ikonová tlačítka v hustých prvcích ≥ 32 px).
- Text nese význam i bez barvy (tón + slovo).
- Animovat jen `transform`/`opacity`; nekonečné smyčky jen ambientní (≥ 60 s).

## 4. Přístupnost

- České `aria-label` u ikonových tlačítek.
- Dialogy/sheety: `role="dialog"`, `aria-modal`, Esc zavře, fokus zpět na spouštěč.
- Live regiony musí existovat před obsahem (proto je drží `Toaster` trvale).
- `prefers-reduced-motion`: `animation: none !important; transition: none !important`.

## 5. Nová obrazovka – checklist

1. Primitivy z `@homebrain/ui` (katalog), vlastní jen layout.
2. Texty dle oddílu 1, oznámení dle oddílu 2.
3. Světlé i tmavé téma, 360×800, 800×1280, 1440×900; label `needs-owner-visual-check`.
4. Chybí-li primitiv, přidat ho do `packages/ui` + katalogu, ne do modulu.
