# Ampersand — what's useful to PluralStar

Survey date: 2026-05-28. Source: https://codeberg.org/Ampersand/app (GitHub mirror: NyaomiDEV/Ampersand). Ampersand is going into **maintenance mode in June 2026** (dev too busy to keep updating), so this is a good moment to harvest ideas/code before the pace drops.

## License — the green light

Ampersand is **AGPL-3.0-only**. PluralStar (both mobile and Desktop) is also **AGPL-3.0**. So code reuse is legally clean, with the usual copyleft obligations:

- Keep their copyright and license notices on any files/snippets taken.
- Mark what you changed and the date (AGPL §5a).
- The whole combined work stays AGPL-3.0 (you're already there).
- Attribution in credits is courteous and expected (they value community credit).

This means you can **adapt their actual code**, not just the ideas — the main constraint is translating it across stacks (see below).

## Stack difference (the catch)

Ampersand is a **Tauri 2 + Ionic Vue 3 + TypeScript** app (one codebase → Android, iOS, desktop). PluralStar mobile is **React Native**; PluralStar Desktop is **Electron + React**. So:

- **Pure-logic TypeScript** (import/export parsers, format mappings, data transforms, validation, migration steps) is **directly portable** — it's framework-agnostic TS.
- **UI/component code** (Vue SFCs, Ionic components) is **not** reusable as-is; treat it as a reference design, not copy-paste.

## Ranked reuse opportunities

### 1. Import/export format mappings — highest value
Their most recent feature work is **`feat: octocon import`** (commit `891dd9f`, 2026-03-15), and they almost certainly have a **SimplyPlural** importer too. This is exactly PluralStar's SP/Octocon parity goal, and the field-by-field mapping (SP/Octocon JSON → internal member/tag/custom-field/journal model) is the tedious, error-prone part they've already solved. This is pure TypeScript and portable.
- They use `@msgpack/msgpack` for their own backup format and `json-stream-es` to **stream large imports** without loading the whole file into memory — directly relevant to your large/polyfragmented-system concerns.
- Where to look: `src` (importers live under their lib/db layer); start from the `feat: octocon import` commit's changed files and the `translations` keys added alongside it.

### 2. Large-system performance (polyfragmented) — ALREADY HANDLED
Their README admits poor performance with many members/tags/custom fields; they fixed list *rendering* with a virtual scroller (`@tanstack/vue-virtual`, issue #95). **PluralStar already solves this with Shopify `@shopify/flash-list` v2** (wired into `MembersScreen` and `HistoryScreen`) — the RN counterpart to vue-virtual. So no reuse needed here.

Caveat: FlashList only addresses **list scroll rendering**. Ampersand's *streaming* (`json-stream-es` + msgpack) addresses a different problem — keeping memory low while **parsing a large import file**. That's only relevant if SP/Octocon export files get very large; FlashList does not touch it. Treat it as a separate, still-open consideration if/when big imports become a concern (ties into opportunity #1).

### 3. Migration framework
`assets/migrations/` holds versioned schema migrations. If PluralStar's local store doesn't yet have a formal migration/versioning scheme, their approach is a clean reference — important once the June 2026 sync backend lands and schemas start evolving.

### 4. iOS / alt-distribution tooling
`make_unsigned_ipa.sh` and `make_altstore_json.mjs` plus their CI build **unsigned IPAs and publish via AltStore/SideStore/Obtainium/IzzyOnDroid**, sidestepping store gatekeeping. Relevant as PluralStar preps iOS and may want off-store distribution. These are build scripts, reusable in spirit.

### 5. Feature ideas worth stealing
- **Biometric app lock** via `@tauri-apps/plugin-biometric` (PluralStar already has a LockScreen — face/fingerprint is a natural add).
- **Material You / dynamic theming** via `@material/material-color-utilities` + accessible color picker for member colors.
- **Mermaid** (`mermaid`) for rendering **system relationship maps / member diagrams** — a differentiating feature.
- **Markdown** journaling via `marked`.
- **Offline-first** as an explicit design value (their whole pitch). PluralStar's planned sync should keep offline-first as the default, not an afterthought.

### 6. Translations
24+ language translation files under `translations/`, AGPL-licensed. Keys won't line up with PluralStar's, but for overlapping plurality terms (member, front, alter, system, fronting, etc.) they're a useful reference — you recently added RU/UK and could cross-check wording.

## Suggested next steps
1. Pull the actual **Octocon + SimplyPlural importer** TS files and port the field mappings into PluralStar's import layer (biggest, most direct win).
2. Read **issue #95** (virtual scroller) before tackling large-system perf.
3. Skim **`assets/migrations/`** as a model for schema versioning ahead of the sync backend.
4. Add an **Ampersand credit** to the community credits if you adopt any code.

## Open item
The importer source itself wasn't retrievable in this pass (Codeberg's file/commit pages are JS-rendered and didn't return content to the fetcher). The repo is small (~17 MiB) — cloning it locally, or having me drive a browser to read the specific files, would let us extract the exact mappings.
