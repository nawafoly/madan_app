import {
  buildWorkbookXlsx,
  type XlsxColumn,
  type XlsxRow,
} from "@/lib/xlsxStore";
import {
  getEmployeeAbsenceDaysValue,
  getEmployeeAbsenceTypeLabel,
  type EmployeeAbsenceRecord,
} from "@/lib/employeeAbsence";
import {
  formatEmployeePayrollMonthLabel,
  parseEmployeePayrollMonth,
  type EmployeePayrollRecord,
} from "@/lib/employeePayroll";
import {
  formatLeaveDateInput,
  getLeaveStatusMeta,
  getLeaveTypeLabel,
  type EmployeeLeaveRequestRecord,
} from "@/lib/employeeLeave";
import type { EmployeeFileRecord } from "@/lib/employeeFiles";
import type { AttendanceRecord } from "@/lib/attendanceRecords";
import {
  EMPLOYEE_EMPTY_VALUE,
  type EmployeeProfileUserDoc,
  type EmployeeProfileViewModel,
} from "@/lib/employeeProfile";
import { formatDateEN, formatDateTimeEN } from "@/lib/formatters";

type EmployeeExcelReportInput = {
  employee: EmployeeProfileUserDoc & { id?: string | null };
  profile: EmployeeProfileViewModel;
  payrollRecords: EmployeePayrollRecord[];
  payrollRecord?: EmployeePayrollRecord | null;
  attendanceRecords?: AttendanceRecord[];
  absences: EmployeeAbsenceRecord[];
  leaveRequests: EmployeeLeaveRequestRecord[];
  files: EmployeeFileRecord[];
  reportMonth: string;
};

type EmployeeExcelReportResult = {
  blob: Blob;
  fileName: string;
};

type DailyAttendanceAnalysis = {
  dateKey: string;
  dayLabel: string;
  status: string;
  firstCheckIn: string;
  lastCheckOut: string;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  shortageMinutes: number;
  zoneNames: string;
  rejectedCount: number;
  notes: string;
};

const RIYADH_TIME_ZONE = "Asia/Riyadh";

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (
      text &&
      text !== EMPLOYEE_EMPTY_VALUE &&
      text !== "undefined" &&
      text !== "null"
    ) {
      return text;
    }
  }
  return "";
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: unknown, fractionDigits = 3) {
  const factor = 10 ** fractionDigits;
  return Math.round(toNumber(value) * factor) / factor;
}

function safeFileName(value: string) {
  return String(value || "employee")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 100);
}

function getEmployment(employee: EmployeeExcelReportInput["employee"]) {
  return (employee.employeeProfile?.employment ||
    employee.employment ||
    {}) as Record<string, any>;
}

function getPayrollRecord(
  input: EmployeeExcelReportInput,
  reportMonth: string,
) {
  if (input.payrollRecord?.payrollMonth === reportMonth) {
    return input.payrollRecord;
  }

  return (
    input.payrollRecords.find(
      (record) => record.payrollMonth === reportMonth,
    ) ||
    input.payrollRecord ||
    input.payrollRecords[0] ||
    null
  );
}

function buildSheet(
  name: string,
  columns: XlsxColumn[],
  rows: XlsxRow[],
  options: {
    title: string;
    subtitle: string;
    headerTone: "navy" | "teal" | "amber" | "emerald" | "slate";
    tabColor: string;
    mergeRanges?: string[];
  },
) {
  return {
    name,
    title: options.title,
    subtitle: options.subtitle,
    headerTone: options.headerTone,
    tabColor: options.tabColor,
    zoomScale: 115,
    mergeRanges: options.mergeRanges,
    columns,
    rows: rows.length
      ? rows
      : [
          columns.reduce<XlsxRow>((row, column, index) => {
            row[column.key] = index === 0 ? "لا توجد بيانات" : "";
            return row;
          }, {}),
        ],
    freezeHeader: true,
    rightToLeft: true,
  };
}

