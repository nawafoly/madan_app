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
    expect(isWeeklyOffDateKey("2024-01-05", ["friday"])).toBe(true);
    expect(isWeeklyOffDateKey("2024-01-04", ["friday"])).toBe(false);
  });

  it("builds work dates after excluding weekly off days and approved leave dates", () => {
    expect(
      buildWorkDateKeysInRange({
        fromDate: "2024-01-04",
        toDate: "2024-01-08",
        weeklyOffDays: ["friday", "saturday"],
        excludedDateKeys: ["2024-01-07"],
      })
    ).toEqual(["2024-01-04", "2024-01-08"]);
  });
});
