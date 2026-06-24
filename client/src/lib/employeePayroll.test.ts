import { describe, expect, it } from "vitest";

import { computeEmployeePayroll } from "./employeePayroll";

describe("employee payroll calculations", () => {
  it("uses monthly scheduled hours for the hourly rate and attendance hours for missing time", () => {
    const result = computeEmployeePayroll({
      baseSalary: 5500,
      expectedWorkDays: 30,
      expectedWorkHours: 240,
      attendanceMissingHours: 21.99,
      insuranceDeduction: 487.5,
    });

    expect(result.hourlyRate).toBeCloseTo(22.9167, 4);
    expect(result.missingHours).toBeCloseTo(21.99, 2);
    expect(result.delayDeduction).toBeCloseTo(503.94, 2);
    expect(result.grossSalary).toBeCloseTo(4996.06, 2);
    expect(result.finalSalary).toBeCloseTo(4508.56, 2);
  });

  it("keeps no-show days out of the hourly shortage calculation", () => {
    const result = computeEmployeePayroll({
      baseSalary: 5500,
      expectedWorkDays: 30,
      expectedWorkHours: 240,
      attendanceAbsentDays: 27,
      attendanceMissingHours: 21.99,
    });

    expect(result.attendanceAbsentDays).toBe(27);
    expect(result.attendanceAbsenceDeduction).toBeCloseTo(4950, 2);
    expect(result.delayDeduction).toBeCloseTo(503.94, 2);
    expect(result.finalSalary).toBeCloseTo(46.06, 2);
  });

  it("deducts full no-show days even when there is no attended-day shortage", () => {
    const result = computeEmployeePayroll({
      baseSalary: 5500,
      expectedWorkDays: 30,
      expectedWorkHours: 240,
      attendanceAbsentDays: 27,
      attendanceMissingHours: 0,
      attendanceOvertimeHours: 0,
    });

    expect(result.attendanceAbsenceDeduction).toBeCloseTo(4950, 2);
    expect(result.delayDeduction).toBe(0);
    expect(result.finalSalary).toBeCloseTo(550, 2);
  });
});