function buildDateKeysInRange(fromDate: string, toDate: string) {
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromDate);
  const endMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toDate);
  if (!startMatch || !endMatch) return [];

  const start = new Date(
    Date.UTC(
      Number(startMatch[1]),
      Number(startMatch[2]) - 1,
      Number(startMatch[3]),
    ),
  );
  const end = new Date(
    Date.UTC(Number(endMatch[1]), Number(endMatch[2]) - 1, Number(endMatch[3])),
  );
  if (start.getTime() > end.getTime()) return [];

  const rows: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    rows.push(
      `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(
        cursor.getUTCDate(),
      ).padStart(2, "0")}`,
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

function dateKeyToUtcDate(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
}

function formatDateKey(dateKey: string) {
  const date = dateKeyToUtcDate(dateKey);
  if (!date) return dateKey;
  return new Intl.DateTimeFormat("en-GB", {
    calendar: "gregory",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function formatDayLabel(dateKey: string) {
  const date = dateKeyToUtcDate(dateKey);
  if (!date) return "";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
}

function getDateKeyDayIndex(dateKey: string) {
  return dateKeyToUtcDate(dateKey)?.getUTCDay() ?? -1;
}

function normalizeDayToken(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, "_");
}

function isWeeklyOffDay(dateKey: string, weeklyOffDays: unknown[]) {
  const dayIndex = getDateKeyDayIndex(dateKey);
  if (dayIndex < 0) return false;

  const aliases: string[][] = [
    ["sunday", "sun", "0", "الاحد", "الأحد"],
    ["monday", "mon", "1", "الاثنين", "الإثنين"],
    ["tuesday", "tue", "2", "الثلاثاء"],
    ["wednesday", "wed", "3", "الاربعاء", "الأربعاء"],
    ["thursday", "thu", "4", "الخميس"],
    ["friday", "fri", "5", "الجمعه", "الجمعة"],
    ["saturday", "sat", "6", "السبت"],
  ].map((group) => group.map(normalizeDayToken));

  const selected = new Set((weeklyOffDays || []).map(normalizeDayToken));
  return aliases[dayIndex].some((alias) => selected.has(alias));
}

function getRiyadhDateParts(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return {
    date,
    dateKey: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function formatRiyadhDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat("en-GB", {
    calendar: "gregory",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: RIYADH_TIME_ZONE,
  }).format(date);
}

function formatRiyadhTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: RIYADH_TIME_ZONE,
  }).format(date);
}

function parseTimeMinutes(value: unknown) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(value || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours < 0 || hours > 23) return null;
  return hours * 60 + Number(match[2]);
}

function formatMinutesAsHours(minutes: number) {
  return round(Math.max(0, minutes) / 60, 2);
}

