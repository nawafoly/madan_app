import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
import { Download, FileText, Loader2, Printer, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { WorkforceApiError, halalasToRiyals, workforceApi } from "./workforceClient";
import { downloadWorkforceEmployeePayrollExcel, printWorkforceEmployeePayrollReport } from "./workforcePayrollExport";

import HabatDatePicker from "@/pages/habat/HabatDatePicker";
type Props = { employeeId: string };
type ReportPayload = { ok: true; report: any };

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit" }).format(new Date());
}
function money(value: unknown) {
  return halalasToRiyals(Number(value || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function statusLabel(status: string, language: "ar" | "en") {
  const labels = { not_generated: tr(language, "غير محتسب", "Not Generated"), draft: tr(language, "مسودة", "Draft"), reviewed: tr(language, "تمت المراجعة", "Reviewed"), approved: tr(language, "معتمد", "Approved"), paid: tr(language, "مدفوع", "Paid") } as Record<string, string>; return labels[status] || status;
}
function friendlyError(caught: unknown, language: "ar" | "en") {
  if (caught instanceof WorkforceApiError) {
    if (caught.code === "workforce_management_forbidden") return tr(language, "لا تملك صلاحية عرض تقارير الرواتب.", "You do not have permission to view payroll reports.");
    if (caught.code === "workforce_employee_not_found") return tr(language, "ملف الموظف غير موجود.", "Employee file was not found.");
  }
  return caught instanceof Error ? caught.message : tr(language, "تعذر تحميل تقرير الراتب.", "Unable to load payroll report.");
}

export default function WorkforceMonthlyEmployeeReportPanel({ employeeId }: Props) {
  const { language } = useLanguage();
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const payload = await workforceApi<ReportPayload>(`employees/${encodeURIComponent(employeeId)}/monthly-payroll-report?month=${encodeURIComponent(month)}`);
      setReport(payload.report);
    } catch (caught) {
      setReport(null); setError(friendlyError(caught, language));
    } finally { setLoading(false); }
  }, [employeeId, month]);

  useEffect(() => { void load(); }, [load]);

  const payroll = report?.payroll || {};
  const attendance = report?.attendance || {};
  const absences = report?.absences || {};
  const lifecycle = report?.lifecycle || {};

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white"><FileText className="h-5 w-5" /></span>
          <div><h3 className="text-lg font-black">{tr(language, "التقرير الشهري للموظف", "Employee Monthly Report")}</h3><p className="mt-1 text-sm text-slate-500">{tr(language, "نسخة مالية من القيم المحفوظة في المسير؛ التقرير لا يعيد احتساب راتب معتمد أو مدفوع.", "Financial view of values stored in payroll; this report does not recalculate approved or paid payroll.")}</p></div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label className="mb-1.5 block text-xs">{tr(language, "الشهر", "Month")}</Label><HabatDatePicker mode="month" value={month} onChange={setMonth} className="w-40" /></div>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {tr(language, "تحديث", "Refresh")}</Button>
          <Button type="button" variant="outline" className="rounded-xl" disabled={!report} onClick={() => report && downloadWorkforceEmployeePayrollExcel(report)}><Download className="h-4 w-4" /> Excel</Button>
          <Button type="button" variant="outline" className="rounded-xl" disabled={!report} onClick={() => report && printWorkforceEmployeePayrollReport(report)}><Printer className="h-4 w-4" /> {tr(language, "طباعة / PDF", "Print / PDF")}</Button>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {loading ? <div className="flex items-center justify-center py-10 text-sm text-slate-500"><Loader2 className="ml-2 h-4 w-4 animate-spin" /> {tr(language, "جاري تحميل التقرير...", "Loading report...")}</div> : report ? (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2"><Badge variant="outline" className="rounded-full">{statusLabel(lifecycle.status || "not_generated", language)}</Badge>{report.readiness ? <Badge variant="outline" className="rounded-full">{tr(language, "جاهزية الحضور:", "Attendance Readiness:")} {report.readiness.ready ? tr(language, "جاهز", "Ready") : tr(language, "غير جاهز", "Not Ready")}</Badge> : null}{attendance.completedThrough ? <Badge variant="outline" className="rounded-full">مغلق حتى {attendance.completedThrough}</Badge> : null}</div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="الإجمالي" value={`${money(payroll.grossSalaryHalalas)} ${tr(language, "ر.س", "SAR")}`} />
            <Metric label="الاستقطاعات" value={`${money(payroll.totalDeductionsHalalas)} ${tr(language, "ر.س", "SAR")}`} />
            <Metric label="الصافي" value={`${money(payroll.netSalaryHalalas)} ${tr(language, "ر.س", "SAR")}`} strong />
            <Metric label="الغياب" value={`${Number(absences.absenceUnits || 0)} ${tr(language, "يوم/وحدة", "day/unit")}`} />
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200"><Table><TableHeader className="bg-slate-50"><TableRow><TableHead className="text-start">{tr(language, "البند", "Item")}</TableHead><TableHead className="text-start">{tr(language, "القيمة", "Value")}</TableHead><TableHead className="text-start">{tr(language, "البند", "Item")}</TableHead><TableHead className="text-start">{tr(language, "القيمة", "Value")}</TableHead></TableRow></TableHeader><TableBody>
            <Pair a="الراتب الأساسي" av={`${money(payroll.baseSalaryHalalas)} ${tr(language, "ر.س", "SAR")}`} b="البدلات" bv={`${money(payroll.allowancesHalalas)} ${tr(language, "ر.س", "SAR")}`} />
            <Pair a="خصم الحضور" av={`${money(payroll.attendanceDeductionHalalas)} ${tr(language, "ر.س", "SAR")}`} b="خصم الغياب" bv={`${money(payroll.absenceDeductionHalalas)} ${tr(language, "ر.س", "SAR")}`} />
            <Pair a="إضافات يدوية" av={`${money(payroll.manualAdditionsHalalas)} ${tr(language, "ر.س", "SAR")}`} b="خصومات يدوية" bv={`${money(payroll.manualDeductionsHalalas)} ${tr(language, "ر.س", "SAR")}`} />
            <Pair a="التأخير" av={`${Number(attendance.lateMinutes || 0)} ${tr(language, "دقيقة", "min")}`} b="الخروج المبكر" bv={`${Number(attendance.earlyLeaveMinutes || 0)} ${tr(language, "دقيقة", "min")}`} />
            <Pair a="نقص الحضور" av={`${Number(attendance.attendanceMissingMinutes || 0)} ${tr(language, "دقيقة", "min")}`} b="بصمات ناقصة" bv={String(Number(attendance.incompletePunchDays || 0))} />
          </TableBody></Table></div>

          {report.activeAdjustments?.length ? <div className="mt-5"><h4 className="mb-2 font-black">{tr(language, "التعديلات اليدوية الفعالة", "Active Manual Adjustments")}</h4><div className="overflow-hidden rounded-2xl border border-slate-200"><Table><TableHeader><TableRow><TableHead className="text-start">{tr(language, "النوع", "Type")}</TableHead><TableHead className="text-start">{tr(language, "الاتجاه", "Direction")}</TableHead><TableHead className="text-start">{tr(language, "المبلغ", "Amount")}</TableHead><TableHead className="text-start">{tr(language, "السبب", "Reason")}</TableHead></TableRow></TableHeader><TableBody>{report.activeAdjustments.map((item: any) => <TableRow key={item.id}><TableCell>{item.kind}</TableCell><TableCell>{item.direction === "addition" ? tr(language, "إضافة", "Addition") : tr(language, "خصم", "Deduction")}</TableCell><TableCell>{money(item.amountHalalas)} {tr(language, "ر.س", "SAR")}</TableCell><TableCell>{item.reason}</TableCell></TableRow>)}</TableBody></Table></div></div> : null}
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-xl ${strong ? "font-black" : "font-bold"}`}>{value}</p></div>;
}
function Pair({ a, av, b, bv }: { a: string; av: string; b: string; bv: string }) {
  return <TableRow><TableCell className="font-semibold">{a}</TableCell><TableCell>{av}</TableCell><TableCell className="font-semibold">{b}</TableCell><TableCell>{bv}</TableCell></TableRow>;
}
