import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Fingerprint,
  Grid3X3,
  Loader2,
  Menu,
  MoreVertical,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  adjustAttendanceRecordsAsAdmin,
  clearAttendanceRecordsAsAdmin,
  fetchAttendanceRecords,
  generateAttendanceMonthlySummary,
  listAttendanceMonthlySummaries,
  type AttendanceRecord,
  type AttendanceMonthlySummary,
} from "@/lib/attendanceRecords";
import {
  computeAttendanceDay,
  getAttendanceDayStatus,
  type AttendanceStatus,
} from "@/lib/attendanceCalculations";
import { buildActiveApprovedLeaveDateKeySet } from "@/lib/employeeLeave";
import { formatNumberEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  buildDateKeysInRange,
  formatWeeklyOffDaysLabel,
  type WorkScheduleWeekday,
} from "@/lib/workSchedule";
import { toast } from "sonner";
import { useLanguage, type Language } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";

type ApprovedLeaveLike = {
  status?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  cancelledDateKeys?: unknown;
};

type EmployeeTodayAttendancePanelProps = {
  employeeUid?: string | null;
  employeeDocId?: string | null;
  title: string;
  description?: string;
  refreshKey?: number;
  className?: string;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  weeklyOffDays?: WorkScheduleWeekday[] | string[] | null;
  approvedLeaveRequests?: ApprovedLeaveLike[];
  holidayDateKeys?: string[];
  absenceDateKeys?: string[];
  canManageAttendance?: boolean;
  cancelLeaveLoading?: boolean;
  onCancelLeave?: (dateKey: string) => void | Promise<void>;
};

type MonthBounds = {
  fromDate: string;
  toDate: string;
  monthLabel: string;
  monthName: string;
  yearLabel: string;
  year: number;
  monthIndex: number;
  daysInMonth: number;
  firstDayIndex: number;
};

type MonthlyAttendanceDay = {
  date: string;
  dayNumber: number;
  records: AttendanceRecord[];
  checkIn: AttendanceRecord | null;
  checkOut: AttendanceRecord | null;
  hasAttendance: boolean;
  hasEvent: boolean;
  hasWarning: boolean;
};

const WEEKDAY_LABELS = {
  ar: ["أحد", "اثن", "ثلث", "ربع", "خميس", "جمع", "سبت"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
} satisfies Record<Language, string[]>;
const RIYADH_TIME_ZONE = "Asia/Riyadh";

function getRiyadhTodayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getRiyadhTodayMonthStart() {
  const todayKey = getRiyadhTodayKey();
  const [year, month] = todayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1, 12));
}

function getYearMonthFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getYearMonthFromBounds(bounds: MonthBounds) {
  return `${bounds.year}-${String(bounds.monthIndex + 1).padStart(2, "0")}`;
}

function isValidYearMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function getMonthBounds(monthDate: Date, language: "ar" | "en"): MonthBounds {
  const year = monthDate.getUTCFullYear();
  const monthIndex = monthDate.getUTCMonth();
  const month = String(monthIndex + 1).padStart(2, "0");
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const firstDayIndex = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const labelDate = new Date(Date.UTC(year, monthIndex, 15, 12));
  const locale = language === "ar" ? "ar-SA-u-ca-gregory" : "en-US";
  const monthName = new Intl.DateTimeFormat(locale, {
    timeZone: RIYADH_TIME_ZONE,
    month: "long",
  }).format(labelDate);
  const yearLabel = new Intl.DateTimeFormat(locale, {
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
  }).format(labelDate);

  return {
    fromDate: `${year}-${month}-01`,
    toDate: `${year}-${month}-${String(daysInMonth).padStart(2, "0")}`,
    monthLabel: `${monthName} ${yearLabel}`,
    monthName,
    yearLabel,
    year,
    monthIndex,
    daysInMonth,
    firstDayIndex,
  };
}

function formatRecordDate(value?: string | null) {
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

function formatDisplayTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: RIYADH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatScheduleTime(value?: string | null, language: "ar" | "en" = "ar") {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(value || "").trim());
  if (!match) return "";

  const hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return "";

  const displayHours = hours % 12 || 12;
  if (language === "ar") {
    return `${formatNumberEN(displayHours, { maximumFractionDigits: 0 })}:${minutes} ${hours < 12 ? "ص" : "م"}`;
  }
  return `${String(displayHours).padStart(2, "0")}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

function formatScheduleRangeLabel(
  startTime?: string | null,
  endTime?: string | null,
  language: "ar" | "en" = "ar"
) {
  const start = formatScheduleTime(startTime, language);
  const end = formatScheduleTime(endTime, language);
  return start && end ? `${start} — ${end}` : "--";
}

function formatDisplayDateTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  const dateLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: RIYADH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return `${dateLabel} ${timeLabel}`;
}

function formatJsonArrayValue(values: string[]) {
  return JSON.stringify(values || []);
}

function formatTimeInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: RIYADH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.hour}:${values.minute}`;
}

function formatLocalizedDate(value: string, language: "ar" | "en") {
  const date = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA-u-ca-gregory" : "en-US", {
    timeZone: RIYADH_TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
}

function formatDurationFromMs(value: number | null, language: "ar" | "en") {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "--";
  }

  const totalMinutes = Math.round(value / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) {
    return tr(
      language,
      `${formatNumberEN(hours)} ساعة ${formatNumberEN(minutes)} دقيقة`,
      `${formatNumberEN(hours)}h ${formatNumberEN(minutes)}m`
    );
  }
  if (hours) return tr(language, `${formatNumberEN(hours)} ساعة`, `${formatNumberEN(hours)}h`);
  return tr(language, `${formatNumberEN(minutes)} دقيقة`, `${formatNumberEN(minutes)}m`);
}

function formatDurationFromHours(value: number | null | undefined, language: "ar" | "en") {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "--";
  }

  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) {
    return tr(
      language,
      `${formatNumberEN(hours)} ساعة ${formatNumberEN(minutes)} دقيقة`,
      `${formatNumberEN(hours)}h ${formatNumberEN(minutes)}m`
    );
  }
  if (hours) return tr(language, `${formatNumberEN(hours)} ساعة`, `${formatNumberEN(hours)}h`);
  return tr(language, `${formatNumberEN(minutes)} دقيقة`, `${formatNumberEN(minutes)}m`);
}

function formatDurationFromHoursOrZero(
  value: number | null | undefined,
  language: "ar" | "en"
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return tr(language, "0 ساعة", "0h");
  }
  return formatDurationFromHours(value, language);
}

