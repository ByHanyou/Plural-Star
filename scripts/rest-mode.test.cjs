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
  for (const invalid of [NaN, Infinity, -Infinity, 1e20]) {
    assert.equal(rest.isResting(night, invalid), true);
    assert.equal(rest.nextAllowedNotification(night, invalid), null);
    assert.equal(rest.nextRestBoundary(night, invalid), null);
  }
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

test('resumes at the remaining occurrence of a repeated rest end', () => {
  const mode = {...night, end: '01:45'};
  for (const offset of ['-04:00', '-05:00']) {
    const now = at(`2026-11-01T01:35:00${offset}`);
    const end = at(`2026-11-01T01:45:00${offset}`);
    assert.equal(rest.nextAllowedNotification(mode, now), end);
    assert.equal(rest.nextRestBoundary(mode, now), end);
    assert.equal(rest.nextAllowedNotification(mode, end), end);
  }
  const now = at('2026-11-01T01:35:20.500-05:00');
  assert.equal(rest.nextAllowedNotification(mode, now) - now, 579500);
});

test('selects the next repeated rest start before advancing to tomorrow', () => {
  const mode = {...night, start: '01:30', end: '01:45'};
  for (const offset of ['-04:00', '-05:00']) {
    assert.equal(rest.nextRestBoundary(mode, at(`2026-11-01T01:15:00${offset}`)),
      at(`2026-11-01T01:30:00${offset}`));
    const start = at(`2026-11-01T01:30:00${offset}`);
    assert.equal(rest.isResting(mode, start), true);
    assert.equal(rest.nextRestBoundary(mode, start), at(`2026-11-01T01:45:00${offset}`));
  }
  for (const clock of ['01:45:00', '01:50:00']) {
    assert.equal(rest.nextRestBoundary(mode, at(`2026-11-01T${clock}-04:00`)),
      at('2026-11-01T01:30:00-05:00'));
  }
  assert.equal(rest.nextRestBoundary(mode, at('2026-11-01T01:45:00-05:00')),
    at('2026-11-02T01:30:00-05:00'));
});

test('skipped rest ends resume at the clock jump', () => {
  const mode = {...night, end: '02:30'};
  const end = at('2026-03-08T03:00:00-04:00');
  for (const value of ['2026-03-07T22:00:00-05:00', '2026-03-08T01:30:00-05:00', '2026-03-08T01:59:59.999-05:00']) {
    assert.equal(rest.nextAllowedNotification(mode, at(value)), end);
    assert.equal(rest.nextRestBoundary(mode, at(value)), end);
  }
  assert.equal(rest.nextAllowedNotification(mode, end), end);
});

test('boundaries follow actual rest state through skipped windows and rollback re-entry', () => {
  for (const [start, end, now, boundary] of [
    ['02:30', '04:00', '2026-03-08T01:30:00-05:00', '2026-03-08T03:00:00-04:00'],
    ['02:30', '03:15', '2026-03-08T01:30:00-05:00', '2026-03-08T03:00:00-04:00'],
    ['02:30', '02:45', '2026-03-08T01:30:00-05:00', '2026-03-09T02:30:00-04:00'],
    ['03:30', '04:00', '2026-03-08T01:30:00-05:00', '2026-03-08T03:30:00-04:00'],
    ['22:00', '01:45', '2026-11-01T01:50:00-04:00', '2026-11-01T01:00:00-05:00'],
    ['01:15', '02:30', '2026-11-01T01:50:00-04:00', '2026-11-01T01:00:00-05:00'],
  ]) {
    const mode = {enabled: true, start, end};
    assert.equal(rest.nextRestBoundary(mode, at(now)), at(boundary), `${start}–${end} at ${now}`);
  }
});

