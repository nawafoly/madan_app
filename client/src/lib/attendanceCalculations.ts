import type { AttendanceRecord } from "@/lib/attendanceRecords";
import { isWeeklyOffDateKey, type WorkScheduleWeekday } from "@/lib/workSchedule";

const RIYADH_TIME_ZONE = "Asia/Riyadh";

export type ShiftSchedule = {
  startTime?: string | null;
  endTime?: string | null;
  weeklyOffDays?: WorkScheduleWeekday[] | string[] | null;
};

export type AttendanceDayComputation = {
  date: string;
  checkIn: AttendanceRecord | null;
  checkOut: AttendanceRecord | null;
  expectedHours: number;
  actualHours: number;
  lateHours: number;
  missingHours: number;
  overtimeHours: number;
  isComplete: boolean;
};

export type AttendancePayrollSummary = {
  expectedHours: number;
  actualHours: number;
  lateHours: number;
  missingHours: number;
  overtimeHours: number;
  completeDays: number;
  incompleteDays: number;
  days: AttendanceDayComputation[];
};

function roundHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100) / 100;
}

function parseTimeParts(value?: string | null) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return { hours, minutes };
}

function riyadhDateKey(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function buildRiyadhDateTimeMs(dateKey: string, time?: string | null) {
  const parts = parseTimeParts(time);
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!parts || !dateMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  return Date.UTC(year, month - 1, day, parts.hours - 3, parts.minutes, 0, 0);
}

export function getShiftExpectedHours(schedule: ShiftSchedule) {
  const startParts = parseTimeParts(schedule.startTime);
  const endParts = parseTimeParts(schedule.endTime);
  if (!startParts || !endParts) return 0;

  const startMinutes = startParts.hours * 60 + startParts.minutes;
  let endMinutes = endParts.hours * 60 + endParts.minutes;
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return roundHours((endMinutes - startMinutes) / 60);
}

export function computeAttendanceDay(
  date: string,
  records: AttendanceRecord[],
  schedule: ShiftSchedule
): AttendanceDayComputation {
  const sorted = [...records].sort(
    (left, right) =>
      Date.parse(left.serverTime || "") - Date.parse(right.serverTime || "")
  );
  const checkIn = sorted.find(record => record.type === "check_in") || null;
  const checkOut =
    [...sorted].reverse().find(record => record.type === "check_out") || null;
  const checkInMs = checkIn?.serverTime ? Date.parse(checkIn.serverTime) : NaN;
  const checkOutMs = checkOut?.serverTime ? Date.parse(checkOut.serverTime) : NaN;
  const scheduleStartMs = buildRiyadhDateTimeMs(date, schedule.startTime);
  let scheduleEndMs = buildRiyadhDateTimeMs(date, schedule.endTime);
  if (
    scheduleStartMs !== null &&
    scheduleEndMs !== null &&
    scheduleEndMs <= scheduleStartMs
  ) {
    scheduleEndMs += 24 * 60 * 60 * 1000;
  }

  const expectedHours = getShiftExpectedHours(schedule);
  const isComplete =
    Number.isFinite(checkInMs) &&
    Number.isFinite(checkOutMs) &&
    checkOutMs > checkInMs;
  const actualHours = isComplete
    ? roundHours((checkOutMs - checkInMs) / 3600000)
    : 0;
  const lateHours =
    Number.isFinite(checkInMs) &&
    scheduleStartMs !== null &&
    checkInMs > scheduleStartMs
      ? roundHours((checkInMs - scheduleStartMs) / 3600000)
      : 0;
  const overtimeHours =
    Number.isFinite(checkOutMs) &&
    scheduleEndMs !== null &&
    checkOutMs > scheduleEndMs
      ? roundHours((checkOutMs - scheduleEndMs) / 3600000)
      : 0;
  const missingHours = roundHours(Math.max(0, expectedHours - actualHours));

  return {
    date,
    checkIn,
    checkOut,
    expectedHours,
    actualHours,
    lateHours,
    missingHours,
    overtimeHours,
    isComplete,
  };
}

export function summarizeAttendanceForPayroll(
  records: AttendanceRecord[],
  schedule: ShiftSchedule
): AttendancePayrollSummary {
  const grouped = new Map<string, AttendanceRecord[]>();
  for (const record of records) {
    const date = riyadhDateKey(record.serverTime);
    if (!date) continue;
    const group = grouped.get(date) || [];
    group.push(record);
    grouped.set(date, group);
  }

  const days = Array.from(grouped.entries())
    .map(([date, dayRecords]) => computeAttendanceDay(date, dayRecords, schedule))
    .sort((left, right) => left.date.localeCompare(right.date));

  return days.reduce<AttendancePayrollSummary>(
    (summary, day) => {
      const countsAsWorkDay = !isWeeklyOffDateKey(
        day.date,
        schedule.weeklyOffDays
      );
      summary.expectedHours = roundHours(
        summary.expectedHours + (countsAsWorkDay ? day.expectedHours : 0)
      );
      summary.actualHours = roundHours(summary.actualHours + day.actualHours);
      summary.lateHours = roundHours(
        summary.lateHours + (countsAsWorkDay ? day.lateHours : 0)
      );
      summary.missingHours = roundHours(
        summary.missingHours + (countsAsWorkDay ? day.missingHours : 0)
      );
      summary.overtimeHours = roundHours(
        summary.overtimeHours + (countsAsWorkDay ? day.overtimeHours : 0)
      );
      summary.completeDays += day.isComplete ? 1 : 0;
      summary.incompleteDays += day.checkIn && !day.checkOut ? 1 : 0;
      summary.days.push(day);
      return summary;
    },
    {
      expectedHours: 0,
      actualHours: 0,
      lateHours: 0,
      missingHours: 0,
      overtimeHours: 0,
      completeDays: 0,
      incompleteDays: 0,
      days: [],
    }
  );
}