function formatNetHoursDifferenceLabel(value: number | null | undefined, language: "ar" | "en") {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (amount === 0) return tr(language, "صافي فرق الساعات: 0", "Net hours difference: 0");
  const duration = formatDurationFromHours(Math.abs(amount), language);
  return amount > 0
    ? tr(language, `زيادة ساعات: ${duration}`, `Extra hours: ${duration}`)
    : tr(language, `نقص ساعات: ${duration}`, `Missing hours: ${duration}`);
}

function getAttendanceAdministrativeStatusLabel(
  computation: ReturnType<typeof computeAttendanceDay> | null | undefined,
  status: AttendanceStatus,
  language: "ar" | "en"
) {
  if (!computation) return getAttendanceStatusLabel(status, language);
  if (!computation.isComplete) {
    return tr(language, "بصمة غير مكتملة", "Incomplete punch");
  }
  if (computation.missingHours > 0) {
    return tr(language, "ناقص ساعات", "Missing hours");
  }
  if (computation.lateHours > 0 && computation.overtimeHours > 0) {
    return tr(language, "تأخير معوّض + زيادة ساعات", "Compensated late + extra hours");
  }
  if (computation.lateHours > 0 && computation.compensatedLateHours > 0) {
    return tr(language, "مكتمل مع تأخير معوّض", "Complete with compensated lateness");
  }
  if (computation.overtimeHours > 0) {
    return tr(language, "مكتمل مع زيادة ساعات", "Complete with extra hours");
  }
  return tr(language, "مكتمل", "Complete");
}

function getAttendanceStatus(
  day: MonthlyAttendanceDay | null,
  computation: ReturnType<typeof computeAttendanceDay> | null | undefined,
  options: {
    todayKey: string;
    weeklyOffDays?: WorkScheduleWeekday[] | string[] | null;
    approvedLeaveDateKeys: Set<string>;
    holidayDateKeys: Set<string>;
    absenceDateKeys: Set<string>;
  }
): AttendanceStatus {
  if (!day) return "future";
  return getAttendanceDayStatus({
    date: day.date,
    hasAttendance: day.hasAttendance,
    checkOut: day.checkOut,
    computation,
    todayDateKey: options.todayKey,
    weeklyOffDays: options.weeklyOffDays,
    approvedLeaveDateKeys: options.approvedLeaveDateKeys,
    holidayDateKeys: options.holidayDateKeys,
    absenceDateKeys: options.absenceDateKeys,
  });
}

function getAttendanceStatusLabel(status: AttendanceStatus, language: "ar" | "en") {
  switch (status) {
    case "present":
      return tr(language, "حضور مكتمل", "Complete Attendance");
    case "partial":
      return tr(language, "حضور يحتاج مراجعة", "Needs Review");
    case "absent":
      return tr(language, "غياب", "Absent");
    case "leave":
      return tr(language, "إجازة معتمدة", "Approved Leave");
    case "off_day":
      return tr(language, "يوم راحة أسبوعية", "Weekly Day Off");
    case "today_pending":
      return tr(language, "بانتظار تسجيل اليوم", "Pending Today");
    case "future":
    default:
      return tr(language, "يوم قادم", "Upcoming Day");
  }
}

function getStatusIndicatorClass(status: AttendanceStatus) {
  switch (status) {
    case "present":
      return "bg-emerald-500";
    case "partial":
      return "bg-rose-500";
    case "absent":
      return "bg-rose-500";
    case "leave":
      return "bg-blue-500";
    case "off_day":
      return "bg-cyan-600";
    default:
      return "";
  }
}

function getSelectedDayClass(status: AttendanceStatus) {
  return status === "future"
    ? "border-orange-500 bg-transparent"
    : "border-orange-500 bg-orange-50";
}

function getSelectedNumberClass(_status: AttendanceStatus) {
  return "bg-orange-500 text-white";
}

function getSelectedSummaryClass(status: AttendanceStatus) {
  switch (status) {
    case "partial":
      return "border-rose-200 bg-rose-50/60";
    case "absent":
      return "border-rose-200 bg-rose-50/60";
    case "leave":
      return "border-blue-200 bg-blue-50";
    case "off_day":
      return "border-cyan-300 bg-cyan-100";
    case "present":
      return "border-emerald-200 bg-emerald-50/60";
    default:
      return "border-slate-200 bg-white";
  }
}

function getSelectedAccentClass(status: AttendanceStatus) {
  switch (status) {
    case "partial":
      return "bg-rose-400";
    case "absent":
      return "bg-rose-400";
    case "leave":
      return "bg-blue-500";
    case "off_day":
      return "bg-cyan-600";
    case "present":
      return "bg-emerald-400";
    default:
      return "bg-slate-300";
  }
}

function getWorkDurationMs(day?: MonthlyAttendanceDay | null) {
  if (!day?.checkIn?.serverTime || !day.checkOut?.serverTime) return null;
  const start = Date.parse(day.checkIn.serverTime);
  const end = Date.parse(day.checkOut.serverTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }
  return end - start;
}

function getDateKey(year: number, monthIndex: number, dayNumber: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
}

function buildMonthlyDays(records: AttendanceRecord[], bounds: MonthBounds) {
  const grouped = new Map<string, AttendanceRecord[]>();
  for (const record of records) {
    const dateKey = formatRecordDate(record.serverTime);
    if (!dateKey) continue;
    const group = grouped.get(dateKey) || [];
    group.push(record);
    grouped.set(dateKey, group);
  }

  const days = new Map<string, MonthlyAttendanceDay>();

  for (let dayNumber = 1; dayNumber <= bounds.daysInMonth; dayNumber += 1) {
    const date = getDateKey(bounds.year, bounds.monthIndex, dayNumber);
    const dayRecords = [...(grouped.get(date) || [])].sort(
      (a, b) => Date.parse(a.serverTime || "") - Date.parse(b.serverTime || "")
    );
    const checkIn =
      dayRecords.find(record => record.type === "check_in") || null;
    const checkOut =
      [...dayRecords].reverse().find(record => record.type === "check_out") ||
      null;

    days.set(date, {
      date,
      dayNumber,
      records: dayRecords,
      checkIn,
      checkOut,
      hasAttendance: dayRecords.length > 0,
      // TODO: اربط ملاحظات/أحداث الموظف عند توفر مصدر بيانات رسمي لها.
      hasEvent: false,
      // TODO: اربط التأخير/التنبيهات عند توفر سياسة دوام أو حقل تأخير في البيانات.
      hasWarning: false,
    });
  }

  return days;
}

