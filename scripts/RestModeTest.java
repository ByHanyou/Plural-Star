package app.notifee.core;

import java.time.ZonedDateTime;
import java.time.Instant;
import java.time.ZoneId;
import java.util.TimeZone;

// Run with RestMode.java from the patched notification package on the classpath.
class RestModeTest {
  private static long at(String value) {
    return ZonedDateTime.parse(value + "[America/New_York]").toInstant().toEpochMilli();
  }

  private static void check(long actual, long expected) {
    if (actual != expected) throw new AssertionError(actual + " != " + expected);
  }

  private static boolean restingAt(int start, int end, long timestamp, ZoneId zone) {
    ZonedDateTime date = Instant.ofEpochMilli(timestamp).atZone(zone);
    int minute = date.getHour() * 60 + date.getMinute();
    return start < end ? minute >= start && minute < end : minute >= start || minute < end;
  }

  private static void checkTransitionMatrix() {
    String[][] fixtures = {
        {"America/New_York", "2026-03-08T05:00:00Z"},
        {"America/New_York", "2026-11-01T04:00:00Z"},
        {"Europe/Berlin", "2026-03-28T23:00:00Z"},
        {"Europe/Berlin", "2026-10-24T22:00:00Z"},
        {"Australia/Lord_Howe", "2026-10-03T13:30:00Z"},
        {"Australia/Lord_Howe", "2026-04-04T13:00:00Z"},
        {"Asia/Kathmandu", "2026-03-07T18:15:00Z"},
        {"UTC", "2026-03-08T00:00:00Z"},
    };
    int[][] windows = {{1320, 150}, {1320, 105}, {75, 150}, {150, 165}, {150, 240}, {540, 1020}};
    try {
      for (String[] fixture : fixtures) {
        ZoneId zone = ZoneId.of(fixture[0]);
        TimeZone.setDefault(TimeZone.getTimeZone(zone));
        for (int[] window : windows) {
          for (int hour = 0; hour < 6; hour++) {
            long now = Instant.parse(fixture[1]).toEpochMilli() + hour * 3600000L + 12345;
            long expected = -1;
            if (!restingAt(window[0], window[1], now, zone)) {
              long boundary = now / 60000 * 60000 + 60000;
              long limit = now + 3 * 86400000L;
              while (boundary < limit && !restingAt(window[0], window[1], boundary, zone)) boundary += 60000;
              if (boundary >= limit) throw new AssertionError("No rest in test horizon");
              expected = boundary - now;
            }
            check(RestMode.untilStart(window[0], window[1], now), expected);
          }
        }
      }
    } finally {
      TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"));
    }
  }

