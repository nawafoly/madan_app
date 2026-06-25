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
      "2024-01-03",
      [
        record("check_in", "2024-01-03T05:45:00.000Z"),
        record("check_out", "2024-01-03T15:00:00.000Z"),
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
      "2024-01-03",
      [record("check_in", "2024-01-03T11:25:00.000Z")],
      { startTime: "09:00", endTime: "17:00" }
    );

    expect(day.isComplete).toBe(false);
    expect(day.lateHours).toBe(5.42);
    expect(day.actualHours).toBe(0);
  });

  it("summarizes monthly attendance records", () => {
    const summary = summarizeAttendanceForPayroll(
      [
        record("check_in", "2024-01-03T05:30:00.000Z"),
        record("check_out", "2024-01-03T14:30:00.000Z"),
        record("check_in", "2024-01-04T06:30:00.000Z"),
        record("check_out", "2024-01-04T13:30:00.000Z"),
      ],
      { startTime: "08:30", endTime: "17:30" }
    );

    expect(summary.completeDays).toBe(2);
    expect(summary.expectedHours).toBe(18);
    expect(summary.actualHours).toBe(16);
    expect(summary.lateHours).toBe(1);
    expect(summary.missingHours).toBe(2);
  });

  it("excludes weekly off days from payroll shortage totals", () => {
    const summary = summarizeAttendanceForPayroll(
      [
        record("check_in", "2024-01-05T07:00:00.000Z"),
        record("check_out", "2024-01-05T08:00:00.000Z"),
      ],
      {
        startTime: "09:00",
        endTime: "17:00",
        weeklyOffDays: ["friday"],
      }
    );

    expect(summary.actualHours).toBe(1);
    expect(summary.expectedHours).toBe(0);
    expect(summary.missingHours).toBe(0);
    expect(summary.lateHours).toBe(0);
  });

  it("counts absent work days from the same status logic used by the calendar", () => {
    const summary = summarizeAttendanceForPayroll(
      [
        record("check_in", "2024-01-03T06:00:00.000Z"),
        record("check_out", "2024-01-03T14:00:00.000Z"),
      ],
      {
        startTime: "09:00",
        endTime: "17:00",
        weeklyOffDays: ["friday"],
      },
      {
        workDateKeys: ["2024-01-03", "2024-01-04", "2024-01-05", "2024-01-06"],
        todayDateKey: "2024-01-07",
        approvedLeaveDateKeys: ["2024-01-06"],
      }
    );

    expect(summary.absentDays).toBe(1);
    expect(summary.absentDateKeys).toEqual(["2024-01-04"]);
  });

  it("lets manual absence override attendance records for payroll", () => {
    const summary = summarizeAttendanceForPayroll(
      [
        record("check_in", "2024-06-17T06:00:00.000Z"),
        record("check_out", "2024-06-17T14:00:00.000Z"),
      ],
      { startTime: "09:00", endTime: "17:00" },
      {
        workDateKeys: ["2024-06-17"],
        todayDateKey: "2024-06-18",
        absenceDateKeys: ["2024-06-17"],
      }
    );

    expect(summary.absentDays).toBe(1);
    expect(summary.absentDateKeys).toEqual(["2024-06-17"]);
    expect(summary.actualHours).toBe(0);
    expect(summary.lateHours).toBe(0);
    expect(summary.missingHours).toBe(0);
    expect(summary.overtimeHours).toBe(0);
    expect(summary.completeDays).toBe(0);
  });
});
