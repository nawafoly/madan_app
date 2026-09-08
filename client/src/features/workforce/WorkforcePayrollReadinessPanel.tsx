import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
import { AlertTriangle, Calculator, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { WorkforceApiError, halalasToRiyals, workforceApi } from "./workforceClient";

import HabatDatePicker from "@/pages/habat/HabatDatePicker";
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
  const { language } = useLanguage();
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
      setError(friendlyError(caught, language));
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
      setMessage(tr(language, "تم تطبيق احتساب الحضور والغياب على مسودة المسير وتحديث صافي الراتب.", "Attendance and absence calculations were applied to the payroll draft and net salary was updated."));
    } catch (caught) {
      setError(friendlyError(caught, language));
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
    <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6" dir={languageDir(language)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <h3 className="font-black">{tr(language, "جاهزية المسير وخصم الحضور", "Payroll Readiness & Attendance Deduction")}</h3>
              <p className="mt-1 text-sm text-slate-500">{tr(language, "فحص موحد للربط، الدوام، البصمات الناقصة، الغياب، ثم احتساب الخصم على مسودة الراتب فقط.", "Unified check of attendance linking, schedule, missing punches, absence, and payroll-draft deductions.")}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs font-bold text-slate-600">
            <span>{tr(language, "الشهر", "Month")}</span>
            <HabatDatePicker mode="month" value={month} onChange={setMonth} className="w-40" />
          </label>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {tr(language, "تحديث", "Refresh")}
          </Button>
        </div>
      </div>

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}

      {loading && !preview ? <div className="py-10 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />{tr(language, "جاري فحص الجاهزية...", "Checking readiness...")}</div> : null}

      {preview ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={status === "ready" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}>
              {status === "ready" ? <CheckCircle2 className="ml-1 h-3.5 w-3.5" /> : <AlertTriangle className="ml-1 h-3.5 w-3.5" />}
              {status === "ready" ? tr(language, "جاهز للاحتساب", "Ready to Calculate") : tr(language, "غير جاهز", "Not Ready")}
            </Badge>
            <Badge variant="outline">{tr(language, "ربط الحضور:", "Attendance Link:")} {linkLabel(preview.attendance.linkStatus, language)}</Badge>
            <Badge variant="outline">الدوام: {preview.attendance.scheduleReady ? tr(language, "جاهز", "Ready") : tr(language, "يحتاج مراجعة", "Needs Review")}</Badge>
            <Badge variant="outline">حتى: {preview.completedThrough || tr(language, "لم تبدأ الفترة", "Period Not Started")}</Badge>
            {preview.locked ? <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">{tr(language, "المسير مقفل للتعديل", "Payroll Locked")}</Badge> : null}
          </div>

          {!preview.readiness.ready ? (
            <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-black text-amber-900">{tr(language, "لم يتم تطبيق خصم الحضور لأن الجاهزية غير مكتملة.", "Attendance deduction was not applied because readiness is incomplete.")}</p>
              {preview.readiness.blockers.map(blocker => (
                <div key={`${blocker.stage}:${blocker.code}`} className="flex items-start gap-2 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{blocker.message}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label={tr(language, "أجر اليوم", "Daily Rate")} value={money(preview.rates.dailyRateHalalas, language)} icon={<WalletCards className="h-4 w-4" />} />
            <Metric label={tr(language, "أجر الساعة", "Hourly Rate")} value={money(preview.rates.hourlyRateHalalas, language)} icon={<Clock3 className="h-4 w-4" />} />
            <Metric label={tr(language, "خصم حضور محسوب", "Calculated Attendance Deduction")} value={money(preview.deductions.attendanceDeductionHalalas, language)} icon={<Calculator className="h-4 w-4" />} />
            <Metric label={tr(language, "خصم غياب محسوب", "Calculated Absence Deduction")} value={money(preview.deductions.absenceDeductionHalalas, language)} icon={<Calculator className="h-4 w-4" />} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SmallMetric label={tr(language, "دقائق النقص", "Missing Minutes")} value={String(preview.attendance.attendanceMissingMinutes)} />
            <SmallMetric label={tr(language, "دقائق التأخير", "Late Minutes")} value={String(preview.attendance.lateMinutes)} />
            <SmallMetric label={tr(language, "دقائق الخروج المبكر", "Early Leave Minutes")} value={String(preview.attendance.earlyLeaveMinutes)} />
            <SmallMetric label={tr(language, "أيام البصمة الناقصة", "Missing Punch Days")} value={String(preview.attendance.incompletePunchDays)} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <Table className="min-w-[760px]">
              <TableHeader><TableRow>
                <TableHead className="text-start">{tr(language, "التاريخ", "Date")}</TableHead>
                <TableHead className="text-start">{tr(language, "الدوام", "Schedule")}</TableHead>
                <TableHead className="text-start">{tr(language, "المطلوب", "Required")}</TableHead>
                <TableHead className="text-start">{tr(language, "النقص", "Shortfall")}</TableHead>
                <TableHead className="text-start">{tr(language, "الغياب", "Absence")}</TableHead>
                <TableHead className="text-start">{tr(language, "الحالة", "Status")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {preview.days.filter(day => day.isWorkingDay || day.attendanceMissingMinutes > 0 || day.absenceUnits > 0 || day.missingPunch).map(day => (
                  <TableRow key={day.date}>
                    <TableCell dir="ltr" className="text-start">{day.date}</TableCell>
                    <TableCell>{scheduleLabel(day.scheduleKind, language)}</TableCell>
                    <TableCell>{minutesText(day.expectedAttendanceMinutes, language)}</TableCell>
                    <TableCell>{minutesText(day.attendanceMissingMinutes, language)}</TableCell>
                    <TableCell>{day.absenceUnits ? `${day.absenceUnits} ${tr(language, "يوم", "day")}` : "—"}</TableCell>
                    <TableCell>{day.missingPunch ? <span className="font-bold text-red-600">{tr(language, "بصمة ناقصة", "Missing Punch")}</span> : "مراجع"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl bg-slate-950 p-4 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-slate-300">{tr(language, "إجمالي الخصم التلقائي المقترح", "Proposed Automatic Deduction")}</p>
              <p className="mt-1 text-2xl font-black">{money(totalAutoDeduction, language)}</p>
              <p className="mt-1 text-xs text-slate-400">{tr(language, "لا يتم تعديل مسودة المسير إلا عند الضغط على زر التطبيق وبعد نجاح جميع بوابات الجاهزية.", "The payroll draft is changed only after Apply is pressed and all readiness gates pass.")}</p>
            </div>
            <Button type="button" className="rounded-xl bg-white text-black hover:bg-slate-100" disabled={!preview.readiness.ready || preview.locked || applying} onClick={() => void apply()}>
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              {tr(language, "تطبيق الاحتساب على مسودة المسير", "Apply Calculation to Payroll Draft")}
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
function money(halalas: number, language: "ar" | "en") {
  return `${halalasToRiyals(halalas).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${tr(language, "ر.س", "SAR")}`;
}
function minutesText(minutes: number, language: "ar" | "en") {
  const value = Number(minutes || 0);
  if (!value) return "—";
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return hours ? (language === "ar" ? `${hours}س ${mins ? `${mins}د` : ""}`.trim() : `${hours}h ${mins ? `${mins}m` : ""}`.trim()) : (language === "ar" ? `${mins}د` : `${mins}m`);
}
function linkLabel(status: string, language: "ar" | "en") {
  if (status === "confirmed") return tr(language, "مؤكد", "Confirmed");
  if (status === "exempt") return tr(language, "مستثنى", "Exempt");
  if (status === "not_ready") return tr(language, "غير جاهز", "Not Ready");
  return tr(language, "غير مربوط", "Unlinked");
}
function scheduleLabel(kind: string, language: "ar" | "en") {
  const labels: Record<string, string> = {
    assignment: tr(language, "دوام أساسي", "Base Schedule"),
    weekly_rest: tr(language, "راحة أسبوعية", "Weekly Rest"),
    exception_off: tr(language, "راحة استثنائية", "Exceptional Rest"),
    custom_shift: tr(language, "دوام مخصص", "Custom Shift"),
    alternate_shift: tr(language, "شفت بديل", "Alternate Shift"),
    weekly_rest_work: tr(language, "عمل في يوم الراحة", "Rest-Day Work"),
    unassigned: tr(language, "غير معين", "Unassigned"),
  };
  return labels[kind] || kind || "—";
}
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function friendlyError(error: unknown, language: "ar" | "en") {
  if (!(error instanceof WorkforceApiError)) return tr(language, "تعذر تنفيذ العملية.", "Unable to complete the operation.");
  const messages: Record<string, string> = {
    workforce_payroll_attendance_unconfirmed: tr(language, "الحضور غير مربوط/غير مؤكد، لم يتم تطبيق خصم حضور تلقائي.", "Attendance is not linked or confirmed; automatic attendance deduction was not applied."),
    workforce_payroll_attendance_incomplete: tr(language, "توجد بصمة ناقصة وتحتاج مراجعة قبل احتساب الراتب.", "A missing punch requires review before payroll can be calculated."),
    workforce_payroll_schedule_not_ready: tr(language, "الدوام غير مكتمل للفترة المطلوبة.", "Schedule is incomplete for the requested period."),
    workforce_payroll_entry_locked: tr(language, "المسير لم يعد مسودة ولا يمكن إعادة احتسابه.", "Payroll is no longer a draft and cannot be recalculated."),
    workforce_payroll_settings_required: tr(language, "أكمل إعدادات الراتب أولًا.", "Complete payroll settings first."),
  };
  return messages[error.code] || error.code || tr(language, "تعذر تنفيذ العملية.", "Unable to complete the operation.");
}
