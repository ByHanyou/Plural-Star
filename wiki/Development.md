# Development

## Requirements

- Node 22.13+ (the repository's `.nvmrc` selects Node 22)
- JDK 17
- Android SDK
- A compatible macOS/Xcode combination and an installed iOS Simulator runtime
- Ruby 3.4+ and the Bundler version recorded in `Gemfile.lock` for iOS work

## Install

```bash
npm ci --legacy-peer-deps
```

## Run

```bash
npm run android
npm run ios
```

## iOS setup on another Mac

Use the Xcode workspace, `ios/PluralSpace.xcworkspace`, rather than opening the
project by itself. The workspace and shared scheme reference files relative to
the checkout. Generated Pods, simulator data, and `xcuserdata` are not committed.

Install the locked Ruby dependencies and Pods before the first build:

```bash
bundle install
cd ios
bundle exec pod install
cd ..
npm run ios
```

Use a modern Ruby on your shell's `PATH`; the Ruby bundled with macOS may be too
old. The repository does not assume an Apple Silicon or Intel Homebrew location.
Do not replace `bundle exec pod install` with a different global CocoaPods version.

The shared scheme runs **Debug** by default. Release remains available with
`npm run ios -- --mode Release`. CocoaPods builds dependencies implicitly, so the
scheme does not refer to generated Pods target IDs.

### Stable and beta Xcode

The build follows `DEVELOPER_DIR` when set, otherwise the Xcode selected by
`xcode-select -p`. To use a different installation for one shell session:

```bash
export DEVELOPER_DIR="/path/to/your/Xcode.app/Contents/Developer"
xcodebuild -version
xcodebuild -checkFirstLaunchStatus
npm run ios
```

Use the actual Xcode installation path on that Mac. If the first-launch check
fails, open that Xcode and finish its component setup, or run
`xcodebuild -runFirstLaunch` for the selected installation. If prompted for
administrator access, complete that setup locally. An out-of-date CoreSimulator
or a missing CoreDevice symbol is a toolchain setup issue; changing JavaScript
dependencies does not update those components. Close the previous Simulator when
switching between Xcode installations.

### Node in Xcode

`ios/.xcode.env` resolves Node from the environment. Xcode launched from Finder
may not see your shell's version manager. If necessary, create the ignored
`ios/.xcode.env.local` with an absolute path to **your** installed Node:

```bash
node -p 'process.execPath'
```

Put that output in `export NODE_BINARY="<your Node path>"` in the local file.
Update it after changing Node installations; do not commit the local file or
copy a Homebrew Cellar path from another Mac.

### Personal device signing

Simulator builds do not require an Apple signing team. For a physical device,
create the ignored `ios/Signing.local.xcconfig`:

```xcconfig
PLURALSTAR_DEVELOPMENT_TEAM = YOUR_TEAM_ID
PLURALSTAR_BUNDLE_ID = com.yourname.pluralstar
```

Debug uses automatic development signing for both the app and Live Activity
extension. The extension gets `.liveactivity` appended to the chosen app bundle
ID. Sign in to your developer account in Xcode and select your connected device.
Your account must support the capabilities the app uses, including push
notifications; otherwise simulator testing is available.

Release/App Store signing retains the publisher's team and named provisioning
profiles. Distributing the published app requires that team's signing assets.
Personal Debug overrides do not change the Release configuration.

### Native dependency changes

After updating React Native or another native dependency, run `npm ci --legacy-peer-deps`, reinstall Pods, and rebuild the app. Metro reload alone
cannot update the installed native code. If JavaScript and native React Native
versions differ, rebuild before investigating application code.

The Podfile exposes Argon2Swift's C module to RNArgon2 for both Debug and Release;
this is reapplied by `pod install`. Keep build fixes in the Podfile, not solely
in generated files under `ios/Pods`.

## Android setup on macOS

Set `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) to your installed SDK, or set `sdk.dir`
in the ignored `android/local.properties`. Set `JAVA_HOME` to JDK 17. On macOS,
`export JAVA_HOME="$(/usr/libexec/java_home -v 17)"` selects an installed JDK 17
without assuming a Homebrew location. `npm run android` requires an attached
device or running emulator.

For signed Release builds, keep credentials in the ignored
`android/keystore.properties`:

```properties
PLURALSPACE_STORE_FILE=/path/to/your/release.keystore
PLURALSPACE_KEY_ALIAS=your-key-alias
PLURALSPACE_STORE_PASSWORD=your-store-password
PLURALSPACE_KEY_PASSWORD=your-key-password
```

`PLURALSPACE_STORE_FILE` can be absolute or relative to `android/`. Without these
two path/alias overrides, the existing `plural-space.keystore` in the repository
root and `pluralspace` alias remain the defaults. The checked-in debug keystore
is only for Debug builds.

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
