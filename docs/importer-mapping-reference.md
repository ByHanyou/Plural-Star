# SP / Octocon importer mapping reference

Extracted 2026-05-28 from Ampersand's source (now local at `C:\AppDev\Ampersand`), files `app/src/lib/db/external/`. Ampersand is AGPL-3.0 = PluralStar's license, so this logic is portable with attribution + preserved notices. PluralStar currently has **no file importer** (only SP API calls in `ShareScreen.tsx` + i18n strings), so this is greenfield.

Reusable Ampersand files (pure TS, framework-agnostic):

- `simplyplural.ts` (472 lines) + `simplyplural_types.d.ts` — the big one
- `octocon.ts` (236) + `octocon_types.d.ts`
- `pluralkit.ts` (180), `tupperbox.ts` (99) — bonus formats, same pattern

The single most valuable thing to copy verbatim is the set of small **gotcha helpers** below — they encode quirks you'd otherwise discover the hard way.

## Critical gotchas (copy these exactly)

**SimplyPlural colors are sometimes ARGB.** SP stores `#RRGGBB` *or* `#AARRGGBB`. Strip the `#`, and if length > 6 strip the leading 2 alpha chars:

```
normalizeSPColor(c): strip '#'; if len > 6 → c = c.slice(2); return '#'+c
```

**Octocon colors** are plain HEX RGB, no alpha — simpler.

**Octocon timestamps have no trailing `Z`.** `time_start`/`time_end`/`inserted_at` are ISO-8601 emitted by Elixir *without* the `Z`. Parsing as-is risks local-time interpretation. Append `Z` (or force UTC) before `new Date(...)`.

**Octocon alter IDs are numbers**, not UUIDs/strings. `name` can be null → fall back to "Unnamed alter".

**SP avatars** live at `https://spaces.apparyllis.com/avatars/{systemUid}/{avatarUuid}` when only `avatarUuid` is present (no `avatarUrl`). You already set a User-Agent for avatar fetches — reuse it here.

**SP custom-field values are typed by an integer code** (`customFields[].type`), and member values arrive as raw strings in `members[].info[fieldId]`:

| code | type | 
|---|---|
| 0 | text | 
| 1 | color | 
| 2 | date | 
| 3 | month | 
| 4 | year | 
| 5 | month+year | 
| 6 | timestamp | 
| 7 | month+day |

**SP mentions** appear in descriptions/notes as `<###@memberId###>` and must be remapped to your own member reference after the member id→uuid map is built. Octocon has no equivalent.

**SP open front** = `frontHistory[].live === true` → no end time. Otherwise `endTime` or "now".

## SimplyPlural export → PluralStar

Top-level keys: `users` (system is `users[0]`), `members`, `frontStatuses` (custom fronts), `groups`, `customFields`, `frontHistory`, `comments`, `notes`, `boardMessages`, `polls`, `automatedReminders`.

| SP field | maps to | notes |
|---|---|---|
| `users[0].username/desc/avatarUrl\|avatarUuid` | System | uid used for avatar CDN path |
| `members[]`: `name, pronouns, desc, color, archived, created` | Member | `created` is ISO; `color` via normalizeSPColor |
| `members[].info` (`{fieldId: value}`) | Member custom fields | resolve fieldId→def via `customFields`, decode by type code |
| `frontStatuses[]` | Member with `isCustomFront: true` | custom fronts modeled as members in Ampersand |
| `groups[]`: `name, desc, color, members[]` | Tags/Groups | `members[]` are member `_id`s → tag membership |
| `frontHistory[]`: `member, startTime, endTime, live, custom, customStatus` | Front entry | `live` → open; `custom` → custom-front ref |
| `comments[]` (`collection:'frontHistory', documentId`) | comments on front entries | sort by `time` |
| `notes[]`: `title, note, member, date` | Journal posts |  |
| `boardMessages[]`, `polls[]`, `automatedReminders[]` | board / polls / reminders | only if PluralStar has equivalents |

## Octocon export → PluralStar

Top-level keys: `user`, `alters`, `fronts`, `tags`, `polls`.

| Octocon field | maps to | notes |
|---|---|---|
| `user`: `username, description, avatar_url, fields[]` | System | `fields[]` defines custom-field schema (id, name, type text/number/boolean, security_level) |
| `alters[]`: `id(number), name, pronouns, description, color, avatar_url, proxy_name, discord_proxies[]` | Member | null name → "Unnamed alter"; color RGB no alpha |
| `alters[].fields[]` (`{id, value}`) | Member custom fields | resolve `id`→`user.fields[].name` |
| `fronts[]`: `alter_id, comment, time_start, time_end` | Front entry | timestamps lack `Z`; no `live` flag (open = missing `time_end`) |
| `tags[]`: `name, description, color, parent_tag_id, alters[]` | Tags/Groups | hierarchical via `parent_tag_id` |
| `polls[]` (`type: vote\|choice`) | polls | optional |

## Suggested build order

1. Define `SimplyPluralExport` / `OctoconExport` TS types (lift the `.d.ts` files nearly verbatim).
2. Port the gotcha helpers (color, field-type decode, timestamp fix, avatar URL, mention remap).
3. Write `members` mapping first (highest value), then `frontHistory`/`fronts`, then tags/custom fields, then the rest.
4. Build an id→internal-id `Map` per entity exactly as Ampersand does (`memberMapping`, `tagMapping`, `customFieldMapping`) — mentions and front entries depend on it.
5. Credit Ampersand in your community credits.
