# Features

## Core

- Three-tier front tracking: `primary`, `coFront`, `coConscious`. Multiple members per tier, energy levels 1–10.
- Custom fronts (statuses) selectable via search pickers under Front and Co-Front in Update Front and Retro History.
- Observatory (singlet) mode: `accountMode: 'singlet'` + `selfMemberId` in settings. Front/Members tabs become Status/Profile, statuses replace fronting, system-only tools (chat, system manager, custom fields, polls, archive, system map) are hidden, terminology adapts throughout.
- Member profiles with avatars, banners, colors, tags, groups, and markdown bios.
- System Manager for groups and subsystems.
- Archive as its own Hub tile (no longer a Members subtab).
- Custom member fields.
- Member noteboards with pinnable notes.
- Polls.
- System Map: force-directed relationship graph (`SystemMapScreen`). Map membership is explicit and persisted (`ps:systemMapMembers`), starts empty; relationship endpoints auto-join. Four preset connection types (Red=Rival, Green=Friend, Yellow=Ally, Pink=Love), unlimited custom types via the Connections sheet (name, color via palette+hex picker, optional directionality with inverse labels). Grey threads by default; selection lights type colors with a 1/2/3-hop BFS reach selector. Grid-binned repulsion past 250 nodes, LOD rendering (avatars ≤250, dots+labels ≤600, dots beyond). Relationships and types export under the `relationships` category.
- Medical (`ps:medical`) is Desktop-only: the Hub tile was removed in v1.13.2. Medical data already stored on the phone is kept and still goes into and comes back from backups under the `medical` category, but the app schedules no medical reminders and cancels any left from earlier builds.
- Journal entries with authors, hashtags, optional passwords, pinning, templates, and a read-only entry view.
- Local system chat with channels, replies, reactions, and image messages.
- Front history and system statistics: expandable leaderboards (5/10/25), Peak Hours and Energy-by-Hour charts, custom date ranges, per-member breakdowns. Open-ended history entries are clamped to the next session start (`buildEffectiveEnd`).
- Retro history entries with mood, location, energy, custom front pickers, and overlap detection.
- Import from Simply Plural, PluralKit, Octocon, Ampersand, Ourcana, HiveMind, Tupperbox, Parallax, PluralLog, and PluralSpace; granular export flows. Importing Members replaces the roster (matched members keep local ids; Custom Fronts exempt); history/journal/chat/polls merge with signature dedupe; granular backup restore overwrites selected categories, including clearing PFPs/banners absent from the backup.

## UX

- Built-in dark and light palettes plus custom palettes.
- Text scaling.
- Font choice: OpenDyslexic, Atkinson Hyperlegible, Lexend, Comic Neue, Gelasio, Cause, and Anton alongside the system font.
- Multi-language UI in `src/i18n/` (24 locales: en, es, fr, de, nl, pt, fi, sv, nb, is, it, pl, tr, ms, vi, th, hi, af, zh, zhHant, ja, ko, ru, uk). zh-Hant auto-detected via script/region codes.
- Local notifications for front state (with configurable refresh interval), front checks (Status Check in singlet mode), and noteboard activity.

## Platform

- React Native app targeting Android and iOS.
- Android release scripts are defined in `package.json`.
- iOS project still uses `PluralSpace` in native project names.
