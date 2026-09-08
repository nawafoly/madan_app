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

const additionKinds: Array<{ value: Kind; label: string }> = [
  { value: "bonus", label: "مكافأة" },
  { value: "allowance", label: "بدل" },
  { value: "commission", label: "عمولة" },
  { value: "manual_addition", label: "إضافة يدوية" },
];
const deductionKinds: Array<{ value: Kind; label: string }> = [
  { value: "advance", label: "سلفة" },
  { value: "penalty", label: "جزاء" },
  { value: "manual_deduction", label: "خصم يدوي" },
  { value: "other_deduction", label: "استقطاع آخر" },
];
const kindLabels = Object.fromEntries([...additionKinds, ...deductionKinds].map(item => [item.value, item.label])) as Record<Kind, string>;

function currentMonthRiyadh() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find(part => part.type === "year")?.value}-${parts.find(part => part.type === "month")?.value}`;
}

function money(value: number | null | undefined) {
  return `${halalasToRiyals(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

function friendlyError(error: unknown) {
  const code = error instanceof WorkforceApiError ? error.code : String((error as { message?: unknown })?.message || "");
  const messages: Record<string, string> = {
    workforce_payroll_settings_required: "أكمل إعدادات الراتب أولًا قبل تسجيل أي إضافة أو خصم يدوي.",
    workforce_payroll_adjustment_kind_invalid: "نوع العملية غير صالح.",
    workforce_payroll_adjustment_direction_kind_mismatch: "نوع العملية لا يطابق اتجاه الإضافة أو الخصم.",
    workforce_payroll_adjustment_amount_invalid: "أدخل مبلغًا صحيحًا أكبر من صفر.",
    workforce_payroll_adjustment_reason_required: "سبب العملية مطلوب.",
    workforce_payroll_adjustment_entry_locked: "مسير هذا الشهر ليس Draft؛ لا يمكن تعديل العمليات اليدوية حتى تتم إعادة فتحه ضمن دورة الرواتب.",
    workforce_payroll_adjustment_not_found: "لم يتم العثور على العملية المطلوبة.",
    workforce_management_forbidden: "الحساب الحالي لا يملك صلاحية إدارة الرواتب.",
  };
  return messages[code] || code || "تعذر إكمال العملية.";
}

export default function WorkforcePayrollAdjustmentsPanel({ employeeId }: { employeeId: string }) {
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
      setError(friendlyError(caught));
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
      setMessage(direction === "addition" ? "تمت إضافة العملية للراتب." : "تم تسجيل الخصم اليدوي.");
    } catch (caught) {
      setError(friendlyError(caught));
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
      setMessage("تم إلغاء العملية وعكس أثرها من إجمالي المسير بدون حذف سجلها.");
    } catch (caught) {
      setError(friendlyError(caught));
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
            <h3 className="font-black">الإضافات والخصومات اليدوية</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">مكافآت وبدلات وعمولات وسلف وجزاءات وخصومات يدوية. هذه الشاشة لا تنشئ خصم حضور أو غياب تلقائيًا.</p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5"><Label>الشهر</Label><Input dir="ltr" type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-10 w-40 rounded-xl" /></div>
          <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></Button>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        <strong>حماية الرواتب:</strong> خصم الحضور التلقائي غير مفعل في هذه المرحلة. أي قيمة حضور/غياب ستظل صفرًا حتى يتم ربط Payroll Readiness واعتماد محرك الاحتساب.
      </div>

      {error ? <div className="flex gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}
      {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}

      {workspace ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="الإضافات اليدوية" value={money(workspace.preview.manualAdditionsHalalas)} />
            <Metric label="الخصومات اليدوية" value={money(workspace.preview.manualDeductionsHalalas)} />
            <Metric label="إجمالي الاستقطاعات" value={money(workspace.preview.totalDeductionsHalalas)} />
            <Metric label="صافي مبدئي" value={money(workspace.preview.netSalaryHalalas)} emphasized />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline" className="rounded-full">الحالة: {workspace.entry?.status || workspace.period?.status || "لم يُنشأ Draft بعد"}</Badge>
            <Badge variant="outline" className="rounded-full">عمليات نشطة: {activeCount}</Badge>
            {!workspace.settingsReady ? <Badge variant="destructive" className="rounded-full">إعدادات الراتب غير مكتملة</Badge> : null}
            {workspace.locked ? <Badge variant="destructive" className="rounded-full">المسير مقفل للتعديل</Badge> : null}
          </div>

          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="الاتجاه"><Select value={direction} onValueChange={value => changeDirection(value as Direction)}><SelectTrigger className="h-11 rounded-2xl bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="addition">إضافة</SelectItem><SelectItem value="deduction">خصم</SelectItem></SelectContent></Select></Field>
              <Field label="النوع"><Select value={kind} onValueChange={value => setKind(value as Kind)}><SelectTrigger className="h-11 rounded-2xl bg-white"><SelectValue /></SelectTrigger><SelectContent>{kinds.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="المبلغ (ر.س)"><Input dir="ltr" type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className="h-11 rounded-2xl bg-white" required /></Field>
              <Field label="السبب"><Input value={reason} onChange={event => setReason(event.target.value)} className="h-11 rounded-2xl bg-white" required /></Field>
            </div>
            <Field label="ملاحظة (اختياري)"><Textarea value={note} onChange={event => setNote(event.target.value)} className="min-h-20 rounded-2xl bg-white" /></Field>
            <Button type="submit" disabled={saving || workspace.locked || !workspace.settingsReady || !amount || !reason.trim()} className="rounded-xl bg-black">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} إضافة للمسير
            </Button>
          </form>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <Table className="min-w-[820px]">
              <TableHeader><TableRow><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">المبلغ</TableHead><TableHead className="text-right">السبب</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">أضيف بواسطة</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {workspace.adjustments.map(item => (
                  <TableRow key={item.id} className={item.status === "cancelled" ? "opacity-50" : ""}>
                    <TableCell className="font-bold">{kindLabels[item.kind] || item.kind}</TableCell>
                    <TableCell className={item.direction === "addition" ? "font-bold text-emerald-700" : "font-bold text-red-700"}>{item.direction === "addition" ? "+" : "-"}{money(item.amountHalalas)}</TableCell>
                    <TableCell><p>{item.reason}</p>{item.note ? <p className="mt-1 text-xs text-slate-500">{item.note}</p> : null}</TableCell>
                    <TableCell>{item.status === "active" ? "نشطة" : "ملغاة"}</TableCell>
                    <TableCell className="text-xs text-slate-500">{item.addedByEmail || "—"}</TableCell>
                    <TableCell className="text-left">{item.status === "active" ? <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={saving || workspace.locked} onClick={() => void cancel(item)}><RotateCcw className="h-3.5 w-3.5" /> إلغاء</Button> : null}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!workspace.adjustments.length ? <p className="py-8 text-center text-sm text-slate-500">لا توجد إضافات أو خصومات يدوية لهذا الشهر.</p> : null}
          </div>
        </>
      ) : loading ? <p className="py-8 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />جاري تحميل عمليات الراتب...</p> : null}
    </section>
  );
}

function Metric({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return <div className={emphasized ? "rounded-2xl bg-slate-950 p-4 text-white" : "rounded-2xl bg-slate-50 p-4"}><p className={emphasized ? "text-xs text-slate-300" : "text-xs text-slate-500"}>{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
