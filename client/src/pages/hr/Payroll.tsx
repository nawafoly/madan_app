import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarRange,
  Calculator,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Upload,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { useSearch } from "wouter";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasPermission, useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchAttendanceRecords } from "@/lib/attendanceRecords";
import {
  summarizeAttendanceForPayroll,
  getShiftExpectedHours,
  type AttendancePayrollSummary,
} from "@/lib/attendanceCalculations";
import { buildActiveApprovedLeaveDateKeySet } from "@/lib/employeeLeave";
import {
  buildEmployeePayrollMonthInput,
  buildEmployeePayrollRecordId,
  computeEmployeePayroll,
  parseEmployeePayrollMonth,
} from "@/lib/employeePayroll";
import {
  createHrCorePayrollRecord,
  finalizeHrCorePayrollRecord,
  reopenHrCorePayrollRecord,
  listHrCoreAbsences,
  listHrCoreEmployees,
  listHrCoreLeaveRequests,
  listHrCorePayrollAdvances,
  listHrCorePayrollRecords,
  type HrCoreAbsence,
  type HrCoreEmployee,
  type HrCorePayrollRecord,
  type HrCoreServiceRequest,
} from "@/lib/hrCoreApi";
import { languageDir, tr } from "@/lib/i18n";
import {
  buildR2DownloadUrl,
  uploadDocumentToCloudflare,
} from "@/lib/documentUploadService";
import {
  buildWorkDateKeysInRange,
  normalizeWeeklyOffDays,
} from "@/lib/workSchedule";
import { cn } from "@/lib/utils";

const RIYADH_TIME_ZONE = "Asia/Riyadh";

type PayrollAdjustment = {
  id: string;
  title: string;
  amount: string;
};

type PayrollDraft = {
  employee: HrCoreEmployee;
  attendance: AttendancePayrollSummary;
  absences: HrCoreAbsence[];
  advances: HrCoreServiceRequest[];
  approvedLeaveDateKeys: Set<string>;
  calculationStartDate: string;
  calculationEndDate: string;
  expectedWorkDays: number;
  expectedWorkHours: number;
  baseAllowances: number;
};

type PayrollRow = {
  employee: HrCoreEmployee;
  record: HrCorePayrollRecord | null;
  draft: PayrollDraft | null;
};

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createAdjustmentId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function round(value: unknown, digits = 2) {
  const parsed = toNumber(value);
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function getRiyadhTodayDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateKeyToUtcMs(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return Number.NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return Number.NaN;
  }
  return timestamp;
}

function utcMsToDateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function buildDefaultAttendanceRange(payrollMonth: string) {
  const month = parseEmployeePayrollMonth(payrollMonth);
  if (!month) {
    const today = getRiyadhTodayDateKey();
    return { from: today, to: today };
  }
  const monthStartMs = dateKeyToUtcMs(month.monthStart);
  const monthStart = new Date(monthStartMs);
  const previousMonth21 = Date.UTC(
    monthStart.getUTCFullYear(),
    monthStart.getUTCMonth() - 1,
    21
  );
  const currentMonth20 = Date.UTC(
    monthStart.getUTCFullYear(),
    monthStart.getUTCMonth(),
    20
  );
  return {
    from: utcMsToDateKey(previousMonth21),
    to: utcMsToDateKey(currentMonth20),
  };
}

function buildPayrollCalculationRange(
  payrollMonth: string,
  calculationStartDate: string,
  calculationEndDate: string
) {
  const month = parseEmployeePayrollMonth(payrollMonth);
  if (!month) return null;
  const today = getRiyadhTodayDateKey();
  const startMs = dateKeyToUtcMs(calculationStartDate);
  const endMs = dateKeyToUtcMs(calculationEndDate);
  const hasValidDates = Number.isFinite(startMs) && Number.isFinite(endMs);
  const rangeDays = hasValidDates && endMs >= startMs
    ? Math.floor((endMs - startMs) / 86400000) + 1
    : 0;
  return {
    ...month,
    calculationStartDate,
    calculationEndDate,
    rangeDays,
    isFutureMonth: month.monthStart > today,
    hasInvalidRange: !hasValidDates || endMs < startMs,
    hasFutureRange: hasValidDates && calculationEndDate > today,
    isRangeTooLong: rangeDays > 62,
  };
}

function normalizeAdjustmentItems(value: unknown): PayrollAdjustment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const row = (item || {}) as Record<string, unknown>;
      return {
        id: String(row.id || `item-${index + 1}`),
        title: String(row.title || "").trim(),
        amount: String(Math.max(0, toNumber(row.amount)) || ""),
      };
    })
    .filter(item => item.title || toNumber(item.amount) > 0);
}

function adjustmentTotal(items: PayrollAdjustment[]) {
  return items.reduce((sum, item) => sum + Math.max(0, toNumber(item.amount)), 0);
}

function employeeAllowances(employee: HrCoreEmployee) {
  return (
    Math.max(0, toNumber(employee.salary.housingAllowance)) +
    Math.max(0, toNumber(employee.salary.transportationAllowance)) +
    Math.max(0, toNumber(employee.salary.otherAllowances))
  );
}

function employeeOvertimeMultiplier(employee: HrCoreEmployee) {
  const value = toNumber(employee.employment?.overtimeMultiplier);
  return value > 0 && value <= 5 ? value : 1.5;
}

function isSupportedMudadPayrollDocument(file: File | null) {
  if (!file) return false;
  const mime = String(file.type || "").trim().toLowerCase();
  const name = String(file.name || "").trim().toLowerCase();
  return (
    mime === "application/pdf" ||
    mime === "image/png" ||
    mime === "image/jpeg" ||
    name.endsWith(".pdf") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg")
  );
}

function payrollDocumentLabel(document: Record<string, unknown> | null | undefined) {
  if (!document) return "";
  return String(document.fileName || document.name || "").trim();
}

function payrollDocumentUrl(document: Record<string, unknown> | null | undefined) {
  if (!document) return "";
  const direct = String(document.fileUrl || document.downloadUrl || document.viewUrl || "").trim();
  if (direct) return direct;
  const path = String(document.filePath || "").trim();
  return path ? buildR2DownloadUrl(path, false) : "";
}

function computeDefaultDraftPayroll(draft: PayrollDraft, language: "ar" | "en") {
  const absentDates = new Set(draft.attendance.absentDateKeys);
  const absences = draft.absences.filter(item => !absentDates.has(item.date));
  const fixedDeductions = normalizeAdjustmentItems(draft.employee.salary.deductions);
  return computeEmployeePayroll({
    baseSalary: draft.employee.salary.baseSalary,
    allowances: draft.baseAllowances,
    expectedWorkDays: draft.expectedWorkDays,
    expectedWorkHours: draft.expectedWorkHours,
    attendanceExpectedHours: draft.attendance.expectedHours,
    attendanceAbsentDays: draft.attendance.absentDays,
    attendanceMissingHours: draft.attendance.missingHours,
    attendanceOvertimeHours: draft.attendance.overtimeHours,
    actualWorkedHours: draft.attendance.actualHours,
    includeOvertime: false,
    overtimeMultiplier: employeeOvertimeMultiplier(draft.employee),
    insuranceDeduction: draft.employee.salary.insuranceDeduction,
    salaryDeductions: [
      ...fixedDeductions.map(item => ({
        id: item.id,
        title: item.title,
        amount: toNumber(item.amount),
      })),
      ...draft.advances.map(item => ({
        id: `advance-${item.id}`,
        title: tr(language, "سلفة راتب معتمدة", "Approved salary advance"),
        amount: toNumber(item.amount),
      })),
    ],
    absences,
  });
}

function recordManualAdditions(record: HrCorePayrollRecord | null) {
  const summary = record?.attendanceSummary;
  if (!summary || typeof summary !== "object") return [] as PayrollAdjustment[];
  return normalizeAdjustmentItems(summary.manualAdditions);
}

function employeeLabel(employee: HrCoreEmployee) {
  return employee.name || employee.email || employee.employeeCode || employee.id;
}

function money(value: unknown, language: "ar" | "en") {
  return new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function number(value: unknown, language: "ar" | "en", digits = 2) {
  return new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-US", {
    maximumFractionDigits: digits,
  }).format(toNumber(value));
}

function dateTime(value: unknown, language: "ar" | "en") {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: RIYADH_TIME_ZONE,
  }).format(date);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadBlob(content: BlobPart, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getRecordAdditions(record: HrCorePayrollRecord) {
  return Math.max(0, toNumber(record.allowances)) + Math.max(0, toNumber(record.overtimeBonus));
}

function getRecordDeductions(record: HrCorePayrollRecord) {
  return (
    Math.max(0, toNumber(record.delayDeduction)) +
    Math.max(0, toNumber(record.absenceDeduction)) +
    Math.max(0, toNumber(record.insuranceDeduction)) +
    Math.max(0, toNumber(record.totalSalaryDeductions))
  );
}

function isDraftPayroll(record: HrCorePayrollRecord | null | undefined) {
  return String(record?.status || "").toLowerCase() === "draft";
}

function isPaidPayroll(record: HrCorePayrollRecord | null | undefined) {
  return String(record?.status || "").toLowerCase() === "paid" || Boolean(record?.paidAt);
}

function isFinalizedPayroll(record: HrCorePayrollRecord | null | undefined) {
  return Boolean(record) && !isDraftPayroll(record);
}

function recordIncludesOvertime(record: HrCorePayrollRecord | null | undefined) {
  return Boolean(record?.attendanceSummary?.includeOvertimeInPayroll);
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: typeof Users;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-4 shadow-sm dark:bg-card",
        tone === "success" && "border-emerald-200",
        tone === "warning" && "border-amber-200",
        tone === "danger" && "border-rose-200"
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-500 dark:text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-muted",
            tone === "success" && "bg-emerald-50 text-emerald-700",
            tone === "warning" && "bg-amber-50 text-amber-700",
            tone === "danger" && "bg-rose-50 text-rose-700"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="text-xl font-black text-slate-950 dark:text-foreground">{value}</div>
    </div>
  );
}