  public static void main(String[] args) {
    TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"));
    check(RestMode.untilStart(1320, 480, at("2026-10-25T21:59:00-04:00")), 60000);
    check(RestMode.untilStart(1320, 480, at("2026-10-25T22:00:00-04:00")), -1);
    check(RestMode.untilStart(1320, 480, at("2026-10-26T00:00:00-04:00")), -1);
    check(RestMode.untilStart(1320, 480, at("2026-10-26T07:59:00-04:00")), -1);
    check(RestMode.untilStart(1320, 480, at("2026-10-26T08:00:00-04:00")), 14 * 3600000L);
    check(RestMode.untilStart(540, 1020, at("2026-10-25T09:00:00-04:00")), -1);
    check(RestMode.untilStart(540, 1020, at("2026-10-25T17:00:00-04:00")), 16 * 3600000L);
    check(RestMode.untilStart(540, 1020, at("2026-03-07T17:00:00-05:00")), 15 * 3600000L);
    check(RestMode.untilStart(540, 1020, at("2026-10-31T17:00:00-04:00")), 17 * 3600000L);
    // Both passes through 01:00 must expire at the next 01:30, not Calendar's default.
    for (String offset : new String[] {"-04:00", "-05:00"}) {
      check(RestMode.untilStart(90, 105, at("2026-11-01T01:15:00" + offset)), 15 * 60000L);
      check(RestMode.untilStart(90, 105, at("2026-11-01T01:15:20.500" + offset)), 879500);
      check(RestMode.untilStart(90, 105, at("2026-11-01T01:30:00" + offset)), -1);
      check(RestMode.untilStart(90, 105, at("2026-11-01T01:35:00" + offset)), -1);
    }
    // After the first rest period, the second start is still ahead on the same date.
    check(RestMode.untilStart(90, 105, at("2026-11-01T01:45:00-04:00")), 45 * 60000L);
    check(RestMode.untilStart(90, 105, at("2026-11-01T01:50:00-04:00")), 40 * 60000L);
    check(RestMode.untilStart(90, 105, at("2026-11-01T01:45:00-05:00")),
        at("2026-11-02T01:30:00-05:00") - at("2026-11-01T01:45:00-05:00"));
    // Resolve tomorrow's repeated start to its first occurrence as well.
    check(RestMode.untilStart(90, 105, at("2026-10-31T23:00:00-04:00")), 150 * 60000L);
    // A start skipped by spring-forward must not become a new boundary later that morning.
    check(RestMode.untilStart(150, 165, at("2026-03-08T03:15:00-04:00")),
        at("2026-03-09T02:30:00-04:00") - at("2026-03-08T03:15:00-04:00"));
    // A skipped 02:30 start becomes active at the jump to 03:00, not at 03:30.
    check(RestMode.untilStart(150, 240, at("2026-03-08T01:30:00-05:00")), 30 * 60000L);
    check(RestMode.untilStart(150, 240, at("2026-03-07T23:00:00-05:00")), 3 * 3600000L);
    check(RestMode.untilStart(150, 240, at("2026-03-08T01:59:20.500-05:00")), 39500);
    check(RestMode.untilStart(150, 240, at("2026-03-08T01:59:59.999-05:00")), 1);
    check(RestMode.untilStart(150, 240, at("2026-03-08T03:00:00-04:00")), -1);
    check(RestMode.untilStart(150, 240, at("2026-03-08T03:59:59.999-04:00")), -1);
    check(RestMode.untilStart(150, 240, at("2026-03-08T04:00:00-04:00")),
        at("2026-03-09T02:30:00-04:00") - at("2026-03-08T04:00:00-04:00"));
    check(RestMode.untilStart(150, 195, at("2026-03-08T01:30:00-05:00")), 30 * 60000L);
    check(RestMode.untilStart(150, 60, at("2026-03-08T01:30:00-05:00")), 30 * 60000L);
    // If the entire rest window is skipped, wait until tomorrow's real start.
    for (int end : new int[] {165, 180}) {
      check(RestMode.untilStart(150, end, at("2026-03-08T01:30:00-05:00")),
          at("2026-03-09T02:30:00-04:00") - at("2026-03-08T01:30:00-05:00"));
    }
    // A real 03:30 start must not be pulled back to the clock jump.
    check(RestMode.untilStart(210, 240, at("2026-03-08T01:30:00-05:00")), 60 * 60000L);
    // A rollback can also re-enter overnight rest at the clock jump itself.
    check(RestMode.untilStart(1320, 105, at("2026-11-01T01:50:00-04:00")), 10 * 60000L);
    // The same rule applies to a half-hour clock jump.
    TimeZone.setDefault(TimeZone.getTimeZone("Australia/Lord_Howe"));
    long beforeHalfHourJump = ZonedDateTime.parse("2026-10-04T01:45:00+10:30[Australia/Lord_Howe]")
        .toInstant().toEpochMilli();
    check(RestMode.untilStart(135, 180, beforeHalfHourJump), 15 * 60000L);
    check(RestMode.untilStart(125, 135, beforeHalfHourJump),
        ZonedDateTime.parse("2026-10-05T02:05:00+11:00[Australia/Lord_Howe]")
            .toInstant().toEpochMilli() - beforeHalfHourJump);
    TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"));
    check(RestMode.untilStart(-1, 480, System.currentTimeMillis()), -1);
    check(RestMode.untilStart(1320, 1320, System.currentTimeMillis()), -1);
    checkTransitionMatrix();
    System.out.println("Native rest schedule checks passed");
  }
}
