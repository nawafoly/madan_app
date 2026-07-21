import { describe, expect, it } from "vitest";

import {
  buildActiveApprovedLeaveDateKeySet,
  getActiveApprovedLeaveDateKeys,
  normalizeEmployeeLeaveRequest,
  normalizeLeaveCancelledDateKeys,
} from "@/lib/employeeLeave";

describe("employee leave cancellation helpers", () => {
  it("excludes only the cancelled day from a multi-day approved leave", () => {
    expect(
      getActiveApprovedLeaveDateKeys({
        status: "approved",
        startDate: "2026-07-20",
        endDate: "2026-07-22",
        cancelledDateKeys: ["2026-07-21"],
      })
    ).toEqual(["2026-07-20", "2026-07-22"]);
  });

  it("does not expose any dates for a fully cancelled leave request", () => {
    expect(
      getActiveApprovedLeaveDateKeys({
        status: "cancelled",
        startDate: "2026-07-21",
        endDate: "2026-07-21",
        cancelledDateKeys: ["2026-07-21"],
      })
    ).toEqual([]);
  });

  it("deduplicates cancelled dates and ignores invalid values", () => {
    expect(
      normalizeLeaveCancelledDateKeys([
        "2026-07-21",
        "2026-07-21",
        "invalid",
        null,
      ])
    ).toEqual(["2026-07-21"]);
  });

  it("combines active dates from multiple requests without duplicates", () => {
    expect(
      Array.from(
        buildActiveApprovedLeaveDateKeySet([
          {
            status: "approved",
            startDate: "2026-07-20",
            endDate: "2026-07-21",
            cancelledDateKeys: ["2026-07-21"],
          },
          {
            status: "approved",
            startDate: "2026-07-20",
            endDate: "2026-07-22",
            cancelledDateKeys: ["2026-07-20"],
          },
        ])
      ).sort()
    ).toEqual(["2026-07-20", "2026-07-21", "2026-07-22"]);
  });

  it("preserves zero active days on a fully cancelled normalized request", () => {
    const request = normalizeEmployeeLeaveRequest("leave-1", {
      employeeUid: "employee-1",
      userId: "employee-1",
      status: "cancelled",
      leaveType: "emergency",
      startDate: "2026-07-21",
      endDate: "2026-07-21",
      daysCount: 0,
      cancelledDateKeys: ["2026-07-21"],
    });

    expect(request.daysCount).toBe(0);
    expect(request.cancelledDateKeys).toEqual(["2026-07-21"]);
  });
});
