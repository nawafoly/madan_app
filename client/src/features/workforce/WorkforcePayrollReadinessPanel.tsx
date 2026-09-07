import { AlertTriangle, Calculator, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { WorkforceApiError, halalasToRiyals, workforceApi } from "./workforceClient";

type Blocker = { stage: string; code: string; message: string };
type Preview = {
  policyVersion: string;
  employeeId: string;
  monthKey: string;
  completedThrough: string | null;
  locked: boolean;
  lockedReason: string | null;
  readiness: {
    ready: boolean;
    code: string;
    message: string;
    attendancePayrollMode: "required" | "exempt";
    blockers: Blocker[];
  };
  settings: {
    baseSalaryHalalas: number;
    allowancesHalalas: number;
    workDaysPerMonth: number | null;
    dailyHours: number | null;
    monthlyHours: number | null;
    derivedDailyHours: number;
    deductionMethod: string;
    attendancePayrollMode: "required" | "exempt";
  };
  attendance: {
    linkStatus: string;
    scheduleReady: boolean;
    attendanceRecordCount: number;
    incompletePunchDays: number;
    expectedAttendanceMinutes: number;
    attendanceMissingMinutes: number;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    automaticAttendanceDeductionEligible: boolean;
    automaticAttendanceDeductionApplied: boolean;
  };
  absences: {
    absenceUnits: number;
    unpaidPartialMinutes: number;
    manualReviewAbsenceDays: number;
  };
  rates: {
    dailyRateHalalas: number;
    hourlyRateHalalas: number;
  };
  deductions: {
    attendanceDeductionHalalas: number;
    absenceDeductionHalalas: number;
  };
  manual: {
    additionsHalalas: number;
    deductionsHalalas: number;
  };
  totals: {
    overtimeHalalas: number;
    grossSalaryHalalas: number;
    totalDeductionsHalalas: number;
    netSalaryHalalas: number;
  };
  days: Array<{
    date: string;
    scheduleKind: string;
    isWorkingDay: boolean;
    scheduledMinutes: number;
    expectedAttendanceMinutes: number;
    attendanceMissingMinutes: number;
    missingPunch: boolean;
    absenceUnits: number;
    absenceTreatment: string | null;
  }>;
};

type Props = { employeeId: string };

export default function WorkforcePayrollReadinessPanel({ employeeId }: Props) {
  const [month, setMonth] = useState(currentMonth());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!employeeId || !month) return;
    setLoading(true);
    setError("");
    try {
      const result = await workforceApi<{ ok: true; preview: Preview }>(
        `employees/${encodeURIComponent(employeeId)}/payroll-readiness?month=${encodeURIComponent(month)}`
      );
      setPreview(result.preview);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setLoading(false);
    }
  }, [employeeId, month]);

  useEffect(() => { void load(); }, [load]);

  async function apply() {
    if (!employeeId || !month || applying) return;
    setApplying(true);
    setError("");
    setMessage("");
    try {
      const result = await workforceApi<{ ok: true; preview: Preview }>(
        `employees/${encodeURIComponent(employeeId)}/payroll-readiness?month=${encodeURIComponent(month)}`,
        { method: "POST" }
      );
      setPreview(result.preview);
      setMessage("تم تطبيق احتساب الحضور والغياب على مسودة المسير وتحديث صافي الراتب.");
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setApplying(false);
    }
  }

  const status = preview?.readiness.ready ? "ready" : "blocked";
  const totalAutoDeduction = useMemo(
    () => Number(preview?.deductions.attendanceDeductionHalalas || 0) + Number(preview?.deductions.absenceDeductionHalalas || 0),
    [preview]
  );

  return (
    <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6" dir="rtl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <h3 className="font-black">جاهزية المسير وخصم الحضور</h3>
              <p className="mt-1 text-sm text-slate-500">فحص موحد للربط، الدوام، البصمات الناقصة، الغياب، ثم احتساب الخصم على مسودة الراتب فقط.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs font-bold text-slate-600">
            <span>الشهر</span>
            <Input dir="ltr" type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-10 w-40 rounded-xl" />
          </label>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} تحديث
          </Button>
        </div>
      </div>

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}

      {loading && !preview ? <div className="py-10 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />جاري فحص الجاهزية...</div> : null}

      {preview ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={status === "ready" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}>
              {status === "ready" ? <CheckCircle2 className="ml-1 h-3.5 w-3.5" /> : <AlertTriangle className="ml-1 h-3.5 w-3.5" />}
              {status === "ready" ? "جاهز للاحتساب" : "غير جاهز"}
            </Badge>
            <Badge variant="outline">ربط الحضور: {linkLabel(preview.attendance.linkStatus)}</Badge>
            <Badge variant="outline">الدوام: {preview.attendance.scheduleReady ? "جاهز" : "يحتاج مراجعة"}</Badge>
            <Badge variant="outline">حتى: {preview.completedThrough || "لم تبدأ الفترة"}</Badge>
            {preview.locked ? <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">المسير مقفل للتعديل</Badge> : null}
          </div>

          {!preview.readiness.ready ? (
            <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-black text-amber-900">لم يتم تطبيق خصم الحضور لأن الجاهزية غير مكتملة.</p>
              {preview.readiness.blockers.map(blocker => (
                <div key={`${blocker.stage}:${blocker.code}`} className="flex items-start gap-2 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{blocker.message}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="أجر اليوم" value={money(preview.rates.dailyRateHalalas)} icon={<WalletCards className="h-4 w-4" />} />
            <Metric label="أجر الساعة" value={money(preview.rates.hourlyRateHalalas)} icon={<Clock3 className="h-4 w-4" />} />
            <Metric label="خصم حضور محسوب" value={money(preview.deductions.attendanceDeductionHalalas)} icon={<Calculator className="h-4 w-4" />} />
            <Metric label="خصم غياب محسوب" value={money(preview.deductions.absenceDeductionHalalas)} icon={<Calculator className="h-4 w-4" />} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SmallMetric label="دقائق النقص" value={String(preview.attendance.attendanceMissingMinutes)} />
            <SmallMetric label="دقائق التأخير" value={String(preview.attendance.lateMinutes)} />
            <SmallMetric label="دقائق الخروج المبكر" value={String(preview.attendance.earlyLeaveMinutes)} />
            <SmallMetric label="أيام البصمة الناقصة" value={String(preview.attendance.incompletePunchDays)} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <Table className="min-w-[760px]">
              <TableHeader><TableRow>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">الدوام</TableHead>
                <TableHead className="text-right">المطلوب</TableHead>
                <TableHead className="text-right">النقص</TableHead>
                <TableHead className="text-right">الغياب</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {preview.days.filter(day => day.isWorkingDay || day.attendanceMissingMinutes > 0 || day.absenceUnits > 0 || day.missingPunch).map(day => (
                  <TableRow key={day.date}>
                    <TableCell dir="ltr" className="text-right">{day.date}</TableCell>
                    <TableCell>{scheduleLabel(day.scheduleKind)}</TableCell>
                    <TableCell>{minutesText(day.expectedAttendanceMinutes)}</TableCell>
                    <TableCell>{minutesText(day.attendanceMissingMinutes)}</TableCell>
                    <TableCell>{day.absenceUnits ? `${day.absenceUnits} يوم` : "—"}</TableCell>
                    <TableCell>{day.missingPunch ? <span className="font-bold text-red-600">بصمة ناقصة</span> : "مراجع"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl bg-slate-950 p-4 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-slate-300">إجمالي الخصم التلقائي المقترح</p>
              <p className="mt-1 text-2xl font-black">{money(totalAutoDeduction)}</p>
              <p className="mt-1 text-xs text-slate-400">لا يتم تعديل مسودة المسير إلا عند الضغط على زر التطبيق وبعد نجاح جميع بوابات الجاهزية.</p>
            </div>
            <Button type="button" className="rounded-xl bg-white text-black hover:bg-slate-100" disabled={!preview.readiness.ready || preview.locked || applying} onClick={() => void apply()}>
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              تطبيق الاحتساب على مسودة المسير
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-bold text-slate-500">{icon}{label}</div><p className="mt-2 text-xl font-black">{value}</p></div>;
}
function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-100 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-black">{value}</p></div>;
}
function money(halalas: number) {
  return `${halalasToRiyals(halalas).toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
}
function minutesText(minutes: number) {
  const value = Number(minutes || 0);
  if (!value) return "—";
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return hours ? `${hours}س ${mins ? `${mins}د` : ""}`.trim() : `${mins}د`;
}
function linkLabel(status: string) {
  if (status === "confirmed") return "مؤكد";
  if (status === "exempt") return "مستثنى";
  if (status === "not_ready") return "غير جاهز";
  return "غير مربوط";
}
function scheduleLabel(kind: string) {
  const labels: Record<string, string> = {
    assignment: "دوام أساسي",
    weekly_rest: "راحة أسبوعية",
    exception_off: "راحة استثنائية",
    custom_shift: "دوام مخصص",
    alternate_shift: "شفت بديل",
    weekly_rest_work: "عمل في يوم الراحة",
    unassigned: "غير معين",
  };
  return labels[kind] || kind || "—";
}
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function friendlyError(error: unknown) {
  if (!(error instanceof WorkforceApiError)) return "تعذر تنفيذ العملية.";
  const messages: Record<string, string> = {
    workforce_payroll_attendance_unconfirmed: "الحضور غير مربوط/غير مؤكد، لم يتم تطبيق خصم حضور تلقائي.",
    workforce_payroll_attendance_incomplete: "توجد بصمة ناقصة وتحتاج مراجعة قبل احتساب الراتب.",
    workforce_payroll_schedule_not_ready: "الدوام غير مكتمل للفترة المطلوبة.",
    workforce_payroll_entry_locked: "المسير لم يعد مسودة ولا يمكن إعادة احتسابه.",
    workforce_payroll_settings_required: "أكمل إعدادات الراتب أولًا.",
  };
  return messages[error.code] || error.code || "تعذر تنفيذ العملية.";
}
