import { Download, Loader2, RefreshCw, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { WorkforceApiError, halalasToRiyals, workforceApi } from "./workforceClient";
import { downloadWorkforceMonthlyPayrollExcel } from "./workforcePayrollExport";

type Payload = { ok: true; report: any };

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
  if (caught instanceof WorkforceApiError && caught.code === "workforce_management_forbidden") return "لا تملك صلاحية عرض المسير الشهري.";
  return caught instanceof Error ? caught.message : "تعذر تحميل المسير الشهري.";
}

export default function WorkforceMonthlyPayrollReportPanel() {
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const payload = await workforceApi<Payload>(`payroll/reports/monthly?month=${encodeURIComponent(month)}`);
      setReport(payload.report);
    } catch (caught) { setReport(null); setError(friendlyError(caught)); }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { void load(); }, [load]);
  const totals = report?.totals || {};
  const counts = totals.statusCounts || {};

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white"><WalletCards className="h-5 w-5" /></span><div><h3 className="text-lg font-black">المسير الشهري للموظفين</h3><p className="mt-1 text-sm text-slate-500">تقرير مالي موحد من Payroll snapshots المحفوظة مع تصدير Excel؛ بدون إعادة احتساب الرواتب المقفلة.</p></div></div>
        <div className="flex flex-wrap items-end gap-2"><div><Label className="mb-1.5 block text-xs">الشهر</Label><Input type="month" dir="ltr" value={month} onChange={e => setMonth(e.target.value)} className="h-10 w-40 rounded-xl" /></div><Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> تحديث</Button><Button type="button" variant="outline" className="rounded-xl" disabled={!report} onClick={() => report && downloadWorkforceMonthlyPayrollExcel(report)}><Download className="h-4 w-4" /> Excel شامل</Button></div>
      </div>

      {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {loading ? <div className="flex items-center justify-center py-10 text-sm text-slate-500"><Loader2 className="ml-2 h-4 w-4 animate-spin" /> جاري تحميل المسير...</div> : report ? <>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="عدد الموظفين" value={String(Number(totals.employeeCount || 0))} /><Metric label="إجمالي الرواتب" value={`${money(totals.grossSalaryHalalas)} ر.س`} /><Metric label="الاستقطاعات" value={`${money(totals.totalDeductionsHalalas)} ر.س`} /><Metric label="الصافي" value={`${money(totals.netSalaryHalalas)} ر.س`} strong /></div>
        <div className="mt-4 flex flex-wrap gap-2">{["not_generated", "draft", "reviewed", "approved", "paid"].map(status => <Badge key={status} variant="outline" className="rounded-full">{statusLabel(status)}: {Number(counts[status] || 0)}</Badge>)}</div>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200"><Table className="min-w-[1500px]"><TableHeader className="bg-slate-50"><TableRow><TableHead className="text-right">الموظف</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">جاهزية</TableHead><TableHead className="text-right">الأساسي</TableHead><TableHead className="text-right">البدلات</TableHead><TableHead className="text-right">تأخير</TableHead><TableHead className="text-right">غياب</TableHead><TableHead className="text-right">خصم حضور</TableHead><TableHead className="text-right">خصم غياب</TableHead><TableHead className="text-right">إضافات</TableHead><TableHead className="text-right">خصومات يدوية</TableHead><TableHead className="text-right">الإجمالي</TableHead><TableHead className="text-right">الاستقطاعات</TableHead><TableHead className="text-right">الصافي</TableHead></TableRow></TableHeader><TableBody>{(report.employees || []).map((item: any) => <TableRow key={item.employeeId}><TableCell><p className="font-black">{item.displayName}</p><p className="text-xs text-slate-500">{item.employeeNumber || item.jobTitle || "—"}</p></TableCell><TableCell><Badge variant="outline" className="rounded-full">{statusLabel(item.status)}</Badge></TableCell><TableCell>{item.readiness?.ready === true ? "جاهز" : item.readiness?.message || "غير جاهز"}</TableCell><TableCell>{money(item.baseSalaryHalalas)}</TableCell><TableCell>{money(item.allowancesHalalas)}</TableCell><TableCell>{Number(item.attendance?.lateMinutes || 0)} د</TableCell><TableCell>{Number(item.absences?.absenceUnits || 0)}</TableCell><TableCell>{money(item.attendanceDeductionHalalas)}</TableCell><TableCell>{money(item.absenceDeductionHalalas)}</TableCell><TableCell>{money(item.manualAdditionsHalalas)}</TableCell><TableCell>{money(item.manualDeductionsHalalas)}</TableCell><TableCell>{money(item.grossSalaryHalalas)}</TableCell><TableCell>{money(item.totalDeductionsHalalas)}</TableCell><TableCell className="font-black">{money(item.netSalaryHalalas)}</TableCell></TableRow>)}</TableBody></Table></div>
      </> : null}
    </section>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-xl ${strong ? "font-black" : "font-bold"}`}>{value}</p></div>;
}
