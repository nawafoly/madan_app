import { formatDateEN, toDateSafe } from "@/lib/formatters";
import { buildR2DownloadUrl } from "@/lib/documentUploadService";
import { getEmployeeAbsenceDaysValue } from "@/lib/employeeAbsence";
import {
  EMPLOYEE_PAYROLL_RECORDS_COLLECTION,
  type EmployeeAbsenceDoc,
  type EmployeePayrollRecordDoc,
} from "@shared/employee";

export { EMPLOYEE_PAYROLL_RECORDS_COLLECTION };

type EmployeePayrollDeductionInput = {
  id?: string | null;
  title?: string | null;
  amount?: number | null;
};

export type EmployeePayrollComputation = {
  baseSalary: number;
  expectedWorkDays?: number | null;
  dailySalary: number;
  hourlyRate: number;
  hoursDifference: number;
  overtimeHours: number;
  missingHours: number;
  attendanceAbsentDays: number;
  attendanceAbsenceDeduction: number;
  effectiveOvertimeHourlyRate: number;
  overtimeBonus: number;
  delayDeduction: number;
  insuranceDeduction: number;
  salaryDeductionsTotal: number;
  totalSalaryDeductions: number;
  absenceDays: number;
  absenceDeduction: number;
  grossSalary: number;
  finalSalary: number;
};

export type EmployeePayrollRecord = EmployeePayrollRecordDoc & {
  id: string;
  createdAtDate: Date | null;
  mudadDocumentViewUrl: string;
  mudadDocumentDownloadUrl: string;
};

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeSalaryDeductions(
  value: EmployeePayrollDeductionInput[] | null | undefined
) {
  return (value || [])
    .map(item => ({
      id: String(item?.id || "").trim() || undefined,
      title: String(item?.title || "").trim() || undefined,
      amount: toFiniteNumber(item?.amount),
    }))
    .filter(item => item.title && item.amount > 0);
}

function normalizePayrollDocument(raw: any) {
  if (!raw || typeof raw !== "object") return null;

  const filePath = String(raw.filePath || raw.path || "").trim();
  const fileUrl = String(
    raw.fileUrl || raw.url || (filePath ? buildR2DownloadUrl(filePath, false) : "")
  ).trim();

  return {
    id: String(raw.id || raw.fileId || "").trim() || null,
    fileName: String(raw.fileName || raw.name || "mudad-document").trim(),
    filePath: filePath || null,
    fileUrl: fileUrl || null,
    contentType: String(raw.contentType || raw.mimeType || "").trim() || null,
    fileSize:
      raw.fileSize === null || raw.fileSize === undefined
        ? null
        : Math.max(0, toFiniteNumber(raw.fileSize)),
    uploadedAt: raw.uploadedAt ?? null,
    uploadedBy: String(raw.uploadedBy || "").trim() || null,
  };
}

export function buildEmployeePayrollMonthInput(date: Date = new Date()) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
}

export function parseEmployeePayrollMonth(value: string) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const [, yearRaw, monthRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  const monthStart = `${yearRaw}-${monthRaw}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${yearRaw}-${monthRaw}-${padDatePart(lastDay)}`;
  const label = formatDateEN(new Date(year, month - 1, 1), {
    year: "numeric",
    month: "long",
  });

  return {
    payrollMonth: normalized,
    monthStart,
    monthEnd,
    label,
  };
}