function AdjustmentEditor({
  title,
  items,
  onChange,
  addLabel,
  language,
  readOnly = false,
}: {
  title: string;
  items: PayrollAdjustment[];
  onChange: (items: PayrollAdjustment[]) => void;
  addLabel: string;
  language: "ar" | "en";
  readOnly?: boolean;
}) {
  const update = (index: number, patch: Partial<PayrollAdjustment>) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  return (
    <section className="rounded-2xl border bg-slate-50/70 p-4 dark:bg-muted/30">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-black text-slate-900 dark:text-foreground">{title}</h3>
        <Badge variant="outline">{money(adjustmentTotal(items), language)}</Badge>
      </div>

      <div className="space-y-2">
        {items.length ? (
          items.map((item, index) => (
            <div key={item.id} className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
              <Input
                value={item.title}
                disabled={readOnly}
                placeholder={tr(language, "البيان", "Item")}
                onChange={event => update(index, { title: event.target.value })}
              />
              <Input
                value={item.amount}
                disabled={readOnly}
                type="number"
                min="0"
                step="0.01"
                placeholder={tr(language, "المبلغ", "Amount")}
                onChange={event => update(index, { amount: event.target.value })}
              />
              {!readOnly ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={tr(language, "حذف", "Remove")}
                  onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-slate-500">
            {tr(language, "لا توجد بنود.", "No items.")}
          </p>
        )}
      </div>

      {!readOnly ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() =>
            onChange([
              ...items,
              { id: createAdjustmentId(), title: "", amount: "" },
            ])
          }
        >
          <Plus className="me-2 h-4 w-4" />
          {addLabel}
        </Button>
      ) : null}
    </section>
  );
}

export default function HrPayrollPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const search = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const requestedEmployeeId = searchParams.get("employeeId")?.trim() || "";
  const requestedMonth = searchParams.get("month")?.trim() || "";
  const initialMonth = parseEmployeePayrollMonth(requestedMonth)
    ? requestedMonth
    : buildEmployeePayrollMonthInput();
  const canManage = hasPermission(user, "payroll.manage");
  const [month, setMonth] = useState(() => initialMonth);
  const initialAttendanceRange = useMemo(
    () => buildDefaultAttendanceRange(initialMonth),
    [initialMonth]
  );
  const [calculationFrom, setCalculationFrom] = useState(initialAttendanceRange.from);
  const [calculationTo, setCalculationTo] = useState(initialAttendanceRange.to);
  const [lastCalculatedRange, setLastCalculatedRange] = useState<{
    from: string;
    to: string;
    prepared: number;
    skipped: number;
  } | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState(requestedEmployeeId || "all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [employees, setEmployees] = useState<HrCoreEmployee[]>([]);
  const [records, setRecords] = useState<HrCorePayrollRecord[]>([]);
  const [preparedDrafts, setPreparedDrafts] = useState<Record<string, PayrollDraft>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [batchCreating, setBatchCreating] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<HrCoreEmployee | null>(null);
  const [draft, setDraft] = useState<PayrollDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [includeOvertime, setIncludeOvertime] = useState(false);
  const [manualAdditions, setManualAdditions] = useState<PayrollAdjustment[]>([]);
  const [manualDeductions, setManualDeductions] = useState<PayrollAdjustment[]>([]);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopening, setReopening] = useState(false);
  const [payrollMudadDocument, setPayrollMudadDocument] = useState<File | null>(null);
  const [mudadInputKey, setMudadInputKey] = useState(0);

  const payrollRange = useMemo(
    () => buildPayrollCalculationRange(month, calculationFrom, calculationTo),
    [calculationFrom, calculationTo, month]
  );

  useEffect(() => {
    const nextRange = buildDefaultAttendanceRange(month);
    setCalculationFrom(nextRange.from);
    setCalculationTo(nextRange.to);
    setLastCalculatedRange(null);
  }, [month]);

  const recordByEmployee = useMemo(() => {
    const map = new Map<string, HrCorePayrollRecord>();
    for (const record of records) {
      if (record.employeeId) map.set(`id:${record.employeeId}`, record);
      if (record.employeeUid) map.set(`uid:${record.employeeUid}`, record);
    }
    return map;
  }, [records]);

  const rows = useMemo<PayrollRow[]>(
    () =>
      employees.map(employee => ({
        employee,
        record:
          recordByEmployee.get(`id:${employee.id}`) ||
          (employee.authUid ? recordByEmployee.get(`uid:${employee.authUid}`) : null) ||
          null,
        draft: preparedDrafts[employee.id] || null,
      })),
    [employees, preparedDrafts, recordByEmployee]
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter(row => {
      if (employeeFilter !== "all" && row.employee.id !== employeeFilter) return false;
      if (statusFilter === "complete" && !isFinalizedPayroll(row.record)) return false;
      if (statusFilter === "draft" && !isDraftPayroll(row.record) && !row.draft) return false;
      if (statusFilter === "incomplete" && (row.record || row.draft)) return false;
      if (!normalizedQuery) return true;
      return [
        row.employee.name,
        row.employee.email,
        row.employee.employeeCode,
        row.employee.department,
        row.employee.title,
      ]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [employeeFilter, query, rows, statusFilter]);

  const totals = useMemo(() => {
    const completeRecords = rows
      .map(row => row.record)
      .filter(record => isFinalizedPayroll(record)) as HrCorePayrollRecord[];
    const prepared = rows.filter(
      row => isDraftPayroll(row.record) || (!row.record && row.draft)
    ).length;
    return {
      employees: rows.length,
      completed: completeRecords.length,
      prepared,
      incomplete: Math.max(0, rows.length - completeRecords.length - prepared),
      base: completeRecords.reduce((sum, record) => sum + toNumber(record.baseSalary), 0),
      additions: completeRecords.reduce((sum, record) => sum + getRecordAdditions(record), 0),
      deductions: completeRecords.reduce((sum, record) => sum + getRecordDeductions(record), 0),
      net: completeRecords.reduce((sum, record) => sum + toNumber(record.finalSalary), 0),
    };
  }, [rows]);

  const selectedRecord = useMemo(() => {
    if (!selectedEmployee) return null;
    return (
      recordByEmployee.get(`id:${selectedEmployee.id}`) ||
      (selectedEmployee.authUid
        ? recordByEmployee.get(`uid:${selectedEmployee.authUid}`)
        : null) ||
      null
    );
  }, [recordByEmployee, selectedEmployee]);

  const fixedAllowances = selectedEmployee ? employeeAllowances(selectedEmployee) : 0;
  const manualAdditionsTotal = adjustmentTotal(manualAdditions);
  const advancesTotal = draft?.advances.reduce((sum, item) => sum + Math.max(0, toNumber(item.amount)), 0) || 0;

  const previewComputation = useMemo(() => {
    if (!selectedEmployee || !draft) return null;
    const attendanceAbsentDateKeys = new Set(draft.attendance.absentDateKeys);
    const payrollAbsences = draft.absences.filter(item => !attendanceAbsentDateKeys.has(item.date));
    return computeEmployeePayroll({
      baseSalary: selectedEmployee.salary.baseSalary,
      allowances: fixedAllowances + manualAdditionsTotal,
      expectedWorkDays: draft.expectedWorkDays,
      expectedWorkHours: draft.expectedWorkHours,
      attendanceExpectedHours: draft.attendance.expectedHours,
      attendanceAbsentDays: draft.attendance.absentDays,
      attendanceMissingHours: draft.attendance.missingHours,
      attendanceOvertimeHours: draft.attendance.overtimeHours,
      actualWorkedHours: draft.attendance.actualHours,
      includeOvertime,
      overtimeMultiplier: employeeOvertimeMultiplier(selectedEmployee),
      insuranceDeduction: selectedEmployee.salary.insuranceDeduction,
      salaryDeductions: [
        ...manualDeductions.map(item => ({ id: item.id, title: item.title, amount: toNumber(item.amount) })),
        ...draft.advances.map(item => ({ id: `advance-${item.id}`, title: tr(language, "سلفة راتب معتمدة", "Approved salary advance"), amount: toNumber(item.amount) })),
      ],
      absences: payrollAbsences,
    });
  }, [draft, fixedAllowances, includeOvertime, language, manualAdditionsTotal, manualDeductions, selectedEmployee]);

  const loadPage = useCallback(
    async (silent = false) => {
      if (!parseEmployeePayrollMonth(month)) return;
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        setPreparedDrafts({});
        const [employeesResult, payrollResult] = await Promise.all([
          listHrCoreEmployees({ active: true, limit: 500 }),
          listHrCorePayrollRecords({ payrollMonth: month, limit: 500 }),
        ]);
        setEmployees(employeesResult.employees.filter(employee => employee.isActive !== false));
        setRecords(payrollResult.payrollRecords);
      } catch (error) {
        console.error("hr_payroll_load_failed", error);
        toast.error(tr(language, "تعذر تحميل بيانات الرواتب.", "Failed to load payroll data."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [language, month]
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const buildDraftForEmployee = useCallback(
    async (
      employee: HrCoreEmployee,
      payrollRecordId?: string
    ): Promise<PayrollDraft> => {
      if (!payrollRange) throw new Error("invalid_payroll_month");
      if (payrollRange.isFutureMonth) throw new Error("future_payroll_month");
      if (payrollRange.hasInvalidRange) throw new Error("invalid_attendance_range");
      if (payrollRange.hasFutureRange) throw new Error("future_attendance_range");
      if (payrollRange.isRangeTooLong) throw new Error("attendance_range_too_long");
      if (!employee.authUid) throw new Error("employee_attendance_uid_missing");
      if (!employee.workSchedule.startTime || !employee.workSchedule.endTime) {
        throw new Error("employee_schedule_missing");
      }
      if (toNumber(employee.salary.baseSalary) <= 0) throw new Error("employee_salary_missing");

      const [attendanceResponse, leaveResponse, absenceResponse, advanceResponse] = await Promise.all([
        fetchAttendanceRecords({
          employeeUid: employee.authUid,
          fromDate: payrollRange.calculationStartDate,
          toDate: payrollRange.calculationEndDate,
          result: "allowed",
          limit: 200,
        }),
        listHrCoreLeaveRequests({ employeeId: employee.id, status: "approved", limit: 200 }),
        listHrCoreAbsences({
          employeeId: employee.id,
          from: payrollRange.calculationStartDate,
          to: payrollRange.calculationEndDate,
          limit: 200,
        }),
        listHrCorePayrollAdvances({
          employeeId: employee.id,
          payrollRecordId,
        }),
      ]);

      const approvedLeaveDateKeys = buildActiveApprovedLeaveDateKeySet(leaveResponse.leaveRequests);
      const weeklyOffDays = normalizeWeeklyOffDays(employee.workSchedule.weeklyOffDays);
      const scheduledWorkDateKeys = buildWorkDateKeysInRange({
        fromDate: payrollRange.calculationStartDate,
        toDate: payrollRange.calculationEndDate,
        weeklyOffDays,
      });
      const attendanceWorkDateKeys = scheduledWorkDateKeys.filter(
        dateKey => !approvedLeaveDateKeys.has(dateKey)
      );
      const attendance = summarizeAttendanceForPayroll(
        attendanceResponse.records,
        {
          startTime: employee.workSchedule.startTime,
          endTime: employee.workSchedule.endTime,
          weeklyOffDays,
        },
        {
          workDateKeys: attendanceWorkDateKeys,
          todayDateKey: getRiyadhTodayDateKey(),
          approvedLeaveDateKeys,
          absenceDateKeys: absenceResponse.absences.map(item => item.date),
        }
      );
      const expectedWorkDays = scheduledWorkDateKeys.length;
      const expectedWorkHours = expectedWorkDays * getShiftExpectedHours(employee.workSchedule);

      return {
        employee,
        attendance,
        absences: absenceResponse.absences,
        advances: advanceResponse.advances,
        approvedLeaveDateKeys,
        calculationStartDate: payrollRange.calculationStartDate,
        calculationEndDate: payrollRange.calculationEndDate,
        expectedWorkDays,
        expectedWorkHours,
        baseAllowances: employeeAllowances(employee),
      };
    },
    [payrollRange]
  );

  const openEmployee = async (employee: HrCoreEmployee) => {
    setSelectedEmployee(employee);
    setDraft(null);
    setIncludeOvertime(false);
    setPayrollMudadDocument(null);
    setMudadInputKey(current => current + 1);
    const record =
      recordByEmployee.get(`id:${employee.id}`) ||
      (employee.authUid ? recordByEmployee.get(`uid:${employee.authUid}`) : null) ||
      null;
    if (record) {
      setManualAdditions(recordManualAdditions(record));
      setManualDeductions(normalizeAdjustmentItems(record.salaryDeductions));
      setIncludeOvertime(recordIncludesOvertime(record));
      if (!isDraftPayroll(record)) return;
    }

    if (!record) {
      setManualAdditions([]);
      setManualDeductions(normalizeAdjustmentItems(employee.salary.deductions));
    }
    const prepared = preparedDrafts[employee.id];
    if (prepared) {
      setDraft(prepared);
      return;
    }
    setDraftLoading(true);
    try {
      const nextDraft = await buildDraftForEmployee(employee, record?.id);
      setDraft(nextDraft);
      setPreparedDrafts(current => ({ ...current, [employee.id]: nextDraft }));
    } catch (error) {
      console.error("payroll_draft_build_failed", error);
      const code = error instanceof Error ? error.message : "";
      const messages: Record<string, string> = {
        future_payroll_month: tr(language, "لا يمكن إنشاء راتب لشهر مستقبلي.", "Cannot create payroll for a future month."),
        invalid_attendance_range: tr(language, "نطاق الحضور غير صحيح. تأكد أن تاريخ البداية قبل تاريخ النهاية.", "Invalid attendance range. Check that the start date is before the end date."),
        future_attendance_range: tr(language, "لا يمكن احتساب الحضور لتاريخ مستقبلي.", "Attendance cannot be calculated for future dates."),
        attendance_range_too_long: tr(language, "نطاق الحضور أكبر من 62 يومًا. اختر دورة راتب أقصر.", "Attendance range exceeds 62 days. Choose a shorter payroll cycle."),
        employee_attendance_uid_missing: tr(language, "الموظف غير مربوط بمعرف حضور.", "Employee has no attendance identity."),
        employee_schedule_missing: tr(language, "جدول دوام الموظف غير مكتمل.", "Employee schedule is incomplete."),
        employee_salary_missing: tr(language, "الراتب الأساسي غير محدد.", "Base salary is missing."),
      };
      toast.error(messages[code] || tr(language, "تعذر احتساب مسودة الراتب.", "Failed to calculate payroll draft."));
    } finally {
      setDraftLoading(false);
    }
  };

  const createPayload = useCallback(
    (payrollDraft: PayrollDraft, additions: PayrollAdjustment[], deductions: PayrollAdjustment[], overtime: boolean) => {
      if (!payrollRange) throw new Error("invalid_payroll_month");
      const employee = payrollDraft.employee;
      const attendanceAbsentDateKeys = new Set(payrollDraft.attendance.absentDateKeys);
      const payrollAbsences = payrollDraft.absences.filter(item => !attendanceAbsentDateKeys.has(item.date));
      const manualAdditionTotal = adjustmentTotal(additions);
      const normalizedDeductions = deductions
        .map(item => ({ id: item.id, title: item.title.trim(), amount: Math.max(0, toNumber(item.amount)) }))
        .filter(item => item.title && item.amount > 0);
      const computation = computeEmployeePayroll({
        baseSalary: employee.salary.baseSalary,
        allowances: payrollDraft.baseAllowances + manualAdditionTotal,
        expectedWorkDays: payrollDraft.expectedWorkDays,
        expectedWorkHours: payrollDraft.expectedWorkHours,
        attendanceExpectedHours: payrollDraft.attendance.expectedHours,
        attendanceAbsentDays: payrollDraft.attendance.absentDays,
        attendanceMissingHours: payrollDraft.attendance.missingHours,
        attendanceOvertimeHours: payrollDraft.attendance.overtimeHours,
        actualWorkedHours: payrollDraft.attendance.actualHours,
        includeOvertime: overtime,
        overtimeMultiplier: employeeOvertimeMultiplier(employee),
        insuranceDeduction: employee.salary.insuranceDeduction,
        salaryDeductions: [
          ...normalizedDeductions,
          ...payrollDraft.advances.map(item => ({
            id: `salary-advance-${item.id}`,
            title: tr(language, "سلفة راتب معتمدة", "Approved salary advance"),
            amount: Math.max(0, toNumber(item.amount)),
          })),
        ],
        absences: payrollAbsences,
      });
      const combinedAbsenceDays = computation.absenceDays + computation.attendanceAbsentDays;
      const combinedAbsenceDeduction = computation.absenceDeduction + computation.attendanceAbsenceDeduction;

      return {
        id: buildEmployeePayrollRecordId(employee.id, month),
        employeeId: employee.id,
        employeeUid: employee.authUid,
        payrollMonth: month,
        monthStart: payrollRange.monthStart,
        monthEnd: payrollRange.monthEnd,
        calculationStartDate: payrollDraft.calculationStartDate,
        calculationEndDate: payrollDraft.calculationEndDate,
        baseSalary: computation.baseSalary,
        housingAllowance: employee.salary.housingAllowance,
        transportationAllowance: employee.salary.transportationAllowance,
        otherAllowances: employee.salary.otherAllowances,
        allowances: computation.allowances,
        absenceDays: combinedAbsenceDays,
        absenceDeduction: combinedAbsenceDeduction,
        expectedWorkHours: payrollDraft.expectedWorkHours,
        actualWorkedHours: payrollDraft.attendance.actualHours,
        attendanceLateHours: payrollDraft.attendance.lateHours,
        attendanceMissingHours: payrollDraft.attendance.missingHours,
        attendanceOvertimeHours: payrollDraft.attendance.overtimeHours,
        attendanceCompleteDays: payrollDraft.attendance.completeDays,
        attendanceIncompleteDays: payrollDraft.attendance.incompleteDays,
        attendanceAbsentDays: computation.attendanceAbsentDays,
        attendanceAbsenceDeduction: computation.attendanceAbsenceDeduction,
        attendanceSource: "cloudflare_attendance",
        attendanceSummary: {
          ...payrollDraft.attendance,
          includeOvertimeInPayroll: overtime,
          overtimeMultiplier: computation.overtimeMultiplier,
          detectedOvertimeHours: computation.detectedOvertimeHours,
          financialOvertimeHours: computation.financialOvertimeHours,
          manualAdditions: additions
            .map(item => ({ id: item.id, title: item.title.trim(), amount: Math.max(0, toNumber(item.amount)) }))
            .filter(item => item.title && item.amount > 0),
        },
        scheduleSnapshot: {
          startTime: employee.workSchedule.startTime,
          endTime: employee.workSchedule.endTime,
          weeklyOffDays: normalizeWeeklyOffDays(employee.workSchedule.weeklyOffDays),
        },
        delayDeduction: computation.delayDeduction,
        overtimeBonus: computation.overtimeBonus,
        insuranceDeduction: computation.insuranceDeduction,
        salaryDeductions: normalizedDeductions,
        salaryAdvanceRequestIds: payrollDraft.advances.map(item => item.id),
        totalSalaryDeductions: computation.totalSalaryDeductions,
        absenceEntries: payrollAbsences.map(item => ({ date: item.date, type: item.type, note: item.note })),
        grossSalary: computation.grossSalary,
        finalSalary: computation.finalSalary,
      };
    },
    [language, month, payrollRange]
  );

  const saveSelectedPayroll = async () => {
    if (!selectedEmployee || !draft) return;
    if (payrollMudadDocument && !isSupportedMudadPayrollDocument(payrollMudadDocument)) {
      toast.error(
        tr(
          language,
          "الصيغ المدعومة لمرفقات الراتب هي PDF أو PNG أو JPG فقط.",
          "Payroll attachments must be PDF, PNG, or JPG."
        )
      );
      return;
    }
    setSaving(true);
    try {
      const payrollRecordId =
        selectedRecord?.id || buildEmployeePayrollRecordId(selectedEmployee.id, month);
      let mudadDocument = selectedRecord?.mudadDocument || null;
      if (payrollMudadDocument) {
        const uploaded = await uploadDocumentToCloudflare({
          entityType: "employee_payroll_record",
          entityId: payrollRecordId,
          category: "employee_payroll_mudad_document",
          file: payrollMudadDocument,
          kind: "attachment",
          uploadedBy: user?.uid || undefined,
          storageFolder: "mudad_documents",
        });
        mudadDocument = {
          id: uploaded.id,
          fileName: uploaded.fileName,
          filePath: uploaded.filePath,
          fileUrl: uploaded.fileUrl || buildR2DownloadUrl(uploaded.filePath, false),
          contentType: uploaded.contentType || null,
          fileSize: uploaded.fileSize,
          uploadedAt: uploaded.uploadedAt,
          uploadedBy: user?.uid || null,
        };
      }
      const payload = {
        ...createPayload(
          draft,
          manualAdditions,
          manualDeductions,
          includeOvertime
        ),
        id: payrollRecordId,
        mudadDocument,
      };
      const result = selectedRecord && isDraftPayroll(selectedRecord)
        ? await finalizeHrCorePayrollRecord(selectedRecord.id, payload)
        : await createHrCorePayrollRecord(payload);
      setRecords(current => [
        result.payrollRecord,
        ...current.filter(record => record.id !== result.payrollRecord.id),
      ]);
      setPreparedDrafts(current => {
        const next = { ...current };
        delete next[selectedEmployee.id];
        return next;
      });
      toast.success(
        selectedRecord && isDraftPayroll(selectedRecord)
          ? tr(language, "تم تحديث الراتب وإعادة اعتماده.", "Payroll was updated and finalized again.")
          : tr(language, "تم إنشاء واعتماد الراتب.", "Payroll was created and finalized.")
      );
      setDraft(null);
      setPayrollMudadDocument(null);
      setMudadInputKey(current => current + 1);
    } catch (error) {
      console.error("payroll_record_save_failed", error);
      const code = error instanceof Error ? (error as Error & { code?: string }).code || error.message : "";
      toast.error(
        code === "payroll_record_exists"
          ? tr(language, "يوجد راتب محفوظ لهذا الموظف والشهر.", "A payroll record already exists for this employee and month.")
          : code === "payroll_record_not_draft"
            ? tr(language, "هذا الراتب لم يعد مسودة. حدّث الصفحة وحاول مرة أخرى.", "This payroll is no longer a draft. Refresh and try again.")
            : tr(language, "تعذر حفظ الراتب.", "Failed to save payroll.")
      );
    } finally {
      setSaving(false);
    }
  };

  const reopenSelectedPayroll = async () => {
    if (!selectedEmployee || !selectedRecord || !canManage) return;
    const reason = reopenReason.trim();
    if (reason.length < 3) {
      toast.error(tr(language, "اكتب سببًا واضحًا لإلغاء الاعتماد.", "Enter a clear reason for reopening payroll."));
      return;
    }
    setReopening(true);
    try {
      const result = await reopenHrCorePayrollRecord(selectedRecord.id, { reason });
      setRecords(current => [
        result.payrollRecord,
        ...current.filter(record => record.id !== result.payrollRecord.id),
      ]);
      setReopenDialogOpen(false);
      setReopenReason("");
      setManualAdditions(recordManualAdditions(result.payrollRecord));
      setManualDeductions(normalizeAdjustmentItems(result.payrollRecord.salaryDeductions));
      setIncludeOvertime(recordIncludesOvertime(result.payrollRecord));
      setDraftLoading(true);
      const nextDraft = await buildDraftForEmployee(selectedEmployee, result.payrollRecord.id);
      setDraft(nextDraft);
      setPreparedDrafts(current => ({ ...current, [selectedEmployee.id]: nextDraft }));
      toast.success(tr(language, "تم إلغاء الاعتماد وإعادة الراتب للمسودة.", "Payroll was reopened as a draft."));
    } catch (error) {
      console.error("payroll_record_reopen_failed", error);
      const code = error instanceof Error ? (error as Error & { code?: string }).code || error.message : "";
      toast.error(
        code === "paid_payroll_cannot_be_reopened"
          ? tr(language, "لا يمكن إعادة فتح راتب مصروف.", "A paid payroll cannot be reopened.")
          : tr(language, "تعذر إلغاء اعتماد الراتب.", "Failed to reopen payroll.")
      );
    } finally {
      setDraftLoading(false);
      setReopening(false);
    }
  };

  const calculatePayrollsFromAttendance = async () => {
    if (!canManage || !payrollRange) return;
    if (payrollRange.isFutureMonth) {
      toast.error(tr(language, "لا يمكن إنشاء راتب لشهر مستقبلي.", "Cannot create payroll for a future month."));
      return;
    }
    if (payrollRange.hasInvalidRange) {
      toast.error(tr(language, "تأكد أن تاريخ البداية يسبق تاريخ النهاية.", "Check that the start date is before the end date."));
      return;
    }
    if (payrollRange.hasFutureRange) {
      toast.error(tr(language, "تاريخ النهاية لا يمكن أن يكون بعد اليوم.", "The end date cannot be in the future."));
      return;
    }
    if (payrollRange.isRangeTooLong) {
      toast.error(tr(language, "دورة الحضور لا يمكن أن تتجاوز 62 يومًا.", "The attendance cycle cannot exceed 62 days."));
      return;
    }

    const targetRows = rows.filter(row => {
      if (isFinalizedPayroll(row.record)) return false;
      return employeeFilter === "all" || row.employee.id === employeeFilter;
    });
    if (!targetRows.length) {
      toast.info(
        employeeFilter === "all"
          ? tr(language, "كل مسيرات الشهر معتمدة بالفعل.", "All monthly payrolls are already finalized.")
          : tr(language, "راتب الموظف المحدد معتمد بالفعل.", "The selected employee payroll is already finalized.")
      );
      return;
    }

    setBatchCreating(true);
    setLastCalculatedRange(null);
    let prepared = 0;
    let skipped = 0;
    const nextDrafts: Record<string, PayrollDraft> = {};
    try {
      for (const row of targetRows) {
        try {
          nextDrafts[row.employee.id] = await buildDraftForEmployee(
            row.employee,
            row.record?.id
          );
          prepared += 1;
        } catch (error) {
          console.error("payroll_attendance_calculation_skipped", row.employee.id, error);
          skipped += 1;
        }
      }
      setPreparedDrafts(current => ({ ...current, ...nextDrafts }));
      setLastCalculatedRange({
        from: payrollRange.calculationStartDate,
        to: payrollRange.calculationEndDate,
        prepared,
        skipped,
      });
      if (prepared) {
        toast.success(
          tr(
            language,
            `تم جلب الحضور واحتساب ${prepared} راتب من ${payrollRange.calculationStartDate} إلى ${payrollRange.calculationEndDate}${skipped ? `، وتعذر احتساب ${skipped}` : ""}. الرواتب ما زالت مسودات بانتظار المراجعة والاعتماد.`,
            `Attendance was loaded and ${prepared} payroll drafts were calculated from ${payrollRange.calculationStartDate} to ${payrollRange.calculationEndDate}${skipped ? `; ${skipped} were skipped` : ""}. Drafts still require review and finalization.`
          )
        );
      } else {
        toast.error(tr(language, "لم يتم احتساب أي راتب. راجع الراتب الأساسي وجدول الدوام وربط الحضور لكل موظف.", "No payroll was calculated. Check base salaries, schedules, and attendance identities."));
      }
    } finally {
      setBatchCreating(false);
    }
  };

  const exportExcel = () => {
    const exportRows = filteredRows.filter(row => isFinalizedPayroll(row.record));
    if (!exportRows.length) {
      toast.error(tr(language, "لا توجد مسيرات مكتملة للتصدير.", "No completed payrolls to export."));
      return;
    }
    const headers = [
      tr(language, "الموظف", "Employee"),
      tr(language, "الرقم الوظيفي", "Employee code"),
      tr(language, "بداية دورة الحضور", "Attendance cycle start"),
      tr(language, "نهاية دورة الحضور", "Attendance cycle end"),
      tr(language, "الراتب الأساسي", "Base salary"),
      tr(language, "الإضافات", "Additions"),
      tr(language, "الخصومات", "Deductions"),
      tr(language, "صافي الراتب", "Net salary"),
      tr(language, "الحضور", "Present days"),
      tr(language, "الغياب", "Absent days"),
      tr(language, "التأخير", "Late hours"),
      tr(language, "الحالة", "Status"),
    ];
    const body = exportRows
      .map(({ employee, record }) => {
        if (!record) return "";
        const values = [
          employeeLabel(employee),
          employee.employeeCode || "",
          record.calculationStartDate || "",
          record.calculationEndDate || "",
          record.baseSalary,
          getRecordAdditions(record),
          getRecordDeductions(record),
          record.finalSalary,
          record.attendanceCompleteDays || 0,
          record.attendanceAbsentDays || 0,
          record.attendanceLateHours || 0,
          record.status,
        ];
        return `<tr>${values.map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`;
      })
      .join("");
    const html = `\ufeff<html dir="rtl"><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${headers.map(value => `<th>${escapeHtml(value)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></body></html>`;
    downloadBlob(html, `madan-payroll-${month}.xls`, "application/vnd.ms-excel;charset=utf-8");
  };

  const printRecords = (recordsToPrint: PayrollRow[], title: string) => {
    const completed = recordsToPrint.filter(row => isFinalizedPayroll(row.record));
    if (!completed.length) {
      toast.error(tr(language, "لا توجد بيانات مكتملة للطباعة.", "No completed data to print."));
      return;
    }
    const popup = window.open("", "_blank", "width=1200,height=800");
    if (!popup) {
      toast.error(tr(language, "اسمح بالنوافذ المنبثقة لإخراج PDF.", "Allow pop-ups to export PDF."));
      return;
    }
    try {
      popup.opener = null;
    } catch {
      // Some browsers block changing opener; printing still works.
    }
    const tableRows = completed
      .map(({ employee, record }) => {
        if (!record) return "";
        return `<tr>
          <td>${escapeHtml(employeeLabel(employee))}</td>
          <td>${escapeHtml(employee.employeeCode || "-")}</td>
          <td>${escapeHtml(money(record.baseSalary, language))}</td>
          <td>${escapeHtml(money(getRecordAdditions(record), language))}</td>
          <td>${escapeHtml(money(getRecordDeductions(record), language))}</td>
          <td><strong>${escapeHtml(money(record.finalSalary, language))}</strong></td>
          <td>${escapeHtml(number(record.attendanceCompleteDays || 0, language))}</td>
          <td>${escapeHtml(number(record.attendanceAbsentDays || 0, language))}</td>
          <td>${escapeHtml(number(record.attendanceLateHours || 0, language))}</td>
        </tr>`;
      })
      .join("");
    const reportRangeStart = completed[0]?.record?.calculationStartDate || calculationFrom;
    const reportRangeEnd = completed[0]?.record?.calculationEndDate || calculationTo;
    popup.document.write(`<!doctype html><html dir="${languageDir(language)}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
      body{font-family:Arial,Tahoma,sans-serif;margin:28px;color:#162033} h1{font-size:24px;margin:0 0 8px;color:#8f1d4e} .meta{display:flex;justify-content:space-between;border:1px solid #d8dee8;padding:12px;margin:18px 0;background:#f8fafc} table{width:100%;border-collapse:collapse;font-size:12px} th{background:#8f1d4e;color:#fff;padding:9px;border:1px solid #7b1743} td{padding:8px;border:1px solid #d8dee8;text-align:center} .totals{margin-top:18px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.box{border:1px solid #d8dee8;background:#f8fafc;padding:12px}.box strong{display:block;margin-top:6px;font-size:16px}@media print{button{display:none}}
    </style></head><body><h1>${escapeHtml(title)}</h1><div class="meta"><span>${escapeHtml(tr(language, "الشهر", "Month"))}: ${escapeHtml(month)}</span><span>${escapeHtml(tr(language, "دورة الحضور", "Attendance cycle"))}: ${escapeHtml(reportRangeStart)} - ${escapeHtml(reportRangeEnd)}</span><span>${escapeHtml(tr(language, "تاريخ التصدير", "Export date"))}: ${escapeHtml(new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: RIYADH_TIME_ZONE }).format(new Date()))}</span></div><table><thead><tr>
      <th>${escapeHtml(tr(language, "الموظف", "Employee"))}</th><th>${escapeHtml(tr(language, "الرقم", "Code"))}</th><th>${escapeHtml(tr(language, "الأساسي", "Base"))}</th><th>${escapeHtml(tr(language, "الإضافات", "Additions"))}</th><th>${escapeHtml(tr(language, "الخصومات", "Deductions"))}</th><th>${escapeHtml(tr(language, "الصافي", "Net"))}</th><th>${escapeHtml(tr(language, "الحضور", "Present"))}</th><th>${escapeHtml(tr(language, "الغياب", "Absent"))}</th><th>${escapeHtml(tr(language, "التأخير", "Late"))}</th>
      </tr></thead><tbody>${tableRows}</tbody></table><div class="totals"><div class="box">${escapeHtml(tr(language, "إجمالي الأساسي", "Total base"))}<strong>${escapeHtml(money(completed.reduce((sum, row) => sum + toNumber(row.record?.baseSalary), 0), language))}</strong></div><div class="box">${escapeHtml(tr(language, "إجمالي الإضافات", "Total additions"))}<strong>${escapeHtml(money(completed.reduce((sum, row) => sum + (row.record ? getRecordAdditions(row.record) : 0), 0), language))}</strong></div><div class="box">${escapeHtml(tr(language, "إجمالي الخصومات", "Total deductions"))}<strong>${escapeHtml(money(completed.reduce((sum, row) => sum + (row.record ? getRecordDeductions(row.record) : 0), 0), language))}</strong></div><div class="box">${escapeHtml(tr(language, "إجمالي الصافي", "Total net"))}<strong>${escapeHtml(money(completed.reduce((sum, row) => sum + toNumber(row.record?.finalSalary), 0), language))}</strong></div></div><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`);
    popup.document.close();
  };

  return (
    <DashboardLayout area="hr">
      <main dir={languageDir(language)} className="mx-auto min-h-full w-full max-w-[1700px] space-y-5 bg-[#F8F9FA] p-4 dark:bg-background sm:p-6">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1 text-sm font-bold text-[#9b2457]">{tr(language, "نظام الرواتب", "Payroll System")}</p>
            <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-foreground">{tr(language, "إدارة الرواتب", "Payroll Management")}</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-muted-foreground">{tr(language, "إنشاء مسيرات الرواتب من الحضور والغياب والسلف ومراجعتها وتصديرها.", "Create, review, and export payroll from attendance, absence, and salary advances.")}</p>
          </div>
          <Button variant="outline" onClick={() => void loadPage(true)} disabled={refreshing}>
            <RefreshCw className={cn("me-2 h-4 w-4", refreshing && "animate-spin")} />
            {tr(language, "تحديث", "Refresh")}
          </Button>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#e8cfda] bg-white shadow-sm dark:bg-card">
          <div className="border-b border-[#ead9e1] bg-gradient-to-l from-[#fff8fb] via-white to-[#fffdf8] p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#9b2457] text-white shadow-sm">
                  <CalendarRange className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-black text-slate-950 dark:text-foreground">
                    {tr(language, "احتساب الرواتب من الحضور", "Calculate payroll from attendance")}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
                    {tr(
                      language,
                      "حدد شهر الراتب ودورة الحضور، ثم يجلب النظام الحضور والغياب والتأخير ونقص الساعات والأوفر تايم لكل موظف.",
                      "Choose the payroll month and attendance cycle. The system will load attendance, absence, lateness, missing hours, and overtime for every employee."
                    )}
                  </p>
                </div>
              </div>
              {lastCalculatedRange ? (
                <Badge className="w-fit bg-emerald-100 px-3 py-1.5 text-emerald-800 hover:bg-emerald-100">
                  <CheckCircle2 className="me-1.5 h-4 w-4" />
                  {tr(
                    language,
                    `تم الاحتساب: ${lastCalculatedRange.prepared} موظف`,
                    `Calculated: ${lastCalculatedRange.prepared} employees`
                  )}
                </Badge>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_1fr_1fr_auto] xl:items-end">
              <div className="space-y-2">
                <Label>{tr(language, "شهر الراتب", "Payroll month")}</Label>
                <Input type="month" value={month} onChange={event => setMonth(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{tr(language, "احتساب الحضور من تاريخ", "Attendance from")}</Label>
                <Input
                  type="date"
                  value={calculationFrom}
                  max={calculationTo || getRiyadhTodayDateKey()}
                  onChange={event => {
                    setCalculationFrom(event.target.value);
                    setPreparedDrafts({});
                    setLastCalculatedRange(null);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>{tr(language, "إلى تاريخ", "To date")}</Label>
                <Input
                  type="date"
                  value={calculationTo}
                  min={calculationFrom}
                  max={getRiyadhTodayDateKey()}
                  onChange={event => {
                    setCalculationTo(event.target.value);
                    setPreparedDrafts({});
                    setLastCalculatedRange(null);
                  }}
                />
              </div>
              {canManage ? (
                <Button
                  className="min-h-10 bg-[#9b2457] px-5 hover:bg-[#841e4b]"
                  onClick={() => void calculatePayrollsFromAttendance()}
                  disabled={
                    batchCreating ||
                    loading ||
                    !payrollRange ||
                    payrollRange.isFutureMonth ||
                    payrollRange.hasInvalidRange ||
                    payrollRange.hasFutureRange ||
                    payrollRange.isRangeTooLong
                  }
                >
                  {batchCreating ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Calculator className="me-2 h-4 w-4" />}
                  {tr(language, "جلب الحضور واحتساب الرواتب", "Load attendance and calculate payroll")}
                </Button>
              ) : null}
            </div>

            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-semibold">
                {payrollRange?.hasInvalidRange
                  ? tr(language, "نطاق التواريخ غير صحيح.", "The date range is invalid.")
                  : payrollRange?.hasFutureRange
                    ? tr(language, "تاريخ النهاية لا يمكن أن يكون بعد اليوم.", "The end date cannot be in the future.")
                    : payrollRange?.isRangeTooLong
                      ? tr(language, "دورة الحضور أكبر من 62 يومًا.", "The attendance cycle exceeds 62 days.")
                      : tr(
                          language,
                          `دورة الاحتساب: ${calculationFrom} إلى ${calculationTo} (${payrollRange?.rangeDays || 0} يومًا). لن يتم اعتماد الرواتب تلقائيًا.`,
                          `Calculation cycle: ${calculationFrom} to ${calculationTo} (${payrollRange?.rangeDays || 0} days). Payroll will not be finalized automatically.`
                        )}
              </span>
              {lastCalculatedRange ? (
                <span className="text-xs font-bold text-emerald-700">
                  {lastCalculatedRange.from} ← {lastCalculatedRange.to}
                  {lastCalculatedRange.skipped ? ` · ${tr(language, `تعذر ${lastCalculatedRange.skipped}`, `${lastCalculatedRange.skipped} skipped`)}` : ""}
                </span>
              ) : null}
            </div>
          </div>

          <div className="p-4">
            <div className="grid gap-3 xl:grid-cols-[240px_220px_1fr_auto]">
              <div className="space-y-2">
                <Label>{tr(language, "الموظف المستهدف", "Target employee")}</Label>
                <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tr(language, "كل الموظفين", "All employees")}</SelectItem>
                    {employees.map(employee => <SelectItem key={employee.id} value={employee.id}>{employeeLabel(employee)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{tr(language, "حالة الراتب", "Payroll status")}</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tr(language, "كل الحالات", "All statuses")}</SelectItem>
                    <SelectItem value="complete">{tr(language, "معتمد", "Finalized")}</SelectItem>
                    <SelectItem value="draft">{tr(language, "مسودة", "Draft")}</SelectItem>
                    <SelectItem value="incomplete">{tr(language, "غير محسوب", "Not calculated")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{tr(language, "بحث", "Search")}</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input className="pe-10" value={query} onChange={event => setQuery(event.target.value)} placeholder={tr(language, "اسم الموظف أو الرقم الوظيفي", "Employee name or code")} />
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="me-2 h-4 w-4" />Excel</Button>
                <Button variant="outline" onClick={() => printRecords(filteredRows, tr(language, "مسيرة الرواتب الشهرية", "Monthly payroll report"))}><FileText className="me-2 h-4 w-4" />PDF</Button>
              </div>
            </div>
            {payrollRange?.isFutureMonth ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                {tr(language, "الشهر المحدد مستقبلي؛ يمكن العرض فقط ولا يمكن إنشاء الرواتب.", "The selected month is in the future; payroll creation is disabled.")}
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <MetricCard label={tr(language, "عدد الموظفين", "Employees")} value={number(totals.employees, language, 0)} icon={Users} />
          <MetricCard label={tr(language, "مسيرات معتمدة", "Finalized payrolls")} value={number(totals.completed, language, 0)} icon={CheckCircle2} tone="success" />
          <MetricCard label={tr(language, "غير مكتملة", "Incomplete")} value={number(totals.incomplete, language, 0)} icon={AlertTriangle} tone={totals.incomplete ? "warning" : "default"} />
          <MetricCard label={tr(language, "إجمالي الأساسي", "Base total")} value={money(totals.base, language)} icon={WalletCards} />
          <MetricCard label={tr(language, "إجمالي الإضافات", "Additions total")} value={money(totals.additions, language)} icon={Plus} />
          <MetricCard label={tr(language, "إجمالي الخصومات", "Deductions total")} value={money(totals.deductions, language)} icon={Minus} tone="danger" />
          <MetricCard label={tr(language, "إجمالي صافي الرواتب", "Net payroll total")} value={money(totals.net, language)} icon={BadgeCheck} tone="success" />
          <MetricCard label={tr(language, "مسودات محسوبة", "Prepared drafts")} value={number(totals.prepared, language, 0)} icon={Clock3} tone={totals.prepared ? "warning" : "default"} />
        </section>

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-card">
          {loading ? (
            <div className="grid min-h-72 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-[#9b2457]" /></div>
          ) : filteredRows.length ? (
            <>
              <div className="grid gap-3 p-3 lg:hidden">
                {filteredRows.map(({ employee, record, draft: rowDraft }) => {
                  const recordIsDraft = isDraftPayroll(record);
                  const recordIsFinalized = isFinalizedPayroll(record);
                  const draftPreview = rowDraft ? computeDefaultDraftPayroll(rowDraft, language) : null;
                  const rowAdditions = record
                    ? getRecordAdditions(record)
                    : rowDraft && draftPreview
                      ? rowDraft.baseAllowances + draftPreview.overtimeBonus
                      : null;
                  const rowDeductions = record
                    ? getRecordDeductions(record)
                    : draftPreview
                      ? draftPreview.delayDeduction + draftPreview.absenceDeduction + draftPreview.attendanceAbsenceDeduction + draftPreview.insuranceDeduction + draftPreview.totalSalaryDeductions
                      : null;
                  const setupLabel = recordIsFinalized
                    ? tr(language, "معتمد", "Finalized")
                    : recordIsDraft
                      ? tr(language, "مفتوح للتعديل", "Open for editing")
                      : rowDraft
                        ? tr(language, "جاهز للمراجعة", "Ready for review")
                        : tr(language, "ناقص", "Incomplete");
                  const statusLabel = recordIsFinalized
                    ? tr(language, "معتمد", "Finalized")
                    : recordIsDraft
                      ? tr(language, "مسودة بعد إلغاء الاعتماد", "Reopened draft")
                      : rowDraft
                        ? tr(language, "محسوب بانتظار الاعتماد", "Calculated, pending finalization")
                        : tr(language, "غير محسوب", "Not calculated");

                  return (
                    <article
                      key={employee.id}
                      data-payroll-attention={!recordIsFinalized ? "true" : undefined}
                      className={cn(
                        "rounded-2xl border bg-white p-4 shadow-sm dark:bg-card",
                        !recordIsFinalized && "border-amber-200/80 bg-amber-50/25"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-black text-slate-950 dark:text-foreground">
                            {employeeLabel(employee)}
                          </h3>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {employee.employeeCode || employee.title || employee.department || "—"}
                          </p>
                        </div>
                        <Badge
                          className={cn(
                            "max-w-36 shrink-0 whitespace-normal text-center leading-5",
                            recordIsFinalized
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                              : recordIsDraft || rowDraft
                                ? "bg-sky-100 text-sky-800 hover:bg-sky-100"
                                : "bg-amber-100 text-amber-800 hover:bg-amber-100"
                          )}
                        >
                          {setupLabel}
                        </Badge>
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-2">
                        {[
                          [tr(language, "الراتب الأساسي", "Base salary"), money(record?.baseSalary ?? employee.salary.baseSalary, language), "text-slate-950 dark:text-foreground"],
                          [tr(language, "صافي الراتب", "Net salary"), record ? money(record.finalSalary, language) : draftPreview ? money(draftPreview.finalSalary, language) : "—", "text-slate-950 dark:text-foreground"],
                          [tr(language, "الإضافات", "Additions"), rowAdditions === null ? "—" : money(rowAdditions, language), "text-emerald-700 dark:text-emerald-300"],
                          [tr(language, "الخصومات", "Deductions"), rowDeductions === null ? "—" : money(rowDeductions, language), "text-rose-700 dark:text-rose-300"],
                        ].map(([label, value, valueClass]) => (
                          <div key={label} className="min-w-0 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-muted/40">
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-muted-foreground">{label}</dt>
                            <dd className={cn("mt-1 break-words text-sm font-black tabular-nums", valueClass)}>{value}</dd>
                          </div>
                        ))}
                      </dl>

                      {record || rowDraft ? (
                        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[11px]">
                          <span className="rounded-lg bg-slate-50 px-1.5 py-2 dark:bg-muted/40">{tr(language, "حضور", "Present")}<strong className="mt-0.5 block">{number(record?.attendanceCompleteDays ?? rowDraft?.attendance.completeDays ?? 0, language)}</strong></span>
                          <span className="rounded-lg bg-slate-50 px-1.5 py-2 dark:bg-muted/40">{tr(language, "غياب", "Absent")}<strong className="mt-0.5 block">{number(record?.attendanceAbsentDays ?? rowDraft?.attendance.absentDays ?? 0, language)}</strong></span>
                          <span className="rounded-lg bg-slate-50 px-1.5 py-2 dark:bg-muted/40">{tr(language, "تأخير", "Late")}<strong className="mt-0.5 block">{number(record?.attendanceLateHours ?? rowDraft?.attendance.lateHours ?? 0, language)}h</strong></span>
                          <span className="rounded-lg bg-slate-50 px-1.5 py-2 dark:bg-muted/40">{tr(language, "إضافي", "OT")}<strong className="mt-0.5 block">{number(record?.attendanceOvertimeHours ?? rowDraft?.attendance.overtimeHours ?? 0, language)}h</strong></span>
                        </div>
                      ) : (
                        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500 dark:bg-muted/40 dark:text-muted-foreground">
                          {tr(language, "اضغط جلب الحضور واحتساب الرواتب لإكمال البيانات.", "Use the attendance calculation button to complete this payroll.")}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-border">
                        <Badge variant="secondary" className="max-w-full whitespace-normal text-start leading-5">{statusLabel}</Badge>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => void openEmployee(employee)}><Eye className="me-1 h-4 w-4" />{tr(language, "عرض", "View")}</Button>
                          {recordIsFinalized && record ? <Button size="sm" variant="outline" onClick={() => printRecords([{ employee, record, draft: null }], tr(language, `كشف راتب ${employeeLabel(employee)}`, `${employeeLabel(employee)} salary slip`))}><Download className="me-1 h-4 w-4" />PDF</Button> : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto lg:block">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-muted/40">
                  <TableRow>
                    <TableHead className="min-w-52">{tr(language, "الموظف", "Employee")}</TableHead>
                    <TableHead>{tr(language, "حالة الإعداد", "Setup")}</TableHead>
                    <TableHead>{tr(language, "الراتب الأساسي", "Base salary")}</TableHead>
                    <TableHead className="min-w-52">{tr(language, "ملخص الحضور", "Attendance summary")}</TableHead>
                    <TableHead>{tr(language, "الإضافات", "Additions")}</TableHead>
                    <TableHead>{tr(language, "الخصومات", "Deductions")}</TableHead>
                    <TableHead>{tr(language, "صافي الراتب", "Net salary")}</TableHead>
                    <TableHead>{tr(language, "الحالة", "Status")}</TableHead>
                    <TableHead>{tr(language, "الإجراءات", "Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map(({ employee, record, draft: rowDraft }) => {
                    const recordIsDraft = isDraftPayroll(record);
                    const recordIsFinalized = isFinalizedPayroll(record);
                    const draftPreview = rowDraft ? computeDefaultDraftPayroll(rowDraft, language) : null;
                    const rowAdditions = record ? getRecordAdditions(record) : rowDraft && draftPreview ? rowDraft.baseAllowances + draftPreview.overtimeBonus : null;
                    const rowDeductions = record ? getRecordDeductions(record) : draftPreview ? draftPreview.delayDeduction + draftPreview.absenceDeduction + draftPreview.attendanceAbsenceDeduction + draftPreview.insuranceDeduction + draftPreview.totalSalaryDeductions : null;
                    return (
                    <TableRow
                      key={employee.id}
                      data-payroll-attention={!recordIsFinalized ? "true" : undefined}
                      className={!recordIsFinalized ? "bg-amber-50/25" : undefined}
                    >
                      <TableCell>
                        <div className="font-black text-slate-950 dark:text-foreground">{employeeLabel(employee)}</div>
                        <div className="mt-1 text-xs text-slate-500">{employee.employeeCode || employee.title || employee.department || "—"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={recordIsFinalized ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : recordIsDraft || rowDraft ? "bg-sky-100 text-sky-800 hover:bg-sky-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}>
                          {recordIsFinalized ? tr(language, "معتمد", "Finalized") : recordIsDraft ? tr(language, "مفتوح للتعديل", "Open for editing") : rowDraft ? tr(language, "جاهز للمراجعة", "Ready for review") : tr(language, "ناقص", "Incomplete")}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-bold">{money(record?.baseSalary ?? employee.salary.baseSalary, language)}</TableCell>
                      <TableCell>
                        {record || rowDraft ? (
                          <div className="grid grid-cols-2 gap-1 text-xs">
                            <span className="rounded-lg bg-slate-100 px-2 py-1">{tr(language, "حضور", "Present")} {number(record?.attendanceCompleteDays ?? rowDraft?.attendance.completeDays ?? 0, language)}</span>
                            <span className="rounded-lg bg-slate-100 px-2 py-1">{tr(language, "غياب", "Absent")} {number(record?.attendanceAbsentDays ?? rowDraft?.attendance.absentDays ?? 0, language)}</span>
                            <span className="rounded-lg bg-slate-100 px-2 py-1">{tr(language, "تأخير", "Late")} {number(record?.attendanceLateHours ?? rowDraft?.attendance.lateHours ?? 0, language)}h</span>
                            <span className="rounded-lg bg-slate-100 px-2 py-1">{tr(language, "إضافي", "OT")} {number(record?.attendanceOvertimeHours ?? rowDraft?.attendance.overtimeHours ?? 0, language)}h</span>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">{tr(language, "اضغط جلب الحضور واحتساب الرواتب", "Use the attendance calculation button")}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-bold text-emerald-700">{rowAdditions === null ? "—" : money(rowAdditions, language)}</TableCell>
                      <TableCell className="font-bold text-rose-700">{rowDeductions === null ? "—" : money(rowDeductions, language)}</TableCell>
                      <TableCell className="font-black">{record ? money(record.finalSalary, language) : draftPreview ? money(draftPreview.finalSalary, language) : "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{recordIsFinalized ? tr(language, "معتمد", "Finalized") : recordIsDraft ? tr(language, "مسودة بعد إلغاء الاعتماد", "Reopened draft") : rowDraft ? tr(language, "محسوب بانتظار الاعتماد", "Calculated, pending finalization") : tr(language, "غير محسوب", "Not calculated")}</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => void openEmployee(employee)}><Eye className="me-1 h-4 w-4" />{tr(language, "عرض", "View")}</Button>
                          {recordIsFinalized && record ? <Button size="sm" variant="outline" onClick={() => printRecords([{ employee, record, draft: null }], tr(language, `كشف راتب ${employeeLabel(employee)}`, `${employeeLabel(employee)} salary slip`))}><Download className="me-1 h-4 w-4" />PDF</Button> : null}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </>
          ) : (
            <div className="grid min-h-72 place-items-center text-center">
              <div><Users className="mx-auto mb-3 h-10 w-10 text-slate-300" /><p className="font-bold">{tr(language, "لا توجد نتائج مطابقة.", "No matching results.")}</p></div>
            </div>
          )}
        </section>
      </main>

      <Dialog open={Boolean(selectedEmployee)} onOpenChange={open => !open && setSelectedEmployee(null)}>
        <DialogContent dir={languageDir(language)} className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedEmployee ? employeeLabel(selectedEmployee) : ""}</DialogTitle>
            <DialogDescription>
              {tr(
                language,
                `تفاصيل راتب ${month} ودورة الحضور من ${selectedRecord?.calculationStartDate || draft?.calculationStartDate || calculationFrom} إلى ${selectedRecord?.calculationEndDate || draft?.calculationEndDate || calculationTo}.`,
                `Payroll details for ${month}; attendance cycle from ${selectedRecord?.calculationStartDate || draft?.calculationStartDate || calculationFrom} to ${selectedRecord?.calculationEndDate || draft?.calculationEndDate || calculationTo}.`
              )}
            </DialogDescription>
          </DialogHeader>

          {draftLoading ? (
            <div className="grid min-h-72 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-[#9b2457]" /></div>
          ) : selectedEmployee && selectedRecord && isFinalizedPayroll(selectedRecord) ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label={tr(language, "الراتب الأساسي", "Base salary")} value={money(selectedRecord.baseSalary, language)} icon={WalletCards} />
                <MetricCard label={tr(language, "الإضافات", "Additions")} value={money(getRecordAdditions(selectedRecord), language)} icon={Plus} tone="success" />
                <MetricCard label={tr(language, "الخصومات", "Deductions")} value={money(getRecordDeductions(selectedRecord), language)} icon={Minus} tone="danger" />
                <MetricCard label={tr(language, "صافي الراتب", "Net salary")} value={money(selectedRecord.finalSalary, language)} icon={BadgeCheck} tone="success" />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-2xl border p-4">
                  <h3 className="mb-3 font-black">{tr(language, "ملخص الحضور", "Attendance summary")}</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      [tr(language, "أيام الحضور", "Present days"), selectedRecord.attendanceCompleteDays],
                      [tr(language, "أيام الغياب", "Absent days"), selectedRecord.attendanceAbsentDays],
                      [tr(language, "الساعات الفعلية", "Actual hours"), selectedRecord.actualWorkedHours],
                      [tr(language, "ساعات التأخير", "Late hours"), selectedRecord.attendanceLateHours],
                      [tr(language, "ساعات النقص", "Missing hours"), selectedRecord.attendanceMissingHours],
                      [tr(language, "الساعات الإضافية", "Overtime hours"), selectedRecord.attendanceOvertimeHours],
                    ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3 dark:bg-muted"><span className="block text-xs text-slate-500">{label}</span><strong>{number(value || 0, language)}</strong></div>)}
                  </div>
                </section>
                <section className="rounded-2xl border p-4">
                  <h3 className="mb-3 font-black">{tr(language, "تفاصيل الاستحقاق", "Salary details")}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>{tr(language, "البدلات", "Allowances")}</span><strong>{money(selectedRecord.allowances, language)}</strong></div>
                    <div className="flex justify-between"><span>{tr(language, "الأوفر تايم", "Overtime")}</span><strong>{money(selectedRecord.overtimeBonus, language)}</strong></div>
                    <div className="flex justify-between"><span>{tr(language, "خصم التأخير", "Delay deduction")}</span><strong>{money(selectedRecord.delayDeduction, language)}</strong></div>
                    <div className="flex justify-between"><span>{tr(language, "خصم الغياب", "Absence deduction")}</span><strong>{money(selectedRecord.absenceDeduction, language)}</strong></div>
                    <div className="flex justify-between"><span>{tr(language, "التأمينات", "Insurance")}</span><strong>{money(selectedRecord.insuranceDeduction, language)}</strong></div>
                    <div className="flex justify-between border-t pt-2 text-base"><span>{tr(language, "الصافي", "Net")}</span><strong>{money(selectedRecord.finalSalary, language)}</strong></div>
                  </div>
                </section>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <AdjustmentEditor title={tr(language, "الإضافات اليدوية", "Manual additions")} items={recordManualAdditions(selectedRecord)} onChange={() => undefined} addLabel="" language={language} readOnly />
                <AdjustmentEditor title={tr(language, "الخصومات", "Deductions")} items={normalizeAdjustmentItems(selectedRecord.salaryDeductions)} onChange={() => undefined} addLabel="" language={language} readOnly />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-2xl border p-4">
                  <h3 className="mb-3 font-black">{tr(language, "حالة السجل", "Record lifecycle")}</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4"><span>{tr(language, "الحالة", "Status")}</span><strong>{isPaidPayroll(selectedRecord) ? tr(language, "مصروف", "Paid") : tr(language, "معتمد", "Finalized")}</strong></div>
                    <div className="flex justify-between gap-4"><span>{tr(language, "رقم المراجعة", "Revision")}</span><strong>{number(selectedRecord.revision || 1, language, 0)}</strong></div>
                    <div className="flex justify-between gap-4"><span>{tr(language, "تاريخ الاعتماد", "Finalized at")}</span><strong>{dateTime(selectedRecord.finalizedAt || selectedRecord.createdAt, language)}</strong></div>
                    {selectedRecord.reopenedAt ? (
                      <>
                        <div className="flex justify-between gap-4"><span>{tr(language, "آخر إعادة فتح", "Last reopened")}</span><strong>{dateTime(selectedRecord.reopenedAt, language)}</strong></div>
                        <div className="rounded-xl bg-amber-50 p-3 text-amber-900">
                          <span className="block text-xs font-semibold">{tr(language, "سبب إعادة الفتح", "Reopen reason")}</span>
                          <strong className="mt-1 block">{selectedRecord.reopenReason || "—"}</strong>
                        </div>
                      </>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-2xl border p-4">
                  <h3 className="mb-3 font-black">{tr(language, "مرفقات الراتب", "Payroll attachments")}</h3>
                  {selectedRecord.mudadDocument && payrollDocumentUrl(selectedRecord.mudadDocument) ? (
                    <Button asChild type="button" variant="outline" className="w-full justify-start">
                      <a href={payrollDocumentUrl(selectedRecord.mudadDocument)} target="_blank" rel="noreferrer">
                        <FileText className="me-2 h-4 w-4" />
                        {payrollDocumentLabel(selectedRecord.mudadDocument) || tr(language, "فتح المستند", "Open document")}
                      </a>
                    </Button>
                  ) : (
                    <div className="rounded-xl border border-dashed p-4 text-center text-sm text-slate-500">
                      {tr(language, "لا يوجد مستند مرفق لهذا السجل. إرفاق المستند اختياري ولا يؤثر على احتساب الراتب.", "No document is attached to this record. Attachments are optional and do not affect payroll calculations.")}
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : selectedEmployee && draft && previewComputation ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label={tr(language, "الراتب الأساسي", "Base salary")} value={money(selectedEmployee.salary.baseSalary, language)} icon={WalletCards} />
                <MetricCard label={tr(language, "إجمالي الإضافات", "Total additions")} value={money(fixedAllowances + manualAdditionsTotal + previewComputation.overtimeBonus, language)} icon={Plus} tone="success" />
                <MetricCard label={tr(language, "إجمالي الخصومات", "Total deductions")} value={money(previewComputation.delayDeduction + previewComputation.absenceDeduction + previewComputation.attendanceAbsenceDeduction + previewComputation.insuranceDeduction + previewComputation.totalSalaryDeductions, language)} icon={Minus} tone="danger" />
                <MetricCard label={tr(language, "صافي الراتب", "Net salary")} value={money(previewComputation.finalSalary, language)} icon={BadgeCheck} tone="success" />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-2xl border p-4">
                  <h3 className="mb-3 font-black">{tr(language, "ملخص الحضور", "Attendance summary")}</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      [tr(language, "أيام الحضور", "Present days"), draft.attendance.completeDays],
                      [tr(language, "أيام الغياب", "Absent days"), draft.attendance.absentDays],
                      [tr(language, "ساعات الفترة", "Expected hours"), draft.attendance.expectedHours],
                      [tr(language, "الساعات الفعلية", "Actual hours"), draft.attendance.actualHours],
                      [tr(language, "التأخير", "Late hours"), draft.attendance.lateHours],
                      [tr(language, "النقص", "Missing hours"), draft.attendance.missingHours],
                      [tr(language, "الأوفر تايم المكتشف", "Detected overtime"), draft.attendance.overtimeHours],
                      [tr(language, "السلف المعتمدة", "Approved advances"), money(advancesTotal, language)],
                    ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3 dark:bg-muted"><span className="block text-xs text-slate-500">{label}</span><strong>{typeof value === "string" ? value : number(value, language)}</strong></div>)}
                  </div>
                </section>
                <section className="rounded-2xl border p-4">
                  <h3 className="mb-3 font-black">{tr(language, "إعدادات الاحتساب", "Calculation settings")}</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-muted">
                      <div>
                        <div className="font-bold">{tr(language, "احتساب الأوفر تايم", "Include overtime")}</div>
                        <div className="text-xs text-slate-500">
                          {tr(
                            language,
                            `يُضاف للراتب بمعامل ${number(employeeOvertimeMultiplier(selectedEmployee), language)}`,
                            `Adds overtime at a ${number(employeeOvertimeMultiplier(selectedEmployee), language)} multiplier`
                          )}
                        </div>
                      </div>
                      <Switch checked={includeOvertime} onCheckedChange={setIncludeOvertime} />
                    </div>
                    <div className="flex justify-between text-sm"><span>{tr(language, "أيام العمل المعتمدة", "Expected work days")}</span><strong>{number(draft.expectedWorkDays, language)}</strong></div>
                    <div className="flex justify-between text-sm"><span>{tr(language, "ساعات العمل الشهرية", "Monthly work hours")}</span><strong>{number(draft.expectedWorkHours, language)}</strong></div>
                    <div className="flex justify-between text-sm"><span>{tr(language, "راتب اليوم", "Daily salary")}</span><strong>{money(previewComputation.dailySalary, language)}</strong></div>
                    <div className="flex justify-between text-sm"><span>{tr(language, "راتب الساعة", "Hourly rate")}</span><strong>{money(previewComputation.hourlyRate, language)}</strong></div>
                    <div className="flex justify-between text-sm"><span>{tr(language, "خصم التأخير والنقص", "Delay/shortage deduction")}</span><strong>{money(previewComputation.delayDeduction, language)}</strong></div>
                    <div className="flex justify-between text-sm"><span>{tr(language, "خصم الغياب", "Absence deduction")}</span><strong>{money(previewComputation.absenceDeduction + previewComputation.attendanceAbsenceDeduction, language)}</strong></div>
                  </div>
                </section>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <AdjustmentEditor title={tr(language, "الإضافات", "Additions")} items={manualAdditions} onChange={setManualAdditions} addLabel={tr(language, "إضافة استحقاق", "Add addition")} language={language} />
                <AdjustmentEditor title={tr(language, "الخصومات", "Deductions")} items={manualDeductions} onChange={setManualDeductions} addLabel={tr(language, "إضافة خصم", "Add deduction")} language={language} />
              </div>

              <section className="rounded-2xl border bg-slate-50/70 p-4 dark:bg-muted/30">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-black text-slate-900 dark:text-foreground">
                      {tr(language, "مرفقات الراتب", "Payroll attachments")}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {tr(
                        language,
                        "أرفق مستند مدد أو حماية الأجور أو إشعار التحويل البنكي أو أي إثبات متعلق بالراتب. المرفق اختياري ويُحفظ مع سجل هذا الشهر.",
                        "Attach a Mudad, wage-protection, bank-transfer, or other payroll document. Attachments are optional and stored with this monthly record."
                      )}
                    </p>
                  </div>
                  {selectedRecord?.mudadDocument && payrollDocumentUrl(selectedRecord.mudadDocument) ? (
                    <Button asChild type="button" variant="outline" size="sm">
                      <a href={payrollDocumentUrl(selectedRecord.mudadDocument)} target="_blank" rel="noreferrer">
                        <Download className="me-2 h-4 w-4" />
                        {payrollDocumentLabel(selectedRecord.mudadDocument) || tr(language, "المرفق الحالي", "Current attachment")}
                      </a>
                    </Button>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <Input
                    key={mudadInputKey}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                    disabled={saving}
                    onChange={event => {
                      const file = event.target.files?.[0] || null;
                      if (file && !isSupportedMudadPayrollDocument(file)) {
                        toast.error(
                          tr(
                            language,
                            "الصيغ المدعومة لمرفقات الراتب هي PDF أو PNG أو JPG فقط.",
                            "Payroll attachments must be PDF, PNG, or JPG."
                          )
                        );
                        event.currentTarget.value = "";
                        setPayrollMudadDocument(null);
                        return;
                      }
                      setPayrollMudadDocument(file);
                    }}
                  />
                  {payrollMudadDocument ? (
                    <Badge className="w-fit bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                      <Upload className="me-1.5 h-4 w-4" />
                      {payrollMudadDocument.name}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="w-fit">
                      {selectedRecord?.mudadDocument
                        ? tr(language, "سيبقى المرفق الحالي", "Current attachment will be kept")
                        : tr(language, "لا يوجد مرفق", "No attachment")}
                    </Badge>
                  )}
                </div>
              </section>

              <div className="grid gap-3 rounded-2xl border bg-slate-950 p-4 text-white sm:grid-cols-4">
                <div><span className="text-xs text-slate-300">grossSalary</span><strong className="mt-1 block">{money(previewComputation.grossSalary, language)}</strong></div>
                <div><span className="text-xs text-slate-300">totalAdditions</span><strong className="mt-1 block">{money(fixedAllowances + manualAdditionsTotal + previewComputation.overtimeBonus, language)}</strong></div>
                <div><span className="text-xs text-slate-300">totalDeductions</span><strong className="mt-1 block">{money(previewComputation.delayDeduction + previewComputation.absenceDeduction + previewComputation.attendanceAbsenceDeduction + previewComputation.insuranceDeduction + previewComputation.totalSalaryDeductions, language)}</strong></div>
                <div className="rounded-xl bg-[#9b2457] p-3"><span className="text-xs text-rose-100">netSalary</span><strong className="mt-1 block text-lg">{money(previewComputation.finalSalary, language)}</strong></div>
              </div>
            </div>
          ) : selectedEmployee ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
              <AlertTriangle className="mb-2 h-5 w-5" />
              {tr(language, "تعذر تجهيز مسودة الراتب. تأكد من الراتب الأساسي وجدول الدوام وربط الموظف بالحضور.", "Could not prepare payroll. Check base salary, work schedule, and attendance identity.")}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setSelectedEmployee(null)}>{tr(language, "إغلاق", "Close")}</Button>
            <div className="flex flex-wrap gap-2">
              {selectedEmployee && selectedRecord && isFinalizedPayroll(selectedRecord) ? (
                <>
                  {canManage && !isPaidPayroll(selectedRecord) ? (
                    <Button
                      variant="outline"
                      className="border-amber-300 text-amber-800 hover:bg-amber-50"
                      onClick={() => setReopenDialogOpen(true)}
                    >
                      <RotateCcw className="me-2 h-4 w-4" />
                      {tr(language, "إلغاء الاعتماد وإعادة للمسودة", "Reopen as draft")}
                    </Button>
                  ) : null}
                  <Button onClick={() => printRecords([{ employee: selectedEmployee, record: selectedRecord, draft: null }], tr(language, `كشف راتب ${employeeLabel(selectedEmployee)}`, `${employeeLabel(selectedEmployee)} salary slip`))}><FileText className="me-2 h-4 w-4" />{tr(language, "تصدير كشف PDF", "Export PDF")}</Button>
                </>
              ) : canManage && draft ? (
                <Button className="bg-[#9b2457] hover:bg-[#841e4b]" disabled={saving} onClick={() => void saveSelectedPayroll()}>{saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <BadgeCheck className="me-2 h-4 w-4" />}{selectedRecord && isDraftPayroll(selectedRecord) ? tr(language, "حفظ وإعادة اعتماد الراتب", "Save and finalize again") : tr(language, "إنشاء واعتماد الراتب", "Create and finalize payroll")}</Button>
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reopenDialogOpen}
        onOpenChange={open => {
          setReopenDialogOpen(open);
          if (!open) setReopenReason("");
        }}
      >
        <DialogContent dir={languageDir(language)} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tr(language, "إلغاء اعتماد الراتب", "Reopen payroll")}</DialogTitle>
            <DialogDescription>
              {tr(
                language,
                "سيعود الراتب إلى مسودة قابلة لإعادة جلب الحضور وتعديل الإضافات والخصومات، مع حفظ سبب الإجراء في سجل التدقيق.",
                "The payroll will return to an editable draft. The reason will be stored in the audit log."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{tr(language, "سبب إلغاء الاعتماد", "Reason for reopening")}</Label>
            <Input
              value={reopenReason}
              onChange={event => setReopenReason(event.target.value)}
              placeholder={tr(language, "مثال: تعديل خصم غياب أو إعادة احتساب الحضور", "Example: correct an absence deduction")}
              disabled={reopening}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)} disabled={reopening}>
              {tr(language, "إلغاء", "Cancel")}
            </Button>
            <Button
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => void reopenSelectedPayroll()}
              disabled={reopening || reopenReason.trim().length < 3}
            >
              {reopening ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <RotateCcw className="me-2 h-4 w-4" />}
              {tr(language, "إعادة للمسودة", "Reopen as draft")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
