import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Clock3, RefreshCw, ShieldCheck, UserX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { workforceApi, WorkforceApiError } from "./workforceClient";

import HabatDatePicker from "@/pages/habat/HabatDatePicker";
import { useHabatRealtimeRefresh } from "@/pages/habat/habatRealtimeClient";
type AttendanceDay = {
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number | null;
  missingPunch: boolean;
  explicitAbsence: null | {
    id: string;
    dayPortion: "full_day" | "half_day";
    status: string;
    payrollTreatment: string;
    reason: string | null;
  };
};

type AttendancePayload = {
  ok: true;
  monthKey: string;
  readiness: {
    ready: boolean;
    status: string;
    reason?: string | null;
    sourceType?: string;
    sourceEmployeeId?: string;
  };
  summary: {
    daysWithRecords: number;
    lateDays: number;
    lateMinutes: number;
    earlyLeaveDays: number;
    earlyLeaveMinutes: number;
    missingPunchDays: number;
    explicitAbsenceDays: number;
  };
  days: AttendanceDay[];
};

type Props = { employeeId: string };

function currentRiyadhMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function friendlyError(error: unknown, language: "ar" | "en") {
  const code = error instanceof WorkforceApiError ? error.code : String((error as { message?: unknown })?.message || "");
  const messages: Record<string, string> = {
    workforce_attendance_month_invalid: tr(language, "صيغة الشهر غير صحيحة.", "Invalid month format."),
    workforce_attendance_source_unavailable: tr(language, "مصدر الحضور غير متاح لهذا المطعم.", "Attendance source is unavailable for this restaurant."),
    workforce_employee_not_found: tr(language, "لم يتم العثور على الموظف.", "Employee was not found."),
  };
  return messages[code] || code || tr(language, "تعذر تحميل بيانات الحضور التشغيلية.", "Unable to load attendance operations.");
}

function dateText(value: string) {
  const parsed = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
}

function timeText(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: true }).format(parsed);
  }
  return value.slice(0, 5) || value;
}

function minutesText(value: number, language: "ar" | "en") {
  const minutes = Math.max(0, Math.round(Number(value || 0)));
  if (!minutes) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? (language === "ar" ? `${hours}س ${rest ? `${rest}د` : ""}`.trim() : `${hours}h ${rest ? `${rest}m` : ""}`.trim()) : (language === "ar" ? `${rest}د` : `${rest}m`);
}

