# Privacy Policy — Plural Star

**Last updated:** April 2026  
**App:** Plural Star (formerly Plural Space)  
**Developer:** The Hanyou System / The Living Archive  
**Contact:** the1hanyou@gmail.com

---

## Overview

Plural Star is a private front-tracking, journaling, and system-management tool for plural individuals and systems. This policy describes how the app handles your data, what leaves your device, and what stays local. The privacy practices described here have not changed as part of the rename from Plural Space to Plural Star.

---

## 1. Data the App Handles

All content you enter in the app — the following categories — is stored exclusively on your device:

- **System information** — system name, description, system-level banner and avatar
- **Member profiles** — names, pronouns, roles, colors, markdown descriptions, profile pictures, 900×300 banners, tags, group assignments
- **Front history** — timestamped records of who fronted across Primary, Co-Front, and Co-Conscious tiers, with mood, location, energy level, and notes per tier
- **Journal entries** — text entries with optional authors, hashtags, and per-entry or whole-journal passwords
- **Chat** — local-only system chat with channels, text messages, images (stored as base64 on your device), replies, and reactions
- **Custom fields** — user-defined per-member fields and values
- **Noteboards** — per-member note threads written by other headmates
- **Polls** — system polls with options, votes, and voter tracking
- **Settings and preferences** — theme, language, notification toggles, front-check interval, custom palettes, custom moods, and saved locations
- **Approximate location** — only when GPS is explicitly enabled in Settings (off by default). Your device's coordinates are reverse-geocoded to a neighbourhood or city name via OpenStreetMap Nominatim. Raw GPS coordinates are never stored.

---

## 2. How Your Data Is Used

All data is used solely to provide app features — tracking fronting sessions, maintaining a system journal, managing custom fields and noteboards, running polls, and generating history and insights. Your data is never used for advertising, analytics, profiling, or any purpose beyond what you see in the app.

---

## 3. Data Storage

All data is stored locally on your device using Android's AsyncStorage (and equivalent on iOS). Plural Star does not operate any servers, does not require an account, and does not transmit your data to any third party, with three narrow exceptions:

- **GPS location (optional):** If you enable the GPS feature, your device's coordinates are sent over HTTPS to [Nominatim (OpenStreetMap)](https://nominatim.openstreetmap.org) to resolve a neighbourhood or city name. Only coordinates are sent — no identifiers, no account information, no system data.
- **Simply Plural / PluralKit token import (optional):** If you use the import feature with a token, the token is used for one-time API requests to those services to fetch your data. The token is not stored by Plural Star after the import completes.
- **Simply Plural file import (optional):** If you import a Simply Plural JSON export file, the file is read from your device's local storage only. No network traffic occurs during file import.

---

## 4. Data Sharing

Plural Star does not sell, share, or transmit your personal data to any third parties for any purpose beyond what is described in Section 3.

---

## 5. Notifications

Plural Star can display local notifications on your device. All notifications are generated entirely on-device and are not transmitted anywhere.

- **Front status notification:** A persistent notification showing who is currently fronting across all three tiers. Displays when someone is fronting and updates when the front changes.
- **Front-check reminders (optional):** If you set a front-check interval in Settings (1, 2, 4, 8, 12, or 24 hours), the app schedules a recurring local reminder to prompt you to update the front. Notifications can be disabled at any time by clearing the interval or turning off notifications in Settings.
- **Noteboard notifications (optional):** When a new noteboard entry is created for a member, the app can surface a local notification to indicate the new note. Disabled by turning off notifications in Settings.

---

## 6. Export & Backup

Plural Star includes optional export features you control entirely:

- **JSON export:** Saves a `.json` file to your device's local storage and opens the share sheet. You decide where it goes. Can be reimported.
- **HTML export:** Saves an `.html` file for offline viewing or uploading to services like Google Drive. You control distribution.
- **Email export:** Opens your device's native mail application with pre-filled content. Plural Star does not send email directly and has no access to your email account.
- **Per-category granularity:** All exports offer per-category toggles so you can choose exactly which data categories (system, members, avatars, banners, front history, journal, groups, chat, moods, palettes, settings, custom fields, noteboards, polls) to include.

Images included in exports (avatars and banners) are encoded as base64 strings inside the JSON payload so they travel with the backup across devices.

---

## 7. Data Deletion

You can permanently erase all app data at any time using **Share → Delete All Data**. Uninstalling the app also removes all locally stored data from your device.

---

## 8. Sensitive Information

Plural Star is designed for plural systems, which may include individuals with dissociative identity disorder (DID), other specified dissociative disorder (OSDD), or other plurality experiences. The app treats all entered information as private by default. No information about system identity, mental health, or personal history is collected or shared by the app.

---

## 9. Children's Privacy

Plural Star is not directed at children under the age of 13 and does not knowingly collect information from children under 13.

---

## 10. Changes to This Policy

If we make material changes to this policy, the updated version will be published at the URL in the app's Play Store listing and at [https://thehanyou.github.io/Plural-Star/](https://thehanyou.github.io/Plural-Star/) with a revised date at the top.

---

## 11. Contact

Questions about this privacy policy or the app can be directed to:  
**[the1hanyou@gmail.com](mailto:the1hanyou@gmail.com)**

Source code: [github.com/TheHanyou/Plural-Star](https://github.com/TheHanyou/Plural-Star) (AGPL-3.0)
