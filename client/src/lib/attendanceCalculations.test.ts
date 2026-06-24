import { describe, expect, it } from "vitest";

import {
  computeAttendanceDay,
  getShiftExpectedHours,
  summarizeAttendanceForPayroll,
} from "./attendanceCalculations";
import type { AttendanceRecord } from "./attendanceRecords";

function record(
  type: AttendanceRecord["type"],
  serverTime: string
): AttendanceRecord {
  return {
    id: `${type}-${serverTime}`,
    employeeUid: "employee-1",
    employeeDocId: "employee-doc-1",
    employeeName: null,
    type,
    result: "allowed",
    serverTime,
    clientTime: null,
    location: { lat: 24.7136, lng: 46.6753, accuracy: 10 },
    zoneId: null,
    zoneName: null,
    zoneType: null,
    distanceMeters: null,
    rejectionReason: null,
    accuracyAccepted: true,
    deviceInfo: {},
    createdByEmail: null,
    createdByRole: null,
  };
}

describe("attendance payroll calculations", () => {
  it("calculates expected hours for a same-day shift", () => {
    expect(getShiftExpectedHours({ startTime: "08:30", endTime: "17:30" })).toBe(9);
  });

  it("calculates late, missing, and overtime hours for one day", () => {
    const day = computeAttendanceDay(
      "2026-06-24",
      [
        record("check_in", "2026-06-24T05:45:00.000Z"),
        record("check_out", "2026-06-24T15:00:00.000Z"),
      ],
      { startTime: "08:30", endTime: "17:30" }
    );

    expect(day.expectedHours).toBe(9);
    expect(day.actualHours).toBe(9.25);
    expect(day.lateHours).toBe(0.25);
    expect(day.overtimeHours).toBe(0.5);
    expect(day.missingHours).toBe(0);
  });

  it("calculates late arrival from shift start even when checkout is missing", () => {
    const day = computeAttendanceDay(
      "2026-06-24",
      [record("check_in", "2026-06-24T11:25:00.000Z")],
      { startTime: "09:00", endTime: "17:00" }
    );

    expect(day.isComplete).toBe(false);
    expect(day.lateHours).toBe(5.42);
    expect(day.actualHours).toBe(0);
  });

  it("summarizes monthly attendance records", () => {
    const summary = summarizeAttendanceForPayroll(
      [
        record("check_in", "2026-06-24T05:30:00.000Z"),
        record("check_out", "2026-06-24T14:30:00.000Z"),
        record("check_in", "2026-06-25T06:30:00.000Z"),
        record("check_out", "2026-06-25T13:30:00.000Z"),
      ],
      { startTime: "08:30", endTime: "17:30" }
    );

    expect(summary.completeDays).toBe(2);
    expect(summary.expectedHours).toBe(18);
    expect(summary.actualHours).toBe(16);
    expect(summary.lateHours).toBe(1);
    expect(summary.missingHours).toBe(2);
  });
});
