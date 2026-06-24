import { describe, expect, it } from "vitest";

// @ts-expect-error The production Worker is plain JavaScript by design.
import * as attendanceWorker from "../workers/attendance-worker.js";

const {
  calculateDistanceMeters,
  evaluateAttendanceZones,
  evaluateDeviceChange,
  evaluateLocationDecision,
  evaluateStateTransition,
  parseAttendanceRecordsQuery,
  parseRiyadhDateBoundary,
} = attendanceWorker;

const center = { lat: 24.7136, lng: 46.6753 };
const zone = {
  id: "riyadh-office",
  name: "Riyadh office",
  type: "radius",
  center,
  radiusMeters: 100,
  active: true,
};

describe("attendance location validation", () => {
  it("accepts an accurate location inside the assigned zone", () => {
    const location = { ...center, accuracy: 15 };
    const zoneCheck = evaluateAttendanceZones(location, [zone]);
    expect(
      evaluateLocationDecision({ location, zoneError: "", zoneCheck })
    ).toEqual({
      result: "allowed",
      rejectionReason: null,
    });
  });

  it("rejects a location outside the assigned zone", () => {
    const location = { lat: 24.72, lng: 46.69, accuracy: 15 };
    const zoneCheck = evaluateAttendanceZones(location, [zone]);
    expect(zoneCheck.withinZone).toBe(false);
    expect(
      evaluateLocationDecision({ location, zoneError: "", zoneCheck })
        .rejectionReason
    ).toBe("outside_zone");
  });

  it("prioritizes outside zone over weak accuracy when the employee is clearly far away", () => {
    const location = { lat: 24.809, lng: 46.6753, accuracy: 109 };
    const zoneCheck = evaluateAttendanceZones(location, [zone]);
    expect(zoneCheck.withinZone).toBe(false);
    expect(zoneCheck.distanceMeters).toBeGreaterThan(10_000);
    expect(
      evaluateLocationDecision({ location, zoneError: "", zoneCheck })
        .rejectionReason
    ).toBe("outside_zone");
  });

  it("rejects GPS accuracy greater than 100 meters", () => {
    const location = { ...center, accuracy: 101 };
    const zoneCheck = evaluateAttendanceZones(location, [zone]);
    expect(
      evaluateLocationDecision({ location, zoneError: "", zoneCheck })
        .rejectionReason
    ).toBe("poor_accuracy");
  });

  it("rejects an employee without allowed zones", () => {
    const location = { ...center, accuracy: 10 };
    const zoneCheck = evaluateAttendanceZones(location, []);
    expect(zoneCheck.withinZone).toBe(false);
    expect(
      evaluateLocationDecision({
        location,
        zoneError: "zone_not_found",
        zoneCheck,
      }).rejectionReason
    ).toBe("zone_not_found");
  });

  it("calculates a zero distance for identical coordinates", () => {
    expect(calculateDistanceMeters(center, center)).toBe(0);
  });
});

describe("attendance state transitions", () => {
  it("allows check-in from checked-out state", () => {
    expect(evaluateStateTransition("check_in", "checked_out")).toMatchObject({
      result: "allowed",
      currentStatus: "checked_in",
    });
  });

  it("allows check-out from checked-in state", () => {
    expect(evaluateStateTransition("check_out", "checked_in")).toMatchObject({
      result: "allowed",
      currentStatus: "checked_out",
    });
  });

  it("rejects duplicate check-in", () => {
    expect(
      evaluateStateTransition("check_in", "checked_in").rejectionReason
    ).toBe("duplicate_check_in");
  });

  it("rejects check-out without check-in", () => {
    expect(evaluateStateTransition("check_out", null).rejectionReason).toBe(
      "not_checked_in"
    );
  });

  it("allows a new check-in when the previous open check-in is from another day", () => {
    expect(
      evaluateStateTransition("check_in", "checked_in", {
        lastServerTime: "2026-06-22T10:00:00.000Z",
        dayBounds: {
          start: parseRiyadhDateBoundary("2026-06-23", false),
          end: parseRiyadhDateBoundary("2026-06-23", true),
        },
      })
    ).toMatchObject({
      result: "allowed",
      currentStatus: "checked_in",
    });
  });

  it("rejects check-out when the only open check-in is from another day", () => {
    expect(
      evaluateStateTransition("check_out", "checked_in", {
        lastServerTime: "2026-06-22T10:00:00.000Z",
        dayBounds: {
          start: parseRiyadhDateBoundary("2026-06-23", false),
          end: parseRiyadhDateBoundary("2026-06-23", true),
        },
      }).rejectionReason
    ).toBe("not_checked_in");
  });
});

describe("attendance device tracking", () => {
  it("does not flag the same browser device", () => {
    expect(evaluateDeviceChange("device-a", "device-a")).toEqual({
      deviceChanged: false,
      previousDeviceId: null,
    });
  });

  it("flags a different browser device", () => {
    expect(evaluateDeviceChange("device-b", "device-a")).toEqual({
      deviceChanged: true,
      previousDeviceId: "device-a",
    });
  });

  it("does not flag the first known device", () => {
    expect(evaluateDeviceChange("device-a", null)).toEqual({
      deviceChanged: false,
      previousDeviceId: null,
    });
  });
});

describe("attendance records query", () => {
  it("parses supported filters and clamps the limit", () => {
    const params = new URLSearchParams({
      employeeUid: "employee-1",
      fromDate: "2026-06-22",
      toDate: "2026-06-23",
      result: "allowed",
      type: "check_in",
      deviceChanged: "true",
      limit: "999",
      page: "2",
    });
    const parsed = parseAttendanceRecordsQuery(params);
    expect(parsed.ok).toBe(true);
    expect(parsed.value).toMatchObject({ limit: 200, page: 2, offset: 200 });
    expect(parsed.value.bindings).toContain("employee-1");
  });

  it("rejects unsupported result values", () => {
    const parsed = parseAttendanceRecordsQuery(
      new URLSearchParams({ result: "pending" })
    );
    expect(parsed.ok).toBe(false);
    expect(parsed.response.status).toBe(400);
  });

  it("converts a Riyadh day boundary to UTC", () => {
    expect(parseRiyadhDateBoundary("2026-06-22", false)).toBe(
      "2026-06-21T21:00:00.000Z"
    );
    expect(parseRiyadhDateBoundary("2026-06-22", true)).toBe(
      "2026-06-22T21:00:00.000Z"
    );
  });
});
