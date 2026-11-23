# Rodina · školní web

Jako správce HA v panelu **Rodina → Nastavení osob** zadejte ročník každého dítěte (1–9) a veřejné HTTPS adresy seznamu jídelníčků, akcí a důležitých termínů. Každý zdroj je volitelný. Prázdné adresy vypnou import. U termínů lze změnit předstih připomínky (výchozí 3 dny).

Integrace obnovuje data při startu a denně ve 4.30 místního času HA. Jídelníček hledá textové PDF do 5 MB odkazované ze seznamu. Přednost mají odkazy označené datem nebo týdnem. Od čtvrtka se načítá i příští týden. Podporované jsou datované pracovní dny a běžné řádky pro polévku, oběd a přílohy. Čísla alergenů se zobrazí česky. Text extrahuje [pypdf 6.21.4](https://pypi.org/project/pypdf/6.21.4/) s licencí BSD-3-Clause a podporou Pythonu 3.14.

Akce a termíny se čtou z datovaných řádků HTML, například z tabulek nebo seznamů. Dítě vidí vlastní ročník a celoškolní akce. Důležité termíny se v okně připomínky ukazují rodičům a na sdíleném kiosku.

Na Dnes a v kuchyňském kiosku se od 14.00 ukazuje oběd na následující den. Detail dítěte ukazuje obědy od pondělí do pátku a nejbližší akce. Při výpadku zdroje zůstanou k dispozici poslední načtená data v platném období a čas načtení. HA udržuje nanejvýš dva týdny jídelníčků, akce na 60 dní a termíny na rok.

Pro ověření v dev panelu použijte `?skola=full`, `holiday`, `empty` nebo `stale`. Všechny ukázky jsou syntetické.
