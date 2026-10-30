import test from "node:test";
import assert from "node:assert/strict";
import {
  workforceLocalTime,
  workforceInstant,
  workforceCalendarWindow
} from "./workforce-calendar-time";

test("calendar wall times remain in Asuncion regardless of device timezone", () => {
  for (const timezone of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
    const previous = process.env.TZ;
    try {
      process.env.TZ = timezone;
      assert.equal(
        workforceInstant("2026-11-01T09:00"),
        "2026-11-01T12:00:00.000Z"
      );
      assert.equal(
        workforceLocalTime("2026-11-01T12:00:00Z"),
        "2026-11-01T09:00"
      );
      assert.equal(
        workforceLocalTime("2026-11-01T01:00:00Z").slice(0, 10),
        "2026-10-31"
      );
      assert.deepEqual(workforceCalendarWindow("2026-10-31"), {
        from: "2026-10-31T03:00:00.000Z",
        to: "2026-12-01T03:00:00.000Z"
      });
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  }
});
test("invalid calendar dates and malformed inputs cannot roll into another day", () => {
  for (const value of [
    "2026-02-30T09:00",
    "2026-11-01T25:00",
    "",
    "2026-11-01T09:00Z"
  ])
    assert.throws(() => workforceInstant(value), /fecha y hora/);
});