function getRecordTimestamp(record: AttendanceRecord) {
  const date = new Date(record.serverTime);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function calculateWorkedMinutes(records: AttendanceRecord[]) {
  const accepted = records
    .filter((record) => record.result === "allowed")
    .sort(
      (left, right) => getRecordTimestamp(left) - getRecordTimestamp(right),
    );

  let openCheckIn: AttendanceRecord | null = null;
  let totalMinutes = 0;

  for (const record of accepted) {
    if (record.type === "check_in") {
      openCheckIn = record;
      continue;
    }

    if (record.type === "check_out" && openCheckIn) {
      const milliseconds =
        getRecordTimestamp(record) - getRecordTimestamp(openCheckIn);
      if (milliseconds > 0) {
        totalMinutes += milliseconds / 60000;
      }
      openCheckIn = null;
    }
  }

  return Math.max(0, Math.round(totalMinutes));
}

function buildApprovedLeaveMap(
  requests: EmployeeLeaveRequestRecord[],
  monthStart: string,
  monthEnd: string,
) {
  const map = new Map<string, EmployeeLeaveRequestRecord>();

  requests
    .filter(
      (request) =>
        String(request.status || "")
          .trim()
          .toLowerCase() === "approved",
    )
    .forEach((request) => {
      const startDate = formatLeaveDateInput(request.startDate);
      const endDate = formatLeaveDateInput(
        request.endDate || request.startDate,
      );
      if (!startDate || !endDate) return;

      const boundedStart = startDate < monthStart ? monthStart : startDate;
      const boundedEnd = endDate > monthEnd ? monthEnd : endDate;
      buildDateKeysInRange(boundedStart, boundedEnd).forEach((dateKey) => {
        if (!map.has(dateKey)) map.set(dateKey, request);
      });
    });

  return map;
}

function buildAbsenceMap(
  absences: EmployeeAbsenceRecord[],
  monthStart: string,
  monthEnd: string,
) {
  const map = new Map<string, EmployeeAbsenceRecord[]>();
  absences
    .filter((absence) => absence.date >= monthStart && absence.date <= monthEnd)
    .forEach((absence) => {
      const current = map.get(absence.date) || [];
      current.push(absence);
      map.set(absence.date, current);
    });
  return map;
}

function buildDailyAttendanceRows(input: {
  attendanceRecords?: AttendanceRecord[];
  absences: EmployeeAbsenceRecord[];
  leaveRequests: EmployeeLeaveRequestRecord[];
  monthStart: string;
  monthEnd: string;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  weeklyOffDays: unknown[];
}) {
  const hasAttendancePayload = Array.isArray(input.attendanceRecords);
  const records = input.attendanceRecords || [];
  const recordGroups = new Map<string, AttendanceRecord[]>();

  records.forEach((record) => {
    const parts = getRiyadhDateParts(record.serverTime);
    if (!parts) return;
    const current = recordGroups.get(parts.dateKey) || [];
    current.push(record);
    recordGroups.set(parts.dateKey, current);
  });

  const absenceMap = buildAbsenceMap(
    input.absences,
    input.monthStart,
    input.monthEnd,
  );
  const approvedLeaveMap = buildApprovedLeaveMap(
    input.leaveRequests,
    input.monthStart,
    input.monthEnd,
  );
  const shiftStartMinutes = parseTimeMinutes(input.shiftStartTime);
  const rawShiftEndMinutes = parseTimeMinutes(input.shiftEndTime);
  const shiftEndMinutes =
    shiftStartMinutes !== null &&
    rawShiftEndMinutes !== null &&
    rawShiftEndMinutes <= shiftStartMinutes
      ? rawShiftEndMinutes + 24 * 60
      : rawShiftEndMinutes;

  return buildDateKeysInRange(
    input.monthStart,
    input.monthEnd,
  ).map<DailyAttendanceAnalysis>((dateKey) => {
    const dayRecords = (recordGroups.get(dateKey) || []).sort(
      (left, right) => getRecordTimestamp(left) - getRecordTimestamp(right),
    );
    const allowedRecords = dayRecords.filter(
      (record) => record.result === "allowed",
    );
    const checkIns = allowedRecords.filter(
      (record) => record.type === "check_in",
    );
    const checkOuts = allowedRecords.filter(
      (record) => record.type === "check_out",
    );
    const firstCheckInRecord = checkIns[0] || null;
    const lastCheckOutRecord = checkOuts[checkOuts.length - 1] || null;
    const rejectedRecords = dayRecords.filter(
      (record) => record.result === "rejected",
    );
    const weeklyOff = isWeeklyOffDay(dateKey, input.weeklyOffDays);
    const leaveRequest = approvedLeaveMap.get(dateKey) || null;
    const manualAbsences = absenceMap.get(dateKey) || [];
    const workedMinutes = calculateWorkedMinutes(dayRecords);
    const firstCheckInParts = firstCheckInRecord
      ? getRiyadhDateParts(firstCheckInRecord.serverTime)
      : null;
    const lastCheckOutParts = lastCheckOutRecord
      ? getRiyadhDateParts(lastCheckOutRecord.serverTime)
      : null;

    let firstCheckInMinutes = firstCheckInParts?.minutes ?? null;
    let lastCheckOutMinutes = lastCheckOutParts?.minutes ?? null;
    if (
      firstCheckInMinutes !== null &&
      lastCheckOutMinutes !== null &&
      lastCheckOutMinutes < firstCheckInMinutes
    ) {
      lastCheckOutMinutes += 24 * 60;
    }

    const lateMinutes =
      firstCheckInMinutes !== null && shiftStartMinutes !== null
        ? Math.max(0, firstCheckInMinutes - shiftStartMinutes)
        : 0;
    const earlyLeaveMinutes =
      lastCheckOutMinutes !== null && shiftEndMinutes !== null
        ? Math.max(0, shiftEndMinutes - lastCheckOutMinutes)
        : 0;
    const overtimeMinutes =
      lastCheckOutMinutes !== null && shiftEndMinutes !== null
        ? Math.max(0, lastCheckOutMinutes - shiftEndMinutes)
        : 0;
    const shortageMinutes = lateMinutes + earlyLeaveMinutes;

    let status = "";
    const notes: string[] = [];

    if (weeklyOff) {
      status = allowedRecords.length ? "حضور في يوم راحة" : "راحة أسبوعية";
    } else if (leaveRequest) {
      status = allowedRecords.length ? "حضور أثناء إجازة" : "إجازة معتمدة";
      notes.push(getLeaveTypeLabel(leaveRequest.leaveType));
    } else if (manualAbsences.length) {
      status = allowedRecords.length ? "حضور مع غياب مسجل" : "غياب مسجل";
      notes.push(
        manualAbsences
          .map(
            (absence) =>
              `${getEmployeeAbsenceTypeLabel(absence.type)}${absence.note ? `: ${absence.note}` : ""}`,
          )
          .join(" | "),
      );
    } else if (!hasAttendancePayload) {
      status = "لم يتم تحميل سجلات الحضور";
    } else if (firstCheckInRecord && lastCheckOutRecord) {
      status = "حاضر";
    } else if (firstCheckInRecord || lastCheckOutRecord) {
      status = "حضور ناقص";
    } else {
      status = "غائب / بلا سجل";
    }

    if (rejectedRecords.length) {
      notes.push(`عمليات مرفوضة: ${rejectedRecords.length}`);
    }
    if (firstCheckInRecord && !lastCheckOutRecord)
      notes.push("لا يوجد انصراف مكتمل");
    if (!firstCheckInRecord && lastCheckOutRecord)
      notes.push("لا يوجد حضور مكتمل");

    const zoneNames = Array.from(
      new Set(
        dayRecords
          .map((record) => pickText(record.zoneName, record.zoneId))
          .filter(Boolean),
      ),
    ).join("، ");

    return {
      dateKey,
      dayLabel: formatDayLabel(dateKey),
      status,
      firstCheckIn: formatRiyadhTime(firstCheckInRecord?.serverTime),
      lastCheckOut: formatRiyadhTime(lastCheckOutRecord?.serverTime),
      workedMinutes,
      lateMinutes,
      earlyLeaveMinutes,
      overtimeMinutes,
      shortageMinutes,
      zoneNames,
      rejectedCount: rejectedRecords.length,
      notes: notes.join(" | "),
    };
  });
}

function getAttendanceTypeLabel(type: AttendanceRecord["type"]) {
  return type === "check_in" ? "حضور" : "انصراف";
}

function getAttendanceResultLabel(result: AttendanceRecord["result"]) {
  return result === "allowed" ? "مسموح" : "مرفوض";
}

function getRejectionReasonLabel(reason: string | null) {
  const normalized = String(reason || "").trim();
  const labels: Record<string, string> = {
    poor_accuracy: "دقة الموقع غير كافية",
    outside_zone: "خارج نطاق العمل",
    office_ip_mismatch: "شبكة الفرع غير مطابقة",
    office_ip_unavailable: "تعذر التحقق من شبكة الفرع",
    duplicate_check_in: "حضور مكرر",
    not_checked_in: "لا يوجد حضور مفتوح",
    zone_not_found: "النطاق غير موجود",
    zone_invalid: "النطاق غير صالح",
    already_checked_out: "تم تسجيل الانصراف مسبقًا",
  };
  return labels[normalized] || normalized;
}

function buildOperationRows(records: AttendanceRecord[]) {
  return [...records]
    .sort((left, right) => getRecordTimestamp(left) - getRecordTimestamp(right))
    .map<XlsxRow>((record) => ({
      dateTime: formatRiyadhDateTime(record.serverTime),
      date: getRiyadhDateParts(record.serverTime)?.dateKey || "",
      type: getAttendanceTypeLabel(record.type),
      result: getAttendanceResultLabel(record.result),
      zone: pickText(record.zoneName, record.zoneId),
      distanceMeters:
        record.distanceMeters === null || record.distanceMeters === undefined
          ? ""
          : round(record.distanceMeters, 1),
      accuracy:
        record.location?.accuracy === null ||
        record.location?.accuracy === undefined
          ? ""
          : round(record.location.accuracy, 1),
      location:
        Number.isFinite(record.location?.lat) &&
        Number.isFinite(record.location?.lng)
          ? `${record.location.lat}, ${record.location.lng}`
          : "",
      device: pickText(record.deviceInfo?.deviceId),
      platform: pickText(record.deviceInfo?.platform),
      rejectionReason: getRejectionReasonLabel(record.rejectionReason),
      createdBy: pickText(record.createdByEmail, record.createdByRole),
      __style: record.result === "rejected" ? "deduction" : "",
    }));
}

function getMonthlyFiles(
  files: EmployeeFileRecord[],
  monthStart: string,
  monthEnd: string,
) {
  return files.filter((file) => {
    const date = file.uploadedAtDate || file.createdAtDate;
    if (!date) return false;
    const dateKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: RIYADH_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    return dateKey >= monthStart && dateKey <= monthEnd;
  });
}

export async function generateEmployeeExcelReport(
  input: EmployeeExcelReportInput,
): Promise<EmployeeExcelReportResult> {
  const { employee, profile, payrollRecords, absences, leaveRequests, files } =
    input;
  const parsedMonth = parseEmployeePayrollMonth(input.reportMonth);
  if (!parsedMonth) {
    throw new Error("اختر شهرًا صالحًا لإنشاء تقرير Excel.");
  }

  const reportMonth = parsedMonth.payrollMonth;
  const payrollRecord = getPayrollRecord(input, reportMonth);
  const payroll = (payrollRecord || {}) as EmployeePayrollRecord &
    Record<string, any>;
  const employment = getEmployment(employee);
  const employeeName = pickText(
    profile.personal.name,
    employee.displayName,
    employee.name,
    employee.email,
    "موظف",
  );
  const employeeCode = pickText(
    profile.employment.employeeCode,
    employee.employeeCode,
    "غير محدد",
  );
  const monthLabel = formatEmployeePayrollMonthLabel(reportMonth);
  const generatedAt = new Date();
  const monthStart =
    pickText(payroll.monthStart, parsedMonth.monthStart) ||
    parsedMonth.monthStart;
  const monthEnd =
    pickText(payroll.monthEnd, parsedMonth.monthEnd) || parsedMonth.monthEnd;
  const scheduleSnapshot = (payroll.scheduleSnapshot || {}) as Record<
    string,
    any
  >;
  const shiftStartTime = pickText(
    scheduleSnapshot.startTime,
    profile.employment.shiftStartTime,
  );
  const shiftEndTime = pickText(
    scheduleSnapshot.endTime,
    profile.employment.shiftEndTime,
  );
  const weeklyOffDays = Array.isArray(scheduleSnapshot.weeklyOffDays)
    ? scheduleSnapshot.weeklyOffDays
    : profile.employment.weeklyOffDays || [];

  const dailyAnalysis = buildDailyAttendanceRows({
    attendanceRecords: input.attendanceRecords,
    absences,
    leaveRequests,
    monthStart,
    monthEnd,
    shiftStartTime,
    shiftEndTime,
    weeklyOffDays,
  });
  const operationRows = buildOperationRows(input.attendanceRecords || []);
  const monthlyAbsences = absences.filter(
    (absence) => absence.date >= monthStart && absence.date <= monthEnd,
  );
  const monthlyApprovedLeaves = leaveRequests.filter((request) => {
    if (
      String(request.status || "")
        .trim()
        .toLowerCase() !== "approved"
    )
      return false;
    const startDate = formatLeaveDateInput(request.startDate);
    const endDate = formatLeaveDateInput(request.endDate || request.startDate);
    return Boolean(
      startDate && endDate && startDate <= monthEnd && endDate >= monthStart,
    );
  });

  const baseSalary = payrollRecord
    ? toNumber(payroll.baseSalary)
    : toNumber(employment.baseSalary);
  const housingAllowance = payrollRecord
    ? toNumber(payroll.housingAllowance)
    : toNumber(employment.housingAllowance);
  const transportationAllowance = payrollRecord
    ? toNumber(payroll.transportationAllowance)
    : toNumber(employment.transportationAllowance);
  const otherAllowances = payrollRecord
    ? toNumber(payroll.otherAllowances)
    : toNumber(employment.otherAllowances);
  const allowances = payrollRecord
    ? toNumber(payroll.allowances) ||
      housingAllowance + transportationAllowance + otherAllowances
    : toNumber(employment.allowances) ||
      housingAllowance + transportationAllowance + otherAllowances;
  const overtimeBonus = payrollRecord
    ? toNumber(payroll.overtimeBonus)
    : toNumber(employment.calculatedOvertimeAmount);
  const payrollAttendanceSummary =
    payroll.attendanceSummary && typeof payroll.attendanceSummary === "object"
      ? (payroll.attendanceSummary as Record<string, unknown>)
      : {};
  const detectedOvertimeHours = toNumber(payroll.attendanceOvertimeHours);
  const financialOvertimeHours = payrollRecord
    ? toNumber(
        payrollAttendanceSummary["financialOvertimeHours"] ??
          (overtimeBonus > 0 ? detectedOvertimeHours : 0),
      )
    : detectedOvertimeHours;
  const delayDeduction = payrollRecord
    ? toNumber(payroll.delayDeduction)
    : toNumber(employment.calculatedMissingDeduction);
  const attendanceAbsenceDeduction = toNumber(
    payroll.attendanceAbsenceDeduction,
  );
  const absenceDeduction = payrollRecord
    ? toNumber(payroll.absenceDeduction)
    : monthlyAbsences.reduce(
        (sum, absence) => sum + getEmployeeAbsenceDaysValue(absence.type),
        0,
      );
  const insuranceDeduction = payrollRecord
    ? toNumber(payroll.insuranceDeduction)
    : toNumber(employment.insuranceDeduction);
  const salaryDeductions = Array.isArray(payroll.salaryDeductions)
    ? payroll.salaryDeductions
    : Array.isArray(employment.salaryDeductions)
      ? employment.salaryDeductions
      : [];
  const otherDeductions = payrollRecord
    ? toNumber(payroll.totalSalaryDeductions)
    : salaryDeductions.reduce(
        (sum: number, item: Record<string, any>) =>
          sum + toNumber(item?.amount),
        0,
      );
  const totalEntitlements = baseSalary + allowances + overtimeBonus;
  const totalDeductions =
    delayDeduction +
    attendanceAbsenceDeduction +
    absenceDeduction +
    insuranceDeduction +
    otherDeductions;
  const grossSalary = Math.max(
    0,
    baseSalary +
      allowances +
      overtimeBonus -
      delayDeduction -
      attendanceAbsenceDeduction,
  );
  const finalSalary = payrollRecord
    ? toNumber(payroll.finalSalary)
    : Math.max(0, totalEntitlements - totalDeductions);

  const approvalRows: XlsxRow[] = [
    { item: "اسم الموظف", value: employeeName, unit: "", notes: "" },
    { item: "الرقم الوظيفي", value: employeeCode, unit: "", notes: "" },
    {
      item: "المسمى الوظيفي",
      value: profile.employment.title,
      unit: "",
      notes: "",
    },
    {
      item: "القسم",
      value: profile.employment.department,
      unit: "",
      notes: "",
    },
    { item: "شهر الراتب", value: monthLabel, unit: "", notes: reportMonth },
    {
      item: "فترة الشهر",
      value: `${formatDateKey(monthStart)} - ${formatDateKey(monthEnd)}`,
      unit: "",
      notes: "",
    },
    {
      item: "فترة الاحتساب الفعلية",
      value: `${formatDateKey(pickText(payroll.calculationStartDate, monthStart))} - ${formatDateKey(
        pickText(payroll.calculationEndDate, monthEnd),
      )}`,
      unit: "",
      notes: "حسب سجل الراتب المحفوظ",
    },
    {
      item: "وقت الدوام",
      value:
        shiftStartTime && shiftEndTime
          ? `${shiftStartTime} - ${shiftEndTime}`
          : "غير محدد",
      unit: "",
      notes: "",
    },
    {
      item: "الراتب الأساسي",
      value: round(baseSalary),
      unit: "ر.س",
      notes: "",
      __style: "total",
    },
    {
      item: "بدل السكن",
      value: round(housingAllowance),
      unit: "ر.س",
      notes: "",
    },
    {
      item: "بدل المواصلات",
      value: round(transportationAllowance),
      unit: "ر.س",
      notes: "",
    },
    {
      item: "بدلات أخرى",
      value: round(otherAllowances),
      unit: "ر.س",
      notes: "",
    },
    {
      item: "إجمالي البدلات",
      value: round(allowances),
      unit: "ر.س",
      notes: "",
      __style: "total",
    },
    {
      item: "قيمة الأوفر تايم",
      value: round(overtimeBonus),
      unit: "ر.س",
      notes: `المحتسب ماليًا: ${round(financialOvertimeHours)} ساعة، المكتشف: ${round(detectedOvertimeHours)} ساعة`,
    },
    {
      item: "إجمالي المستحقات",
      value: round(totalEntitlements),
      unit: "ر.س",
      notes: "الراتب + البدلات + الإضافي",
      __style: "total",
    },
    {
      item: "خصم التأخير / نقص الساعات",
      value: round(delayDeduction),
      unit: "ر.س",
      notes: `${round(payroll.attendanceMissingHours)} ساعة`,
      __style: "deduction",
    },
    {
      item: "خصم غياب الحضور",
      value: round(attendanceAbsenceDeduction),
      unit: "ر.س",
      notes: `${round(payroll.attendanceAbsentDays)} يوم`,
      __style: "deduction",
    },
    {
      item: "خصم الغياب المسجل",
      value: round(absenceDeduction),
      unit: "ر.س",
      notes: `${round(payroll.absenceDays)} يوم`,
      __style: "deduction",
    },
    {
      item: "خصم التأمينات",
      value: round(insuranceDeduction),
      unit: "ر.س",
      notes: "",
      __style: "deduction",
    },
    ...salaryDeductions.map(
      (deduction: Record<string, any>, index: number) => ({
        item: pickText(deduction?.title, `خصم إضافي ${index + 1}`),
        value: round(deduction?.amount),
        unit: "ر.س",
        notes: "خصم إضافي محفوظ في سجل الراتب",
        __style: "deduction",
      }),
    ),
    {
      item: "إجمالي الخصومات",
      value: round(totalDeductions),
      unit: "ر.س",
      notes: "يشمل جميع الخصومات",
      __style: "total",
    },
    {
      item: "الراتب قبل الخصومات النهائية",
      value: round(grossSalary),
      unit: "ر.س",
      notes: "",
      __style: "total",
    },
    {
      item: "الراتب النهائي المعتمد",
      value: round(finalSalary),
      unit: "ر.س",
      notes: "القيمة المحفوظة في سجل الراتب",
      __style: "net",
    },
    {
      item: "ساعات العمل المتوقعة",
      value: round(payroll.expectedWorkHours),
      unit: "ساعة",
      notes: "",
    },
    {
      item: "ساعات العمل الفعلية",
      value: round(payroll.actualWorkedHours),
      unit: "ساعة",
      notes: "",
    },
    {
      item: "أيام الحضور المكتملة",
      value: round(payroll.attendanceCompleteDays),
      unit: "يوم",
      notes: "",
    },
    {
      item: "أيام الحضور الناقصة",
      value: round(payroll.attendanceIncompleteDays),
      unit: "يوم",
      notes: "",
    },
    {
      item: "أيام الغياب من الحضور",
      value: round(payroll.attendanceAbsentDays),
      unit: "يوم",
      notes: "",
    },
    {
      item: "تاريخ إنشاء سجل الراتب",
      value: payroll.createdAt ? formatDateTimeEN(payroll.createdAt) : "",
      unit: "",
      notes: "",
    },
    {
      item: "أنشأ السجل",
      value: pickText(payroll.createdByEmail, payroll.createdByUid),
      unit: "",
      notes: "",
    },
    {
      item: "تاريخ إنشاء ملف الاعتماد",
      value: formatDateTimeEN(generatedAt),
      unit: "",
      notes: "",
    },
  ];

  const dailyRows: XlsxRow[] = dailyAnalysis.map((row) => ({
    date: formatDateKey(row.dateKey),
    day: row.dayLabel,
    status: row.status,
    firstCheckIn: row.firstCheckIn,
    lastCheckOut: row.lastCheckOut,
    workedHours: formatMinutesAsHours(row.workedMinutes),
    lateMinutes: row.lateMinutes,
    earlyLeaveMinutes: row.earlyLeaveMinutes,
    overtimeMinutes: row.overtimeMinutes,
    shortageMinutes: row.shortageMinutes,
    zone: row.zoneNames,
    rejected: row.rejectedCount,
    notes: row.notes,
    __style:
      row.status.includes("غائب") || row.status.includes("ناقص")
        ? "deduction"
        : row.status === "حاضر"
          ? "net"
          : "",
  }));

  const absenceLeaveRows: XlsxRow[] = [
    ...dailyAnalysis
      .filter((row) => row.status === "غائب / بلا سجل")
      .map((row) => ({
        kind: "غياب مكتشف من الحضور",
        dateRange: formatDateKey(row.dateKey),
        type: "يوم كامل",
        days: 1,
        status: "محسوب من السجل اليومي",
        notes: row.notes,
        __style: "deduction",
      })),
    ...monthlyAbsences.map((absence) => ({
      kind: "غياب مسجل يدويًا",
      dateRange: formatDateKey(absence.date),
      type: getEmployeeAbsenceTypeLabel(absence.type),
      days: getEmployeeAbsenceDaysValue(absence.type),
      status: "محفوظ",
      notes: absence.note || "",
      __style: "deduction",
    })),
    ...monthlyApprovedLeaves.map((request) => ({
      kind: "إجازة معتمدة",
      dateRange: `${formatDateKey(formatLeaveDateInput(request.startDate))} - ${formatDateKey(
        formatLeaveDateInput(request.endDate || request.startDate),
      )}`,
      type: getLeaveTypeLabel(request.leaveType),
      days: toNumber(request.daysCount),
      status: getLeaveStatusMeta(request.status).label,
      notes: pickText(request.employeeNote, request.hrNote),
    })),
  ];

  const monthlyFiles = getMonthlyFiles(files, monthStart, monthEnd);
  const attachmentRows: XlsxRow[] = [
    ...(payroll.mudadDocument
      ? [
          {
            kind: "مرفق مرتبط بالراتب",
            fileName: pickText(payroll.mudadDocument.fileName, "مرفق الراتب"),
            contentType: pickText(payroll.mudadDocument.contentType),
            uploadDate: payroll.mudadDocument.uploadedAt
              ? formatDateTimeEN(payroll.mudadDocument.uploadedAt)
              : "",
            viewUrl: pickText(
              payroll.mudadDocumentViewUrl,
              payroll.mudadDocument.fileUrl,
            ),
            downloadUrl: pickText(payroll.mudadDocumentDownloadUrl),
          },
        ]
      : []),
    ...monthlyFiles.map((file) => ({
      kind: file.officialDocument ? "مستند رسمي" : "ملف موظف",
      fileName: file.fileName || file.title,
      contentType: pickText(file.contentType, file.fileTypeLabel),
      uploadDate: file.uploadedAtDate ? formatDateEN(file.uploadedAtDate) : "",
      viewUrl: pickText(file.fileUrl),
      downloadUrl: pickText(file.fileUrl),
    })),
  ];

  const subtitle = `${employeeName} | الرقم الوظيفي: ${employeeCode} | ${monthLabel}`;
  const blob = await buildWorkbookXlsx({
    title: `اعتماد راتب - ${employeeName} - ${reportMonth}`,
    creator: "MAEDIN HR",
    description: `ملف اعتماد راتب شامل للموظف ${employeeName} عن ${monthLabel}`,
    sheets: [
      buildSheet(
        "اعتماد الراتب",
        [
          { key: "item", header: "البيان", width: 36 },
          { key: "value", header: "القيمة", width: 22, align: "center" },
          { key: "unit", header: "الوحدة", width: 12, align: "center" },
          { key: "notes", header: "ملاحظات", width: 44 },
        ],
        approvalRows,
        {
          title: "اعتماد الراتب الشهري",
          subtitle: `${subtitle} | يعتمد على سجل الراتب المحفوظ ولا يتغير بتعديل البيانات الحالية`,
          headerTone: "navy",
          tabColor: "030640",
        },
      ),
      buildSheet(
        "الحضور اليومي",
        [
          { key: "date", header: "التاريخ", width: 14, align: "center" },
          { key: "day", header: "اليوم", width: 14, align: "center" },
          { key: "status", header: "الحالة", width: 24 },
          {
            key: "firstCheckIn",
            header: "أول حضور",
            width: 14,
            align: "center",
          },
          {
            key: "lastCheckOut",
            header: "آخر انصراف",
            width: 14,
            align: "center",
          },
          {
            key: "workedHours",
            header: "ساعات العمل",
            width: 15,
            align: "center",
          },
          {
            key: "lateMinutes",
            header: "التأخير (دقيقة)",
            width: 16,
            align: "center",
          },
          {
            key: "earlyLeaveMinutes",
            header: "الخروج المبكر",
            width: 16,
            align: "center",
          },
          {
            key: "overtimeMinutes",
            header: "الإضافي (دقيقة)",
            width: 16,
            align: "center",
          },
          {
            key: "shortageMinutes",
            header: "النقص (دقيقة)",
            width: 16,
            align: "center",
          },
          { key: "zone", header: "النطاق", width: 24 },
          {
            key: "rejected",
            header: "عمليات مرفوضة",
            width: 16,
            align: "center",
          },
          { key: "notes", header: "ملاحظات", width: 42 },
        ],
        dailyRows,
        {
          title: "الحضور اليومي من أول الشهر إلى آخره",
          subtitle: `${subtitle} | الدوام: ${shiftStartTime || "غير محدد"} - ${shiftEndTime || "غير محدد"}`,
          headerTone: "teal",
          tabColor: "0F766E",
        },
      ),
      buildSheet(
        "عمليات الحضور",
        [
          {
            key: "dateTime",
            header: "التاريخ والوقت",
            width: 24,
            align: "center",
          },
          { key: "date", header: "تاريخ الرياض", width: 14, align: "center" },
          { key: "type", header: "العملية", width: 12, align: "center" },
          { key: "result", header: "النتيجة", width: 12, align: "center" },
          { key: "zone", header: "النطاق", width: 24 },
          {
            key: "distanceMeters",
            header: "المسافة (م)",
            width: 14,
            align: "center",
          },
          {
            key: "accuracy",
            header: "دقة GPS (م)",
            width: 15,
            align: "center",
          },
          { key: "location", header: "الإحداثيات", width: 24 },
          { key: "device", header: "الجهاز", width: 30 },
          { key: "platform", header: "المنصة", width: 18 },
          { key: "rejectionReason", header: "سبب الرفض", width: 30 },
          { key: "createdBy", header: "مصدر العملية", width: 24 },
        ],
        operationRows,
        {
          title: "جميع عمليات الحضور والانصراف",
          subtitle,
          headerTone: "amber",
          tabColor: "F2B705",
        },
      ),
      buildSheet(
        "الغياب والإجازات",
        [
          { key: "kind", header: "التصنيف", width: 26 },
          {
            key: "dateRange",
            header: "التاريخ / الفترة",
            width: 24,
            align: "center",
          },
          { key: "type", header: "النوع", width: 22 },
          { key: "days", header: "عدد الأيام", width: 14, align: "center" },
          { key: "status", header: "الحالة", width: 22 },
          { key: "notes", header: "ملاحظات", width: 44 },
        ],
        absenceLeaveRows,
        {
          title: "الغياب والإجازات المؤثرة على الشهر",
          subtitle,
          headerTone: "slate",
          tabColor: "64748B",
        },
      ),
      buildSheet(
        "المرفقات",
        [
          { key: "kind", header: "نوع المرفق", width: 30 },
          { key: "fileName", header: "اسم الملف", width: 38 },
          { key: "contentType", header: "صيغة الملف", width: 24 },
          {
            key: "uploadDate",
            header: "تاريخ الرفع",
            width: 22,
            align: "center",
          },
          { key: "viewUrl", header: "رابط العرض", width: 60 },
          { key: "downloadUrl", header: "رابط التحميل", width: 60 },
        ],
        attachmentRows,
        {
          title: "المرفقات المرتبطة باعتماد الراتب",
          subtitle: `${subtitle} | يمكن نسخ الرابط وفتحه مباشرة`,
          headerTone: "emerald",
          tabColor: "16A34A",
        },
      ),
    ],
  });

  return {
    blob,
    fileName: `${safeFileName(employeeName)}-${reportMonth}-payroll-approval.xlsx`,
  };
}
