# Přístup (BioLock) – module notes

Backend: `custom_components/homebrain/access/` · Frontend: `modules/access/` · Firmware:
firmware BioLock (soukromý repozitář vlastníka) (ESPHome, face + palm sensor, Nuki lock).

## What it does
- **Osoby** – people grouped from the sensor's user list (face IDs 1–999, palm IDs 1000+), with
  hand labels (right/left), allow/deny, delete and a „Doporučeno přezapsat“ chip.
- **Průvodce** (wizard, sheet) – name → face → right palm → left palm, each step skippable.
  Service mode is switched on automatically. Re-enrol (přezapsání) of one ID enrols a NEW ID
  first and deletes the old one only after the sensor confirms success (rollback-safe).
- **Test ruky** – live recognition feed (in service mode) to check which hand is which.
- **Zařízení** – biometric unlock, service mode (30 min countdown), action on recognition,
  Wi-Fi, firmware, lockout reset, notification setting.
- **Historie** – last 50 recognitions/rejections from HA events.

## Data and privacy
- No biometric data ever leaves the sensor. HomeBrain stores only labels in
  `/config/homebrain/access.json`: `{user_id: {hand, person, enrolled_at}}`, person flags
  (`child`) and settings. Never in the repo or `/www`.
- Events `esphome.biolock_{users,enrolled,deleted,recognized,rejected}` are normalised through a
  fixed allowlist of fields (`type`, `type_requested`, `name`, `reason`, `decision`,
  `liveness`, `ok`, `admin`, `user_id`). The firmware has no match score.

## WebSocket API (admin only)
`homebrain/access/state`, `…/subscribe`, `…/command` (allowlisted ESPHome actions + the three
BioLock entities), `…/label`, `…/person`, `…/settings`.
- `enroll_face` / `enroll_palm` accept an optional `timeout_s` (5–60). It is forwarded only when
  the device's ESPHome action declares the field (biolock-firmware#8); older builds get the
  call without it.

## Enrolment failure codes (biolock-firmware#8)
`enrolled` carries `type_requested` and a reason code. The panel maps them to Czech text + tip
(`reasonCs` in `modules/access/src/domain.ts`): `timeout`, `face_instead_of_palm`
(„Zachycen obličej místo dlaně – zakryj obličej dlaní“), `already_enrolled`,
`liveness_failed`, `camera`, `full`, `no_reply`. Free-text reasons from older firmware fall
back to a generic „Nepodařilo se“ + tip (never shown raw).

## Re-enrol health rule
`health.py` recommends re-enrolment by age (adults 24 months, children 9 months, from
`enrolled_at`) and by recognition health over 14 days (retries, success rate). A one-shot HA
persistent notification is raised per ID when the advice first appears (setting
`notify_reenroll`, default on).

## Development
- Dev panel `/access` uses `createMockAccessApi` (synthetic Jan / Petra / Tomáš).
  Query: `enroll_ms=<ms>` (scan duration), `access_fail=<code,…>` (fail the next enrolments).
  `window.__hbAccessLog` records every command for e2e.
- e2e: `tests/e2e/access.spec.ts` (Osoby + re-enrol chip, wizard happy/fail/re-enrol, Zařízení).
