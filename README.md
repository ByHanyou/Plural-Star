<h1 align="center">Plural Star</h1>

<p align="center">
  <img src="https://raw.githubusercontent.com/TheHanyou/Plural-Star/main/docs/icon.png" width="120" alt="Plural Star icon" />
</p>

<p align="center">
  <strong>Front tracking, system journal & history for plural systems.</strong><br>
  Private. Offline-first. No accounts. No servers.
</p>

<p align="center">
  <a href="https://github.com/TheHanyou/Plural-Star/releases/latest/download/app-release.apk">
    <img src="https://img.shields.io/badge/Download%20APK-Latest%20Release-DAA520?style=for-the-badge&logo=android&logoColor=white" alt="Download APK" />
  </a>
  &nbsp;
  <a href="https://github.com/TheHanyou/Plural-Star/releases/latest/download/PluralSpace.ipa">
    <img src="https://img.shields.io/badge/Download%20IPA-Latest%20Release-DAA520?style=for-the-badge&logo=apple&logoColor=white" alt="Download IPA" />
  </a>
</p>

<p align="center">
  <a href="https://www.buymeacoffee.com/PluralStar">
    <img src="https://img.buymeacoffee.com/button-api/?text=Support+PS&amp;emoji=%E2%98%95&amp;slug=PluralStar&amp;button_colour=151929&amp;font_colour=ffffff&amp;font_family=Cookie&amp;outline_colour=ffffff&amp;coffee_colour=FFDD00" alt="Support Plural Star on Buy Me a Coffee" />
  </a>
  &nbsp;
  <a href="https://discord.gg/FFQw33cu8m">
    <img src="https://img.shields.io/badge/Discord-Join%20Us-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join our Discord" />
  </a>
</p>

<p align="center">
  <a href="https://thehanyou.github.io/Plural-Star/">Privacy Policy</a>
</p>

---

> **Renamed from Plural Space.** The app, repo, and subreddit were renamed to Plural Star for community clarity — another app was also using the Plural Space name. Your existing installation, data, backups, and Buy-Me-a-Coffee links all continue to work; on-device data and old Plural Space `.json` exports are fully compatible with Plural Star.
>
> The iOS build artifact is still named `PluralSpace.ipa` because the underlying Xcode project name hasn't been migrated (doing so requires a separate native-module refactor). This is cosmetic only — the installed app shows as Plural Star everywhere on your device.

Made in part with AI assistance, and is one of the main reasons we went Open Source. So that those wishing to, or those with concerns, could examine the code.

Simply Plural and Octocon are being discontinued. Plural Star is the replacement you own entirely — your data stays on your device.

## Features

**◈ Three-Tier Front Tracking**  
Track who's fronting across three distinct tiers: Primary Front, Co-Front, and Co-Conscious. Each tier has its own member selection, mood, note, and energy level (1–5). Primary Front also tracks location. Members are exclusive to one tier at a time. Set all three tiers from a single unified modal with a searchable member picker — type a name or filter by tag to find members instantly, even in large systems. A persistent notification keeps all three tiers visible from your notification shade. Optional recurring front-check reminders can be scheduled at 1, 2, 4, 8, 12, or 24 hour intervals.

**◇ Member Profiles**  
Build out your system roster with profile pictures, 900×300 banner images, names, pronouns, roles, colors, and rich text bios. Write descriptions with full markdown formatting — bold, italic, strikethrough, headers, links, lists, block quotes, inline code, and more — using a dual-mode editor (Fancy Pants toolbar or raw Markdown). Organize members with freeform tags and named groups. Create colored named groups and assign members to multiple groups. Filter the member list by group, tag, or search. Sort by 6 different modes: alphabetical, reverse alphabetical, age, color, role, or manual ordering. Members display tier-specific badges (Primary, Co-Front, Co-Con) when fronting. Archive dormant members to keep your active roster clean — archived members are hidden from the front picker but their history is fully preserved, and they can be restored at any time.

**✦ Custom Fields**  
Define your own per-member fields beyond the built-in ones. Support for text, number, toggle, date, month/year, month, year, and markdown types. Create fields once in the Hub; fill them out per-member in the member edit modal. Fields are reorderable, renameable, and fully exportable. Compatible with Simply Plural custom field imports.

**📋 Per-Member Noteboards**  
Each member has their own noteboard — a shared space inside the member profile where any headmate can leave notes for or about them. Notes record author, timestamp, and content; can be pinned to the top; and display chronologically in the member's profile sub-tab. Useful for leaving messages between alters, shared observations, or ongoing context that doesn't fit anywhere else.

**📊 System Polls**  
Create polls the whole system can vote on — decisions, preferences, member opinions. Polls live in the Hub with options (each with its own vote tallies), voter tracking (who voted for what), and optional closure. Every active member can cast one vote per poll; votes can be changed until the poll is closed.

**◷ History & Insights**  
Front History gives you a complete timestamped log of every switch, organized by day, with co-front and co-conscious tiers displayed inline. Member History shows everything about a specific headmate — every front session across all tiers, mood changes, location changes, note updates, energy levels, and journal entries they authored — alongside a summary of total time fronted, sessions, top mood, and top location. Add retroactive history entries manually with full three-tier support, start/end time selection, and a "Current" option for ongoing sessions — the app detects overlaps with existing entries and lets you choose how to handle them.

