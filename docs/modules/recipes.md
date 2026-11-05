# Recepty (recipes) – module notes

Backend: `custom_components/homebrain/recipes/` · Frontend: `modules/recipes/`.

## MVP timers and editor
- Cooking timers (Minutky) live in the integration (`recipes.db`), shared by every device and
  kept across HA restarts; see [kitchen-timers.md](kitchen-timers.md) (free timers, egg timer,
  `homebrain_timer_finished` event, persistent notification, Dnes card).
- Music bar volume sends Companion `command_volume_level` levels 0–15 only on user interaction;
  the slider is a command value, not a live volume sensor.
- In the manual editor each step can have an optional airfryer temperature, duration and program.
  Saving only edits the recipe. Starting always requires the cooking-mode confirmation.

## Storage
- SQLite `/config/homebrain/recipes.db` (tables `recipes`, `ingredients`, `steps`, `tags`,
  `settings`, `schema_migrations`). Migrations are versioned and reversible
  (`store.migrate()` / `store.downgrade()`), applied lazily on the first WS call.
- Photos: `/config/homebrain/recipes/media/<id>.webp` (≤ 1600 px) + `<id>-thumb.webp`
  (≤ 480 px), re-encoded (EXIF dropped). Served only via the authenticated view
  `/api/homebrain/recipes/photo/<id>/<full|thumb>` with short-lived signed paths
  (`async_sign_path`), same pattern as wine images / weather radar.

## URL import
- Server-side fetch with the wine `SafeFetcher` (https only, public IPs only, re-validated
  redirects, size caps). Parses schema.org `Recipe` JSON-LD (incl. `@graph`, `HowToSection`,
  `VideoObject.hasPart` clips → per-step video timestamps), microdata fallback.
  Docs: https://schema.org/Recipe ·
  https://developers.google.com/search/docs/appearance/structured-data/recipe
- Czech units (`lžíce, lžička, hrnek, ks, g, dkg, ml, l, špetka, stroužek…`), fractions
  (`½`, `1/2`, `1,5`), ranges (`2–3`), ISO 8601 durations (`PT1H30M`), step timers from text
  (`20 minut`, `půl hodiny`, `hodinu a půl`, `1,5 hodiny`).
- `import_url {save:false}` returns a preview for the editor; `save:true` stores the recipe
  and downloads the photo (a failed photo never fails the save).

## Permissions
- Mapped non-admin roles (kitchen tablet = `kiosk`, `adult`, `child`): list/get/tags/config,
  favourite, rating, „uvařeno“, music commands. Airfryer: owner/adult/kiosk only.
- Admin only: create/update/delete, URL import, settings. Panel `homebrain-recepty` is
  registered without `require_admin` so the tablet account can open it; the WS layer
  enforces roles (`roles.role_ws_commands`).

## Kitchen tablet (HA Companion app, pinned/kiosk)
### Music – YouTube Music app via Companion notification commands
A web page cannot control another Android app's media session, so HomeBrain sends
Companion **notification commands** to the tablet:
- `notify.mobile_app_<tablet>` with `message: command_media`,
  `data: {media_command: play|pause|next|previous, media_package_name: com.google.android.apps.youtube.music}`
- volume: `message: command_volume_level`, `data: {media_stream: music_stream, command: 0–15}`
- now playing: Companion sensor `sensor.<tablet>_media_session` (enable it in the app).
- Docs: https://companion.home-assistant.io/docs/notifications/notification-commands/ ·
  https://companion.home-assistant.io/docs/core/sensors/#media-session-sensor

Setup: Recepty → Nastavení → *Tablet pro hudbu* (lists available `notify.mobile_app_*`
services). The media session sensor is an entity binding (Settings → Devices & services →
HomeBrain → Configure → Recipes). Until the notify target is set, the music bar is hidden.
While a recipe video plays, music is paused and resumed afterwards (only if it was playing).

### Screen stays on
- Cooking mode requests the **Screen Wake Lock API** (`navigator.wakeLock.request('screen')`)
  and re-requests it on `visibilitychange`. It works only in a secure context (HTTPS or
  localhost): https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
- If HA is opened over plain `http://` on the tablet, enable Companion app
  *Settings → Companion app → Keep screen on* (or send `command_screen_on` with
  `keep_screen_on: true`, see the notification commands docs above).

### Airfryer (optional)
Bind by domain in the HomeBrain options (step *Recipes*): start `button`, temperature and
cook time `number`, method `select` (optional), drawer `binary_sensor`, remaining time
`sensor` (optional). Entity ids are household data and are never committed.
A step can carry `{temperature °C, minutes, method}`; *Poslat do fritézy* opens a
confirmation dialog, and only after *Spustit* does the server set the values and press start.
The server refuses without `confirmed: true`, with the drawer open (`on`) or unknown.
Tests use mocked services only.

### Video
YouTube IFrame Player API (`playsinline`, `seekTo(step.videoTs)`), floating mini player in
cooking mode: https://developers.google.com/youtube/iframe_api_reference