test('boundary calculations match a timeline scan in multiple time zones', () => {
  const fixtures = [
    ['America/New_York', '2026-03-08T05:00:00Z'],
    ['America/New_York', '2026-11-01T04:00:00Z'],
    ['Europe/Berlin', '2026-03-28T23:00:00Z'],
    ['Europe/Berlin', '2026-10-24T22:00:00Z'],
    ['Australia/Lord_Howe', '2026-10-03T13:30:00Z'],
    ['Australia/Lord_Howe', '2026-04-04T13:00:00Z'],
    ['Asia/Kathmandu', '2026-03-07T18:15:00Z'],
    ['UTC', '2026-03-08T00:00:00Z'],
  ];
  try {
    for (const [zone, midnight] of fixtures) {
      process.env.TZ = zone;
      for (const [start, end] of [['22:00', '02:30'], ['22:00', '01:45'], ['01:15', '02:30'], ['02:30', '02:45'], ['02:30', '04:00'], ['09:00', '17:00']]) {
        const mode = {enabled: true, start, end};
        for (let hour = 0; hour < 6; hour++) {
          const now = at(midnight) + hour * 3600000 + 12345;
          const initial = rest.isResting(mode, now);
          let expected = Math.floor(now / 60000) * 60000 + 60000;
          const limit = now + 3 * 86400000;
          while (expected < limit && rest.isResting(mode, expected) === initial) expected += 60000;
          assert.ok(expected < limit);
          const label = `${zone} ${start}–${end} ${new Date(now).toISOString()}`;
          assert.equal(rest.nextRestBoundary(mode, now), expected, label);
          assert.equal(rest.nextAllowedNotification(mode, now), initial ? expected : now, label);
        }
      }
    }
  } finally {
    process.env.TZ = 'America/New_York';
  }
});