export default function WorkforceAttendanceOperationsPanel({ employeeId }: Props) {
  const { language } = useLanguage();
  const [month, setMonth] = useState(currentRiyadhMonth());
  const [payload, setPayload] = useState<AttendancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await workforceApi<AttendancePayload>(
        `employees/${encodeURIComponent(employeeId)}/attendance-operations?month=${encodeURIComponent(month)}`
      );
      setPayload(data);
    } catch (caught) {
      setError(friendlyError(caught, language));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [employeeId, month]);

  useEffect(() => { void load(); }, [load]);
  useHabatRealtimeRefresh(load);

  const readinessLabel = useMemo(() => {
    const status = payload?.readiness.status;
    if (status === "confirmed") return tr(language, "ربط الحضور مؤكد", "Attendance Link Confirmed");
    if (status === "exempt") return tr(language, "مستثنى من ربط الحضور", "Attendance Link Exempt");
    if (status === "unlinked") return tr(language, "الحضور غير مربوط", "Attendance Not Linked");
    if (status === "not_ready") return tr(language, "الحضور غير جاهز", "Attendance Not Ready");
    return status || tr(language, "غير معروف", "Unknown");
  }, [language, payload?.readiness.status]);

  const summary = payload?.summary;
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-black">{tr(language, "الحضور التشغيلي: الغياب والتأخير", "Attendance Operations: Absence & Lateness")}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              {tr(language, "قراءة موحدة من مصدر البصمة المرتبط بالموظف مع الغياب الإداري في Workforce Core. هذه الشاشة للمراجعة والجاهزية فقط ولا تطبق أي خصم راتب تلقائي.", "Unified attendance data from the employee-linked attendance source together with administrative absence in Workforce Core. This screen is for review and readiness only and does not apply payroll deductions automatically.")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HabatDatePicker mode="month" value={month} onChange={setMonth} className="w-[155px]" />
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4" /> {tr(language, "تحديث", "Refresh")}
          </Button>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      {payload ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1">
              {payload.readiness.ready ? <ShieldCheck className="ml-1 h-3.5 w-3.5" /> : <AlertTriangle className="ml-1 h-3.5 w-3.5" />}
              {readinessLabel}
            </Badge>
            {!payload.readiness.ready ? (
              <Badge variant="outline" className="rounded-full px-3 py-1">{tr(language, "غير مؤهل لخصم حضور تلقائي", "Not Eligible for Automatic Attendance Deduction")}</Badge>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Metric label={tr(language, "أيام بسجل", "Days With Records")} value={summary?.daysWithRecords || 0} />
            <Metric label={tr(language, "أيام تأخير", "Late Days")} value={summary?.lateDays || 0} />
            <Metric label={tr(language, "دقائق التأخير", "Late Minutes")} value={summary?.lateMinutes || 0} />
            <Metric label={tr(language, "خروج مبكر", "Early Leave")} value={summary?.earlyLeaveDays || 0} />
            <Metric label={tr(language, "دقائق خروج مبكر", "Early Leave Minutes")} value={summary?.earlyLeaveMinutes || 0} />
            <Metric label={tr(language, "بصمة ناقصة", "Missing Punch")} value={summary?.missingPunchDays || 0} />
            <Metric label={tr(language, "غياب معتمد", "Approved Absence")} value={summary?.explicitAbsenceDays || 0} />
          </div>

          <div className="mt-5 overflow-x-auto">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">{tr(language, "التاريخ", "Date")}</TableHead>
                  <TableHead className="text-start">{tr(language, "الدخول", "Clock In")}</TableHead>
                  <TableHead className="text-start">{tr(language, "الخروج", "Clock Out")}</TableHead>
                  <TableHead className="text-start">{tr(language, "الحالة", "Status")}</TableHead>
                  <TableHead className="text-start">{tr(language, "التأخير", "Late")}</TableHead>
                  <TableHead className="text-start">{tr(language, "الخروج المبكر", "Early Leave")}</TableHead>
                  <TableHead className="text-start">{tr(language, "العمل", "Worked")}</TableHead>
                  <TableHead className="text-start">{tr(language, "ملاحظة تشغيلية", "Operational Note")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payload.days.map(day => (
                  <TableRow key={day.date}>
                    <TableCell className="font-semibold">{dateText(day.date)}</TableCell>
                    <TableCell dir="ltr" className="text-start">{timeText(day.checkInAt)}</TableCell>
                    <TableCell dir="ltr" className="text-start">{timeText(day.checkOutAt)}</TableCell>
                    <TableCell>{day.explicitAbsence ? tr(language, "غياب", "Absent") : day.status || "—"}</TableCell>
                    <TableCell>{minutesText(day.lateMinutes, language)}</TableCell>
                    <TableCell>{minutesText(day.earlyLeaveMinutes, language)}</TableCell>
                    <TableCell>{day.workedMinutes == null ? "—" : minutesText(day.workedMinutes, language)}</TableCell>
                    <TableCell>
                      {day.missingPunch ? <Badge variant="outline" className="rounded-full"><Clock3 className="ml-1 h-3.5 w-3.5" /> {tr(language, "بصمة ناقصة", "Missing Punch")}</Badge> : null}
                      {day.explicitAbsence ? <Badge variant="outline" className="mr-1 rounded-full"><UserX className="ml-1 h-3.5 w-3.5" /> {day.explicitAbsence.dayPortion === "half_day" ? tr(language, "غياب نصف يوم", "Half-Day Absence") : tr(language, "غياب يوم كامل", "Full-Day Absence")}</Badge> : null}
                      {!day.missingPunch && !day.explicitAbsence ? "—" : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!loading && !payload.days.length ? <p className="py-8 text-center text-sm text-slate-500">{tr(language, "لا توجد حركات حضور أو غياب لهذا الشهر.", "No attendance or absence records for this month.")}</p> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black">{Number(value || 0).toLocaleString("en-US")}</p>
    </div>
  );
}