export function buildEmployeePayrollRecordId(employeeId: string, payrollMonth: string) {
  const normalizedEmployeeId = String(employeeId || "")
    .trim()
    .replace(/[\\/#?\[\]]/g, "_");
  const normalizedPayrollMonth = String(payrollMonth || "").trim();
  return `${normalizedEmployeeId}__${normalizedPayrollMonth}`;
}

export function computeEmployeePayroll(input: {
  baseSalary?: number | null;
  expectedWorkDays?: number | null;
  expectedWorkHours?: number | null;
  attendanceExpectedHours?: number | null;
  attendanceAbsentDays?: number | null;
  actualWorkedHours?: number | null;
  overtimeHourlyRate?: number | null;
  insuranceDeduction?: number | null;
  salaryDeductions?: EmployeePayrollDeductionInput[] | null;
  absences?: Array<Pick<EmployeeAbsenceDoc, "date" | "type" | "note">> | null;
}): EmployeePayrollComputation {
  const baseSalary = Math.max(0, toFiniteNumber(input.baseSalary));
  const expectedWorkDays = Math.max(0, toFiniteNumber(input.expectedWorkDays));
  const expectedWorkHours = Math.max(0, toFiniteNumber(input.expectedWorkHours));
  const attendanceExpectedHours = Math.max(
    0,
    input.attendanceExpectedHours === null || input.attendanceExpectedHours === undefined
      ? expectedWorkHours
      : toFiniteNumber(input.attendanceExpectedHours)
  );
  const attendanceAbsentDays = Math.max(0, toFiniteNumber(input.attendanceAbsentDays));
  const actualWorkedHours = Math.max(0, toFiniteNumber(input.actualWorkedHours));
  const overtimeHourlyRate = Math.max(0, toFiniteNumber(input.overtimeHourlyRate));
  const insuranceDeduction = Math.max(0, toFiniteNumber(input.insuranceDeduction));
  const normalizedSalaryDeductions = normalizeSalaryDeductions(input.salaryDeductions);

  const hourlyRate =
    baseSalary > 0 && expectedWorkHours > 0 ? baseSalary / expectedWorkHours : 0;
  const hoursDifference = actualWorkedHours - attendanceExpectedHours;
  const overtimeHours = Math.max(0, hoursDifference);
  const missingHours = Math.max(0, -hoursDifference);
  const effectiveOvertimeHourlyRate =
    overtimeHourlyRate > 0 ? overtimeHourlyRate : hourlyRate;
  const overtimeBonus = overtimeHours * effectiveOvertimeHourlyRate;
  const delayDeduction = missingHours * hourlyRate;
  const salaryDeductionsTotal = normalizedSalaryDeductions.reduce(
    (sum, item) => sum + item.amount,
    0
  );
  const totalSalaryDeductions = salaryDeductionsTotal;
  const absenceDays = (input.absences || []).reduce(
    (sum, item) => sum + getEmployeeAbsenceDaysValue(item.type),
    0
  );
  const dailySalary =
    baseSalary > 0 && expectedWorkDays > 0
      ? baseSalary / expectedWorkDays
      : 0;
  const attendanceAbsenceDeduction = attendanceAbsentDays * dailySalary;
  const absenceDeduction = absenceDays * dailySalary;
  const grossSalary = Math.max(
    0,
    baseSalary + overtimeBonus - delayDeduction - attendanceAbsenceDeduction
  );
  const finalSalary = Math.max(
    0,
    grossSalary - totalSalaryDeductions - insuranceDeduction - absenceDeduction
  );

  return {
    baseSalary,
    dailySalary,
    hourlyRate,
    hoursDifference,
    overtimeHours,
    missingHours,
    attendanceAbsentDays,
    attendanceAbsenceDeduction,
    effectiveOvertimeHourlyRate,
    overtimeBonus,
    delayDeduction,
    insuranceDeduction,
    salaryDeductionsTotal,
    totalSalaryDeductions,
    absenceDays,
    absenceDeduction,
    grossSalary,
    finalSalary,
  };
}

export function formatEmployeePayrollMonthLabel(value: unknown) {
  const parsed = parseEmployeePayrollMonth(String(value || "").trim());
  return parsed?.label || String(value || "").trim() || "—";
}

export function normalizeEmployeePayrollRecord(
  id: string,
  raw: Record<string, any>
): EmployeePayrollRecord {
  const normalizedSalaryDeductions = normalizeSalaryDeductions(
    Array.isArray(raw.salaryDeductions) ? raw.salaryDeductions : []
  );
  const absenceEntries = Array.isArray(raw.absenceEntries)
    ? raw.absenceEntries
      .map(item => ({
        date: String(item?.date || "").trim(),
        type: String(item?.type || "full_day").trim(),
        note: String(item?.note || "").trim() || null,
      }))
      .filter(item => item.date)
    : null;
  const mudadDocument = normalizePayrollDocument(raw.mudadDocument);
  const mudadDocumentViewUrl =
    mudadDocument?.fileUrl ||
    (mudadDocument?.filePath ? buildR2DownloadUrl(mudadDocument.filePath, false) : "");
  const mudadDocumentDownloadUrl =
    mudadDocument?.filePath
      ? buildR2DownloadUrl(mudadDocument.filePath, true)
      : mudadDocumentViewUrl;

  return {
    id,
    employeeId: String(raw.employeeId || "").trim(),
    employeeUid: String(raw.employeeUid || "").trim(),
    payrollMonth: String(raw.payrollMonth || "").trim(),
    monthStart: String(raw.monthStart || "").trim(),
    monthEnd: String(raw.monthEnd || "").trim(),
    baseSalary: Math.max(0, toFiniteNumber(raw.baseSalary)),
    absenceDays: Math.max(0, toFiniteNumber(raw.absenceDays)),
    absenceDeduction: Math.max(0, toFiniteNumber(raw.absenceDeduction)),
    expectedWorkHours:
      raw.expectedWorkHours === null || raw.expectedWorkHours === undefined
        ? null
        : Math.max(0, toFiniteNumber(raw.expectedWorkHours)),
    actualWorkedHours:
      raw.actualWorkedHours === null || raw.actualWorkedHours === undefined
        ? null
        : Math.max(0, toFiniteNumber(raw.actualWorkedHours)),
    attendanceLateHours:
      raw.attendanceLateHours === null || raw.attendanceLateHours === undefined
        ? null
        : Math.max(0, toFiniteNumber(raw.attendanceLateHours)),
    attendanceMissingHours:
      raw.attendanceMissingHours === null || raw.attendanceMissingHours === undefined
        ? null
        : Math.max(0, toFiniteNumber(raw.attendanceMissingHours)),
    attendanceOvertimeHours:
      raw.attendanceOvertimeHours === null || raw.attendanceOvertimeHours === undefined
        ? null
        : Math.max(0, toFiniteNumber(raw.attendanceOvertimeHours)),
    attendanceCompleteDays:
      raw.attendanceCompleteDays === null || raw.attendanceCompleteDays === undefined
        ? null
        : Math.max(0, toFiniteNumber(raw.attendanceCompleteDays)),
    attendanceIncompleteDays:
      raw.attendanceIncompleteDays === null || raw.attendanceIncompleteDays === undefined
        ? null
        : Math.max(0, toFiniteNumber(raw.attendanceIncompleteDays)),
    attendanceAbsentDays:
      raw.attendanceAbsentDays === null || raw.attendanceAbsentDays === undefined
        ? null
        : Math.max(0, toFiniteNumber(raw.attendanceAbsentDays)),
    attendanceAbsenceDeduction:
      raw.attendanceAbsenceDeduction === null ||
      raw.attendanceAbsenceDeduction === undefined
        ? null
        : Math.max(0, toFiniteNumber(raw.attendanceAbsenceDeduction)),
    delayDeduction:
      raw.delayDeduction === null || raw.delayDeduction === undefined
        ? null
        : Math.max(0, toFiniteNumber(raw.delayDeduction)),
    overtimeBonus:
      raw.overtimeBonus === null || raw.overtimeBonus === undefined
        ? null
        : Math.max(0, toFiniteNumber(raw.overtimeBonus)),
    insuranceDeduction:
      raw.insuranceDeduction === null || raw.insuranceDeduction === undefined
        ? null
        : Math.max(0, toFiniteNumber(raw.insuranceDeduction)),
    salaryDeductions: normalizedSalaryDeductions,
    totalSalaryDeductions:
      raw.totalSalaryDeductions === null || raw.totalSalaryDeductions === undefined
        ? null
        : Math.max(0, toFiniteNumber(raw.totalSalaryDeductions)),
    absenceEntries,
    finalSalary: Math.max(0, toFiniteNumber(raw.finalSalary)),
    mudadDocument,
    createdAt: raw.createdAt ?? null,
    createdByUid: String(raw.createdByUid || "").trim() || null,
    createdByEmail: String(raw.createdByEmail || "").trim() || null,
    createdAtDate: toDateSafe(raw.createdAt),
    mudadDocumentViewUrl,
    mudadDocumentDownloadUrl,
  };
}

export function sortEmployeePayrollRecords<T extends EmployeePayrollRecordDoc>(records: T[]) {
  return [...records].sort((left, right) => {
    const byMonth = String(right.payrollMonth || "").localeCompare(
      String(left.payrollMonth || "")
    );
    if (byMonth !== 0) return byMonth;

    const leftTime = toDateSafe(left.createdAt)?.getTime() || 0;
    const rightTime = toDateSafe(right.createdAt)?.getTime() || 0;
    return rightTime - leftTime;
  });
}
