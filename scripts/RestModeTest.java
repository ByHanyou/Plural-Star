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
    check(RestMode.untilStart(-1, 480, System.currentTimeMillis()), -1);
    check(RestMode.untilStart(1320, 1320, System.currentTimeMillis()), -1);
    System.out.println("Native rest schedule checks passed");
  }
}