function AttendanceMetric({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-h-[106px] rounded-[18px] border border-slate-200 bg-white px-4 py-4 text-right shadow-[0_8px_24px_-22px_rgba(15,23,42,0.35)]">
      <div className="text-sm font-medium text-slate-400">{label}</div>
      <div
        className={cn(
          "mt-8 text-base font-semibold text-slate-950",
          valueClassName
        )}
      >
        {value}
      </div>
    </div>
  );
}

function AttendanceSummaryPill({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-2xl border px-3 py-2",
        className
      )}
    >
      <span className="font-semibold">{label}</span>
      <span className="tabular-nums">{formatNumberEN(value)}</span>
    </div>
  );
}

function MonthlySummaryField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[16px] border border-slate-200 bg-white px-3 py-3 text-right">
      <div className="text-[11px] font-semibold text-slate-400">{label}</div>
      <div
        className={cn(
          "mt-2 break-words text-sm font-semibold text-slate-950",
          mono && "font-mono text-xs leading-6"
        )}
        dir={mono ? "ltr" : "rtl"}
      >
        {value}
      </div>
    </div>
  );
}

function AttendanceMonthlySummaryCard({
  summary,
  language,
}: {
  summary: AttendanceMonthlySummary;
  language: Language;
}) {
  return (
    <div className="space-y-3 rounded-[22px] border border-emerald-100 bg-emerald-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-right">
        <div>
          <div className="text-sm font-semibold text-emerald-900">
            {tr(language, "ملخص الحضور الشهري", "Monthly Attendance Summary")}
          </div>
          <p className="mt-1 text-xs leading-6 text-emerald-700">
            {tr(language, "هذه قراءة محفوظة من جدول الملخصات، وليست أرشفة أو حذف للسجلات.", "This is a saved summary record, not an archive or deletion of attendance records.")}
          </p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-800">
          {summary.yearMonth}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MonthlySummaryField label="year_month" value={summary.yearMonth} />
        <MonthlySummaryField
          label="present_days"
          value={formatNumberEN(summary.presentDays)}
        />
        <MonthlySummaryField
          label="check_in_count"
          value={formatNumberEN(summary.checkInCount)}
        />
        <MonthlySummaryField
          label="check_out_count"
          value={formatNumberEN(summary.checkOutCount)}
        />
        <MonthlySummaryField
          label="rejected_count"
          value={formatNumberEN(summary.rejectedCount)}
        />
        <MonthlySummaryField
          label="source_records_count"
          value={formatNumberEN(summary.sourceRecordsCount)}
        />
        <MonthlySummaryField
          label="first_check_in"
          value={formatDisplayDateTime(summary.firstCheckIn)}
          mono
        />
        <MonthlySummaryField
          label="last_check_out"
          value={formatDisplayDateTime(summary.lastCheckOut)}
          mono
        />
        <MonthlySummaryField
          label="device_ids_json"
          value={formatJsonArrayValue(summary.deviceIds)}
          mono
        />
        <MonthlySummaryField
          label="zone_ids_json"
          value={formatJsonArrayValue(summary.zoneIds)}
          mono
        />
      </div>
    </div>
  );
}