**⊞ System Statistics**  
System-wide stats at a glance: total fronting time, session count, and message count with time range filtering (All Time, 7 Days, 30 Days). Top 5 leaderboards for fronters, co-fronters, co-conscious, chatters, moods, and locations. Peak Hours chart showing when your system is typically most active.

**⌨ System Chat**  
Local-only IRC-style chat for your system. Create, rename, and organize channels (up to 100) with defaults for General, Venting, and Planning. Select a speaker from your member roster independently of who's fronting — chat activity doesn't affect front or history. Send text messages, share images (stored as base64 — delete the source and the chat copy persists), reply to messages, and react with emoji. Archive channels to free storage with the option to close the channel or continue fresh with a clean slate — archived messages export as `ChannelName_YYYY-MM-DD.json`.

**◉ System Journal**  
Write journal entries with full rich text formatting — the same dual-mode editor (Fancy Pants or Markdown) available in member profiles. Tag entries with authors (searchable by name), add topic hashtags (searchable by tag), and optionally lock individual entries or the entire journal behind passwords. Export individual entries or the full journal in `.txt`, `.md`, or `.json`.

**⇅ Import & Export**  
Migrating from Simply Plural or PluralKit? Import your full system data — members, history, custom fields, and system info — with a single API token or directly from a Simply Plural data export JSON file. Co-fronting sessions from Simply Plural are correctly grouped into combined entries. Profile pictures are imported from SP/PK avatar URLs. Octocon users can use the PluralKit import path. Custom field names and values are mapped automatically with bidirectional ID normalization.

Export your full system data as JSON (reimportable), HTML (opens in Google Docs), or send a formatted summary to any email address. Granular per-category toggles — pick exactly what to export or restore: system info, members, avatars, banners, front history, journal, groups, chat, moods, palettes, settings, custom fields, noteboards, polls. Import `.txt`, `.md`, or `.json` files directly as journal entries.

**🌐 Multilingual**  
Full interface available in English, Español, Français, Deutsch, Português, Suomi, Norsk, 中文, and 日本語 — 9 languages total. Auto-detects your device language on first launch. Change anytime via dropdown in System Settings.

**Other Features**
- Obsidian Blue dark theme and Steel light theme built-in, plus 10 custom palette slots — define your own four-color theme
- System Profile with its own banner, description, and markdown formatting — separate from member profiles
- Profile pictures on member avatars throughout the app; banners shown on member profiles and edit screens
- Adjustable text size — Normal, Large, or Extra Large
- Mood picker with preset and custom mood support, per tier
- Per-tier energy levels (1–5) for Primary, Co-Front, and Co-Conscious
- Location tagging with optional GPS auto-fill (resolves to neighbourhood or city — raw coordinates are never stored)
- Notification toggle in System Settings, plus front-check interval scheduling
- Password protection per journal entry and for the full journal
- Searchable tag and author filters in journal
- Member tags and named groups with multi-group assignment
- Searchable member picker with tag filtering in front selection
- Per-member history with full event log
- Simply Plural token import, file import, and PluralKit token import with co-front grouping
- Full data export and restore with per-category granularity
- Discord community accessible directly from the Hub

---

## Privacy

Everything lives on your device. No accounts, no cloud sync, no tracking, no ads.

The only outbound requests are:
- **GPS location** (optional, off by default) — coordinates are sent to [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org) to resolve a neighbourhood or city name. Raw coordinates are never stored.
- **Simply Plural / PluralKit import** (optional) — your token is used for a single one-time request and never stored.

Full privacy policy: [https://thehanyou.github.io/Plural-Star/](https://thehanyou.github.io/Plural-Star/)

---

## Installation

**Android — Direct APK (sideload)**  
Download the latest APK from the button above or from [Releases](https://github.com/TheHanyou/Plural-Star/releases). Enable "Install from unknown sources" on your device and install.

**iOS — IPA (sideload)**  
Download the latest IPA from the button above or from [Releases](https://github.com/TheHanyou/Plural-Star/releases). Install using [AltStore](https://altstore.io/) or a Mac with Xcode. Requires either AltStore or an Apple Developer account.

Direct AltStore Download: (paste into Safari) altstore://install?url=https://github.com/TheHanyou/Plural-Star/releases/download/v1.4.5/PluralSpace.ipa

---

## Build from Source

```bash
# Requirements: Node 22+, JDK 17, Android SDK
git clone https://github.com/TheHanyou/Plural-Star.git
cd Plural-Star
npm install --legacy-peer-deps
cd android && gradlew.bat assembleRelease
```

---

## License

[GNU Affero General Public License v3.0](LICENSE)

This software is free and open source. You are free to use, modify, and distribute it under the terms of the AGPL-3.0 license. Any distributed modifications or network-accessible deployments must also be released under AGPL-3.0.

---

## Support

Plural Star is free, always. If it's been useful to you, a contribution helps cover Play Store fees and development time.

<a href="https://www.buymeacoffee.com/PluralStar">
  <img src="https://img.buymeacoffee.com/button-api/?text=Support+PS&amp;emoji=%E2%98%95&amp;slug=PluralStar&amp;button_colour=151929&amp;font_colour=ffffff&amp;font_family=Cookie&amp;outline_colour=ffffff&amp;coffee_colour=FFDD00" alt="Support Plural Star on Buy Me a Coffee" />
</a>

---

## Contact

**The Hanyou System**  
[Discord](https://discord.gg/FFQw33cu8m) · [r/PluralStar](https://www.reddit.com/r/PluralStar/) · [GitHub Issues](https://github.com/TheHanyou/Plural-Star/issues)
