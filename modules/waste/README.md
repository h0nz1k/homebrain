# Modul Odpady (`@homebrain/module-waste`)

Fáze 1: český přehled dnešních, zítřejších a nejbližších svozů, zrušené termíny a stav dat.

Logické vazby `waste_dataset`, `waste_next` a `waste_next_<přípona>` odkazují na entity Home Assistantu. Modul odebírá pouze jejich změny a každou minutu přepočítává datum. Samostatný senzor má datum svozu ve stavu, typ v `waste_type`; známý typ dostane český název, ostatní použijí `friendly_name`.

Dataset je objekt nebo JSON v atributu `waste_dashboard`. Kontrakt v `src/contract.ts` definuje `schema_version: 1`, `generated_at`, `source_status` (available, stale, unavailable, error), `source_updated_at`, `events` a `notices`. Událost obsahuje `id`, `waste_type`, `display_name`, `collection_date` (YYYY-MM-DD), `availability` (confirmed, tentative, cancelled, unavailable), `visual_token` a `source_updated_at`. Typy: plastic, paper, glass, mixed, bio, electro, hazardous, bulky, other. Normalizace opravuje neznámé typy a vizuální tokeny, vadné události vynechá. Dataset má při shodě data a typu přednost před samostatným senzorem.

Kvalita je nejhorší ze všech zdrojů: chybějící entity, unknown/unavailable nebo neplatný dataset znamenají nedostupnost; stáří entity přes 36 hodin nebo source_status stale znamená zastaralost. Datum se vyhodnocuje v Europe/Prague. Zrušené budoucí události jsou oddělené od nejbližších svozů.

Fixtures v `src/__fixtures__` jsou portované legacy scénáře; původ: `donor/waste`, cesta `fixtures/`, commit `e3a3c34`. Podrobnosti jsou v `src/__fixtures__/legacy/README.md`. Nevyžadují síťové spojení s Home Assistantem. Dev host používá syntetická data relativní k dnešku; `/waste?waste=stale` a `/waste?waste=unavailable` ukazují poruchové stavy.

Z kořene repozitáře spusťte `pnpm test` (kontrakt, adaptér a komponenta), `pnpm test:e2e` (mobil, tablet, desktop) a `pnpm build`. Před testy z čistého checkoutu spusťte `pnpm --filter '@homebrain/panel^...' build`, protože workspace exportuje sestavené soubory. Styly přehledu jsou v `packages/ui/src/tokens.css`, které načítá shell; samotný modul sestavuje tsc.

### Přehled s popelnicemi (Refs #77)

Panel používá schválený vektorový model plastové dvoukolové popelnice EN 840, 240 l.
Všechny typy včetně objemného a nebezpečného odpadu sdílejí stejnou geometrii;
barvy čerpají z `--hb-waste-*`. Počítání dnů používá kalendářní datum v Europe/Prague.

Událost může volitelně obsahovat `last_collection_date` (`YYYY-MM-DD`, před datem
příštího svozu). Naplnění je lineární odhad mezi těmito termíny, nikoliv měření.
Bez platného minulého termínu se výplň nezobrazuje. Pokud poslední svoz připadá
na dnešek a další je v budoucnu, nádoba krátce zazáří a vyprázdní se.
Zdroj bez tohoto údaje zůstává plně kompatibilní.

Večer před svozem (od 16:00 pražského času) se hero nádoba jemně zhoupne.
V den svozu se její víko krátce nadzvedne o 18° kolem zadního madla a zavře.
Statické stavy, řádek a miniatury mají vždy zavřené víko.
`prefers-reduced-motion` vypíná všechny animace i přechody a odstraňuje animační třídy.
Připomínky ve 20:00 a od 5:30 do 9:00 se zobrazují pouze v otevřeném panelu.
Přepínače se ukládají lokálně v prohlížeči; nic neposílají do HA ani do telefonu.

Jediný parametrický SVG model je přímo v `src/views/WasteBin.tsx`.
Miniatury používají zjednodušenou zavřenou siluetu s jednobodovým světlým obrysem.
Naplnění hero zobrazuje malý ukazatel s procenty a označením odhadu.
Playwright ukládá kontrolní snímky mimo Git do `/tmp/hb-waste-review/r2/`.
