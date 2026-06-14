#!/usr/bin/env node
const {spawn, spawnSync} = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANDROID_DIR = path.join(ROOT, 'android');
const PACKAGE = 'com.pluralspace.app';
const ACTIVITY = `${PACKAGE}/.MainActivity`;
const IS_WIN = process.platform === 'win32';
const GRADLE = IS_WIN ? 'gradlew.bat' : 'bash';
const GRADLE_ARGS = IS_WIN ? ['assembleDebug'] : ['./gradlew', 'assembleDebug'];
const DEBUG_APK = path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

const ADB = (() => {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (sdk) return path.join(sdk, 'platform-tools', IS_WIN ? 'adb.exe' : 'adb');
  return 'adb';
})();

const die = msg => { console.error(`\n${msg}\n`); process.exit(1); };

console.log('Checking adb for attached devices…');
const r = spawnSync(ADB, ['devices'], {encoding: 'utf8'});
if (r.error) die(`Could not run adb (${ADB}). Set ANDROID_HOME or put platform-tools on PATH.`);
const devices = r.stdout
  .split('\n').slice(1)
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('*') && l.includes('\t'))
  .map(l => {
    const [serial, state] = l.split('\t');
    return {serial, state};
  });
const ready = devices.filter(d => d.state === 'device');
if (ready.length === 0) {
  console.error('\nadb devices output:');
  console.error(r.stdout);
  die(
    'No attached device/emulator found.\n' +
    '  - If an emulator IS running, ADB lost track of it. Try:\n' +
    `      ${ADB} kill-server\n` +
    `      ${ADB} start-server\n` +
    `      ${ADB} devices\n` +
    '  - Or plug in a phone with USB debugging enabled.'
  );
}
console.log(`Targeting: ${ready.map(d => d.serial).join(', ')}`);

console.log('Starting Metro in a new window…');
if (IS_WIN) {
  spawn('cmd.exe', ['/c', 'start', '"Metro"', 'cmd', '/k', 'npx react-native start'], {
    detached: true, stdio: 'ignore',
  }).unref();
} else {
  const child = spawn('npx', ['react-native', 'start'], {detached: true, stdio: 'ignore'});
  child.unref();
}

console.log('Building debug APK…');
const g = spawnSync(GRADLE, GRADLE_ARGS, {cwd: ANDROID_DIR, stdio: 'inherit', shell: IS_WIN});
if (g.error) die(`Gradle build failed (${g.error.message}).`);
if (g.status !== 0) die(`Gradle build failed (exit ${g.status}).`);

for (const d of ready) {
  console.log(`Installing app on ${d.serial}…`);
  const install = spawnSync(ADB, ['-s', d.serial, 'install', '-r', DEBUG_APK], {stdio: 'inherit'});
  if (install.error) die(`adb install failed (${install.error.message}).`);
  if (install.status !== 0) die(`adb install failed on ${d.serial} (exit ${install.status}).`);

  console.log(`Launching app on ${d.serial}…`);
  spawnSync(ADB, ['-s', d.serial, 'shell', 'am', 'start', '-n', ACTIVITY], {stdio: 'inherit'});
}

console.log('\nApp installed and launched. Metro is running in a separate window.');