export default function EmployeeTodayAttendancePanel({
  employeeUid,
  employeeDocId,
  refreshKey = 0,
  className,
  shiftStartTime,
  shiftEndTime,
  weeklyOffDays,
  approvedLeaveRequests = [],
  holidayDateKeys = [],
  absenceDateKeys = [],
  canManageAttendance = false,
  cancelLeaveLoading = false,
  onCancelLeave,
}: EmployeeTodayAttendancePanelProps) {
  const { language } = useLanguage();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [monthDate, setMonthDate] = useState(() => getRiyadhTodayMonthStart());
  const [summaryMonth, setSummaryMonth] = useState(() =>
    getYearMonthFromDate(getRiyadhTodayMonthStart())
  );
  const [monthlySummary, setMonthlySummary] =
    useState<AttendanceMonthlySummary | null>(null);
  const [monthlySummaryLoading, setMonthlySummaryLoading] = useState(false);
  const [monthlySummaryGenerating, setMonthlySummaryGenerating] =
    useState(false);
  const [monthlySummaryError, setMonthlySummaryError] = useState("");
  const [monthlySummaryRefreshKey, setMonthlySummaryRefreshKey] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => getRiyadhTodayKey());
  const [activeTab, setActiveTab] = useState<"records" | "leave">("records");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentCheckInTime, setAdjustmentCheckInTime] = useState("");
  const [adjustmentCheckOutTime, setAdjustmentCheckOutTime] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [clearingAttendance, setClearingAttendance] = useState(false);
  const [adjustmentRefreshKey, setAdjustmentRefreshKey] = useState(0);
  const monthBounds = useMemo(
    () => getMonthBounds(monthDate, language),
    [language, monthDate]
  );
  const detailsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSummaryMonth(getYearMonthFromBounds(monthBounds));
  }, [monthBounds.monthIndex, monthBounds.year]);

  useEffect(() => {
    const uid = String(employeeUid || "").trim();
    if (!uid) {
      setRecords([]);
      setLoading(false);
      setError("");
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    fetchAttendanceRecords({
      employeeUid: uid,
      fromDate: monthBounds.fromDate,
      toDate: monthBounds.toDate,
      result: "allowed",
      limit: 200,
    })
      .then(response => {
        if (active) setRecords(response.records);
      })
      .catch(fetchError => {
        console.error("employee_monthly_attendance_failed", fetchError);
        if (active) {
          setRecords([]);
          setError("تعذر تحميل سجل الحضور الشهري.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    employeeUid,
    monthBounds.fromDate,
    monthBounds.toDate,
    adjustmentRefreshKey,
    refreshKey,
  ]);

  useEffect(() => {
    const uid = String(employeeUid || "").trim();
    if (!canManageAttendance || !uid || !isValidYearMonth(summaryMonth)) {
      setMonthlySummary(null);
      setMonthlySummaryLoading(false);
      setMonthlySummaryError("");
      return;
    }

    let active = true;
    setMonthlySummaryLoading(true);
    setMonthlySummaryError("");

    listAttendanceMonthlySummaries(uid, summaryMonth, summaryMonth)
      .then(summaries => {
        if (active) setMonthlySummary(summaries[0] || null);
      })
      .catch(fetchError => {
        console.error("attendance_monthly_summary_load_failed", fetchError);
        if (active) {
          setMonthlySummary(null);
          setMonthlySummaryError("تعذر تحميل ملخص الحضور الشهري.");
        }
      })
      .finally(() => {
        if (active) setMonthlySummaryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    canManageAttendance,
    employeeUid,
    monthlySummaryRefreshKey,
    summaryMonth,
  ]);

  useEffect(() => {
    if (
      selectedDate < monthBounds.fromDate ||
      selectedDate > monthBounds.toDate
    ) {
      const todayKey = getRiyadhTodayKey();
      setSelectedDate(
        todayKey >= monthBounds.fromDate && todayKey <= monthBounds.toDate
          ? todayKey
          : monthBounds.fromDate
      );
    }
  }, [monthBounds.fromDate, monthBounds.toDate, selectedDate]);

  const monthDays = useMemo(
    () => buildMonthlyDays(records, monthBounds),
    [monthBounds, records]
  );
  const todayKey = getRiyadhTodayKey();
  const approvedLeaveDateKeys = useMemo(
    () => buildActiveApprovedLeaveDateKeySet(approvedLeaveRequests),
    [approvedLeaveRequests]
  );
  const holidayDateKeySet = useMemo(
    () =>
      new Set(
        holidayDateKeys.map(date => String(date || "").trim()).filter(Boolean)
      ),
    [holidayDateKeys]
  );
  const absenceDateKeySet = useMemo(
    () =>
      new Set(
        absenceDateKeys.map(date => String(date || "").trim()).filter(Boolean)
      ),
    [absenceDateKeys]
  );
  const selectedDay = monthDays.get(selectedDate) || null;
  const attendanceDaysCount = Array.from(monthDays.values()).filter(
    day => day.hasAttendance
  ).length;
  const attendanceStatusCounts = useMemo(() => {
    return Array.from(monthDays.values()).reduce(
      (counts, day) => {
        const dayComputation = computeAttendanceDay(day.date, day.records, {
          startTime: shiftStartTime,
          endTime: shiftEndTime,
        });
        const status = getAttendanceStatus(day, dayComputation, {
          todayKey,
          weeklyOffDays,
          approvedLeaveDateKeys,
          holidayDateKeys: holidayDateKeySet,
          absenceDateKeys: absenceDateKeySet,
        });
        counts[status] += 1;
        return counts;
      },
      {
        present: 0,
        partial: 0,
        absent: 0,
        leave: 0,
        off_day: 0,
        future: 0,
        today_pending: 0,
      } satisfies Record<AttendanceStatus, number>
    );
  }, [
    approvedLeaveDateKeys,
    absenceDateKeySet,
    holidayDateKeySet,
    monthDays,
    shiftEndTime,
    shiftStartTime,
    todayKey,
    weeklyOffDays,
  ]);
  const workDurationMs = getWorkDurationMs(selectedDay);
  const workDurationLabel = formatDurationFromMs(workDurationMs, language);
  const attendanceComputation = selectedDay
    ? computeAttendanceDay(selectedDay.date, selectedDay.records, {
        startTime: shiftStartTime,
        endTime: shiftEndTime,
      })
    : null;
  const selectedStatus = getAttendanceStatus(
    selectedDay,
    attendanceComputation,
    {
      todayKey,
      weeklyOffDays,
      approvedLeaveDateKeys,
      holidayDateKeys: holidayDateKeySet,
      absenceDateKeys: absenceDateKeySet,
    }
  );
  const lateHoursLabel = attendanceComputation
    ? formatDurationFromHoursOrZero(attendanceComputation.lateHours, language)
    : "--";
  const afterScheduleMetricValue =
    attendanceComputation?.lateHours && attendanceComputation.lateHours > 0
      ? attendanceComputation.compensatedLateHours
      : attendanceComputation?.afterScheduleWorkHours;
  const afterScheduleHoursLabel = attendanceComputation
    ? formatDurationFromHoursOrZero(afterScheduleMetricValue, language)
    : "--";
  const afterScheduleMetricLabel =
    attendanceComputation?.lateHours && attendanceComputation.lateHours > 0
      ? tr(language, "التعويض بعد الدوام", "After-hours compensation")
      : tr(language, "عمل بعد نهاية الدوام", "Work after shift end");
  const overtimeHoursLabel = attendanceComputation
    ? formatDurationFromHoursOrZero(attendanceComputation.overtimeHours, language)
    : "--";
  const missingHoursLabel = attendanceComputation
    ? formatDurationFromHoursOrZero(attendanceComputation.missingHours, language)
    : "--";
  const differenceLabel = attendanceComputation
    ? formatNetHoursDifferenceLabel(attendanceComputation.netHoursDifference, language)
    : "--";
  const selectedStatusLabel = getAttendanceStatusLabel(selectedStatus, language);
  const administrativeStatusLabel = getAttendanceAdministrativeStatusLabel(
    attendanceComputation,
    selectedStatus,
    language
  );
  const isRestOrLeaveSelectedDay =
    selectedStatus === "leave" || selectedStatus === "off_day";
  const selectedRecordsCount = selectedDay?.records.length || 0;
  const hasSelectedRecord = selectedRecordsCount > 0;
  const firstCheckInLabel = formatDisplayTime(selectedDay?.checkIn?.serverTime);
  const lastCheckOutLabel = formatDisplayTime(
    selectedDay?.checkOut?.serverTime
  );
  const shiftTimeLabel = hasSelectedRecord
    ? `${firstCheckInLabel} — ${lastCheckOutLabel}`
    : "--";
  const scheduleTimeLabel = formatScheduleRangeLabel(
    shiftStartTime,
    shiftEndTime,
    language
  );
  const weeklyOffDaysLabel = formatWeeklyOffDaysLabel(weeklyOffDays);

  const openRecordsList = () => {
    setActiveTab("records");
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      detailsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  };

  const openAttendanceAdjustment = () => {
    setAdjustmentCheckInTime(
      formatTimeInputValue(selectedDay?.checkIn?.serverTime) ||
        String(shiftStartTime || "")
    );
    setAdjustmentCheckOutTime(
      formatTimeInputValue(selectedDay?.checkOut?.serverTime) ||
        String(shiftEndTime || "")
    );
    setAdjustmentNote("");
    setAdjustmentOpen(true);
  };

  const handleSaveAttendanceAdjustment = async () => {
    const uid = String(employeeUid || "").trim();
    const docId = String(employeeDocId || employeeUid || "").trim();
    if (!canManageAttendance || !uid || !docId) {
      toast.error("لا تملك صلاحية تعديل بصمة الموظف.");
      return;
    }
    if (!adjustmentCheckInTime && !adjustmentCheckOutTime) {
      toast.error("أدخل وقت الحضور أو وقت الانصراف.");
      return;
    }

    setSavingAdjustment(true);
    try {
      await adjustAttendanceRecordsAsAdmin({
        employeeUid: uid,
        employeeDocId: docId,
        date: selectedDate,
        checkInTime: adjustmentCheckInTime || undefined,
        checkOutTime: adjustmentCheckOutTime || undefined,
        note: adjustmentNote,
      });
      toast.success("تم تعديل بصمة الموظف.");
      setAdjustmentOpen(false);
      setAdjustmentRefreshKey(current => current + 1);
    } catch (saveError) {
      console.error("admin_attendance_adjustment_failed", saveError);
      toast.error("تعذر تعديل بصمة الموظف.");
    } finally {
      setSavingAdjustment(false);
    }
  };

  const handleClearAttendance = async () => {
    const uid = String(employeeUid || "").trim();
    const docId = String(employeeDocId || employeeUid || "").trim();
    const recordsToClear = (selectedDay?.records || []).filter(record =>
      String(record.id || "").trim()
    );
    if (!canManageAttendance || !uid || !docId) {
      toast.error("لا تملك صلاحية مسح بصمة الموظف.");
      return;
    }
    if (!recordsToClear.length) {
      toast.error("لا توجد بصمة مسجلة لهذا اليوم.");
      return;
    }
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        tr(
          language,
          `مسح بصمة يوم ${formatLocalizedDate(selectedDate, language)}؟\n\nسيتم حذف سجلات الحضور والانصراف لهذا اليوم وإعادة تصفير حالة الموظف.`,
          `Clear attendance for ${formatLocalizedDate(selectedDate, language)}?\n\nThis will delete check-in and check-out records for this day and reset the employee status.`
        )
      )
    ) {
      return;
    }

    setClearingAttendance(true);
    try {
      const clearedRecords = await clearAttendanceRecordsAsAdmin({
        employeeUid: uid,
        employeeDocId: docId,
        date: selectedDate,
        recordIds: recordsToClear.map(record => record.id),
        serverTimes: recordsToClear
          .map(record => record.serverTime)
          .filter(Boolean),
        note: "Cleared from HR attendance panel",
      });
      toast.success(
        clearedRecords > 0
          ? `تم مسح ${formatNumberEN(clearedRecords)} سجل بصمة.`
          : "لا توجد سجلات بصمة لمسحها."
      );
      setAdjustmentOpen(false);
      setAdjustmentRefreshKey(current => current + 1);
    } catch (clearError) {
      console.error("admin_attendance_clear_failed", clearError);
      toast.error("تعذر مسح بصمة الموظف.");
    } finally {
      setClearingAttendance(false);
    }
  };

  const handleGenerateMonthlySummary = async () => {
    const uid = String(employeeUid || "").trim();
    if (!canManageAttendance || !uid) {
      toast.error("لا تملك صلاحية توليد ملخص الحضور الشهري.");
      return;
    }
    if (!isValidYearMonth(summaryMonth)) {
      toast.error("اختر شهرًا صحيحًا بصيغة YYYY-MM.");
      return;
    }

    setMonthlySummaryGenerating(true);
    setMonthlySummaryError("");
    try {
      await generateAttendanceMonthlySummary(uid, summaryMonth);
      const summaries = await listAttendanceMonthlySummaries(
        uid,
        summaryMonth,
        summaryMonth
      );
      setMonthlySummary(summaries[0] || null);
      setMonthlySummaryRefreshKey(current => current + 1);
      toast.success("تم توليد ملخص الحضور الشهري.");
    } catch (summaryError) {
      console.error("attendance_monthly_summary_generate_failed", summaryError);
      setMonthlySummaryError("تعذر توليد ملخص الحضور الشهري.");
      toast.error("تعذر توليد ملخص الحضور الشهري.");
    } finally {
      setMonthlySummaryGenerating(false);
    }
  };

  const changeMonth = (direction: "next" | "previous") => {
    setMonthDate(current => {
      const next = new Date(current);
      next.setUTCMonth(current.getUTCMonth() + (direction === "next" ? 1 : -1));
      return next;
    });
  };

  const calendarCells = [
    ...Array.from({ length: monthBounds.firstDayIndex }, (_, index) => ({
      key: `empty-${index}`,
      day: null as MonthlyAttendanceDay | null,
    })),
    ...Array.from(monthDays.values()).map(day => ({
      key: day.date,
      day,
    })),
  ];

  return (
    <section
      dir={languageDir(language)}
      className={cn(
        "w-full max-w-none space-y-6 rounded-[28px] bg-[#fbfbfc] px-4 pb-10 pt-2 text-slate-950 sm:px-6 xl:px-8",
        className
      )}
    >
      <header className="grid grid-cols-[44px_1fr_44px] items-center pt-1">
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full text-slate-800 transition hover:bg-slate-100"
          onClick={openRecordsList}
          aria-label={tr(language, "عرض سجلات اليوم المحدد", "Show selected day records")}
        >
          <Menu className="h-7 w-7" />
        </button>
        <h1 className="text-center text-2xl font-medium tracking-normal text-slate-950">
          {tr(language, "الحضور", "Attendance")}
        </h1>
        <button
          type="button"
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-slate-100",
            summaryOpen ? "bg-slate-100 text-slate-950" : "text-slate-500"
          )}
          onClick={() => setSummaryOpen(open => !open)}
          aria-pressed={summaryOpen}
          aria-label={tr(language, "عرض ملخص حالات الشهر", "Show monthly status summary")}
        >
          <SlidersHorizontal className="h-6 w-6" />
        </button>
      </header>

      {summaryOpen ? (
        <div className="grid gap-2 rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm shadow-sm sm:grid-cols-3">
          <AttendanceSummaryPill
            label={tr(language, "حضور", "Present")}
            value={attendanceStatusCounts.present}
            className="border-emerald-200 bg-emerald-50 text-emerald-700"
          />
          <AttendanceSummaryPill
            label={tr(language, "ناقص", "Partial")}
            value={attendanceStatusCounts.partial}
            className="border-rose-200 bg-rose-50 text-rose-700"
          />
          <AttendanceSummaryPill
            label={tr(language, "غياب", "Absent")}
            value={attendanceStatusCounts.absent}
            className="border-rose-200 bg-rose-50 text-rose-700"
          />
          <AttendanceSummaryPill
            label={tr(language, "إجازة", "Leave")}
            value={attendanceStatusCounts.leave}
            className="border-blue-200 bg-blue-50 text-blue-700"
          />
          <AttendanceSummaryPill
            label={tr(language, "راحة", "Off")}
            value={attendanceStatusCounts.off_day}
            className="border-cyan-300 bg-cyan-100 text-cyan-800"
          />
        </div>
      ) : null}

      {canManageAttendance ? (
        <div className="space-y-4 rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_-28px_rgba(15,23,42,0.35)]">
          <div className="flex flex-col gap-3 text-right lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-base font-semibold text-slate-950">
                {tr(language, "ملخص الحضور الشهري", "Monthly Attendance Summary")}
              </div>
              <p className="mt-1 text-xs leading-6 text-slate-500">
                {tr(
                  language,
                  "اختر شهرًا لتوليد أو عرض الملخص المحفوظ بدون حذف أو أرشفة للسجلات.",
                  "Choose a month to generate or view the saved summary without deleting or archiving records."
                )}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="space-y-2 text-sm font-semibold text-slate-800">
                {tr(language, "الشهر", "Month")}
                <input
                  type="month"
                  value={summaryMonth}
                  onChange={event => setSummaryMonth(event.target.value)}
                  className="h-11 rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-center text-sm font-semibold tabular-nums outline-none transition focus:border-slate-400 focus:bg-white"
                  disabled={monthlySummaryGenerating}
                />
              </label>
              <Button
                type="button"
                className="h-11 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-900"
                onClick={() => void handleGenerateMonthlySummary()}
                disabled={
                  !employeeUid ||
                  monthlySummaryLoading ||
                  monthlySummaryGenerating ||
                  !isValidYearMonth(summaryMonth)
                }
              >
                {monthlySummaryGenerating ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : null}
                {tr(language, "توليد ملخص الشهر", "Generate Month Summary")}
              </Button>
            </div>
          </div>

          {monthlySummaryError ? (
            <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-4 text-center text-sm text-rose-700">
              {monthlySummaryError}
            </div>
          ) : monthlySummaryLoading ? (
            <div className="flex min-h-[92px] items-center justify-center rounded-[16px] border border-slate-200 bg-slate-50 text-sm text-slate-500">
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              {tr(language, "جاري تحميل ملخص الحضور الشهري...", "Loading monthly attendance summary...")}
            </div>
          ) : monthlySummary ? (
            <AttendanceMonthlySummaryCard summary={monthlySummary} language={language} />
          ) : (
            <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm leading-7 text-slate-500">
              {tr(
                language,
                "لا يوجد ملخص محفوظ لهذا الشهر بعد. اضغط \"توليد ملخص الشهر\" لإنشاء القراءة الأولى.",
                "No saved summary exists for this month yet. Click \"Generate Month Summary\" to create the first reading."
              )}
            </div>
          )}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="grid grid-cols-[44px_1fr_44px] items-center">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-950 transition hover:bg-slate-100"
            onClick={() => changeMonth("next")}
            aria-label={tr(language, "الشهر التالي", "Next Month")}
          >
            <ChevronRight className="h-8 w-8" />
          </button>

          <div className="text-center">
            <div className="text-2xl font-medium text-slate-950">
              {monthBounds.monthName}
            </div>
            <div className="mt-1 text-2xl font-medium text-slate-400">
              {monthBounds.yearLabel}
            </div>
          </div>

          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-950 transition hover:bg-slate-100"
            onClick={() => changeMonth("previous")}
            aria-label={tr(language, "الشهر السابق", "Previous Month")}
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-x-2 gap-y-2 text-center sm:gap-x-4 xl:gap-x-5">
          {WEEKDAY_LABELS[language].map((label, index) => (
            <div
              key={`${label}-${index}`}
              className="text-sm font-semibold text-slate-400 sm:text-base"
            >
              {label}
            </div>
          ))}

          {calendarCells.map(cell => {
            if (!cell.day)
              return <div key={cell.key} className="h-[54px] xl:h-[64px]" />;

            const day = cell.day;
            const selected = day.date === selectedDate;
            const dayComputation = computeAttendanceDay(day.date, day.records, {
              startTime: shiftStartTime,
              endTime: shiftEndTime,
            });
            const attendanceStatus = getAttendanceStatus(day, dayComputation, {
              todayKey,
              weeklyOffDays,
              approvedLeaveDateKeys,
              holidayDateKeys: holidayDateKeySet,
              absenceDateKeys: absenceDateKeySet,
            });
            const indicatorClass = getStatusIndicatorClass(attendanceStatus);

            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => setSelectedDate(day.date)}
                className={cn(
                  "relative mx-auto flex h-[54px] w-full max-w-[86px] items-center justify-center rounded-sm text-xl font-medium text-slate-900 transition xl:h-[64px] xl:max-w-none",
                  selected
                    ? cn("border-2", getSelectedDayClass(attendanceStatus))
                    : cn(
                        "border-2 border-transparent hover:bg-slate-100",
                        attendanceStatus === "leave" &&
                          "rounded-xl border-blue-200 bg-blue-50 text-blue-950 hover:bg-blue-50",
                        attendanceStatus === "off_day" &&
                          "text-slate-900 hover:bg-cyan-50"
                      )
                )}
                aria-label={`${formatLocalizedDate(day.date, language)} - ${getAttendanceStatusLabel(attendanceStatus, language)}`}
              >
                {indicatorClass ? (
                  <span
                    className={cn(
                      "absolute left-1/2 top-0 h-1 w-10 -translate-x-1/2 rounded-full xl:w-14",
                      attendanceStatus === "leave" && "h-1.5 w-11 xl:w-16",
                      indicatorClass
                    )}
                  />
                ) : null}

                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md",
                    selected && getSelectedNumberClass(attendanceStatus)
                  )}
                >
                  {formatNumberEN(day.dayNumber)}
                </span>

                {day.hasEvent ? (
                  <span className="absolute bottom-0 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-blue-500" />
                ) : null}

                {attendanceStatus === "leave" ? (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                    {tr(language, "إ", "L")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 rounded-[16px] border border-slate-200 bg-white px-3 py-3 text-xs font-medium text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            {tr(language, "أخضر = حضور مكتمل", "Green = complete attendance")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            {tr(language, "برتقالي = اليوم المحدد", "Orange = selected day")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            {tr(language, "أحمر = نقص/تأخير غير معوّض", "Red = uncompensated shortage/late")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            {tr(language, "أزرق = طلب/إجازة", "Blue = request/leave")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            {tr(language, "رمادي = لا يوجد سجل", "Gray = no record")}
          </span>
        </div>
      </div>

      <div ref={detailsRef} className="grid grid-cols-2 items-end gap-8 pt-3">
        <button
          type="button"
          onClick={() => setActiveTab("records")}
          className={cn(
            "pb-5 text-center text-xl font-medium transition",
            activeTab === "records" ? "text-slate-950" : "text-slate-300"
          )}
        >
          {tr(language, "السجلات", "Records")}
          <span
            className={cn(
              "mx-auto mt-5 block h-1.5 w-full max-w-[330px] rounded-full",
              activeTab === "records" ? "bg-slate-950" : "bg-transparent"
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("leave")}
          className={cn(
            "pb-5 text-center text-xl font-medium transition",
            activeTab === "leave" ? "text-slate-950" : "text-slate-300"
          )}
        >
          {tr(language, "إجازتي", "My Leave")}
          <span
            className={cn(
              "mx-auto mt-5 block h-1.5 w-full max-w-[330px] rounded-full",
              activeTab === "leave" ? "bg-slate-950" : "bg-transparent"
            )}
          />
        </button>
      </div>

      {activeTab === "records" ? (
        <div className="space-y-5">
          <div className="flex items-center gap-4 text-slate-950">
            <Fingerprint className="h-10 w-10 stroke-[2.2]" />
            <span className="text-2xl font-medium">
              {formatNumberEN(selectedRecordsCount)}
            </span>
            {selectedStatus !== "future" ? (
              <span
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  selectedStatus === "present" &&
                    "border-emerald-200 bg-emerald-50 text-emerald-700",
                  selectedStatus === "partial" &&
                    "border-rose-200 bg-rose-50 text-rose-700",
                  selectedStatus === "absent" &&
                    "border-rose-200 bg-rose-50 text-rose-700",
                  selectedStatus === "leave" &&
                    "border-blue-200 bg-blue-50 text-blue-700",
                  selectedStatus === "off_day" &&
                    "border-cyan-300 bg-cyan-100 text-cyan-800",
                  selectedStatus === "today_pending" &&
                    "border-slate-200 bg-white text-slate-500"
                )}
              >
                {selectedStatusLabel}
              </span>
            ) : null}
            <span className="sr-only">عدد سجلات اليوم المحدد</span>
            {canManageAttendance && !isRestOrLeaveSelectedDay ? (
              <div className="mr-auto flex flex-wrap items-center gap-2">
                {hasSelectedRecord ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full border-rose-200 bg-white px-4 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                    onClick={() => void handleClearAttendance()}
                    disabled={
                      !employeeUid || savingAdjustment || clearingAttendance
                    }
                  >
                    {clearingAttendance ? (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="ml-2 h-4 w-4" />
                    )}
                    {tr(language, "مسح البصمة", "Clear Attendance")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full border-slate-200 bg-white px-4 text-slate-950"
                  onClick={openAttendanceAdjustment}
                  disabled={
                    !employeeUid || savingAdjustment || clearingAttendance
                  }
                >
                  {tr(language, "تعديل البصمة", "Adjust Attendance")}
                </Button>
              </div>
            ) : null}
          </div>

          {canManageAttendance && adjustmentOpen ? (
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_-28px_rgba(15,23,42,0.35)]">
              <div className="flex flex-col gap-1 text-right">
                <div className="text-sm font-semibold text-slate-950">
                  {tr(
                    language,
                    `تعديل بصمة يوم ${formatLocalizedDate(selectedDate, language)}`,
                    `Adjust attendance for ${formatLocalizedDate(selectedDate, language)}`
                  )}
                </div>
                <p className="text-xs leading-6 text-slate-500">
                  {tr(
                    language,
                    "يستخدم عند اعتماد طلب تصحيح أو وجود مشكلة موقع أو نسيان البصمة.",
                    "Use this when approving a correction request, handling a location issue, or fixing a missed punch."
                  )}
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold text-slate-800">
                  {tr(language, "وقت الحضور", "Check-in Time")}
                  <input
                    type="time"
                    dir="ltr"
                    value={adjustmentCheckInTime}
                    onChange={event =>
                      setAdjustmentCheckInTime(event.target.value)
                    }
                    className="h-11 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-center text-base font-semibold tabular-nums outline-none transition focus:border-slate-400 focus:bg-white"
                    disabled={savingAdjustment}
                  />
                </label>

                <label className="space-y-2 text-sm font-semibold text-slate-800">
                  {tr(language, "وقت الانصراف", "Check-out Time")}
                  <input
                    type="time"
                    dir="ltr"
                    value={adjustmentCheckOutTime}
                    onChange={event =>
                      setAdjustmentCheckOutTime(event.target.value)
                    }
                    className="h-11 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 text-center text-base font-semibold tabular-nums outline-none transition focus:border-slate-400 focus:bg-white"
                    disabled={savingAdjustment}
                  />
                </label>
              </div>

              <label className="mt-3 block space-y-2 text-sm font-semibold text-slate-800">
                {tr(language, "سبب التعديل", "Adjustment Reason")}
                <textarea
                  value={adjustmentNote}
                  onChange={event => setAdjustmentNote(event.target.value)}
                  placeholder={tr(language, "مثال: تم اعتماد طلب التصحيح بعد مراجعة HR", "Example: correction request approved after HR review")}
                  className="min-h-20 w-full resize-none rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-normal outline-none transition focus:border-slate-400 focus:bg-white"
                  disabled={savingAdjustment}
                />
              </label>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setAdjustmentOpen(false)}
                  disabled={savingAdjustment}
                >
                  {tr(language, "إلغاء", "Cancel")}
                </Button>
                <Button
                  type="button"
                  className="rounded-full bg-slate-950 text-white hover:bg-slate-900"
                  onClick={() => void handleSaveAttendanceAdjustment()}
                  disabled={savingAdjustment}
                >
                  {savingAdjustment ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {tr(language, "حفظ تعديل البصمة", "Save Attendance Adjustment")}
                </Button>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-5 text-center text-sm text-rose-700">
              {error}
            </div>
          ) : loading ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-[20px] border border-slate-200 bg-white text-slate-500">
              <Loader2 className="ml-2 h-5 w-5 animate-spin" />
              {tr(language, "جاري تحميل سجل الحضور...", "Loading attendance records...")}
            </div>
          ) : (
            <>
              {hasSelectedRecord ? (
                <div
                  className={cn(
                    "relative overflow-hidden rounded-[16px] px-5 py-5 text-slate-900",
                    selectedStatus === "partial" && "bg-rose-50",
                    selectedStatus === "present" && "bg-emerald-50",
                    selectedStatus !== "partial" &&
                      selectedStatus !== "present" &&
                      "bg-slate-50"
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 w-4",
                      getSelectedAccentClass(selectedStatus)
                    )}
                  />
                  <div className="grid grid-cols-[44px_1fr] items-center gap-3">
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-white/45"
                      aria-label="خيارات السجل"
                    >
                      <MoreVertical className="h-7 w-7" />
                    </button>
                    <div className="space-y-4 text-left" dir="ltr">
                      <div className="text-xs font-semibold text-slate-400" dir="rtl">
                        {tr(language, "البصمة الفعلية", "Actual punch")}
                      </div>
                      <div className="text-xl font-medium">
                        {shiftTimeLabel}
                      </div>
                      <div className="flex items-center justify-end gap-2 text-lg text-slate-500">
                        <Clock3 className="h-8 w-8" />
                        <span dir="rtl">{workDurationLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    "min-h-[150px] rounded-[18px] border border-dashed px-5 py-8 text-center",
                    selectedStatus === "absent"
                      ? "border-rose-200 bg-rose-50 text-rose-800"
                        : selectedStatus === "leave"
                        ? "border-blue-200 bg-white text-blue-900"
                        : selectedStatus === "off_day"
                          ? "border-cyan-200 bg-white text-cyan-900"
                          : "border-slate-200 bg-white text-slate-950"
                  )}
                >
                  <Grid3X3
                    className={cn(
                      "mx-auto h-9 w-9",
                      selectedStatus === "absent"
                        ? "text-rose-400"
                        : selectedStatus === "leave"
                          ? "text-blue-600"
                          : selectedStatus === "off_day"
                            ? "text-cyan-600"
                            : "text-slate-300"
                    )}
                  />
                  <div className="mt-3 text-lg font-semibold">
                    {selectedStatus === "absent"
                      ? absenceDateKeySet.has(selectedDate)
                        ? tr(language, "غياب مسجل من الموارد البشرية", "Absence recorded by HR")
                        : tr(language, "غياب - لا يوجد سجل حضور", "Absent - no check-in record")
                      : selectedStatus === "leave"
                        ? tr(language, "إجازة معتمدة لهذا اليوم", "Approved leave for this day")
                        : selectedStatus === "off_day"
                          ? tr(language, "يوم راحة أسبوعية", "Weekly day off")
                          : selectedStatus === "today_pending"
                            ? tr(language, "لم يتم تسجيل حضور لهذا اليوم حتى الآن", "No check-in has been recorded for today yet")
                            : tr(language, "لا يوجد سجل", "No record")}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {selectedStatus === "absent"
                      ? absenceDateKeySet.has(selectedDate)
                        ? tr(language, "هذا اليوم مسجل في سجل الغياب، ويظهر في التقويم كغياب محسوب.", "This day is recorded as an absence and appears in the calendar as counted absence.")
                        : tr(language, "هذا يوم عمل سابق بلا سجلات حضور، ويُعامل كغياب محسوب.", "This is a past workday without attendance records and is treated as counted absence.")
                      : selectedStatus === "leave"
                        ? tr(language, "هذا اليوم مستثنى بسبب إجازة معتمدة للموظف.", "This day is excluded because the employee has approved leave.")
                        : selectedStatus === "off_day"
                          ? tr(language, `هذا اليوم ضمن أيام الراحة الأسبوعية: ${weeklyOffDaysLabel}.`, `This day is part of the weekly days off: ${weeklyOffDaysLabel}.`)
                          : tr(language, "لا توجد بيانات حضور فعلية لليوم المحدد.", "No actual attendance data exists for the selected day.")}
                  </p>
                  {canManageAttendance && selectedStatus === "leave" && onCancelLeave ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-5 rounded-full border-rose-200 bg-white px-5 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      onClick={() => void onCancelLeave(selectedDate)}
                      disabled={cancelLeaveLoading}
                    >
                      {cancelLeaveLoading ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="ml-2 h-4 w-4" />
                      )}
                      {tr(language, "إلغاء الإجازة", "Cancel Leave")}
                    </Button>
                  ) : null}
                </div>
              )}

              {!isRestOrLeaveSelectedDay ? (
                <>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                    <AttendanceMetric
                      label={tr(language, "الدوام المعتمد", "Official Schedule")}
                      value={scheduleTimeLabel}
                    />
                    <AttendanceMetric
                      label={tr(language, "أول حضور", "First Check-in")}
                      value={firstCheckInLabel}
                    />
                    <AttendanceMetric
                      label={tr(language, "آخر انصراف", "Last Check-out")}
                      value={lastCheckOutLabel}
                    />
                    <AttendanceMetric
                      label={tr(language, "مدة العمل الفعلية", "Actual Work Duration")}
                      value={workDurationLabel}
                    />
                    <AttendanceMetric
                      label={tr(language, "صافي فرق الساعات", "Net Hours Difference")}
                      value={differenceLabel}
                      valueClassName={cn(
                        "text-base",
                        attendanceComputation &&
                          attendanceComputation.netHoursDifference > 0 &&
                          "text-emerald-600",
                        attendanceComputation &&
                          attendanceComputation.netHoursDifference < 0 &&
                          "text-rose-600"
                      )}
                    />
                    <AttendanceMetric
                      label={tr(language, "الحالة الإدارية", "Administrative Status")}
                      value={administrativeStatusLabel}
                    />
                  </div>

                  <div
                    className={cn(
                      "grid min-h-[104px] gap-4 rounded-[18px] border px-5 py-5 text-right shadow-[0_8px_24px_-22px_rgba(15,23,42,0.35)] sm:grid-cols-2 lg:grid-cols-4",
                      getSelectedSummaryClass(selectedStatus)
                    )}
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-400">
                        {tr(language, "التأخير الفعلي", "Actual Late")}
                      </div>
                      <div className="mt-4 text-base font-semibold text-orange-700">
                        {lateHoursLabel}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-400">
                        {afterScheduleMetricLabel}
                      </div>
                      <div className="mt-4 text-base font-semibold text-blue-700">
                        {afterScheduleHoursLabel}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-400">
                        {tr(language, "نقص الساعات", "Missing Hours")}
                      </div>
                      <div className="mt-4 text-base font-semibold text-rose-700">
                        {missingHoursLabel}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-400">
                        {tr(language, "زيادة ساعات", "Extra Hours")}
                      </div>
                      <div className="mt-4 text-base font-semibold text-emerald-700">
                        {overtimeHoursLabel}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="min-h-[220px] rounded-[20px] border border-dashed border-slate-200 bg-white px-5 py-10 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
          <div className="mt-4 text-lg font-semibold text-slate-950">
            {tr(language, "لا توجد بيانات إجازات هنا", "No leave data here")}
          </div>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-7 text-slate-400">
            {tr(
              language,
              "تبويب إجازتي واجهة مكانية فقط داخل شاشة الحضور حتى يتم ربطه بمصدر الإجازات الحالي عند الحاجة.",
              "The My Leave tab is a placeholder inside attendance until it is connected to the current leave source when needed."
            )}
          </p>
        </div>
      )}

      <div className="text-center text-xs text-slate-300">
        {monthBounds.monthLabel} · {tr(language, "أيام بها حضور:", "Days with attendance:")}{" "}
        {formatNumberEN(attendanceDaysCount)}
      </div>
    </section>
  );
}
