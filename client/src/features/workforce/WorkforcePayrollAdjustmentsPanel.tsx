import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
import { CircleAlert, Loader2, Plus, RefreshCw, RotateCcw, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import { WorkforceApiError, halalasToRiyals, riyalsToHalalas, workforceApi } from "./workforceClient";

import HabatDatePicker from "@/pages/habat/HabatDatePicker";
import HabatNumberInput from "@/pages/habat/HabatNumberInput";
type Direction = "addition" | "deduction";
type Kind = "bonus" | "allowance" | "commission" | "manual_addition" | "advance" | "penalty" | "manual_deduction" | "other_deduction";

type Adjustment = {
  id: string;
  direction: Direction;
  kind: Kind;
  amountHalalas: number;
  reason: string;
  note: string | null;
  status: "active" | "cancelled";
  addedAt: string | null;
  addedByEmail: string | null;
  cancelledAt: string | null;
};

type Workspace = {
  employeeId: string;
  monthKey: string;
  settingsReady: boolean;
  period: { id: string; status: string; periodStart: string; periodEnd: string } | null;
  entry: { id: string; status: string } | null;
  adjustments: Adjustment[];
  preview: {
    baseSalaryHalalas: number;
    allowancesHalalas: number;
    overtimeHalalas: number;
    manualAdditionsHalalas: number;
    attendanceDeductionHalalas: number;
    absenceDeductionHalalas: number;
    manualDeductionsHalalas: number;
    grossSalaryHalalas: number;
    totalDeductionsHalalas: number;
    netSalaryHalalas: number;
  };
  locked: boolean;
  lockedReason: string | null;
  automaticAttendanceDeductionApplied: boolean;
};

const additionKinds: Array<{ value: Kind; ar: string; en: string }> = [
  { value: "bonus", ar: "مكافأة", en: "Bonus" },
  { value: "allowance", ar: "بدل", en: "Allowance" },
  { value: "commission", ar: "عمولة", en: "Commission" },
  { value: "manual_addition", ar: "إضافة يدوية", en: "Manual Addition" },
];
const deductionKinds: Array<{ value: Kind; ar: string; en: string }> = [
  { value: "advance", ar: "سلفة", en: "Advance" },
  { value: "penalty", ar: "جزاء", en: "Penalty" },
  { value: "manual_deduction", ar: "خصم يدوي", en: "Manual Deduction" },
  { value: "other_deduction", ar: "استقطاع آخر", en: "Other Deduction" },
];
const allKinds = [...additionKinds, ...deductionKinds];
function kindLabel(kind: Kind, language: "ar" | "en") {
  const item = allKinds.find(entry => entry.value === kind);
  return item ? (language === "ar" ? item.ar : item.en) : kind;
}

function currentMonthRiyadh() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find(part => part.type === "year")?.value}-${parts.find(part => part.type === "month")?.value}`;
}

function money(value: number | null | undefined, language: "ar" | "en") {
  return `${halalasToRiyals(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${tr(language, "ر.س", "SAR")}`;
}

function friendlyError(error: unknown, language: "ar" | "en") {
  const code = error instanceof WorkforceApiError ? error.code : String((error as { message?: unknown })?.message || "");
  const messages: Record<string, string> = {
    workforce_payroll_settings_required: tr(language, "أكمل إعدادات الراتب أولًا قبل تسجيل أي إضافة أو خصم يدوي.", "Complete payroll settings before adding manual additions or deductions."),
    workforce_payroll_adjustment_kind_invalid: tr(language, "نوع العملية غير صالح.", "Invalid adjustment type."),
    workforce_payroll_adjustment_direction_kind_mismatch: tr(language, "نوع العملية لا يطابق اتجاه الإضافة أو الخصم.", "Adjustment type does not match its direction."),
    workforce_payroll_adjustment_amount_invalid: tr(language, "أدخل مبلغًا صحيحًا أكبر من صفر.", "Enter a valid amount greater than zero."),
    workforce_payroll_adjustment_reason_required: tr(language, "سبب العملية مطلوب.", "A reason is required."),
    workforce_payroll_adjustment_entry_locked: tr(language, "مسير هذا الشهر ليس Draft؛ لا يمكن تعديل العمليات اليدوية حتى تتم إعادة فتحه ضمن دورة الرواتب.", "This month's payroll is not Draft; manual adjustments cannot be changed until payroll is reopened."),
    workforce_payroll_adjustment_not_found: tr(language, "لم يتم العثور على العملية المطلوبة.", "Adjustment was not found."),
    workforce_management_forbidden: tr(language, "الحساب الحالي لا يملك صلاحية إدارة الرواتب.", "The current account cannot manage payroll."),
  };
  return messages[code] || code || tr(language, "تعذر إكمال العملية.", "Unable to complete the operation.");
}

export default function WorkforcePayrollAdjustmentsPanel({ employeeId }: { employeeId: string }) {
  const { language } = useLanguage();
  const [month, setMonth] = useState(currentMonthRiyadh);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [direction, setDirection] = useState<Direction>("deduction");
  const [kind, setKind] = useState<Kind>("manual_deduction");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const kinds = direction === "addition" ? additionKinds : deductionKinds;
  const activeCount = useMemo(() => workspace?.adjustments.filter(item => item.status === "active").length || 0, [workspace]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await workforceApi<{ ok: true; workspace: Workspace }>(
        `employees/${encodeURIComponent(employeeId)}/payroll-adjustments?month=${encodeURIComponent(month)}`
      );
      setWorkspace(payload.workspace);
    } catch (caught) {
      setError(friendlyError(caught, language));
    } finally {
      setLoading(false);
    }
  }, [employeeId, month]);

  useEffect(() => { void load(); }, [load]);

  function changeDirection(value: Direction) {
    setDirection(value);
    setKind(value === "addition" ? "bonus" : "manual_deduction");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || workspace?.locked) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = await workforceApi<{ ok: true; workspace: Workspace }>(
        `employees/${encodeURIComponent(employeeId)}/payroll-adjustments?month=${encodeURIComponent(month)}`,
        {
          method: "POST",
          body: JSON.stringify({
            direction,
            kind,
            amountHalalas: riyalsToHalalas(amount),
            reason,
            note: note || null,
            operationId: `ui_payroll_adjustment_${crypto.randomUUID()}`,
          }),
        }
      );
      setWorkspace(payload.workspace);
      setAmount("");
      setReason("");
      setNote("");
      setMessage(direction === "addition" ? tr(language, "تمت إضافة العملية للراتب.", "Adjustment added to payroll.") : tr(language, "تم تسجيل الخصم اليدوي.", "Manual deduction recorded."));
    } catch (caught) {
      setError(friendlyError(caught, language));
    } finally {
      setSaving(false);
    }
  }

  async function cancel(adjustment: Adjustment) {
    if (saving || workspace?.locked || adjustment.status !== "active") return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = await workforceApi<{ ok: true; workspace: Workspace }>(
        `employees/${encodeURIComponent(employeeId)}/payroll-adjustments/${encodeURIComponent(adjustment.id)}`,
        { method: "DELETE" }
      );
      setWorkspace(payload.workspace);
      setMessage(tr(language, "تم إلغاء العملية وعكس أثرها من إجمالي المسير بدون حذف سجلها.", "Adjustment cancelled and its effect reversed without deleting its audit record."));
    } catch (caught) {
      setError(friendlyError(caught, language));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white"><WalletCards className="h-5 w-5" /></span>
          <div>
            <h3 className="font-black">{tr(language, "الإضافات والخصومات اليدوية", "Manual Additions & Deductions")}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{tr(language, "مكافآت وبدلات وعمولات وسلف وجزاءات وخصومات يدوية. هذه الشاشة لا تنشئ خصم حضور أو غياب تلقائيًا.", "Bonuses, allowances, commissions, advances, penalties, and manual deductions. This screen does not create automatic attendance or absence deductions.")}</p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5"><Label>{tr(language, "الشهر", "Month")}</Label><HabatDatePicker mode="month" value={month} onChange={setMonth} className="w-40" /></div>
          <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></Button>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        <strong>{tr(language, "حماية الرواتب:", "Payroll Protection:")}</strong> خصم الحضور التلقائي غير مفعل في هذه المرحلة. أي قيمة حضور/غياب ستظل صفرًا حتى يتم ربط Payroll Readiness واعتماد محرك الاحتساب.
      </div>

      {error ? <div className="flex gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}
      {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}

      {workspace ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label={tr(language, "الإضافات اليدوية", "Manual Additions")} value={money(workspace.preview.manualAdditionsHalalas, language)} />
            <Metric label={tr(language, "الخصومات اليدوية", "Manual Deductions")} value={money(workspace.preview.manualDeductionsHalalas, language)} />
            <Metric label={tr(language, "إجمالي الاستقطاعات", "Total Deductions")} value={money(workspace.preview.totalDeductionsHalalas, language)} />
            <Metric label={tr(language, "صافي مبدئي", "Preliminary Net")} value={money(workspace.preview.netSalaryHalalas, language)} emphasized />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline" className="rounded-full">الحالة: {workspace.entry?.status || workspace.period?.status || tr(language, "لم يُنشأ Draft بعد", "Draft Not Created Yet")}</Badge>
            <Badge variant="outline" className="rounded-full">{tr(language, "عمليات نشطة:", "Active Adjustments:")} {activeCount}</Badge>
            {!workspace.settingsReady ? <Badge variant="destructive" className="rounded-full">{tr(language, "إعدادات الراتب غير مكتملة", "Payroll Settings Incomplete")}</Badge> : null}
            {workspace.locked ? <Badge variant="destructive" className="rounded-full">{tr(language, "المسير مقفل للتعديل", "Payroll Locked")}</Badge> : null}
          </div>

          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label={tr(language, "الاتجاه", "Direction")}><Select value={direction} onValueChange={value => changeDirection(value as Direction)}><SelectTrigger className="h-11 rounded-2xl bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="addition">{tr(language, "إضافة", "Addition")}</SelectItem><SelectItem value="deduction">{tr(language, "خصم", "Deduction")}</SelectItem></SelectContent></Select></Field>
              <Field label={tr(language, "النوع", "Type")}><Select value={kind} onValueChange={value => setKind(value as Kind)}><SelectTrigger className="h-11 rounded-2xl bg-white"><SelectValue /></SelectTrigger><SelectContent>{kinds.map(item => <SelectItem key={item.value} value={item.value}>{language === "ar" ? item.ar : item.en}</SelectItem>)}</SelectContent></Select></Field>
              <Field label={tr(language, "المبلغ (ر.س)", "Amount (SAR)")}><HabatNumberInput min="0.01" step="0.01" value={amount} onValueChange={value => setAmount(value)} className="h-11 rounded-2xl bg-white" required /></Field>
              <Field label={tr(language, "السبب", "Reason")}><Input value={reason} onChange={event => setReason(event.target.value)} className="h-11 rounded-2xl bg-white" required /></Field>
            </div>
            <Field label={tr(language, "ملاحظة (اختياري)", "Note (Optional)")}><Textarea value={note} onChange={event => setNote(event.target.value)} className="min-h-20 rounded-2xl bg-white" /></Field>
            <Button type="submit" disabled={saving || workspace.locked || !workspace.settingsReady || !amount || !reason.trim()} className="rounded-xl bg-black">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {tr(language, "إضافة للمسير", "Add to Payroll")}
            </Button>
          </form>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <Table className="min-w-[820px]">
              <TableHeader><TableRow><TableHead className="text-start">{tr(language, "النوع", "Type")}</TableHead><TableHead className="text-start">{tr(language, "المبلغ", "Amount")}</TableHead><TableHead className="text-start">{tr(language, "السبب", "Reason")}</TableHead><TableHead className="text-start">{tr(language, "الحالة", "Status")}</TableHead><TableHead className="text-start">{tr(language, "أضيف بواسطة", "Added By")}</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {workspace.adjustments.map(item => (
                  <TableRow key={item.id} className={item.status === "cancelled" ? "opacity-50" : ""}>
                    <TableCell className="font-bold">{kindLabel(item.kind, language)}</TableCell>
                    <TableCell className={item.direction === "addition" ? "font-bold text-emerald-700" : "font-bold text-red-700"}>{item.direction === "addition" ? "+" : "-"}{money(item.amountHalalas, language)}</TableCell>
                    <TableCell><p>{item.reason}</p>{item.note ? <p className="mt-1 text-xs text-slate-500">{item.note}</p> : null}</TableCell>
                    <TableCell>{item.status === "active" ? tr(language, "نشطة", "Active") : tr(language, "ملغاة", "Cancelled")}</TableCell>
                    <TableCell className="text-xs text-slate-500">{item.addedByEmail || "—"}</TableCell>
                    <TableCell className="text-start">{item.status === "active" ? <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={saving || workspace.locked} onClick={() => void cancel(item)}><RotateCcw className="h-3.5 w-3.5" /> {tr(language, "إلغاء", "Cancel")}</Button> : null}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!workspace.adjustments.length ? <p className="py-8 text-center text-sm text-slate-500">{tr(language, "لا توجد إضافات أو خصومات يدوية لهذا الشهر.", "No manual additions or deductions for this month.")}</p> : null}
          </div>
        </>
      ) : loading ? <p className="py-8 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />{tr(language, "جاري تحميل عمليات الراتب...", "Loading payroll adjustments...")}</p> : null}
    </section>
  );
}

function Metric({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return <div className={emphasized ? "rounded-2xl bg-slate-950 p-4 text-white" : "rounded-2xl bg-slate-50 p-4"}><p className={emphasized ? "text-xs text-slate-300" : "text-xs text-slate-500"}>{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
