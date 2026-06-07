# Architecture

## App Shape

- `App.tsx` owns startup, persistence loading, top-level state, theme selection, and primary navigation.
- Screen components under `src/screens/` handle feature areas.
- Modal components under `src/modals/` handle creation and editing flows.
- Shared UI lives in `src/components/`.

## Data Model

Shared types are in `src/utils.ts`.

- `SystemInfo`: system-level profile and settings like journal lock fields.
- `Member`: member profile, tags, groups, media, and custom field values.
- `FrontState`: current three-tier front state.
- `HistoryEntry`: front sessions and tier-level history changes.
- `JournalEntry`: journal records.
- `ChatChannel` and `ChatMessage`: local chat.
- `MemberGroup`, `NoteboardEntry`, `MemberPoll`: supporting features.

## Persistence

- `src/storage.ts` wraps AsyncStorage.
- Critical keys are also mirrored to JSON files in a document backup directory.
- Reads can recover from backup if AsyncStorage is missing, broken, or empty for critical data.

## Export

- `src/export/exportUtils.ts` builds JSON export payloads.
- HTML, text, markdown, and email-friendly exports are generated locally.
- Export payloads can include members, history, journal, groups, chat, settings, palettes, noteboards, polls, and media data.

## Native Integration

- `src/services/NotificationService.ts`: local notifications.
- `src/services/LiveActivityService.ts`: iOS live activity support.
- `android/` and `ios/` contain platform-specific configuration and assets.
