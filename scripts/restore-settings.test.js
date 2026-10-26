// Run with: node --test scripts/restore-settings.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

const filename = path.resolve(__dirname, '../src/import/restore.ts');
const {code: outputText} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
  filename, presets: ['module:@react-native/babel-preset'], babelrc: false, configFile: false,
});

// Exercise the public restore entry point with native I/O replaced by memory.
async function restore(current, incoming, restoreIsBundle, importMode, selection = {settings: true}) {
  const data = {_meta: {app: 'Plural Star'}, ...incoming};
  let saved = current;
  let writes = 0;
  let confirm;
  let done = false;
  const errors = [];
  const mocks = {
    'react-native': {Alert: {alert: (_title, _message, buttons) => { confirm = buttons[1].onPress; }}},
    'react-native-blob-util': {fs: {
      dirs: {CacheDir: '/cache'},
      readFile: async () => JSON.stringify(data),
      exists: async () => false,
    }},
    '../storage': {KEYS: {settings: 'settings'}, store: {
      get: async key => { assert.equal(key, 'settings'); return current; },
      set: async (key, value) => {
        assert.equal(key, 'settings');
        saved = JSON.parse(JSON.stringify(value));
        writes++;
      },
    }},
    './zipBundle': {importZipBundle: async () => ({data})},
    './detect': {isNativeBackup: () => true, looksLikeOurcana: () => false, looksLikeMultiplicity: () => false, looksLikeSP: () => false, looksLikeOctocon: () => false},
    './restoreCommon': {},
    '../utils/log': {},
    '../utils/mediaMigrations': {},
    './ourcana': {}, './multiplicity': {}, './simplyPlural': {}, './octocon': {},
    './importNames': {}, './importError': {importErrorText: e => {throw e;}}, '../i18n/i18n': {}, '../utils': {},
    '../utils/mediaUtils': {}, '../utils/concurrency': {}, './progress': {},
    './convert': {}, './spApi': {},
  };
  const context = {
    exports: {},
    require: name => {
      if (name.startsWith('@babel/runtime/helpers/')) return require(name);
      assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`);
      return mocks[name];
    },
    setTimeout: () => 0,
  };
  vm.runInNewContext(outputText, context, {filename});
  context.exports.handleRestore({
    restorePath: restoreIsBundle ? '/backup.zip' : '/backup.json',
    restorePreview: true, restoreIsBundle, importMode, restoreSel: selection,
    setRestoring: () => {}, setRestoreProgress: () => {},
    setRestoreDone: value => { done = value; },
    setRestoreError: error => errors.push(error),
    t: key => key, onDataImported: () => {}, history: [],
  });
  assert.equal(typeof confirm, 'function');
  await confirm();
  assert.deepEqual(errors, []);
  assert.equal(done, true);
  return {saved, writes};
}

for (const bundle of [false, true]) {
  for (const mode of ['overwrite', 'update']) {
    const label = `${bundle ? 'ZIP' : 'JSON'} / ${mode}`;
    for (const [name, current, importedBackground, expected] of [
      ['keeps local background when omitted', {backgroundImage: 'local.jpg'}, {}, 'local.jpg'],
      ['ignores foreign background', {backgroundImage: 'local.jpg'}, {backgroundImage: 'foreign.jpg'}, 'local.jpg'],
      ['keeps solid background', {}, {backgroundImage: 'foreign.jpg'}, undefined],
      ['handles missing local settings', null, {backgroundImage: 'foreign.jpg'}, undefined],
    ]) {
      test(`${label}: ${name}`, async () => {
        const local = current && {...current, customMoods: ['local mood'], lightMode: false};
        const incoming = {settings: {...importedBackground, lightMode: true, customMoods: ['backup mood']}};
        const original = JSON.stringify({local, incoming});
        const {saved, writes} = await restore(local, incoming, bundle, mode);
        assert.equal(writes, 1);
        assert.equal(saved.backgroundImage, expected);
        assert.equal(saved.lightMode, true);
        assert.deepEqual(saved.customMoods, local?.customMoods || []);
        assert.equal(JSON.stringify({local, incoming}), original);
      });
    }
    test(`${label}: restores selected moods with settings`, async () => {
      const {saved} = await restore({backgroundImage: 'local.jpg'}, {
        settings: {lightMode: true}, customMoods: ['restored mood'],
      }, bundle, mode, {settings: true, moods: true});
      assert.equal(saved.backgroundImage, 'local.jpg');
      assert.equal(saved.lightMode, true);
      assert.deepEqual(saved.customMoods, ['restored mood']);
    });
    test(`${label}: moods-only restore keeps other local settings`, async () => {
      const {saved} = await restore({backgroundImage: 'local.jpg', lightMode: false}, {
        settings: {backgroundImage: 'foreign.jpg', lightMode: true, customMoods: ['restored mood']},
      }, bundle, mode, {moods: true});
      assert.deepEqual(saved, {backgroundImage: 'local.jpg', lightMode: false, customMoods: ['restored mood']});
    });
    test(`${label}: unselected settings are not written`, async () => {
      const {writes} = await restore({backgroundImage: 'local.jpg'}, {
        settings: {backgroundImage: 'foreign.jpg'},
      }, bundle, mode, {});
      assert.equal(writes, 0);
    });
  }
}
