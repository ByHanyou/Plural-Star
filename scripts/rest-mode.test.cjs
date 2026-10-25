const assert = require('node:assert/strict');
const {test} = require('node:test');
const {transformFileSync} = require('@babel/core');
const path = require('node:path');

process.env.TZ = 'America/New_York';

// Use the existing Babel toolchain to exercise the TypeScript without a mobile runtime.
function load(file, dependencies = {}) {
  const {code} = transformFileSync(path.join(__dirname, '..', file), {
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-typescript', '@babel/plugin-transform-modules-commonjs'],
  });
  const module = {exports: {}};
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

const rest = load('src/model/restMode.ts');
const time = load('src/utils/time.ts');
const recurrence = load('src/utils/recurrence.ts', {'./time': time});
const night = {enabled: true, start: '22:00', end: '08:00'};
const at = value => new Date(value).getTime();

test('validates times and treats invalid enabled schedules as quiet', () => {
  for (const clock of ['24:00', '12:60', '9:00', '', null]) assert.equal(rest.clockMinutes(clock), null);
  assert.equal(rest.clockMinutes('23:59'), 1439);
  assert.equal(rest.validRestMode({...night, end: '22:00'}), false);
  assert.equal(rest.isResting({...night, start: 'invalid'}), true);
  assert.equal(rest.nextAllowedNotification({...night, start: 'invalid'}, Date.now()), null);
  assert.equal(rest.isResting({...night, enabled: false}), false);
  assert.equal(rest.isResting(undefined), false);
});

test('overnight and daytime windows include the start and exclude the end', () => {
  for (const [clock, quiet] of [['21:59', false], ['22:00', true], ['00:00', true], ['07:59', true], ['08:00', false]]) {
    assert.equal(rest.isResting(night, at(`2026-10-25T${clock}:00`)), quiet, clock);
  }
  const daytime = {...night, start: '09:00', end: '17:00'};
  assert.equal(rest.isResting(daytime, at('2026-10-25T09:00:00')), true);
  assert.equal(rest.isResting(daytime, at('2026-10-25T17:00:00')), false);
  assert.equal(rest.isResting(daytime, at('2026-10-25T23:00:00')), false);
});

test('resumes the next morning across daylight saving changes', () => {
  for (const [evening, morning, hours] of [
    ['2026-03-07T22:00:00', '2026-03-08T08:00:00', 9],
    ['2026-10-31T22:00:00', '2026-11-01T08:00:00', 11],
  ]) {
    const resume = rest.nextAllowedNotification(night, at(evening));
    assert.equal(resume, at(morning));
    assert.equal(resume - at(evening), hours * 3600000);
    assert.equal(rest.nextRestBoundary(night, at(evening)), resume);
    assert.equal(rest.nextRestBoundary(night, resume), at(`${morning.slice(0, 10)}T22:00:00`));
  }
  const noon = at('2026-10-25T12:00:00');
  assert.equal(rest.nextAllowedNotification(night, noon), noon);
  assert.equal(rest.nextRestBoundary({...night, enabled: false}, noon), null);
});

function scheduler(settings, os = 'ios') {
  const scheduled = [];
  const cancelled = [];
  const reminders = load('src/services/reminders.ts', {
    'react-native-notify-kit': {
      createTriggerNotification: async (notification, trigger) => scheduled.push({notification, trigger}),
      cancelTriggerNotification: async id => cancelled.push(id),
      RepeatFrequency: {HOURLY: 'hourly', DAILY: 'daily', WEEKLY: 'weekly'},
    },
    'react-native': {Platform: {OS: os}},
    '../model/restMode': rest,
    './restMode': {notificationSettings: async () => settings},
    '../utils': {...time, ...recurrence, fmtTime: String},
    '../utils/log': {log: {error: (...args) => { throw args.at(-1); }}},
    '../i18n/i18n': {t: key => key},
    './notify': {
      REMINDER_ANDROID: {},
      setupReminderChannel: async () => {},
      cancelTriggersWithPrefix: async prefix => cancelled.push(prefix),
      timestampTrigger: (timestamp, repeatFrequency) => ({timestamp, repeatFrequency}),
    },
  });
  return {...reminders, scheduled, cancelled};
}

test('iOS front checks repeat only at allowed daily times and restore hourly scheduling', async () => {
  const originalNow = Date.now;
  Date.now = () => at('2026-10-25T12:00:00');
  try {
    const settings = {notificationsEnabled: true, restMode: night};
    const s = scheduler(settings);
    await s.scheduleFrontCheckReminder(1);
    assert.equal(s.scheduled.length, 14);
    for (const {trigger} of s.scheduled) {
      assert.equal(trigger.repeatFrequency, 'daily');
      assert.equal(rest.isResting(night, trigger.timestamp), false);
    }
    assert.ok(s.cancelled.includes('ps-front-check'));
    assert.ok(s.cancelled.includes('ps-front-check-'));
    settings.restMode = {...night, enabled: false};
    s.scheduled.length = 0;
    await s.scheduleFrontCheckReminder(1);
    assert.equal(s.scheduled.length, 1);
    assert.equal(s.scheduled[0].trigger.repeatFrequency, 'hourly');
  } finally {
    Date.now = originalNow;
  }
});

test('planner filters the alert time, restores reminders, and cancels when notifications are disabled', async () => {
  const originalNow = Date.now;
  Date.now = () => at('2026-10-25T12:00:00');
  try {
    const settings = {notificationsEnabled: true, restMode: night};
    const s = scheduler(settings);
    const planner = {
      appointments: [
        {id: 'early', title: 'Early', time: at('2026-10-26T08:30:00'), reminderMinutesBefore: 60},
        {id: 'late', title: 'Late', time: at('2026-10-26T22:30:00'), reminderMinutesBefore: 60},
      ],
      reminders: [{id: 'daily', title: 'Daily', enabled: true, times: ['07:00', '09:00'], createdAt: Date.now()}],
    };
    await s.reschedulePlannerNotifications(planner);
    assert.deepEqual(s.scheduled.map(n => n.notification.id), ['ps-plan-appt-late', 'ps-plan-rem-daily-1']);
    settings.restMode = {...night, enabled: false};
    s.scheduled.length = 0;
    await s.reschedulePlannerNotifications(planner);
    assert.equal(s.scheduled.length, 4);
    settings.notificationsEnabled = false;
    s.scheduled.length = 0;
    await s.reschedulePlannerNotifications(planner);
    await s.scheduleFrontCheckReminder(1);
    assert.equal(s.scheduled.length, 0);
    assert.ok(s.cancelled.includes('ps-plan-appt-'));
    assert.ok(s.cancelled.includes('ps-plan-rem-'));
  } finally {
    Date.now = originalNow;
  }
});
