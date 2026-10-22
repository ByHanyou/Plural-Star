# Development

## Requirements

- Node 22+
- JDK 17
- Android SDK
- Xcode and CocoaPods for iOS work

## Install

```bash
npm install --legacy-peer-deps
```

## Run

```bash
npm run android
npm run ios
```

Android debug builds install as `com.pluralspace.app.debug`, next to the store build. `npm run android` reads `.env.defaults`, overridden by `.env`: `JAVA_HOME` picks the JDK Gradle runs on, and `START_METRO=false` stops the script from starting Metro, so you run `npm start` yourself.

## Check

```bash
npm run typecheck
npm run audit:check
```

## Build

```bash
npm run build-android-apk
npm run build-android-release
```

## Important Files

- `package.json`: scripts and dependency versions.
- `tsconfig.json`: TypeScript config; `tsconfig.check.json` adds the unused-code checks used by `npm run typecheck`.
- `babel.config.js`, `metro.config.js`: bundler config.
- `react-native.config.js`: asset linking config.
- `patches/`: patch-package fixes applied on install.
- `scripts/`: the Android run helper and the audit gate.

## Documentation

- Privacy policy site: `docs/index.html`
