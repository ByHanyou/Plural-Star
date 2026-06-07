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

## Build

```bash
npm run build-android-apk
npm run build-android-release
```

## Important Files

- `package.json`: scripts and dependency versions.
- `tsconfig.json`: TypeScript config.
- `babel.config.js`, `metro.config.js`: bundler config.
- `react-native.config.js`: asset linking config.

## Documentation

- Privacy policy site: `docs/index.html`
- Android reference notes: `docs/android_build_config_reference.txt`
- Android manifest reference: `docs/android_manifest_reference.xml`
