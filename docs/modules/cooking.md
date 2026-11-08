# Maso v troubě (MEATER)

Karta **„Maso v troubě“** na Dnes (desktop, telefon, nástěnný kiosk) ukazuje rozpečené maso
z bezdrátových teploměrů MEATER (1–4 sondy, např. MEATER Pro XL s Wi‑Fi dokem). Data bere
z integrace Home Assistantu **MEATER** (`meater`, cloud). HomeBrain nic neovládá, jen čte.

## Co karta ukazuje

Pro každou **aktivní** sondu (běží v ní pečení nastavené v aplikaci MEATER):

- název kusu masa z aplikace (jinak „Sonda N“),
- velkou teplotu uvnitř → cílovou teplotu a prstenec propečení (vnitřní / cílová),
- teplotu v troubě (okolní teplota sondy),
- zbývající čas („za 12 min“, „za 1 h 05 min“, „odhaduje se…“ dokud ho aplikace počítá),
- stav česky: Čeká na start · Peče se · **Sundat z tepla** · Odpočívá · Hotovo ·
  Mírně nedodělané · Mírně přepečené · Přepečené.

„Sundat z tepla“ je zvýrazněné (jantarový rámeček, jemný pulz; při omezeném pohybu
a v noci bez pulzu) a řadí se jako první. Bez aktivního pečení se karta nezobrazí vůbec.

Kiosk 1280×800: když se peče, karta dostane místo pod hodinami; souhrnná věta, řádek
„Co se dnes vaří“, štítky a vedlejší karty signálů se dočasně skryjí a pruh dne se zúží.
Hlavní signál zůstává. Kritická výstraha má vždy přednost (karta pečení se skryje).

Vidí ji všechny role (admin, dospělý, dítě, kiosk), nikdo ji neovládá.

## Jak HomeBrain najde sondy

Integrace MEATER vytvoří entity až při **prvním pečení**, takže jejich `entity_id` předem
nejsou známé. HomeBrain je proto **nehledá podle `entity_id`**:

1. v registru entit vezme senzory platformy `meater`,
2. klíč senzoru určí podle `translation_key` (záloha: přípona `unique_id` za `-`):
   `internal`, `ambient`, `cook_name`, `cook_state`, `cook_target_temp`, `cook_peak_temp`,
   `cook_time_remaining`, `cook_time_elapsed`,
3. seskupí je po sondách (sériové číslo = předpona `unique_id`, záloha zařízení HA),
   pořadí sond je stabilní podle sériového čísla.

Sonda je aktivní, když odpovídá aspoň jeden z `cook_*` senzorů (mimo pečení jsou
nedostupné). Neznámý stav pečení se ukáže jako „Probíhá“. Časy jsou v integraci senzory
typu časové razítko (teď ± sekundy), HomeBrain z nich počítá sekundy. Teploty ve °F se
převedou na °C.

WebSocket: `homebrain/cooking/subscribe` posílá jen minimální data na aktivní sondu
(`name, internal, ambient, target, peak, remaining_s, elapsed_s, state, progress`), nikdy
sériová čísla ani `entity_id`. Nová zpráva přijde jen při změně.

## Ověřit při prvním skutečném pečení

- v registru entit jsou senzory platformy `meater` s `translation_key` výše (4 sondy = 4 zařízení),
- karta se objeví během pečení a po jeho ukončení zmizí,
- stav `ready_for_resting` se ukáže jako „Sundat z tepla“, zbývající čas odpovídá aplikaci.

## Příklad: upozornění (automatizace HA)

Jen ukázka, HomeBrain ji nenasazuje. `entity_id` jsou **zástupné** – po prvním pečení je
nahraďte skutečnými (Nastavení → Zařízení → MEATER). Telefon dostane upozornění vždy,
televize jen toast, když je zapnutá.

```yaml
alias: Maso v troubě – upozornění
mode: queued
triggers:
  - trigger: template
    id: deset_minut
    value_template: >-
      {% set t = as_timestamp(states('sensor.demo_probe_1_cook_time_remaining'), none) %}
      {{ t is not none and 0 < t - as_timestamp(now()) <= 600 }}
  - trigger: state
    id: sundat
    entity_id: sensor.demo_probe_1_cook_state
    to: ready_for_resting
  - trigger: state
    id: odpocinuto
    entity_id: sensor.demo_probe_1_cook_state
    from: resting
    to: finished
variables:
  maso: >-
    {{ states('sensor.demo_probe_1_cook_name')
       if states('sensor.demo_probe_1_cook_name') not in ['unknown', 'unavailable']
       else 'Maso' }}
  zprava: >-
    {% if trigger.id == 'deset_minut' %}{{ maso }}: hotovo zhruba za 10 minut.
    {% elif trigger.id == 'sundat' %}{{ maso }}: sundejte z tepla a nechte odpočinout.
    {% else %}{{ maso }}: odpočinuto, můžete krájet.{% endif %}
actions:
  - action: notify.mobile_app_demo_phone
    data:
      title: Maso v troubě
      message: '{{ zprava }}'
  - if:
      - condition: state
        entity_id: media_player.demo_tv
        state: 'on'
    then:
      - action: notify.demo_tv
        data:
          message: '{{ zprava }}'
```

Pro více sond automatizaci zkopírujte se senzory další sondy (nebo použijte šablonu se
seznamem sond).
