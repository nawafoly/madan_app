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

function friendlyError(error: unknown) {
  const code = error instanceof WorkforceApiError ? error.code : String((error as { message?: unknown })?.message || "");
  const messages: Record<string, string> = {
    workforce_attendance_month_invalid: "صيغة الشهر غير صحيحة.",
    workforce_attendance_source_unavailable: "مصدر الحضور غير متاح لهذا المطعم.",
    workforce_employee_not_found: "لم يتم العثور على الموظف.",
  };
  return messages[code] || code || "تعذر تحميل بيانات الحضور التشغيلية.";
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
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false }).format(parsed);
  }
  return value.slice(0, 5) || value;
}

function minutesText(value: number) {
  const minutes = Math.max(0, Math.round(Number(value || 0)));
  if (!minutes) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}س ${rest ? `${rest}د` : ""}`.trim() : `${rest}د`;
}

export default function WorkforceAttendanceOperationsPanel({ employeeId }: Props) {
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
      setError(friendlyError(caught));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [employeeId, month]);

  useEffect(() => { void load(); }, [load]);

  const readinessLabel = useMemo(() => {
    const status = payload?.readiness.status;
    if (status === "confirmed") return "ربط الحضور مؤكد";
    if (status === "exempt") return "مستثنى من ربط الحضور";
    if (status === "unlinked") return "الحضور غير مربوط";
    if (status === "not_ready") return "الحضور غير جاهز";
    return status || "غير معروف";
  }, [payload?.readiness.status]);

  const summary = payload?.summary;
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-black">الحضور التشغيلي: الغياب والتأخير</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              قراءة موحدة من مصدر البصمة المرتبط بالموظف مع الغياب الإداري في Workforce Core. هذه الشاشة للمراجعة والجاهزية فقط ولا تطبق أي خصم راتب تلقائي.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input dir="ltr" type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-10 w-[155px] rounded-xl" />
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4" /> تحديث
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
              <Badge variant="outline" className="rounded-full px-3 py-1">غير مؤهل لخصم حضور تلقائي</Badge>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Metric label="أيام بسجل" value={summary?.daysWithRecords || 0} />
            <Metric label="أيام تأخير" value={summary?.lateDays || 0} />
            <Metric label="دقائق التأخير" value={summary?.lateMinutes || 0} />
            <Metric label="خروج مبكر" value={summary?.earlyLeaveDays || 0} />
            <Metric label="دقائق خروج مبكر" value={summary?.earlyLeaveMinutes || 0} />
            <Metric label="بصمة ناقصة" value={summary?.missingPunchDays || 0} />
            <Metric label="غياب معتمد" value={summary?.explicitAbsenceDays || 0} />
          </div>

          <div className="mt-5 overflow-x-auto">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">الدخول</TableHead>
                  <TableHead className="text-right">الخروج</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">التأخير</TableHead>
                  <TableHead className="text-right">الخروج المبكر</TableHead>
                  <TableHead className="text-right">العمل</TableHead>
                  <TableHead className="text-right">ملاحظة تشغيلية</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payload.days.map(day => (
                  <TableRow key={day.date}>
                    <TableCell className="font-semibold">{dateText(day.date)}</TableCell>
                    <TableCell dir="ltr" className="text-right">{timeText(day.checkInAt)}</TableCell>
                    <TableCell dir="ltr" className="text-right">{timeText(day.checkOutAt)}</TableCell>
                    <TableCell>{day.explicitAbsence ? "غياب" : day.status || "—"}</TableCell>
                    <TableCell>{minutesText(day.lateMinutes)}</TableCell>
                    <TableCell>{minutesText(day.earlyLeaveMinutes)}</TableCell>
                    <TableCell>{day.workedMinutes == null ? "—" : minutesText(day.workedMinutes)}</TableCell>
                    <TableCell>
                      {day.missingPunch ? <Badge variant="outline" className="rounded-full"><Clock3 className="ml-1 h-3.5 w-3.5" /> بصمة ناقصة</Badge> : null}
                      {day.explicitAbsence ? <Badge variant="outline" className="mr-1 rounded-full"><UserX className="ml-1 h-3.5 w-3.5" /> {day.explicitAbsence.dayPortion === "half_day" ? "غياب نصف يوم" : "غياب يوم كامل"}</Badge> : null}
                      {!day.missingPunch && !day.explicitAbsence ? "—" : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!loading && !payload.days.length ? <p className="py-8 text-center text-sm text-slate-500">لا توجد حركات حضور أو غياب لهذا الشهر.</p> : null}
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
