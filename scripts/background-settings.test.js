// Run with: node --test scripts/background-settings.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const babel = require('@babel/core');

function load(file, imports) {
  const filename = path.resolve(__dirname, '..', file);
  const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, presets: ['module:@react-native/babel-preset'], babelrc: false, configFile: false,
  });
  const context = {exports: {}, require: name => {
    if (name.startsWith('@babel/runtime/helpers/')) return require(name);
    assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
    return imports[name];
  }};
  vm.runInNewContext(code, context, {filename});
  return context.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
function harness() {
  let state = {appSettings: {backgroundImage: 'old.png', language: 'en'},
    setAppSettings: value => { state.appSettings = value; }, setActivePaletteId: () => {}};
  let stored = plain(state.appSettings);
  let fail = false;
  let gate;
  const removed = [];
  let n = 0;
  const store = {set: async (key, value) => {
    if (gate) await gate;
    if (fail) throw Error('disk full');
    if (key === 'settings') stored = plain(value);
  }};
  const imports = {
    '../storage': {KEYS: {settings: 'settings'}, store},
    './appStore': {useAppStore: {getState: () => state}},
  };
  imports['./settings'] = load('src/store/settings.ts', imports);
  Object.assign(imports, {
    '../utils': {}, '../i18n/i18n': {changeLanguage: async () => {}}, '../utils/gpsLocation': {},
    '../utils/permissions': {}, '../utils/log': {}, '../utils/emitter': {Emitter: class {}},
    '../theme': {LIGHT_PALETTE: {id: 'light'}}, '../utils/mediaUtils': {},
    '../utils/mediaMigrations': {}, '../services/reminders': {}, '../mailbox/mailbox': {},
    '../utils/backgroundImage': {
      saveBackgroundImageFromUri: async () => `new-${++n}.png`,
      removeBackgroundImage: async name => { if (name) removed.push(name); },
    },
  });
  return {actions: load('src/store/actions.ts', imports), state, removed,
    stored: () => stored, fail: value => { fail = value; }, hold: promise => { gate = promise; }};
}

test('replacing and removing delete only the formerly committed file', async () => {
  const h = harness();
  await h.actions.changeBackgroundImage('content://gallery/photo');
  assert.equal(h.stored().backgroundImage, 'new-1.png');
  assert.deepEqual(h.removed, ['old.png']);
  await h.actions.changeBackgroundImage();
  assert.equal(h.stored().backgroundImage, undefined);
  assert.deepEqual(h.removed, ['old.png', 'new-1.png']);
});

test('failed replacement retains the current file and settings and cleans the new file', async () => {
  const h = harness();
  h.fail(true);
  await assert.rejects(h.actions.changeBackgroundImage('file:///photo'), /disk full/);
  assert.equal(h.state.appSettings.backgroundImage, 'old.png');
  assert.equal(h.stored().backgroundImage, 'old.png');
  assert.deepEqual(h.removed, ['new-1.png']);
  h.fail(false);
  await h.actions.changeBackgroundImage('file:///photo');
  assert.equal(h.stored().backgroundImage, 'new-2.png');
});

test('failed removal preserves the selected background', async () => {
  const h = harness();
  h.fail(true);
  await assert.rejects(h.actions.changeBackgroundImage(), /disk full/);
  assert.equal(h.state.appSettings.backgroundImage, 'old.png');
  assert.deepEqual(h.removed, []);
});

test('concurrent background, palette and list saves persist all changes', async () => {
  const h = harness();
  await Promise.all([
    h.actions.changeBackgroundImage('file:///photo'),
    h.actions.selectPalette('light'),
    h.actions.saveMemberSortMode('name'),
  ]);
  assert.deepEqual(h.stored(), {backgroundImage: 'new-1.png', language: 'en',
    activePaletteId: 'light', lightMode: true, memberSortMode: 'name'});
  assert.deepEqual(plain(h.state.appSettings), h.stored());
});

test('saving an older settings draft never restores a replaced or removed image', async () => {
  const h = harness();
  const draft = {...h.state.appSettings, language: 'fr'};
  await h.actions.changeBackgroundImage('file:///photo');
  await h.actions.saveAppSettings(draft);
  assert.equal(h.stored().backgroundImage, 'new-1.png');
  await h.actions.changeBackgroundImage();
  await h.actions.saveAppSettings(draft);
  assert.equal(h.stored().backgroundImage, undefined);
  assert.equal(h.stored().language, 'fr');
});

test('overlapping replacements leave only the latest image selected', async () => {
  const h = harness();
  await Promise.all([h.actions.changeBackgroundImage('file:///a'), h.actions.changeBackgroundImage('file:///b')]);
  assert.equal(h.stored().backgroundImage, 'new-2.png');
  assert.deepEqual(h.removed.sort(), ['new-1.png', 'old.png']);
});

test('an in-flight disk write keeps the current background alive', async () => {
  const h = harness();
  let release;
  h.hold(new Promise(resolve => { release = resolve; }));
  const saving = h.actions.changeBackgroundImage('file:///photo');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state.appSettings.backgroundImage, 'old.png');
  assert.deepEqual(h.removed, []);
  release();
  await saving;
  assert.equal(h.state.appSettings.backgroundImage, 'new-1.png');
});

test('native file utility accepts content/file URIs and confines deletion to background files', async () => {
  const copies = [], removed = [];
  let fail = false;
  const media = load('src/utils/backgroundImage.ts', {'./mediaFiles': {
    BACKGROUND_DIR: '/documents/ps_backgrounds', ensureDir: async () => {},
    removeIfExists: async name => removed.push(name),
    downscaleOrCopy: async (...args) => { copies.push(args); if (fail) throw Error('copy failed'); },
  }});
  for (const uri of ['content://provider/42', 'file:///camera.jpg']) {
    const name = await media.saveBackgroundImageFromUri(uri);
    assert.match(name, /^background-[a-z0-9-]+\.png$/);
    assert.equal(copies.at(-1)[0], uri);
    assert.equal(copies.at(-1)[2], 1920);
    assert.equal(media.backgroundImageUri(name), `/documents/ps_backgrounds/${name}`.replace(/^/, 'file://'));
  }
  await assert.rejects(media.saveBackgroundImageFromUri('https://example.com/photo'));
  for (const invalid of ['../avatar.png', 'file:///photo', '', undefined]) {
    assert.equal(media.backgroundImageUri(invalid), undefined);
    await media.removeBackgroundImage(invalid);
  }
  assert.deepEqual(removed, []);
  fail = true;
  await assert.rejects(media.saveBackgroundImageFromUri('content://provider/bad'), /copy failed/);
  assert.equal(removed[0], copies.at(-1)[1]);
});

test('export omits the device filename without changing settings or selected moods', async () => {
  const settings = {backgroundImage: 'local.png', customMoods: ['calm'], language: 'en'};
  const {buildExportBase} = load('src/export/payload.ts', {
    '../utils': {}, '../storage': {KEYS: {settings: 'settings'}, store: {get: async key => key === 'settings' ? settings : undefined}},
    '../utils/concurrency': {},
  });
  const data = await buildExportBase({}, [], [], [], {settings: true, moods: true});
  assert.deepEqual(plain(data.settings), {customMoods: ['calm'], language: 'en'});
  assert.equal(settings.backgroundImage, 'local.png');
  assert.deepEqual(plain(data.customMoods), ['calm']);
});
