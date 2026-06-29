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
  type AttendanceRecord,
} from "@/lib/attendanceRecords";
import {
  computeAttendanceDay,
  getAttendanceDayStatus,
  type AttendanceStatus,
} from "@/lib/attendanceCalculations";
import { formatLeaveDateInput } from "@/lib/employeeLeave";
import { formatNumberEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  buildDateKeysInRange,
  formatWeeklyOffDaysLabel,
  type WorkScheduleWeekday,
} from "@/lib/workSchedule";
import { toast } from "sonner";

type ApprovedLeaveLike = {
  status?: unknown;
  startDate?: unknown;
  endDate?: unknown;
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

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
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

function getMonthBounds(monthDate: Date): MonthBounds {
  const year = monthDate.getUTCFullYear();
  const monthIndex = monthDate.getUTCMonth();
  const month = String(monthIndex + 1).padStart(2, "0");
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const firstDayIndex = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const labelDate = new Date(Date.UTC(year, monthIndex, 15, 12));
  const monthName = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    timeZone: RIYADH_TIME_ZONE,
    month: "long",
  }).format(labelDate);
  const yearLabel = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
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

function formatArabicDate(value: string) {
  const date = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    timeZone: RIYADH_TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
}

function formatDurationFromMs(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "--";
  }

  const totalMinutes = Math.round(value / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes)
    return `${formatNumberEN(hours)} ساعة ${formatNumberEN(minutes)} دقيقة`;
  if (hours) return `${formatNumberEN(hours)} ساعة`;
  return `${formatNumberEN(minutes)} دقيقة`;
}

function formatDurationFromHours(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "--";
  }

  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) {
    return `${formatNumberEN(hours)} ساعة ${formatNumberEN(minutes)} دقيقة`;
  }
  if (hours) return `${formatNumberEN(hours)} ساعة`;
  return `${formatNumberEN(minutes)} دقيقة`;
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

function getAttendanceStatusLabel(status: AttendanceStatus) {
  switch (status) {
    case "present":
      return "حضور مكتمل";
    case "partial":
      return "حضور يحتاج مراجعة";
    case "absent":
      return "غياب";
    case "leave":
      return "إجازة معتمدة";
    case "off_day":
      return "يوم راحة أسبوعية";
    case "today_pending":
      return "بانتظار تسجيل اليوم";
    case "future":
    default:
      return "يوم قادم";
  }
}

function getStatusIndicatorClass(status: AttendanceStatus) {
  switch (status) {
    case "present":
      return "bg-emerald-500";
    case "partial":
      return "bg-orange-500";
    case "absent":
      return "bg-rose-500";
    case "leave":
      return "bg-violet-700";
    case "off_day":
      return "bg-cyan-600";
    default:
      return "";
  }
}

function getSelectedDayClass(status: AttendanceStatus) {
  switch (status) {
    case "present":
      return "border-emerald-500 bg-emerald-50";
    case "partial":
      return "border-orange-500 bg-orange-50";
    case "absent":
      return "border-rose-500 bg-rose-50";
    case "leave":
      return "border-violet-700 bg-violet-100 shadow-[0_0_0_4px_rgba(124,58,237,0.14)]";
    case "off_day":
      return "border-cyan-500 bg-cyan-50";
    default:
      return "border-slate-900 bg-transparent";
  }
}

function getSelectedNumberClass(status: AttendanceStatus) {
  switch (status) {
    case "present":
      return "bg-emerald-600 text-white";
    case "partial":
      return "bg-orange-500 text-white";
    case "absent":
      return "bg-rose-600 text-white";
    case "leave":
      return "bg-violet-700 text-white";
    case "off_day":
      return "bg-cyan-700 text-white";
    default:
      return "bg-slate-950 text-white";
  }
}

function getSelectedSummaryClass(status: AttendanceStatus) {
  switch (status) {
    case "partial":
      return "border-orange-200 bg-orange-50/60";
    case "absent":
      return "border-rose-200 bg-rose-50/60";
    case "leave":
      return "border-violet-300 bg-violet-100";
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
      return "bg-orange-400";
    case "absent":
      return "bg-rose-400";
    case "leave":
      return "bg-violet-700";
    case "off_day":
      return "bg-cyan-600";
    case "present":
      return "bg-emerald-400";
    default:
      return "bg-slate-300";
  }
}

