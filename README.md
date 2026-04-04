<h1 align="center">Plural Space</h1>

<p align="center">
  <img src="https://raw.githubusercontent.com/TheHanyou/Plural-Space/main/docs/icon.png" width="120" alt="Plural Space icon" />
</p>

<p align="center">
  <strong>Front tracking, system journal & history for plural systems.</strong><br>
  Private. Offline-first. No accounts. No servers.
</p>

<p align="center">
  <a href="https://github.com/TheHanyou/Plural-Space/releases/latest/download/app-release.apk">
    <img src="https://img.shields.io/badge/Download%20APK-Latest%20Release-DAA520?style=for-the-badge&logo=android&logoColor=white" alt="Download APK" />
  </a>
  &nbsp;
  <a href="https://github.com/TheHanyou/Plural-Space/releases/latest/download/PluralSpace.ipa">
    <img src="https://img.shields.io/badge/Download%20IPA-Latest%20Release-DAA520?style=for-the-badge&logo=apple&logoColor=white" alt="Download IPA" />
  </a>
</p>

<p align="center">
  <a href="https://www.buymeacoffee.com/PluralSpace">
    <img src="https://img.buymeacoffee.com/button-api/?text=Support+PS&amp;emoji=%E2%98%95&amp;slug=PluralSpace&amp;button_colour=151929&amp;font_colour=ffffff&amp;font_family=Cookie&amp;outline_colour=ffffff&amp;coffee_colour=FFDD00" alt="Support PS on Buy Me a Coffee" />
  </a>
</p>

<p align="center">
  <a href="https://thehanyou.github.io/Plural-Space/">Privacy Policy</a>
</p>

---

Simply Plural is being discontinued. Plural Space is the replacement you own entirely — your data stays on your device.

## Features

**◈ Three-Tier Front Tracking**  
Track who's fronting across three distinct tiers: Primary Front, Co-Front, and Co-Conscious. Each tier has its own member selection, mood, and notes. Primary Front also tracks location. Members are exclusive to one tier at a time. Set all three tiers from a single unified modal with a searchable member picker — type a name or filter by tag to find members instantly, even in large systems. A persistent notification keeps all three tiers visible from your notification shade.

**◇ Member Profiles**  
Build out your system roster with names, pronouns, roles, colors, and bios. Organize members with freeform tags and named groups. Tag members however makes sense for your system — by role, subsystem, origin, or anything else. Create colored named groups and assign members to multiple groups. Filter the member list by group, tag, or search. Members display tier-specific badges (Primary, Co-Front, Co-Con) when fronting. Archive dormant members to keep your active roster clean — archived members are hidden from the front picker but their history is fully preserved, and they can be restored at any time.

**◷ History & Insights**  
Front History gives you a complete timestamped log of every switch, organized by day, with co-front and co-conscious tiers displayed inline. Member History shows everything about a specific headmate — every front session across all tiers, mood changes, location changes, note updates, and journal entries they authored — alongside a summary of total time fronted, sessions, top mood, and top location. Add retroactive history entries manually with full three-tier support, start/end time selection, and a "Current" option for ongoing sessions — the app detects overlaps with existing entries and lets you choose how to handle them.

**◉ System Journal**  
Write journal entries as a system. Tag entries with authors (specific headmates), add topic hashtags, and optionally lock individual entries or the entire journal behind passwords. Filter entries by author or tag. Export individual entries or the full journal in `.txt`, `.md`, or `.json`.

**↑ Import & Export**  
Migrating from Simply Plural or PluralKit? Import your full system data — members, history, and system info — with a single API token. Co-fronting sessions from Simply Plural are correctly grouped into combined entries. Octocon users can use the PluralKit import path.

Export your full system data as JSON (reimportable), HTML (opens in Google Docs), or send a formatted summary to any email address. Import `.txt`, `.md`, or `.json` files directly as journal entries.

**🌐 Multilingual**  
Full interface available in English, Español, Français, Deutsch, and Português. Auto-detects your device language on first launch. Change anytime in System Settings.

**Other Features**
- Obsidian Blue dark theme and Steel light theme built-in, plus 10 custom palette slots — define your own four-color theme
- Mood picker with preset and custom mood support
- Location tagging with optional GPS auto-fill (resolves to neighbourhood or city — raw coordinates are never stored)
- Notification toggle in System Settings
- Password protection per journal entry and for the full journal
- Hashtag tagging system for journal topics
- Author filter and tag filter in journal
- Member tags and named groups with multi-group assignment
- Searchable member picker with tag filtering in front selection
- Per-member history with full event log
- Simply Plural and PluralKit token import with co-front grouping
- Full data export and restore

---

## Privacy

Everything lives on your device. No accounts, no cloud sync, no tracking, no ads.

The only outbound requests are:
- **GPS location** (optional, off by default) — coordinates are sent to [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org) to resolve a neighbourhood or city name. Raw coordinates are never stored.
- **Simply Plural / PluralKit import** (optional) — your token is used for a single one-time request and never stored.

Full privacy policy: [https://thehanyou.github.io/Plural-Space/](https://thehanyou.github.io/Plural-Space/)

---

## Installation

**Android — Direct APK (sideload)**  
Download the latest APK from the button above or from [Releases](https://github.com/TheHanyou/Plural-Space/releases). Enable "Install from unknown sources" on your device and install.

**iOS — IPA (sideload)**  
Download the latest IPA from the button above or from [Releases](https://github.com/TheHanyou/Plural-Space/releases). Install using [AltStore](https://altstore.io/) or a Mac with Xcode. Requires either AltStore or an Apple Developer account.

Direct AltStore Download: (paste into Safari) altstore://install?url=https://github.com/TheHanyou/Plural-Space/releases/download/v1.2.0/PluralSpace.ipa

---

## Build from Source

```bash
# Requirements: Node 22+, JDK 17, Android SDK
git clone https://github.com/TheHanyou/Plural-Space.git
cd Plural-Space
npm install --legacy-peer-deps
cd android && gradlew.bat assembleRelease
```

---

## License

[GNU Affero General Public License v3.0](LICENSE)

This software is free and open source. You are free to use, modify, and distribute it under the terms of the AGPL-3.0 license. Any distributed modifications or network-accessible deployments must also be released under AGPL-3.0.

---

## Support

Plural Space is free, always. If it's been useful to you, a contribution helps cover Play Store fees and development time.

<a href="https://www.buymeacoffee.com/PluralSpace">
  <img src="https://img.buymeacoffee.com/button-api/?text=Support+PS&amp;emoji=%E2%98%95&amp;slug=PluralSpace&amp;button_colour=151929&amp;font_colour=ffffff&amp;font_family=Cookie&amp;outline_colour=ffffff&amp;coffee_colour=FFDD00" alt="Support PS on Buy Me a Coffee" />
</a>

---

## Contact

**The Hanyou System**  
[r/PluralSpace](https://www.reddit.com/r/PluralSpace/) · [GitHub Issues](https://github.com/TheHanyou/Plural-Space/issues)
