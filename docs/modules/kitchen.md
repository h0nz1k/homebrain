# Kuchyň – tabletový kiosk

Refs #90. Panel **Kuchyň** (`/homebrain-kuchyn`) má záložky Hudba a Vaření.
Rodina je rezervovaná a zatím se nezobrazuje. Přístup mají správce HA a role
HomeBrain `adult` a `kiosk`. Nastavení v panelu vidí a ukládá pouze správce HA.
Pro trvale přihlášený tablet použijte samostatného neadministrátorského uživatele
s rolí `kiosk`. Fritézu ručně spouští pouze dospělý nebo správce, s potvrzením;
role kiosk zachovává stávající oprávnění fritézy (náhled a ovládání běžícího pečení).

## Přehrávač a USB zvuk

1. Připojte USB-C reproduktor k tabletu a v Androidu ověřte zvukový výstup.
2. V Music Assistantu zprovozněte přehrávač tabletu, například vestavěný webový
   přehrávač Sendspin. Přítomnost HA Companion aplikace sama nevytvoří MA přehrávač.
   Ověřte, že přehrávač zůstává dostupný při používání panelu v Companion aplikaci;
   webový přehrávač v uspané kartě může vyžadovat jiný způsob provozu.
3. Jako správce otevřete ozubené kolo v Kuchyni a vyberte **Výstup**.
   Seznam obsahuje pouze entity `media_player` z integrace Music Assistant.
   USB reproduktor sám není entitou přehrávače. Jeho název v panelu vychází z HA.

Bez dostupného cíle se zobrazuje **Vyberte přehrávač** a hudební akce jsou zakázané.
Výpadek Music Assistantu má samostatnou zprávu; Vaření zůstává dostupné.
Nejsou potřeba Fully Kiosk ani další tokeny. HomeBrain používá přihlášené WS spojení HA.

## Rádia, playlisty a účty

V nastavení vyhledejte rádio názvem, vyberte nejvýše pět hlavních a deset dalších.
Prázdná rádiová knihovna je v pořádku: hledání používá veřejnou službu
`music_assistant.search` i mimo knihovnu. Ukládají se URI a metadata, žádné streamy
nebo loga nejsou součástí instalace. Dostupný artwork pochází z metadat MA;
chybějící nebo nepodporovaný obrázek nahradí neutrální grafika.

Výchozí řady **Táta** a **Máma** se mapují na první dvě osoby HA; mapování i názvy
ověřte v nastavení. Lze přidat další osoby (nejvýše šest). Pro každou vyberte
pět playlistů z knihovny MA a označte hudební účet. Veřejné HA služby často
vracejí pouze `library://` URI bez účtu poskytovatele.
Takové playlisty zůstávají v pickeru dostupné i při filtru: správce je ručně
přiřadí k osobní řadě a označí účet. Tato přiřazení se při dalších načteních
použijí pro filtrování; pokud odpověď poskytuje účet přímo, má filtr k dispozici
i tuto hodnotu. Automatické rozpoznání dvou účtů z anonymního knihovního URI
není přes veřejné HA služby možné.
`Vše ›` otevře celou knihovnu s filtrem osoby; další stránky se načítají tlačítkem.
Pokud je stejný playlist sdílený mezi účty, může být přítomen v obou řadách.

Druhý účet YouTube Music přidejte jako dalšího poskytovatele přímo v Music
Assistantu, synchronizujte jeho knihovnu a pak označte účet u osoby a vyberte playlisty.
HomeBrain neuchovává přihlašovací údaje Google.

Tlačítka **YouTube · Táta/Máma** otevírají nastavitelný odkaz (výchozí
`vnd.youtube://`, záloha `https://m.youtube.com`). **Účet Google přepnete uvnitř
aplikace YouTube**; tlačítko účet nepřepíná. Odkaz MEATER je také nastavitelný.
MEATER karta je pouze pro čtení. Po dosažení cíle nabídne sdílenou minutku
odpočinku masa (výchozích 10 minut, nastavitelných 1–120 minut).

## Baterie a HyperOS

V nastavení vyberte senzor procent baterie a zvlášť senzor stavu nabíjení z HA
Companion aplikace. V HyperOS zapněte:
**Nastavení → Baterie → Ochrana baterie → Omezené nabíjení**.

Text „nabíjení omezeno“ se ukáže jen při nejméně 80 % a známém nenabíjecím stavu
(`not_charging`, `not charging`, `discharging`, `full`). Je to indikace stavu
senzoru, nikoliv příkaz Androidu. Při chybějícím stavu se omezení nepředpokládá.

## API a uložení

Nastavení je validované a uložené v `ConfigEntry.options.kitchen` úložiště HA.
Entity a osobní názvy se nastavují až v HA, nejsou v repozitáři. WS:
`homebrain/kitchen/get`, `search_radios`, `playlists`, `play`, `transport`, `save`.
Čtení stavu se obnovuje každých 5 s a po akci nebo reconnectu. MEATER a minutky
používají stávající push subscriptions. Hudební služby se volají pouze na serveru
s kontextem uživatele: veřejné MA `get_library`/`search` s `return_response`,
`play_media` a `media_player.media_play`, `media_pause`, `volume_set`.
Seznam akcí ve frontend klientu je uzavřený; klient nemůže zadat libovolnou službu
ani cílovou entitu. Server ověřuje role, MA registraci cíle a HA control oprávnění.
Každý příkaz má uživatelský limit za minutu a služba timeout 15 s.

## Vývoj bez HA

Dev scénáře: `?kitchen=radio|playlist|idle|no-player|unavailable-player|unavailable`,
`&cooking=active` (souhlasně běžící fritéza, MEATER a minutky), výchozí vaření je
nečinné. `&session=kiosk|adult|child|guest` ověřuje oprávnění panelu.
`&maso=2` zahrnuje sondu na cílové teplotě; `&fryerlive=cooking` a `&timers=demo`
lze kombinovat jednotlivě. Všechna data jsou syntetická, artwork je procedurální.