function buildApprovedLeaveDateKeys(requests: ApprovedLeaveLike[] = []) {
  const dates = new Set<string>();

  for (const request of requests) {
    if (
      String(request.status || "approved")
        .trim()
        .toLowerCase() !== "approved"
    ) {
      continue;
    }

    const startDate = formatLeaveDateInput(request.startDate);
    const endDate = formatLeaveDateInput(request.endDate || request.startDate);
    for (const dateKey of buildDateKeysInRange(startDate, endDate)) {
      dates.add(dateKey);
    }
  }

  return dates;
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
}: EmployeeTodayAttendancePanelProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [monthDate, setMonthDate] = useState(() => getRiyadhTodayMonthStart());
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
  const monthBounds = useMemo(() => getMonthBounds(monthDate), [monthDate]);
  const detailsRef = useRef<HTMLDivElement | null>(null);

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
    () => buildApprovedLeaveDateKeys(approvedLeaveRequests),
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
  const workDurationLabel = formatDurationFromMs(workDurationMs);
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
  const lateHoursLabel = attendanceComputation?.lateHours
    ? formatDurationFromHours(attendanceComputation.lateHours)
    : "--";
  const overtimeHoursLabel = attendanceComputation?.overtimeHours
    ? formatDurationFromHours(attendanceComputation.overtimeHours)
    : "--";
  const missingHoursLabel =
    attendanceComputation?.missingHours && selectedDay?.checkOut
      ? formatDurationFromHours(attendanceComputation.missingHours)
      : "--";
  const differenceLabel = attendanceComputation
    ? attendanceComputation.lateHours > 0
      ? `-${formatDurationFromHours(attendanceComputation.lateHours)}`
      : attendanceComputation.overtimeHours > 0
        ? `+${formatDurationFromHours(attendanceComputation.overtimeHours)}`
        : attendanceComputation.missingHours > 0 && selectedDay?.checkOut
          ? `-${formatDurationFromHours(attendanceComputation.missingHours)}`
          : "0"
    : "--";
  const selectedStatusLabel = getAttendanceStatusLabel(selectedStatus);
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
        `مسح بصمة يوم ${formatArabicDate(selectedDate)}؟\n\nسيتم حذف سجلات الحضور والانصراف لهذا اليوم وإعادة تصفير حالة الموظف.`
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
      dir="rtl"
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
          aria-label="عرض سجلات اليوم المحدد"
        >
          <Menu className="h-7 w-7" />
        </button>
        <h1 className="text-center text-2xl font-medium tracking-normal text-slate-950">
          الحضور
        </h1>
        <button
          type="button"
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-slate-100",
            summaryOpen ? "bg-slate-100 text-slate-950" : "text-slate-500"
          )}
          onClick={() => setSummaryOpen(open => !open)}
          aria-pressed={summaryOpen}
          aria-label="عرض ملخص حالات الشهر"
        >
          <SlidersHorizontal className="h-6 w-6" />
        </button>
      </header>

      {summaryOpen ? (
        <div className="grid gap-2 rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm shadow-sm sm:grid-cols-3">
          <AttendanceSummaryPill
            label="حضور"
            value={attendanceStatusCounts.present}
            className="border-emerald-200 bg-emerald-50 text-emerald-700"
          />
          <AttendanceSummaryPill
            label="ناقص"
            value={attendanceStatusCounts.partial}
            className="border-orange-200 bg-orange-50 text-orange-700"
          />
          <AttendanceSummaryPill
            label="غياب"
            value={attendanceStatusCounts.absent}
            className="border-rose-200 bg-rose-50 text-rose-700"
          />
          <AttendanceSummaryPill
            label="إجازة"
            value={attendanceStatusCounts.leave}
            className="border-violet-300 bg-violet-100 text-violet-800"
          />
          <AttendanceSummaryPill
            label="راحة"
            value={attendanceStatusCounts.off_day}
            className="border-cyan-300 bg-cyan-100 text-cyan-800"
          />
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="grid grid-cols-[44px_1fr_44px] items-center">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-950 transition hover:bg-slate-100"
            onClick={() => changeMonth("next")}
            aria-label="الشهر التالي"
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
            aria-label="الشهر السابق"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-x-2 gap-y-2 text-center sm:gap-x-4 xl:gap-x-5">
          {WEEKDAY_LABELS.map((label, index) => (
            <div
              key={`${label}-${index}`}
              className="text-xl font-medium text-slate-400"
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
                          "rounded-xl border-violet-200 bg-violet-100 text-violet-950 hover:bg-violet-100",
                        attendanceStatus === "off_day" &&
                          "text-slate-900 hover:bg-cyan-50"
                      )
                )}
                aria-label={`${formatArabicDate(day.date)} - ${getAttendanceStatusLabel(attendanceStatus)}`}
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
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-violet-700 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                    إ
                  </span>
                ) : null}
              </button>
            );
          })}
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
          السجلات
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
          إجازتي
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
                    "border-orange-200 bg-orange-50 text-orange-700",
                  selectedStatus === "absent" &&
                    "border-rose-200 bg-rose-50 text-rose-700",
                  selectedStatus === "leave" &&
                    "border-violet-300 bg-violet-100 text-violet-800",
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
                    مسح البصمة
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
                  تعديل البصمة
                </Button>
              </div>
            ) : null}
          </div>

          {canManageAttendance && adjustmentOpen ? (
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_-28px_rgba(15,23,42,0.35)]">
              <div className="flex flex-col gap-1 text-right">
                <div className="text-sm font-semibold text-slate-950">
                  تعديل بصمة يوم {formatArabicDate(selectedDate)}
                </div>
                <p className="text-xs leading-6 text-slate-500">
                  يستخدم عند اعتماد طلب تصحيح أو وجود مشكلة موقع أو نسيان
                  البصمة.
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold text-slate-800">
                  وقت الحضور
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
                  وقت الانصراف
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
                سبب التعديل
                <textarea
                  value={adjustmentNote}
                  onChange={event => setAdjustmentNote(event.target.value)}
                  placeholder="مثال: تم اعتماد طلب التصحيح بعد مراجعة HR"
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
                  إلغاء
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
                  حفظ تعديل البصمة
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
              جاري تحميل سجل الحضور...
            </div>
          ) : (
            <>
              {hasSelectedRecord ? (
                <div
                  className={cn(
                    "relative overflow-hidden rounded-[16px] px-5 py-5 text-slate-900",
                    selectedStatus === "partial" && "bg-orange-50",
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
                        ? "border-violet-200 bg-white text-violet-900"
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
                          ? "text-violet-600"
                          : selectedStatus === "off_day"
                            ? "text-cyan-600"
                            : "text-slate-300"
                    )}
                  />
                  <div className="mt-3 text-lg font-semibold">
                    {selectedStatus === "absent"
                      ? absenceDateKeySet.has(selectedDate)
                        ? "غياب مسجل من الموارد البشرية"
                        : "غياب - لا يوجد سجل حضور"
                      : selectedStatus === "leave"
                        ? "إجازة معتمدة لهذا اليوم"
                        : selectedStatus === "off_day"
                          ? "يوم راحة أسبوعية"
                          : selectedStatus === "today_pending"
                            ? "لم يتم تسجيل حضور لهذا اليوم حتى الآن"
                            : "لا يوجد سجل"}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {selectedStatus === "absent"
                      ? absenceDateKeySet.has(selectedDate)
                        ? "هذا اليوم مسجل في سجل الغياب، ويظهر في التقويم كغياب محسوب."
                        : "هذا يوم عمل سابق بلا سجلات حضور، ويُعامل كغياب محسوب."
                      : selectedStatus === "leave"
                        ? "هذا اليوم مستثنى بسبب إجازة معتمدة للموظف."
                        : selectedStatus === "off_day"
                          ? `هذا اليوم ضمن أيام الراحة الأسبوعية: ${weeklyOffDaysLabel}.`
                          : "لا توجد بيانات حضور فعلية لليوم المحدد."}
                  </p>
                </div>
              )}

              {!isRestOrLeaveSelectedDay ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <AttendanceMetric
                      label="أول حضور"
                      value={firstCheckInLabel}
                    />
                    <AttendanceMetric
                      label="آخر انصراف"
                      value={lastCheckOutLabel}
                    />
                    <AttendanceMetric
                      label="مدة العمل"
                      value={workDurationLabel}
                    />
                    <AttendanceMetric
                      label="الفرق"
                      value={differenceLabel}
                      valueClassName={cn(
                        "text-2xl",
                        selectedStatus === "partial" && "text-orange-600",
                        selectedStatus === "present" && "text-emerald-600",
                        selectedStatus === "absent" && "text-rose-600"
                      )}
                    />
                  </div>

                  <div
                    className={cn(
                      "grid min-h-[104px] grid-cols-3 rounded-[18px] border px-5 py-5 text-right shadow-[0_8px_24px_-22px_rgba(15,23,42,0.35)]",
                      getSelectedSummaryClass(selectedStatus)
                    )}
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-400">
                        الأوفر تايم
                      </div>
                      <div className="mt-8 text-base font-semibold text-blue-700">
                        {overtimeHoursLabel}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-400">
                        التأخير
                      </div>
                      <div className="mt-8 text-base font-semibold text-orange-700">
                        {lateHoursLabel}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-400">
                        نقص الساعات
                      </div>
                      <div className="mt-8 text-base font-semibold text-rose-700">
                        {missingHoursLabel}
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
            لا توجد بيانات إجازات هنا
          </div>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-7 text-slate-400">
            TODO: تبويب إجازتي واجهة مكانية فقط داخل شاشة الحضور حتى يتم ربطه
            بمصدر الإجازات الحالي عند الحاجة.
          </p>
        </div>
      )}

      <div className="text-center text-xs text-slate-300">
        {monthBounds.monthLabel} · أيام بها حضور:{" "}
        {formatNumberEN(attendanceDaysCount)}
      </div>
    </section>
  );
}
