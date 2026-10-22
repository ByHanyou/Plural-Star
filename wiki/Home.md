# Plural Star Wiki

Plural Star is a private, offline-first React Native app for front tracking, journaling, member management, and shared system tooling.

## Pages

- [Features](Features.md)
- [Architecture](Architecture.md)
- [Development](Development.md)
- [Data and Privacy](Data-and-Privacy.md)

## Repo Map

- `App.tsx`: app shell; composes the tab host and root modals from `src/app/`.
- `src/app/`: startup loading (`startup/loadAll.ts`), the tab host, root modals, theme and lifecycle hooks, and the tab-navigation handle.
- `src/store/`: zustand stores and the actions that persist changes.
- `src/screens/`: primary screens.
- `src/components/`: reusable UI.
- `src/modals/`: editing and workflow modals.
- `src/hooks/`: shared hooks.
- `src/services/`: notifications and live activity integration.
- `src/storage.ts`: AsyncStorage wrapper and filesystem backup recovery.
- `src/export/`: JSON, ZIP bundle, PluralKit, journal, and email export helpers.
- `src/import/`: importers for other plurality apps and backup restore.
- `src/network/`: Friends & Syncing identity, gateway, relay connection, and front mirroring.
- `src/sync/`: device-to-device sync.
- `src/cloud/`: Cloud Services vault.
- `src/stats/`: statistics computation.
- `src/history/`, `src/journal/`, `src/mailbox/`, `src/planner/`, `src/polls/`, `src/picker/`, `src/whiteboard/`: feature logic used by the screens.
- `src/markdown/`: markdown parsing.
- `src/i18n/`: translations and language setup.
- `src/model/`: data types and defaults. `src/utils/`: helpers. `src/utils.ts` re-exports both.
- `src/theme.ts`, `src/themeColors.ts`, `src/themeContext.ts`, `src/config.ts`: palettes, fonts, the theme context, and runtime configuration.
- `android/`, `ios/`: native projects.

## Notes

- The product name is Plural Star.
- Some native artifact names still use `PluralSpace`.
- Privacy policy site files live in `docs/`.
