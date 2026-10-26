const assert = require('node:assert/strict');
const {test} = require('node:test');
const {transformFileSync} = require('@babel/core');
const path = require('node:path');

// Exercise the refactored sharing and theme modules without a mobile runtime.
function load(file, dependencies = {}) {
  const {code} = transformFileSync(path.join(__dirname, '..', file), {
    babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-typescript', '@babel/plugin-transform-modules-commonjs'],
  });
  const module = {exports: {}};
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

const colors = load('src/themeColors.ts');
const theme = load('src/theme.ts', {'react-native': {Platform: {OS: 'ios'}}, './themeColors': colors});
const collections = load('src/utils/collections.ts');
const members = load('src/utils/members.ts', {
  '../i18n/i18n': {}, '../themeColors': colors, './collections': collections,
  './intl': {nameCompare: (a, b) => a.localeCompare(b)}, './tags': {}, './text': {},
});
const utils = {...collections, ...members};
const networkTypes = load('src/network/types.ts', {'../cloud/cloudTypes': {CLOUD_LINK_KEY: 'link'}});
const frontShare = load('src/network/frontShare.ts', {'../utils': utils, '../utils/log': {}, './types': networkTypes});
const payload = load('src/network/mirror/payload.ts', {'../../utils': utils, '../types': networkTypes});
const view = load('src/network/mirror/view.ts', {'../../utils': utils, '../types': networkTypes, './payload': payload, '../../themeColors': colors});
const KEYS = {system: 'system', members: 'members'};
const {buildMirror} = load('src/network/mirror/build.ts', {
  '../../themeColors': colors, '../../storage': {KEYS}, '../../utils': utils,
  '../../cloud/cloudKeys': {}, '../frontShare': frontShare, '../types': networkTypes,
});
const palette = {bg: '#112233', accent: '#aabbcc', text: '#ffffff', mid: '#445566'};
const normalized = colors.normalizeProfilePalette(palette);
const source = data => ({
  read: async key => data[key] === undefined ? null : JSON.stringify(data[key]),
  gifHash: async () => null, isSource: value => typeof value === 'string' && value.startsWith('file://'),
});
const share = async (feature, data) => JSON.parse((await buildMirror(source(data), feature, [], 'friend', {mode: 'all', ids: new Set()})).payload);

test('profile palettes validate all colors and survive JSON without saved-palette IDs', () => {
  assert.deepEqual(normalized, {bg: '#112233', accent: '#AABBCC', text: '#FFFFFF', mid: '#445566'});
  assert.equal(colors.sameProfilePalette(palette, JSON.parse(JSON.stringify(normalized))), true);
  for (const invalid of [null, [], {bg: '#112233'}, {...palette, accent: 'red'}, {...palette, mid: '#123'}]) {
    assert.equal(colors.normalizeProfilePalette(invalid), undefined);
  }
});

test('profile themes preserve text scaling and leave the app theme intact', () => {
  const base = {...theme.DEFAULT_THEME, textScale: 1.5};
  const before = {...base};
  const profile = theme.profileWindowTheme(base, palette);
  assert.equal(profile.bg, palette.bg);
  assert.equal(profile.accent, normalized.accent);
  assert.equal(profile.textScale, 1.5);
  assert.deepEqual(base, before);
  assert.equal(theme.profileWindowTheme(base, {bg: 'bad'}), base);
  assert.deepEqual(theme.profileWindowTheme(base, undefined, '#123456'), theme.profileTheme(base, '#123456'));
});

test('member sharing preserves profile colors through direct and group views', async () => {
  const member = members.blankMember({id: 'member', name: 'Member', color: '#123456', profileBg: true, profilePalette: palette});
  const shared = await share('members', {members: [member, {...member, id: 'private', private: true}]});
  assert.equal(shared.length, 1);
  const direct = view.mirrorToMember(shared[0], new Map());
  assert.deepEqual(direct.profilePalette, normalized);
  assert.equal(direct.profileBg, true);
  const grouped = view.toBrowserMembers({groups: [], membership: {group: [{id: member.id, name: member.name}]}}, shared, new Map());
  assert.deepEqual(grouped[0].profilePalette, normalized);
  assert.deepEqual(grouped[0].groupIds, ['group']);
});

test('system sharing copies valid palette colors and omits invalid palettes', async () => {
  const shared = await share('systemProfile', {system: {name: 'System', profilePalette: palette}});
  assert.deepEqual(payload.mirrorProfileOf(shared).profilePalette, normalized);
  const malformed = await share('systemProfile', {system: {name: 'System', profilePalette: {...palette, text: 'invalid'}}});
  assert.equal(Object.hasOwn(malformed, 'profilePalette'), false);
});

test('cloning follows the color selection for both palettes and legacy backgrounds', () => {
  const member = members.blankMember({profilePalette: palette, profileBg: true});
  const clone = members.cloneMemberFrom(member, members.CLONE_ALL);
  assert.deepEqual(clone.profilePalette, normalized);
  assert.equal(clone.profileBg, true);
  const plain = members.cloneMemberFrom(member, {...members.CLONE_ALL, color: false});
  assert.equal(plain.profilePalette, undefined);
  assert.equal(plain.profileBg, undefined);
});
