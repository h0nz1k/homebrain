# Bezpečnost / Security

## Hlášení zranitelnosti

Zranitelnosti prosím **nehlaste veřejným issue**. Použijte soukromé hlášení přes GitHub:
*Security → Report a vulnerability* (Private vulnerability reporting) v tomto repozitáři.
Odpověď obvykle do 7 dnů. Podporovaná je jen nejnovější vydaná verze (včetně pre-release).

*Please report vulnerabilities privately via GitHub's “Report a vulnerability” (Security tab), not via public issues.
Only the latest release is supported.*

## Rozsah

- Integrace `custom_components/homebrain` (WebSocket příkazy, role, allowlist služeb, stahování obrázků/dat).
- Frontend panelu (`apps/panel`, `modules/*`, `packages/*`).

## Zásady projektu

- Žádné long-lived tokeny v prohlížeči ani v repu; panel používá HA session (`hass.connection`).
- Zápisy do HA jen přes allowlist služeb; konfigurační WS příkazy jsou `require_admin`.
- Repo nesmí obsahovat data konkrétní domácnosti (IP adresy, hostnames, e-maily, GPS, skutečná `entity_id`, jména).
  Hlídá to gitleaks s vlastními pravidly (`.gitleaks.toml`) v CI.
