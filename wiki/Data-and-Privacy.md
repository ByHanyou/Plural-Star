# Data and Privacy

## Storage

- App data is stored locally.
- Main persistence uses AsyncStorage.
- Critical records also write filesystem JSON backups via `src/storage.ts`.

## Network Use

Outbound requests are limited.

- Optional GPS reverse geocoding uses OpenStreetMap Nominatim.
- Optional import flows can call Simply Plural or PluralKit APIs.

## Export

- JSON export is the main reimportable backup format.
- HTML, text, markdown, and email exports are also supported.
- Media can be embedded into exports as base64 data.

## Privacy Policy

- Published site: `docs/index.html`
- Public URL: `https://thehanyou.github.io/Plural-Star/`

## Destructive Actions

- App data can be cleared from inside the app.
- Uninstall also removes local app data from the device.
