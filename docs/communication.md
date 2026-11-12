# Komunikační centrum – fáze 1

Refs #105. Služba `homebrain.notify` doručuje přes existující služby Home Assistantu.
HomeBrain nepřijímá hesla, neposílá přímé HTTP požadavky poskytovatelům a nevyžaduje
placené služby. Nasazení a zkoušku na skutečných zařízeních provádí vlastník po schválení PR.

## Rozhodnutí: přímé adaptéry místo Apprise-API

[Oficiální HA integrace Apprise](https://www.home-assistant.io/integrations/apprise/)
umí lokální `url` i konfigurační soubor; kontejner Apprise-API tedy není nutný.
Pro dva externí kanály fáze 1 volíme přímé volání již nakonfigurovaných HA služeb:
Telegram a SMTP/notify entity. Pravidla, potvrzení a audit stejně musí řešit HomeBrain.
Odpadá další kontejner i kopírování tajemství. Existující službu `notify.apprise_demo`
lze později použít jako konkrétní endpoint Telegramu či e-mailu; směrování tagy
Apprise zde není implementováno. SMS, WhatsApp a nouzové odesílání mimo HA jsou mimo fázi 1.

## Co musí připravit vlastník

- Companion app a vlastní HA účet na každém telefonu; ověřit vznik služby
  `notify.mobile_app_…`, povolit notifikace i kritická oznámení podle platformy.
- [Telegram bot v HA](https://www.home-assistant.io/integrations/telegram_bot/),
  povolený chat a první `/start`. Bot token zadat pouze do HA. Použít konkrétní
  `notify` službu/entity nebo `telegram_bot.send_message` s explicitním `target`.
- SMTP odesílatel: Gmail s dvoufázovým ověřením a heslem aplikace v `secrets.yaml`.
  [SMTP v HA](https://www.home-assistant.io/integrations/smtp/),
  [hesla aplikací Google](https://support.google.com/accounts/answer/185833).
  Heslo běžného účtu se nepoužívá. Příjemce patří do konfigurace HA, nikdy do Gitu.
- Todo seznam a pro kiosk existující `tts` entita i cílový `media_player`.
  Zvuk a oprávnění tabletu ověřit ručně.

Příklad importu SMTP ze soukromého `configuration.yaml` (hodnoty secrets doplní vlastník):

```yaml
notify:
  - platform: smtp
    name: demo_mail
    server: smtp.gmail.com
    port: 587
    encryption: starttls
    sender: !secret smtp_sender
    username: !secret smtp_username
    password: !secret smtp_app_password
    recipient: !secret smtp_recipient
```

Novější HA importuje YAML SMTP do konfigurace integrace a označí YAML za zastaralý.
Po migraci použít konkrétní `notify` entitu příjemce (`email: {entity_id: notify.demo}`)
a postupovat podle opravy v HA. Nové SMTP lze nastavit také přímo přes UI HA;
heslo aplikace se nikdy nezadává do HomeBrainu.

## Konfigurace směrování

Nastavení → Zařízení a služby → HomeBrain → Možnosti → Komunikační centrum.
Do objektu „Pravidla doručování“ vložit následující strukturu a nahradit syntetické
identifikátory vlastními lokálními vazbami. Změny platí pro další odesílání i čekající
zprávy. Modul lze vypnout ve volbě Moduly; po opětovném zapnutí se fronty obnoví.
Výchozí příjemce `demo` a skupina `household` nemají žádný aktivní kanál.
Časy jsou v časové zóně HA; stejné začátky a konce tichých hodin znamenají vypnuto.

```yaml
people:
  demo:
    preferences: [push, telegram, email, todo, tts]
    quiet_start: "22:00"
    quiet_end: "07:00"
    channels:
      push: notify.mobile_app_demo
      telegram:
        service: telegram_bot.send_message
        target: [12345] # syntetické ID; nahradit povoleným chatem v HA
      email:
        service: notify.demo_mail
      todo: todo.demo
      tts:
        entity_id: tts.demo
        media_player_entity_id: media_player.demo
  other:
    preferences: [todo]
    channels:
      todo: todo.other
groups:
  household: [demo, other]
digest_at: "07:00"
dedup_seconds: 300
```

Alternativa pro Telegram/e-mail je `email: {entity_id: notify.demo}` (volá
`notify.send_message`). Konkrétní služby `notify.*` nesmí být obecné `notify.notify`
a `notify.send_message`; ty vyžadují explicitní entitu. Ostatní domény služeb jsou
zakázané s výjimkou `telegram_bot.send_message`. Skupiny obsahují pouze klíče osob,
nelze je vnořovat. Neznámá osoba/skupina je chyba služby.

## Použití a pravidla

```yaml
action: homebrain.notify
data:
  recipient: household
  title: Připomenutí
  message: Zkušební úkol domácnosti
  priority: high
  tag: demo-reminder
  # channel: todo # volitelné výlučné vynucení kanálu
  # data: {}      # volitelná data pouze pro Companion push
```

- `normal`, `high`: první úspěšný kanál v preferencích. Tiché hodiny zprávu odloží.
  Chybějící konfigurace/služba i chyba volání přejdou na další preferovaný kanál.
- `critical`: obejde tiché hodiny, push nese iOS critical sound a Android vysokou
  prioritu/alarm kanál. Nastavení OS může stále doručení omezit.
- `high` a `critical` doručené přes push mají tlačítko **Beru**. Událost
  `mobile_app_notification_action` s unikátní akcí zruší eskalaci. Bez potvrzení
  následuje po 5 minutách první dostupný Telegram/e-mail **z preferencí osoby**.
  Vyhodnocení běží každých 30 s. `high` při eskalaci respektuje tiché hodiny.
  Běžný push lze také potvrdit, ale neeskaluje; možnost potvrzení expiruje po 7 dnech.
- `info`: uloží se do denního souhrnu, nejbližší čas `digest_at` po přijetí.
  Souhrn používá Telegram/e-mail/todo z preferencí; při selhání zůstává ve frontě.
  Tiché hodiny mají přednost. Různá vynucení kanálu mají oddělené souhrny.
- `channel` vynucuje výhradně jeden kanál počátečního doručení, bez fallbacku.
  Eskalace high/critical push zůstává aktivní. Vynucení neobchází tiché hodiny ani souhrn.
- `tag` deduplikuje pro každou osobu v okně `dedup_seconds`, bez ohledu na text,
  prioritu či kanál. Pro alarm s vyšší prioritou proto použít jiný tag.
- Audit zaznamenává předání HA službě, nikoliv potvrzení poskytovatele či přečtení.
  `acknowledged` znamená přijetí akce Beru pro čekající push zprávu.

Volání je povolené HA administrátorům a automatizacím bez uživatelského kontextu.
Ostatní uživatelé nemohou libovolně oslovovat ostatní osoby. Služba podporuje
volitelnou odpověď `{results: [{id, status}]}` pro každého unikátního příjemce.
Frontend žádnou zapisující službu nevolá, proto nerozšiřuje allowlist HA klienta.

## Historie, obnova a limity

Administrátorský panel **Zprávy** čte `homebrain/communication/recent` každých 30 s
nebo tlačítkem Obnovit. Obsah zpráv je soukromý: nedostává jej dítě ani kiosk.
HA Store `homebrain.communication` obsahuje posledních 200 auditních událostí,
až 200 odložených zpráv, 200 čekajících potvrzení a 1000 aktivních dedup tagů.
Přetečení fronty je v auditu chyba; nepotvrzený alarm při plné kapacitě rovnou
eskaluje. Odložené zprávy po 7 dnech expirují. Odebrání osoby zruší její čekající
zprávy. Audit a fronty obsahují text zpráv, proto chránit zálohy HA.

Fronty, termíny eskalací a dedup přežijí restart. Při startu HA se opožděné úlohy
zpracují v příštím intervalu. Každý dokončený požadavek a změna ve frontách se uloží; nečinné intervaly Store nepřepisují. Při unloadu
se zruší listenery a timer a stav se dopíše. Přesně jedno doručení nelze zaručit
při pádu HA mezi přijetím externí služby a uložením stavu. Nejde o náhradu
certifikovaného alarmu. Fáze 1 nepotvrzuje todo položky ani akce v Telegramu.

## Ověření před merge

Automatické testy používají syntetické osoby a mocky služeb, nikoliv produkční HA.
PR má štítky `writes-to-ha` a `needs-owner-visual-check`; vlastník schvaluje merge,
provádí vizuální kontrolu 360×800, 800×1280, 1440×900 a až poté nastaví své kanály.
