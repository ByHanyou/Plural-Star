# Data and Privacy

## Storage

- App data is stored locally.
- Main persistence uses AsyncStorage.
- Critical records also write filesystem JSON backups via `src/storage.ts`.

## Network Use

Outbound requests are limited, and every network feature is off by default.

- Optional GPS reverse geocoding uses OpenStreetMap Nominatim.
- Optional import flows can call Simply Plural or PluralKit APIs, and fetch avatars referenced by URL in an export.
- Optional Friends & Syncing sends end-to-end encrypted messages and device sync through the relay node; the current front status goes to the gateway in the clear.
- Optional Cloud Services stores an encrypted vault on the node under a password that never leaves the device.

## Export

- JSON export is the main reimportable backup format.
- ZIP bundles carry the images alongside the JSON; PluralKit-format, journal text and markdown, and email exports are also supported.
- Media can be embedded into exports as base64 data.

## Privacy Policy

- Published site: `docs/index.html`
- Public URL: `https://byhanyou.github.io/Plural-Star/`

## Destructive Actions

- App data can be cleared from inside the app.
- Uninstall also removes local app data from the device.