function scheduler(settings, os = 'ios') {
  const scheduled = [];
  const cancelled = [];
  const occurrenceCalls = [];
  const reminders = load('src/services/reminders.ts', {
    'react-native-notify-kit': {
      createTriggerNotification: async (notification, trigger) => scheduled.push({notification, trigger}),
      cancelTriggerNotification: async id => cancelled.push(id),
      RepeatFrequency: {HOURLY: 'hourly', DAILY: 'daily', WEEKLY: 'weekly'},
    },
    'react-native': {Platform: {OS: os}},
    '../model/restMode': rest,
    './restMode': {notificationSettings: async () => settings},
    '../utils': {...time, ...recurrence, fmtTime: String, plannerNextOccurrence: (...args) => {
      occurrenceCalls.push(args);
      return recurrence.plannerNextOccurrence(...args);
    }},
    '../utils/log': {log: {error: (...args) => { throw args.at(-1); }}},
    '../i18n/i18n': {t: key => key},
    './notify': {
      REMINDER_ANDROID: {},
      setupReminderChannel: async () => {},
      cancelTriggersWithPrefix: async prefix => cancelled.push(prefix),
      timestampTrigger: (timestamp, repeatFrequency) => ({timestamp, repeatFrequency}),
    },
  });
  return {...reminders, scheduled, cancelled, occurrenceCalls};
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

test('iOS front checks keep distinct local slots across clock changes', async () => {
  const originalNow = Date.now;
  const originalZone = process.env.TZ;
  const fixtures = [
    ['America/New_York', '2026-03-07T12:17:23-05:00'],
    ['America/New_York', '2026-10-31T12:17:23-04:00'],
    ['America/New_York', '2026-03-08T01:17:23-05:00'],
    ['America/New_York', '2026-11-01T01:17:23-04:00'],
    ['America/New_York', '2026-11-01T01:17:23-05:00'],
    ['Europe/Berlin', '2026-03-28T12:17:23+01:00'],
    ['Europe/Berlin', '2026-10-24T12:17:23+02:00'],
    ['Australia/Lord_Howe', '2026-10-03T12:17:23+10:30'],
    ['Australia/Lord_Howe', '2026-10-03T02:17:23+10:30'],
    ['Australia/Lord_Howe', '2026-04-04T12:47:23+11:00'],
    ['Asia/Kathmandu', '2026-03-07T12:17:23+05:45'],
    ['UTC', '2026-03-07T12:17:23Z'],
  ];
  try {
    for (const [zone, value] of fixtures) {
      process.env.TZ = zone;
      const now = at(value);
      Date.now = () => now;
      const local = new Date(now);
      // Independent timeline oracle: take the first future match for each clock hour.
      const nextByHour = new Map();
      for (let probe = now + 60000; probe < now + 3 * 86400000 && nextByHour.size < 24; probe += 60000) {
        const date = new Date(probe);
        if (date.getMinutes() === local.getMinutes() && !nextByHour.has(date.getHours())) nextByHour.set(date.getHours(), probe);
      }
      for (const interval of [1, 2, 3, 4, 6, 8, 12, 24, 5]) {
        for (const mode of [night, {...night, enabled: false}, {...night, start: '03:00', end: '04:00'}]) {
          // The unrestricted hourly case uses one native hourly trigger.
          if (interval === 1 && !mode.enabled) continue;
          const s = scheduler({notificationsEnabled: true, restMode: mode});
          await s.scheduleFrontCheckReminder(interval);
          const step = 24 % interval === 0 ? interval : 24;
          const expected = [];
          for (let hour = 0; hour < 24; hour++) {
            if (((hour - local.getHours() + 24) % 24) % step !== 0) continue;
            const minute = hour * 60 + local.getMinutes();
            const start = rest.clockMinutes(mode.start);
            const end = rest.clockMinutes(mode.end);
            const quiet = mode.enabled && (start < end ? minute >= start && minute < end : minute >= start || minute < end);
            if (!quiet) expected.push(hour);
          }
          const dates = s.scheduled.map(n => new Date(n.trigger.timestamp));
          const label = `${zone} ${value} ${interval}h ${JSON.stringify(mode)}`;
          assert.deepEqual(dates.map(d => d.getHours()).sort((a, b) => a - b), expected, label);
          assert.equal(new Set(s.scheduled.map(n => n.notification.id)).size, dates.length, label);
          for (const {trigger} of s.scheduled) {
            const date = new Date(trigger.timestamp);
            assert.ok(trigger.timestamp > now, label);
            assert.ok(trigger.timestamp < now + 3 * 86400000, label);
            assert.equal(date.getMinutes(), local.getMinutes(), label);
            assert.equal(date.getSeconds(), local.getSeconds(), label);
            assert.equal(trigger.timestamp, nextByHour.get(date.getHours()), label);
            assert.equal(trigger.repeatFrequency, 'daily', label);
            assert.equal(rest.isResting(mode, trigger.timestamp), false, label);
          }
        }
      }
    }
  } finally {
    Date.now = originalNow;
    process.env.TZ = originalZone;
  }
});

test('a nonexistent iOS front-check slot waits for its real clock time without losing the daily series', async () => {
  const originalNow = Date.now;
  Date.now = () => at('2026-03-08T01:30:00-05:00');
  try {
    for (const mode of [night, {...night, start: '03:00', end: '04:00'}, {...night, start: '04:00', end: '05:00'}]) {
      const s = scheduler({notificationsEnabled: true, restMode: mode});
      await s.scheduleFrontCheckReminder(1);
      const atTwo = s.scheduled.filter(n => new Date(n.trigger.timestamp).getHours() === 2);
      const quiet = rest.isResting(mode, at('2026-03-09T02:30:00-04:00'));
      assert.equal(atTwo.length, quiet ? 0 : 1);
      if (!quiet) assert.equal(atTwo[0].trigger.timestamp, at('2026-03-09T02:30:00-04:00'));
      const atThree = s.scheduled.filter(n => new Date(n.trigger.timestamp).getHours() === 3);
      assert.equal(atThree.length, rest.isResting(mode, at('2026-03-08T03:30:00-04:00')) ? 0 : 1);
    }
  } finally {
    Date.now = originalNow;
  }
});

test('front checks cancel stale triggers for invalid imported intervals', async () => {
  for (const os of ['ios', 'android']) {
    for (const interval of [NaN, Infinity, -Infinity, -1, 0, 0.5, 1.5]) {
      const s = scheduler({notificationsEnabled: true, restMode: night}, os);
      await s.scheduleFrontCheckReminder(interval);
      assert.equal(s.scheduled.length, 0);
      assert.ok(s.cancelled.includes('ps-front-check'));
      assert.ok(s.cancelled.includes('ps-front-check-'));
    }
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

test('daily and weekly reminder series survive a first occurrence suppressed by DST', async () => {
  const originalNow = Date.now;
  Date.now = () => at('2026-03-07T12:00:00-05:00');
  try {
    for (const os of ['ios', 'android']) {
      for (const [repeat, expected] of [['daily', '2026-03-09T02:30:00-04:00'], ['weekly', '2026-03-15T02:30:00-04:00']]) {
        const settings = {notificationsEnabled: true, restMode: {...night, start: '03:00', end: '04:00'}};
        const s = scheduler(settings, os);
        await s.reschedulePlannerNotifications({appointments: [], reminders: [{
          id: 'gap', title: 'Gap', enabled: true, repeat, times: ['02:30'], createdAt: at('2026-03-01T00:00:00-05:00'),
        }]});
        assert.equal(s.scheduled.length, 1, `${os} ${repeat}`);
        assert.equal(s.scheduled[0].trigger.timestamp, at(expected));
        assert.equal(s.scheduled[0].trigger.repeatFrequency, repeat);
      }
    }
  } finally {
    Date.now = originalNow;
  }
});

test('recurring appointments search by alert time while quiet one-offs remain skipped', async () => {
  const originalNow = Date.now;
  Date.now = () => at('2026-03-07T12:00:00-05:00');
  try {
    for (const [repeat, expected] of [['daily', '2026-03-09T02:30:00-04:00'], ['weekly', '2026-03-15T02:30:00-04:00']]) {
      const s = scheduler({notificationsEnabled: true, restMode: {...night, start: '01:00', end: '02:00'}});
      await s.reschedulePlannerNotifications({reminders: [], appointments: [
        {id: 'repeat', title: 'Repeat', repeat, time: at('2026-03-01T03:30:00-05:00'), reminderMinutesBefore: 60},
        {id: 'once', title: 'Once', time: at('2026-03-08T03:30:00-04:00'), reminderMinutesBefore: 60},
      ]});
      assert.deepEqual(s.scheduled.map(n => n.notification.id), ['ps-plan-appt-repeat']);
      assert.equal(s.scheduled[0].trigger.timestamp, at(expected));
      assert.equal(s.scheduled[0].trigger.repeatFrequency, repeat);
    }
  } finally {
    Date.now = originalNow;
  }
});

test('permanently quiet native repeats have a bounded search', async () => {
  const s = scheduler({notificationsEnabled: true, restMode: night});
  await s.reschedulePlannerNotifications({appointments: [], reminders: [{
    id: 'quiet', title: 'Quiet', enabled: true, repeat: 'daily', times: ['23:00'], createdAt: at('2026-01-01T00:00:00-05:00'),
  }]});
  assert.equal(s.scheduled.length, 0);
  assert.ok(s.occurrenceCalls.length <= 375);
});

test('reminder clocks survive anchors created on the spring-forward date', async () => {
  const originalNow = Date.now;
  Date.now = () => at('2026-03-08T12:00:00-04:00');
  try {
    for (const [repeat, expected] of [['daily', '2026-03-09T02:30:00-04:00'], ['weekly', '2026-03-15T02:30:00-04:00']]) {
      const s = scheduler({notificationsEnabled: true, restMode: {...night, start: '03:00', end: '04:00'}});
      await s.reschedulePlannerNotifications({appointments: [], reminders: [{
        id: 'anchor', title: 'Anchor', enabled: true, repeat, times: ['02:30'], createdAt: Date.now(),
      }]});
      assert.equal(s.scheduled.length, 1);
      assert.equal(s.scheduled[0].trigger.timestamp, at(expected));
      assert.equal(s.scheduled[0].trigger.repeatFrequency, repeat);
    }
  } finally {
    Date.now = originalNow;
  }
});

test('an allowed normalized occurrence does not move the native series clock', async () => {
  const originalNow = Date.now;
  Date.now = () => at('2026-03-07T12:00:00-05:00');
  try {
    for (const [start, end, repeats] of [['04:00', '05:00', true], ['22:00', '03:00', false]]) {
      const settings = {notificationsEnabled: true, restMode: {...night, start, end}};
      const s = scheduler(settings);
      await s.reschedulePlannerNotifications({appointments: [], reminders: [{
        id: 'clock', title: 'Clock', enabled: true, repeat: 'daily', times: ['02:30'], createdAt: at('2026-03-01T00:00:00-05:00'),
      }]});
      assert.equal(s.scheduled[0].trigger.timestamp, at('2026-03-08T03:30:00-04:00'));
      assert.equal(s.scheduled[0].trigger.repeatFrequency, undefined);
      assert.equal(s.scheduled.length, repeats ? 2 : 1);
      if (repeats) {
        assert.equal(s.scheduled[1].trigger.timestamp, at('2026-03-09T02:30:00-04:00'));
        assert.equal(s.scheduled[1].trigger.repeatFrequency, 'daily');
      }
      assert.ok(s.occurrenceCalls.length <= 375);
    }
  } finally {
    Date.now = originalNow;
  }
});

test('the bounded search preserves future start dates and rejects invalid imported clocks', async () => {
  const originalNow = Date.now;
  Date.now = () => at('2026-03-07T12:00:00-05:00');
  try {
    const s = scheduler({notificationsEnabled: true, restMode: night});
    const start = at('2027-06-01T00:00:00-04:00');
    await s.reschedulePlannerNotifications({appointments: [
      {id: 'future', title: 'Future', repeat: 'daily', time: at('2027-06-01T09:00:00-04:00'), reminderMinutesBefore: 60},
    ], reminders: [
      {id: 'future', title: 'Future', enabled: true, repeat: 'daily', times: ['09:00'], startDate: start, createdAt: Date.now()},
      {id: 'invalid', title: 'Invalid', enabled: true, repeat: 'daily', times: ['25:00', '12:60'], createdAt: Date.now()},
    ]});
    assert.deepEqual(s.scheduled.map(n => n.trigger.timestamp), [at('2027-06-01T08:00:00-04:00'), at('2027-06-01T09:00:00-04:00')]);
  } finally {
    Date.now = originalNow;
  }
});

test('appointment alert offsets cannot shift the native repeat clock or weekday', async () => {
  const originalNow = Date.now;
  Date.now = () => at('2026-03-07T12:00:00-05:00');
  try {
    for (const os of ['ios', 'android']) {
      for (const [repeat, date] of [['daily', '2026-03-09'], ['weekly', '2026-03-15']]) {
        const s = scheduler({notificationsEnabled: true, restMode: {...night, start: '01:00', end: '02:00'}}, os);
        await s.reschedulePlannerNotifications({reminders: [], appointments: [{
          id: 'offset', title: 'Offset', repeat, time: at('2026-03-01T03:30:00-05:00'), reminderMinutesBefore: 180,
        }]});
        assert.equal(s.scheduled.length, 2);
        assert.equal(s.scheduled[0].trigger.timestamp, at('2026-03-07T23:30:00-05:00'));
        assert.equal(s.scheduled[0].trigger.repeatFrequency, undefined);
        assert.equal(s.scheduled[1].trigger.timestamp, at(`${date}T00:30:00-04:00`));
        assert.equal(s.scheduled[1].trigger.repeatFrequency, repeat);
      }
    }
  } finally {
    Date.now = originalNow;
  }
});
