package app.notifee.core;

import java.time.ZonedDateTime;
import java.util.TimeZone;

// Run with RestMode.java from the patched notification package on the classpath.
class RestModeTest {
  private static long at(String value) {
    return ZonedDateTime.parse(value + "[America/New_York]").toInstant().toEpochMilli();
  }

  private static void check(long actual, long expected) {
    if (actual != expected) throw new AssertionError(actual + " != " + expected);
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
    check(RestMode.untilStart(-1, 480, System.currentTimeMillis()), -1);
    check(RestMode.untilStart(1320, 1320, System.currentTimeMillis()), -1);
    System.out.println("Native rest schedule checks passed");
  }
}
