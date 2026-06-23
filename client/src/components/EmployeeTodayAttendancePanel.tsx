import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  fetchAttendanceRecords,
  type AttendanceRecord,
} from "@/lib/attendanceRecords";
import { formatNumberEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";

type EmployeeTodayAttendancePanelProps = {
  employeeUid?: string | null;
  title: string;
  description?: string;
  refreshKey?: number;
  className?: string;
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

  if (hours && minutes) return `${formatNumberEN(hours)} ساعة ${formatNumberEN(minutes)} دقيقة`;
  if (hours) return `${formatNumberEN(hours)} ساعة`;
  return `${formatNumberEN(minutes)} دقيقة`;
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
    const checkIn = dayRecords.find(record => record.type === "check_in") || null;
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
      <div className={cn("mt-8 text-base font-semibold text-slate-950", valueClassName)}>
        {value}
      </div>
    </div>
  );
}

export default function EmployeeTodayAttendancePanel({
  employeeUid,
  refreshKey = 0,
  className,
}: EmployeeTodayAttendancePanelProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [monthDate, setMonthDate] = useState(() => getRiyadhTodayMonthStart());
  const [selectedDate, setSelectedDate] = useState(() => getRiyadhTodayKey());
  const [activeTab, setActiveTab] = useState<"records" | "leave">("records");
  const monthBounds = useMemo(() => getMonthBounds(monthDate), [monthDate]);

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
  const selectedDay = monthDays.get(selectedDate) || null;
  const attendanceDaysCount = Array.from(monthDays.values()).filter(
    day => day.hasAttendance
  ).length;
  const workDurationMs = getWorkDurationMs(selectedDay);
  const workDurationLabel = formatDurationFromMs(workDurationMs);
  const selectedRecordsCount = selectedDay?.records.length || 0;
  const hasSelectedRecord = selectedRecordsCount > 0;
  const firstCheckInLabel = formatDisplayTime(selectedDay?.checkIn?.serverTime);
  const lastCheckOutLabel = formatDisplayTime(selectedDay?.checkOut?.serverTime);
  const shiftTimeLabel = hasSelectedRecord
    ? `${firstCheckInLabel} — ${lastCheckOutLabel}`
    : "--";

  const changeMonth = (direction: "next" | "previous") => {
    setMonthDate(current => {
      const next = new Date(current);
      next.setUTCMonth(
        current.getUTCMonth() + (direction === "next" ? 1 : -1)
      );
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
        "mx-auto w-full max-w-[760px] space-y-7 rounded-[28px] bg-[#fbfbfc] px-4 pb-10 pt-2 text-slate-950 sm:px-6",
        className
      )}
    >
      <header className="grid grid-cols-[44px_1fr_44px] items-center pt-1">
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full text-slate-800 transition hover:bg-slate-100"
          aria-label="القائمة"
        >
          <Menu className="h-7 w-7" />
        </button>
        <h1 className="text-center text-2xl font-medium tracking-normal text-slate-950">
          الحضور
        </h1>
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
          aria-label="عرض أو فلترة"
        >
          <SlidersHorizontal className="h-6 w-6" />
        </button>
      </header>

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

        <div className="grid grid-cols-7 gap-x-4 gap-y-2 text-center sm:gap-x-6">
          {WEEKDAY_LABELS.map((label, index) => (
            <div
              key={`${label}-${index}`}
              className="text-xl font-medium text-slate-400"
            >
              {label}
            </div>
          ))}

          {calendarCells.map(cell => {
            if (!cell.day) return <div key={cell.key} className="h-[54px]" />;

            const day = cell.day;
            const selected = day.date === selectedDate;

            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => setSelectedDate(day.date)}
                className={cn(
                  "relative mx-auto flex h-[54px] w-[48px] items-center justify-center rounded-sm text-xl font-medium text-slate-900 transition",
                  selected
                    ? "border-2 border-slate-900 bg-transparent"
                    : "border-2 border-transparent hover:bg-slate-100"
                )}
                aria-label={formatArabicDate(day.date)}
              >
                {day.hasAttendance ? (
                  <span
                    className={cn(
                      "absolute left-1/2 top-0 h-1 w-10 -translate-x-1/2 rounded-full",
                      day.hasWarning ? "bg-orange-500" : "bg-slate-800"
                    )}
                  />
                ) : null}

                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md",
                    selected && "bg-slate-950 text-white"
                  )}
                >
                  {formatNumberEN(day.dayNumber)}
                </span>

                {day.hasEvent ? (
                  <span className="absolute bottom-0 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-blue-500" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 items-end gap-8 pt-3">
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
      </div>

      {activeTab === "records" ? (
        <div className="space-y-5">
          <div className="flex items-center gap-4 text-slate-950">
            <Fingerprint className="h-10 w-10 stroke-[2.2]" />
            <span className="text-2xl font-medium">
              {formatNumberEN(selectedRecordsCount)}
            </span>
            <span className="sr-only">عدد سجلات اليوم المحدد</span>
          </div>

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
                <div className="relative overflow-hidden rounded-[16px] bg-[#e6f3df] px-5 py-5 text-slate-900">
                  <span className="absolute inset-y-0 left-0 w-4 bg-[#8ddb7a]" />
                  <div className="grid grid-cols-[44px_1fr] items-center gap-3">
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-white/45"
                      aria-label="خيارات السجل"
                    >
                      <MoreVertical className="h-7 w-7" />
                    </button>
                    <div className="space-y-4 text-left" dir="ltr">
                      <div className="text-xl font-medium">{shiftTimeLabel}</div>
                      <div className="flex items-center justify-end gap-2 text-lg text-slate-500">
                        <Clock3 className="h-8 w-8" />
                        <span dir="rtl">{workDurationLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="min-h-[150px] rounded-[18px] border border-dashed border-slate-200 bg-white px-5 py-8 text-center">
                  <Grid3X3 className="mx-auto h-9 w-9 text-slate-300" />
                  <div className="mt-3 text-lg font-semibold text-slate-950">
                    لا يوجد سجل
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    لا توجد بيانات حضور فعلية لليوم المحدد.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <AttendanceMetric label="أول حضور" value={firstCheckInLabel} />
                <AttendanceMetric label="آخر انصراف" value={lastCheckOutLabel} />
                <AttendanceMetric label="مدة العمل" value={workDurationLabel} />
                <AttendanceMetric
                  label="الفرق"
                  value="+"
                  valueClassName="text-2xl text-orange-600"
                />
              </div>

              <div className="grid min-h-[104px] grid-cols-3 rounded-[18px] border border-slate-200 bg-white px-5 py-5 text-right shadow-[0_8px_24px_-22px_rgba(15,23,42,0.35)]">
                <div>
                  <div className="text-sm font-medium text-slate-400">
                    عمل إضافي مؤكد
                  </div>
                  <div className="mt-8 text-base font-semibold text-slate-950">
                    --
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-400">
                    احتساب الساعة
                  </div>
                  <div className="mt-8 text-base font-semibold text-slate-950">
                    --
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-400">
                    التغييرات
                  </div>
                  <div className="mt-8 text-base font-semibold text-slate-950">
                    --
                  </div>
                </div>
              </div>

              <div className="text-xs leading-6 text-slate-400">
                TODO: الفرق، العمل الإضافي، احتساب الساعة، التغييرات، الملاحظات
                والتنبيهات تنتظر مصدر بيانات رسمي ولا يتم احتسابها حالياً.
              </div>
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
        {monthBounds.monthLabel} · أيام بها حضور: {formatNumberEN(attendanceDaysCount)}
      </div>
    </section>
  );
}
