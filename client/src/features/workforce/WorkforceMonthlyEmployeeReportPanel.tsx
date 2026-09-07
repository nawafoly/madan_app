import { Download, FileText, Loader2, Printer, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { WorkforceApiError, halalasToRiyals, workforceApi } from "./workforceClient";
import { downloadWorkforceEmployeePayrollExcel, printWorkforceEmployeePayrollReport } from "./workforcePayrollExport";

type Props = { employeeId: string };
type ReportPayload = { ok: true; report: any };

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit" }).format(new Date());
}
function money(value: unknown) {
  return halalasToRiyals(Number(value || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function statusLabel(status: string) {
  return ({ not_generated: "غير محتسب", draft: "مسودة", reviewed: "تمت المراجعة", approved: "معتمد", paid: "مدفوع" } as Record<string, string>)[status] || status;
}
function friendlyError(caught: unknown) {
  if (caught instanceof WorkforceApiError) {
    if (caught.code === "workforce_management_forbidden") return "لا تملك صلاحية عرض تقارير الرواتب.";
    if (caught.code === "workforce_employee_not_found") return "ملف الموظف غير موجود.";
  }
  return caught instanceof Error ? caught.message : "تعذر تحميل تقرير الراتب.";
}

export default function WorkforceMonthlyEmployeeReportPanel({ employeeId }: Props) {
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
      setReport(null); setError(friendlyError(caught));
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
          <div><h3 className="text-lg font-black">التقرير الشهري للموظف</h3><p className="mt-1 text-sm text-slate-500">نسخة مالية من القيم المحفوظة في المسير؛ التقرير لا يعيد احتساب راتب معتمد أو مدفوع.</p></div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label className="mb-1.5 block text-xs">الشهر</Label><Input type="month" dir="ltr" value={month} onChange={e => setMonth(e.target.value)} className="h-10 w-40 rounded-xl" /></div>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> تحديث</Button>
          <Button type="button" variant="outline" className="rounded-xl" disabled={!report} onClick={() => report && downloadWorkforceEmployeePayrollExcel(report)}><Download className="h-4 w-4" /> Excel</Button>
          <Button type="button" variant="outline" className="rounded-xl" disabled={!report} onClick={() => report && printWorkforceEmployeePayrollReport(report)}><Printer className="h-4 w-4" /> طباعة / PDF</Button>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {loading ? <div className="flex items-center justify-center py-10 text-sm text-slate-500"><Loader2 className="ml-2 h-4 w-4 animate-spin" /> جاري تحميل التقرير...</div> : report ? (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2"><Badge variant="outline" className="rounded-full">{statusLabel(lifecycle.status || "not_generated")}</Badge>{report.readiness ? <Badge variant="outline" className="rounded-full">جاهزية الحضور: {report.readiness.ready ? "جاهز" : "غير جاهز"}</Badge> : null}{attendance.completedThrough ? <Badge variant="outline" className="rounded-full">مغلق حتى {attendance.completedThrough}</Badge> : null}</div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="الإجمالي" value={`${money(payroll.grossSalaryHalalas)} ر.س`} />
            <Metric label="الاستقطاعات" value={`${money(payroll.totalDeductionsHalalas)} ر.س`} />
            <Metric label="الصافي" value={`${money(payroll.netSalaryHalalas)} ر.س`} strong />
            <Metric label="الغياب" value={`${Number(absences.absenceUnits || 0)} يوم/وحدة`} />
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200"><Table><TableHeader className="bg-slate-50"><TableRow><TableHead className="text-right">البند</TableHead><TableHead className="text-right">القيمة</TableHead><TableHead className="text-right">البند</TableHead><TableHead className="text-right">القيمة</TableHead></TableRow></TableHeader><TableBody>
            <Pair a="الراتب الأساسي" av={`${money(payroll.baseSalaryHalalas)} ر.س`} b="البدلات" bv={`${money(payroll.allowancesHalalas)} ر.س`} />
            <Pair a="خصم الحضور" av={`${money(payroll.attendanceDeductionHalalas)} ر.س`} b="خصم الغياب" bv={`${money(payroll.absenceDeductionHalalas)} ر.س`} />
            <Pair a="إضافات يدوية" av={`${money(payroll.manualAdditionsHalalas)} ر.س`} b="خصومات يدوية" bv={`${money(payroll.manualDeductionsHalalas)} ر.س`} />
            <Pair a="التأخير" av={`${Number(attendance.lateMinutes || 0)} دقيقة`} b="الخروج المبكر" bv={`${Number(attendance.earlyLeaveMinutes || 0)} دقيقة`} />
            <Pair a="نقص الحضور" av={`${Number(attendance.attendanceMissingMinutes || 0)} دقيقة`} b="بصمات ناقصة" bv={String(Number(attendance.incompletePunchDays || 0))} />
          </TableBody></Table></div>

          {report.activeAdjustments?.length ? <div className="mt-5"><h4 className="mb-2 font-black">التعديلات اليدوية الفعالة</h4><div className="overflow-hidden rounded-2xl border border-slate-200"><Table><TableHeader><TableRow><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">الاتجاه</TableHead><TableHead className="text-right">المبلغ</TableHead><TableHead className="text-right">السبب</TableHead></TableRow></TableHeader><TableBody>{report.activeAdjustments.map((item: any) => <TableRow key={item.id}><TableCell>{item.kind}</TableCell><TableCell>{item.direction === "addition" ? "إضافة" : "خصم"}</TableCell><TableCell>{money(item.amountHalalas)} ر.س</TableCell><TableCell>{item.reason}</TableCell></TableRow>)}</TableBody></Table></div></div> : null}
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
