import { buildWorkbookXlsx, type XlsxColumn, type XlsxRow } from "@/lib/xlsxStore";
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
  formatLeaveDateRange,
  formatLeaveDaysLabel,
  getLeaveStatusMeta,
  getLeaveTypeLabel,
  type EmployeeLeaveRequestRecord,
} from "@/lib/employeeLeave";
import type { EmployeeFileRecord } from "@/lib/employeeFiles";
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
  absences: EmployeeAbsenceRecord[];
  leaveRequests: EmployeeLeaveRequestRecord[];
  files: EmployeeFileRecord[];
  reportMonth: string;
};

type EmployeeExcelReportResult = {
  blob: Blob;
  fileName: string;
};

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== EMPLOYEE_EMPTY_VALUE) return text;
  }
  return "";
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateValue(value: unknown) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value || "");
  return formatDateEN(date);
}

function safeFileName(value: string) {
  return String(value || "employee")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function inPayrollMonth(dateValue: string, reportMonth: string) {
  const month = parseEmployeePayrollMonth(reportMonth);
  if (!month || !dateValue) return false;
  return dateValue >= month.monthStart && dateValue <= month.monthEnd;
}

function getEmployment(employee: EmployeeExcelReportInput["employee"]) {
  return (employee.employeeProfile?.employment || employee.employment || {}) as Record<
    string,
    any
  >;
}

function getPayrollRecord(
  records: EmployeePayrollRecord[],
  reportMonth: string
) {
  return (
    records.find(record => record.payrollMonth === reportMonth) ||
    records[0] ||
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
  }
) {
  return {
    name,
    title: options.title,
    subtitle: options.subtitle,
    headerTone: options.headerTone,
    tabColor: options.tabColor,
    zoomScale: 120,
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
    rightToLeft: true,
  };
}

function buildVerticalMergeRanges(
  rows: XlsxRow[],
  key: string,
  columnLetter: string,
  firstDataRowNumber: number
) {
  const nextRows = rows.map(row => ({ ...row }));
  const mergeRanges: string[] = [];
  let groupStart = 0;

  for (let index = 1; index <= nextRows.length; index += 1) {
    const previousValue = String(nextRows[groupStart]?.[key] || "").trim();
    const currentValue = String(nextRows[index]?.[key] || "").trim();
    const groupEnded = index === nextRows.length || currentValue !== previousValue;

    if (!groupEnded) continue;

    const groupLength = index - groupStart;
    if (previousValue && groupLength > 1) {
      const startRow = firstDataRowNumber + groupStart;
      const endRow = firstDataRowNumber + index - 1;
      mergeRanges.push(`${columnLetter}${startRow}:${columnLetter}${endRow}`);

      for (let rowIndex = groupStart + 1; rowIndex < index; rowIndex += 1) {
        nextRows[rowIndex][key] = "";
      }
    }

    groupStart = index;
  }

  return { rows: nextRows, mergeRanges };
}

export async function generateEmployeeExcelReport(
  input: EmployeeExcelReportInput
): Promise<EmployeeExcelReportResult> {
  const { employee, profile, payrollRecords, absences, leaveRequests, files } =
    input;
  const reportMonth =
    parseEmployeePayrollMonth(input.reportMonth)?.payrollMonth ||
    input.reportMonth;
  const payrollRecord = getPayrollRecord(payrollRecords, reportMonth);
  const employment = getEmployment(employee);
  const monthlyAbsences = absences.filter(absence =>
    inPayrollMonth(absence.date, reportMonth)
  );
  const approvedLeaveDays = leaveRequests
    .filter(request => request.status === "approved")
    .reduce((sum, request) => sum + toNumber(request.daysCount), 0);
  const salaryDeductions =
    payrollRecord?.salaryDeductions ||
    (Array.isArray(employment.salaryDeductions)
      ? employment.salaryDeductions
      : []);
  const generatedAt = new Date();
  const employeeName = pickText(
    profile.personal.name,
    employee.displayName,
    employee.name,
    employee.email,
    "موظف"
  );
  const monthLabel = formatEmployeePayrollMonthLabel(reportMonth);
  const baseSalary = payrollRecord?.baseSalary ?? toNumber(employment.baseSalary);
  const overtimeBonus =
    payrollRecord?.overtimeBonus ?? toNumber(employment.calculatedOvertimeAmount);
  const insuranceDeduction =
    payrollRecord?.insuranceDeduction ?? toNumber(employment.insuranceDeduction);
  const totalSalaryDeductions =
    payrollRecord?.totalSalaryDeductions ??
    salaryDeductions.reduce((sum, item) => sum + toNumber(item?.amount), 0);
  const calculatedNetSalary = toNumber(employment.calculatedNetSalary);
  const finalSalary =
    payrollRecord?.finalSalary ??
    (calculatedNetSalary ||
      Math.max(
        0,
        baseSalary + overtimeBonus - totalSalaryDeductions - insuranceDeduction
      ));
  const missingHours =
    toNumber(employment.missingHours) ||
    Math.max(
      0,
      toNumber(employment.expectedWorkHours) - toNumber(employment.actualWorkedHours)
    );
  const absenceDays = monthlyAbsences.reduce(
    (sum, absence) => sum + getEmployeeAbsenceDaysValue(absence.type),
    0
  );

  const summaryRows: XlsxRow[] = [
    { field: "اسم الموظف", value: employeeName },
    { field: "المسمى الوظيفي", value: profile.employment.title },
    { field: "القسم", value: profile.employment.department },
    {
      field: "تاريخ مباشرة العمل",
      value: profile.employment.startDate
        ? formatDateEN(profile.employment.startDate)
        : "",
    },
    { field: "رقم الجوال", value: profile.personal.phone },
    { field: "البريد الإلكتروني", value: profile.personal.email },
    { field: "حالة الموظف", value: profile.employment.statusLabel },
    { field: "رقم الموظف", value: profile.employment.employeeCode },
    { field: "رقم البصمة", value: profile.employment.fingerprintNumber },
    { field: "شهر التقرير", value: monthLabel },
    { field: "تاريخ إنشاء التقرير", value: formatDateTimeEN(generatedAt) },
  ];

  const financeRows: XlsxRow[] = [
    { item: "الراتب الأساسي", amount: baseSalary, notes: "" },
    { item: "البدلات", amount: toNumber(employment.allowances), notes: "حسب البيانات المسجلة" },
    { item: "مكافأة العمل الإضافي", amount: overtimeBonus, notes: "" },
    { item: "خصم التأمين", amount: insuranceDeduction, notes: "", __style: "deduction" },
    {
      item: "إجمالي الخصومات",
      amount: totalSalaryDeductions,
      notes: "يشمل الخصومات المسجلة فقط ولا يشمل التأمينات",
      __style: "total",
    },
    { item: "صافي الراتب النهائي", amount: finalSalary, notes: "", __style: "net" },
    ...salaryDeductions.map((deduction, index) => ({
      item: pickText(deduction?.title, `خصم ${index + 1}`),
      amount: toNumber(deduction?.amount),
      notes: "",
      __style: "deduction",
    })),
  ];

  const attendanceRows: XlsxRow[] = [
    {
      metric: "مجموع ساعات التأخير / النقص",
      value: missingHours,
      unit: "ساعة",
      notes: "محسوبة من فرق ساعات العمل المتوقعة والفعلية عند توفرها",
    },
    {
      metric: "دقائق الخروج المبكر",
      value: toNumber(employment.earlyExitMinutes),
      unit: "دقيقة",
      notes: employment.earlyExitMinutes ? "" : "لا يوجد مصدر تفصيلي مسجل",
    },
    {
      metric: "أيام الغياب",
      value: absenceDays,
      unit: "يوم",
      notes: `${monthlyAbsences.length} سجل غياب خلال الشهر`,
    },
    ...monthlyAbsences.map(absence => ({
      metric: "تفصيل غياب",
      value: getEmployeeAbsenceTypeLabel(absence.type),
      unit: formatDateValue(absence.date),
      notes: absence.note || "",
    })),
  ];

  const leaveRows: XlsxRow[] = [
    {
      type: "رصيد",
      title: "رصيد الإجازات المتاح",
      value: profile.employment.leaveBalance ?? "",
      status: "رصيد حالي",
      dateRange: "",
      notes: "",
    },
    {
      type: "استهلاك",
      title: "الإجازات المستهلكة المعتمدة",
      value: approvedLeaveDays,
      status: "معتمد",
      dateRange: "",
      notes: "",
    },
    ...leaveRequests.slice(0, 12).map(request => ({
      type: getLeaveTypeLabel(request.leaveType),
      title: "طلب إجازة",
      value: formatLeaveDaysLabel(request.daysCount),
      status: getLeaveStatusMeta(request.status).label,
      dateRange: formatLeaveDateRange(request.startDate, request.endDate),
      notes: pickText(request.employeeNote, request.hrNote),
    })),
    ...files.slice(0, 12).map(file => ({
      type: "مستند",
      title: file.title,
      value: file.fileTypeLabel,
      status: file.statusLabel,
      dateRange: file.uploadedAtDate ? formatDateEN(file.uploadedAtDate) : "",
      notes: file.fileName,
    })),
  ];
  const leaveTypeMerges = buildVerticalMergeRanges(leaveRows, "type", "A", 5);

  const blob = await buildWorkbookXlsx({
    title: `تقرير موظف - ${employeeName}`,
    creator: "MAEDIN",
    description: `تقرير شهري شامل للموظف ${employeeName} عن ${monthLabel}`,
    sheets: [
      buildSheet(
        "الملخص والبيانات",
        [
          { key: "field", header: "البيان", width: 24 },
          { key: "value", header: "القيمة", width: 36 },
        ],
        summaryRows,
        {
          title: "تقرير الموظف الشهري",
          subtitle: `${employeeName} | ${monthLabel} | تم الإنشاء ${formatDateTimeEN(generatedAt)}`,
          headerTone: "navy",
          tabColor: "1E3A8A",
        }
      ),
      buildSheet(
        "الرواتب والمالية",
        [
          { key: "item", header: "البند المالي", width: 34 },
          { key: "amount", header: "المبلغ", width: 16 },
          { key: "notes", header: "ملاحظات", width: 42 },
        ],
        financeRows,
        {
          title: "الرواتب والمالية",
          subtitle: "تفاصيل الراتب الأساسي والبدلات والمكافآت والخصومات للشهر المحدد",
          headerTone: "emerald",
          tabColor: "16A34A",
        }
      ),
      buildSheet(
        "الحضور والالتزام",
        [
          { key: "metric", header: "المؤشر", width: 28 },
          { key: "value", header: "القيمة", width: 18 },
          { key: "unit", header: "الوحدة / التاريخ", width: 18 },
          { key: "notes", header: "ملاحظات", width: 42 },
        ],
        attendanceRows,
        {
          title: "الحضور والالتزام",
          subtitle: "ملخص الانضباط الشهري مع تفاصيل الغياب المسجلة",
          headerTone: "amber",
          tabColor: "F97316",
        }
      ),
      buildSheet(
        "الإجازات والمستندات",
        [
          { key: "type", header: "النوع", width: 18, align: "center" },
          { key: "title", header: "العنوان", width: 28 },
          { key: "value", header: "القيمة", width: 18 },
          { key: "status", header: "الحالة", width: 18 },
          { key: "dateRange", header: "الفترة / التاريخ", width: 26 },
          { key: "notes", header: "ملاحظات", width: 36 },
        ],
        leaveTypeMerges.rows,
        {
          title: "الإجازات والمستندات",
          subtitle: "رصيد الإجازات والطلبات الأخيرة والمستندات المرتبطة بملف الموظف",
          headerTone: "teal",
          tabColor: "0891B2",
          mergeRanges: leaveTypeMerges.mergeRanges,
        }
      ),
    ],
  });

  return {
    blob,
    fileName: `تقرير موظف - ${safeFileName(employeeName)} - ${reportMonth}.xlsx`,
  };
}
