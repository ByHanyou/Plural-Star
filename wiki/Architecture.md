# Architecture

## App Shape

- `App.tsx` composes the app shell. `src/app/` holds the tab host (`TabHost.tsx`), the root modals (`AppModals.tsx`), the theme hook (`useAppTheme.ts`), the lifecycle hooks (`lifecycle.ts`) and the store subscription that tells sync and Cloud Services about data changes (`dataChanges.ts`).
- `src/app/startup/loadAll.ts` loads persisted data into the stores at launch and on foreground.
- `src/store/` holds the zustand stores (`appStore.ts`, `uiStore.ts`) and `actions.ts`, which persists every change.
- Screen components under `src/screens/` handle feature areas.
- Modal components under `src/modals/` handle creation and editing flows.
- Shared UI lives in `src/components/`; shared hooks in `src/hooks/`. Components read the active theme with `useTheme()` from `src/themeContext.ts`; `App.tsx` provides it.

## Data Model

Shared types are in `src/model/types.ts`, their defaults in `src/model/defaults.ts`. `src/utils.ts` re-exports them together with the helpers in `src/utils/`.

- `SystemInfo`: system-level profile and settings like journal lock fields.
- `Member`: member profile, tags, groups, media, and custom field values.
- `FrontState`: current three-tier front state.
- `HistoryEntry`: front sessions and tier-level history changes.
- `JournalEntry`: journal records.
- `ChatChannel` and `ChatMessage`: local chat.
- `MemberGroup`, `NoteboardEntry`, `MemberPoll`: supporting features.
- `AppSettings`: preferences, terminology, fonts, and feature toggles.

## Persistence

- `src/storage.ts` wraps AsyncStorage.
- Critical keys are also mirrored to JSON files in a document backup directory.
- Reads can recover from backup if AsyncStorage is missing, broken, or empty for critical data.

## Networking

- `src/network/`: Ed25519/X25519 identity, friend pairing, the relay connection, the push gateway client, and front mirroring to friends.
- `src/sync/`: device-to-device sync of the `ps:` keys and media over the encrypted connection.
- `src/cloud/`: the encrypted Cloud Services vault and its adapter into local storage.
- `src/config.ts`: runtime limits and the developer overrides stored under `psdev:config`.

## Export and Import

- `src/export/`: `payload.ts` builds the export payload, `exportUtils.ts` writes JSON, PluralKit and email exports, `zipBundle.ts` writes ZIP bundles, `journalExport.ts` journal files, `files.ts` saves and shares files, `images.ts` reads media, `categories.ts` and `pluralKitExport.ts` are shared with Desktop. `src/import/zipBundle.ts` reads ZIP bundles.
- ZIP bundle, PluralKit-format, journal text and markdown, and email exports are generated locally.
- Export payloads can include members, history, journal, groups, chat, settings, palettes, noteboards, polls, and media data.
- `src/import/` restores backups and converts exports from other plurality apps.

## Native Integration

- `src/services/frontNotification.ts`, `friendAlerts.ts`, `reminders.ts`, `messageNotifications.ts`, `notify.ts`: local notifications (ongoing front and friends, friend alerts, front-check and planner reminders, noteboard and chat pings, shared channel and trigger helpers).
- `src/services/LiveActivityService.ts`: iOS live activity support.
- `android/` and `ios/` contain platform-specific configuration and assets.
