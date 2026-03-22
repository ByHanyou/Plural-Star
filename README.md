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
</p>

<p align="center">
  <a href="https://www.buymeacoffee.com/pluralspace">
    <img src="https://img.shields.io/badge/Support%20on%20BMC-DAA520?style=for-the-badge&logo=buy-me-a-coffee&logoColor=white" alt="Buy Me a Coffee" />
  </a>
</p>

<p align="center">
  <a href="https://thehanyou.github.io/Plural-Space/">Privacy Policy</a>
</p>

---

Simply Plural is being discontinued. Plural Space is the replacement you own entirely — your data stays on your device.

## Features

**◈ Front Tracking**  
Know who's fronting at a glance. Set the front with a tap and track mood and location alongside each session. Add or update notes in real time without changing the front. A persistent notification keeps the current fronter visible from your notification shade, updated automatically.

**◇ Member Profiles**  
Build out your system roster with names, pronouns, roles, colors, and bios. Each member gets their own color identity used throughout the app.

**◷ History & Insights**  
Front History gives you a complete timestamped log of every switch, organized by day. Member History shows everything about a specific headmate — every front session, mood change, location change, note update, and journal entry they authored — alongside a summary of total time fronted, sessions, top mood, and top location.

**◉ System Journal**  
Write journal entries as a system. Tag entries with authors (specific headmates), add topic hashtags, and optionally lock individual entries or the entire journal behind passwords. Filter entries by author or tag. Export individual entries or the full journal in `.txt`, `.md`, or `.json`.

**↑ Import & Export**  
Migrating from Simply Plural or PluralKit? Import your full system data — members, history, and system info — with a single API token. Octocon users can use the PluralKit import path.

Export your full system data as JSON (reimportable), HTML (opens in Google Docs), or send a formatted summary to any email address. Import `.txt`, `.md`, or `.json` files directly as journal entries.

**Other Features**
- Obsidian Blue dark theme and Steel light theme
- Mood picker with preset and custom mood support
- Location tagging with optional GPS auto-fill (resolves to neighbourhood or city — raw coordinates are never stored)
- Password protection per journal entry and for the full journal
- Hashtag tagging system for journal topics
- Author filter and tag filter in journal
- Per-member history with full event log
- Simply Plural and PluralKit token import
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

**Direct APK (sideload)**  
Download the latest APK from the button above or from [Releases](https://github.com/TheHanyou/Plural-Space/releases). Enable "Install from unknown sources" on your device and install.

**Google Play**  
Coming soon.

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

[GNU General Public License v3.0](LICENSE)

This software is free and open source. You are free to use, modify, and distribute it under the terms of the GPL-3.0 license. Any distributed modifications must also be released under GPL-3.0.

---

## Support

Plural Space is free, always. If it's been useful to you, a contribution helps cover Play Store fees and development time.

<a href="https://www.buymeacoffee.com/pluralspace">
  <img src="https://img.buymeacoffee.com/button-api/?text=Support+PS&amp;emoji=&amp;slug=pluralspace&amp;button_colour=0a1f2e&amp;font_colour=ffffff&amp;font_family=Cookie&amp;outline_colour=ffffff&amp;coffee_colour=FFDD00" alt="Support on Buy Me a Coffee" />
</a>

---

## Contact

**The Hanyou System**  
<a href="/cdn-cgi/l/e
