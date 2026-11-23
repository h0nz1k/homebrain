# Modul Rodina (`@homebrain/module-family`)

- Fáze: 4 · ADR-0001 §5.7
- MVP: Týdenní přehled z kalendářů, přítomnost osob, sdílené todo. Požadavky viz discovery #14.
- Stav: MVP kalendář + nákup + ChoreOps povinnosti; #123 přidává přidání úkolů, dnešní předání a přehled bodů (WS `homebrain/family/*`, viz `docs/requirements/family.md` FAM-020–022).
- Školní rozvrh (#175): WS `homebrain/family/timetable` (ne pro kiosk), nastavení v `family.timetable`
  (`bells`, `afternoon`, `holiday_calendar`, `free`, `items`, `children`) a `family.school.bells_url`.
  Ruční zvonění má přednost před importem. Dev mock: `?rozvrh=full|holiday`.
