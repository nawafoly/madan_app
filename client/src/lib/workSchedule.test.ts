import { describe, expect, it } from "vitest";

import {
  buildWorkDateKeysInRange,
  formatWeeklyOffDaysLabel,
  isWeeklyOffDateKey,
  normalizeWeeklyOffDays,
} from "./workSchedule";

describe("work schedule helpers", () => {
  it("normalizes weekly off days from saved employee schedules", () => {
    expect(normalizeWeeklyOffDays(["friday", "saturday", "invalid"])).toEqual([
      "friday",
      "saturday",
    ]);
    expect(formatWeeklyOffDaysLabel(["friday", "saturday"])).toBe(
      "الجمعة، السبت"
    );
  });

  it("detects weekly off dates by date key", () => {
    expect(isWeeklyOffDateKey("2026-06-26", ["friday"])).toBe(true);
    expect(isWeeklyOffDateKey("2026-06-25", ["friday"])).toBe(false);
  });

  it("builds work dates after excluding weekly off days and approved leave dates", () => {
    expect(
      buildWorkDateKeysInRange({
        fromDate: "2026-06-25",
        toDate: "2026-06-29",
        weeklyOffDays: ["friday", "saturday"],
        excludedDateKeys: ["2026-06-28"],
      })
    ).toEqual(["2026-06-25", "2026-06-29"]);
  });
});
