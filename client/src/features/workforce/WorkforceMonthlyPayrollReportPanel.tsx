import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
import { Download, Loader2, RefreshCw, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { WorkforceApiError, halalasToRiyals, workforceApi } from "./workforceClient";
import { downloadWorkforceMonthlyPayrollExcel } from "./workforcePayrollExport";

import HabatDatePicker from "@/pages/habat/HabatDatePicker";
type Payload = { ok: true; report: any };

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
  if (caught instanceof WorkforceApiError && caught.code === "workforce_management_forbidden") return tr(language, "لا تملك صلاحية عرض المسير الشهري.", "You do not have permission to view monthly payroll.");
  return caught instanceof Error ? caught.message : tr(language, "تعذر تحميل المسير الشهري.", "Unable to load monthly payroll.");
}

export default function WorkforceMonthlyPayrollReportPanel() {
  const { language } = useLanguage();
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const payload = await workforceApi<Payload>(`payroll/reports/monthly?month=${encodeURIComponent(month)}`);
      setReport(payload.report);
    } catch (caught) { setReport(null); setError(friendlyError(caught, language)); }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { void load(); }, [load]);
  const totals = report?.totals || {};
  const counts = totals.statusCounts || {};

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white"><WalletCards className="h-5 w-5" /></span><div><h3 className="text-lg font-black">{tr(language, "المسير الشهري للموظفين", "Monthly Employee Payroll")}</h3><p className="mt-1 text-sm text-slate-500">{tr(language, "تقرير مالي موحد من Payroll snapshots المحفوظة مع تصدير Excel؛ بدون إعادة احتساب الرواتب المقفلة.", "Unified financial report from stored payroll snapshots with Excel export; locked payroll is not recalculated.")}</p></div></div>
        <div className="flex flex-wrap items-end gap-2"><div><Label className="mb-1.5 block text-xs">{tr(language, "الشهر", "Month")}</Label><HabatDatePicker mode="month" value={month} onChange={setMonth} className="w-40" /></div><Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {tr(language, "تحديث", "Refresh")}</Button><Button type="button" variant="outline" className="rounded-xl" disabled={!report} onClick={() => report && downloadWorkforceMonthlyPayrollExcel(report)}><Download className="h-4 w-4" /> {tr(language, "Excel شامل", "Full Excel")}</Button></div>
      </div>

      {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {loading ? <div className="flex items-center justify-center py-10 text-sm text-slate-500"><Loader2 className="ml-2 h-4 w-4 animate-spin" /> {tr(language, "جاري تحميل المسير...", "Loading payroll...")}</div> : report ? <>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="عدد الموظفين" value={String(Number(totals.employeeCount || 0))} /><Metric label="إجمالي الرواتب" value={`${money(totals.grossSalaryHalalas)} ${tr(language, "ر.س", "SAR")}`} /><Metric label="الاستقطاعات" value={`${money(totals.totalDeductionsHalalas)} ${tr(language, "ر.س", "SAR")}`} /><Metric label="الصافي" value={`${money(totals.netSalaryHalalas)} ${tr(language, "ر.س", "SAR")}`} strong /></div>
        <div className="mt-4 flex flex-wrap gap-2">{["not_generated", "draft", "reviewed", "approved", "paid"].map(status => <Badge key={status} variant="outline" className="rounded-full">{statusLabel(status, language)}: {Number(counts[status] || 0)}</Badge>)}</div>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200"><Table className="min-w-[1500px]"><TableHeader className="bg-slate-50"><TableRow><TableHead className="text-start">{tr(language, "الموظف", "Employee")}</TableHead><TableHead className="text-start">{tr(language, "الحالة", "Status")}</TableHead><TableHead className="text-start">{tr(language, "جاهزية", "Readiness")}</TableHead><TableHead className="text-start">{tr(language, "الأساسي", "Base")}</TableHead><TableHead className="text-start">{tr(language, "البدلات", "Allowances")}</TableHead><TableHead className="text-start">{tr(language, "تأخير", "Late")}</TableHead><TableHead className="text-start">{tr(language, "غياب", "Absence")}</TableHead><TableHead className="text-start">{tr(language, "خصم حضور", "Attendance Deduction")}</TableHead><TableHead className="text-start">{tr(language, "خصم غياب", "Absence Deduction")}</TableHead><TableHead className="text-start">{tr(language, "إضافات", "Additions")}</TableHead><TableHead className="text-start">{tr(language, "خصومات يدوية", "Manual Deductions")}</TableHead><TableHead className="text-start">{tr(language, "الإجمالي", "Gross")}</TableHead><TableHead className="text-start">{tr(language, "الاستقطاعات", "Deductions")}</TableHead><TableHead className="text-start">{tr(language, "الصافي", "Net")}</TableHead></TableRow></TableHeader><TableBody>{(report.employees || []).map((item: any) => <TableRow key={item.employeeId}><TableCell><p className="font-black">{item.displayName}</p><p className="text-xs text-slate-500">{item.employeeNumber || item.jobTitle || "—"}</p></TableCell><TableCell><Badge variant="outline" className="rounded-full">{statusLabel(item.status, language)}</Badge></TableCell><TableCell>{item.readiness?.ready === true ? tr(language, "جاهز", "Ready") : item.readiness?.message || tr(language, "غير جاهز", "Not Ready")}</TableCell><TableCell>{money(item.baseSalaryHalalas)}</TableCell><TableCell>{money(item.allowancesHalalas)}</TableCell><TableCell>{Number(item.attendance?.lateMinutes || 0)} {tr(language, "د", "m")}</TableCell><TableCell>{Number(item.absences?.absenceUnits || 0)}</TableCell><TableCell>{money(item.attendanceDeductionHalalas)}</TableCell><TableCell>{money(item.absenceDeductionHalalas)}</TableCell><TableCell>{money(item.manualAdditionsHalalas)}</TableCell><TableCell>{money(item.manualDeductionsHalalas)}</TableCell><TableCell>{money(item.grossSalaryHalalas)}</TableCell><TableCell>{money(item.totalDeductionsHalalas)}</TableCell><TableCell className="font-black">{money(item.netSalaryHalalas)}</TableCell></TableRow>)}</TableBody></Table></div>
      </> : null}
    </section>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-xl ${strong ? "font-black" : "font-bold"}`}>{value}</p></div>;
}
