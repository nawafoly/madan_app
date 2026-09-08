import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
import { CircleAlert, Loader2, RefreshCw, RotateCcw, ShieldCheck, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { WorkforceApiError, halalasToRiyals, workforceApi } from "./workforceClient";

import HabatDatePicker from "@/pages/habat/HabatDatePicker";
type PayrollStatus = "draft" | "reviewed" | "approved" | "paid";

type Workspace = {
  monthKey: string;
  currentStatus: PayrollStatus;
  employee: { id: string; displayName: string; employeeNumber: string | null } | null;
  period: { id: string; status: PayrollStatus; periodStart: string; periodEnd: string; payDate: string | null; reviewedAt: string | null; approvedAt: string | null; paidAt: string | null } | null;
  entry: { id: string; status: PayrollStatus; grossSalaryHalalas: number; totalDeductionsHalalas: number; netSalaryHalalas: number; reviewedAt: string | null; approvedAt: string | null; paidAt: string | null } | null;
  reviewGate: { ready: boolean; blockers: Array<{ code: string; message: string }> };
  actions: { review: boolean; approve: boolean; markPaid: boolean; reopen: boolean; reversePayment: boolean };
  policy: { paidReopenAllowed: boolean; paymentReversalRequiredForPaid: boolean; reopenTargets: Array<"draft" | "reviewed"> };
};

type Payload = { ok: true; workspace: Workspace; idempotent?: boolean };

type Props = { employeeId: string };

const STATUS_LABEL: Record<PayrollStatus, { ar: string; en: string }> = {
  draft: { ar: "مسودة", en: "Draft" },
  reviewed: { ar: "تمت المراجعة", en: "Reviewed" },
  approved: { ar: "معتمد", en: "Approved" },
  paid: { ar: "مدفوع", en: "Paid" },
};

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit" }).format(new Date());
}

function friendlyError(caught: unknown, language: "ar" | "en") {
  if (caught instanceof WorkforceApiError) {
    const map: Record<string, string> = {
      workforce_payroll_entry_required: tr(language, "لا توجد مسودة راتب محسوبة لهذا الشهر.", "No calculated payroll draft exists for this month."),
      workforce_payroll_period_not_closed: tr(language, "لا يمكن إرسال الراتب للمراجعة قبل انتهاء شهر المسير.", "Payroll cannot be sent for review before the payroll month ends."),
      workforce_payroll_readiness_not_applied: tr(language, "طبّق جاهزية الحضور والخصومات أولًا.", "Apply payroll readiness and deductions first."),
      workforce_payroll_readiness_not_ready: tr(language, "جاهزية الحضور غير مكتملة.", "Attendance readiness is incomplete."),
      workforce_payroll_paid_reopen_not_allowed: tr(language, "لا يمكن إعادة فتح راتب مدفوع. استخدم عكس الدفع أولًا.", "Paid payroll cannot be reopened. Reverse payment first."),
      workforce_payroll_reopen_requires_approved: tr(language, "إعادة الفتح متاحة للراتب المعتمد فقط.", "Only approved payroll can be reopened."),
      workforce_payroll_payment_reversal_requires_paid: tr(language, "عكس الدفع متاح للراتب المدفوع فقط.", "Payment reversal is available only for paid payroll."),
      workforce_payroll_lifecycle_reason_required: tr(language, "سبب الإرجاع أو عكس الدفع مطلوب.", "A reason is required for reopening or payment reversal."),
      workforce_payroll_lifecycle_transition_invalid: tr(language, "انتقال حالة الراتب غير مسموح.", "Payroll status transition is not allowed."),
    };
    return map[caught.code] || caught.code;
  }
  return caught instanceof Error ? caught.message : tr(language, "تعذر تنفيذ العملية.", "Unable to complete the operation.");
}

export default function WorkforcePayrollLifecyclePanel({ employeeId }: Props) {
  const { language } = useLanguage();
  const [month, setMonth] = useState(currentMonth());
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [reopenTarget, setReopenTarget] = useState<"draft" | "reviewed">("draft");
  const [payDate, setPayDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await workforceApi<Payload>(`employees/${encodeURIComponent(employeeId)}/payroll-lifecycle?month=${encodeURIComponent(month)}`);
      setWorkspace(result.workspace);
    } catch (caught) {
      setError(friendlyError(caught, language));
      setWorkspace(null);
    } finally { setLoading(false); }
  }, [employeeId, month]);

  useEffect(() => { void load(); }, [load]);

  async function act(action: "review" | "approve" | "mark_paid" | "reopen" | "reverse_payment") {
    if (saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const body: Record<string, unknown> = {
        action,
        operationId: crypto.randomUUID(),
      };
      if (action === "reopen") {
        body.reason = reason;
        body.targetStatus = reopenTarget;
      }
      if (action === "reverse_payment") body.reason = reason;
      if (action === "mark_paid" && payDate) body.payDate = payDate;
      const result = await workforceApi<Payload>(`employees/${encodeURIComponent(employeeId)}/payroll-lifecycle?month=${encodeURIComponent(month)}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setWorkspace(result.workspace);
      setReason(""); setPayDate("");
      setMessage(
        action === "review"
          ? tr(language, "تم إرسال الراتب للمراجعة.", "Payroll sent for review.")
          : action === "approve"
            ? tr(language, "تم اعتماد الراتب.", "Payroll approved.")
            : action === "mark_paid"
              ? tr(language, "تم تسجيل الراتب كمدفوع.", "Payroll marked as paid.")
              : action === "reopen"
                ? tr(language, "تمت إعادة فتح الراتب مع تسجيل السبب.", "Payroll reopened and the reason recorded.")
                : tr(language, "تم عكس الدفع وإرجاع الراتب إلى معتمد.", "Payment reversed and payroll returned to Approved.")
      )
    } catch (caught) { setError(friendlyError(caught, language)); }
    finally { setSaving(false); }
  }

  const status = workspace?.currentStatus || "draft";
  const entry = workspace?.entry;
  const canBackward = status === "approved" || status === "paid";
  const netRiyals = useMemo(() => halalasToRiyals(entry?.netSalaryHalalas || 0), [entry?.netSalaryHalalas]);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white"><ShieldCheck className="h-5 w-5" /></span>
          <div><h3 className="text-lg font-black">{tr(language, "دورة اعتماد الراتب", "Payroll Approval Lifecycle")}</h3><p className="mt-1 text-sm text-slate-500">{tr(language, "مسودة ← مراجعة ← اعتماد ← مدفوع، مع إعادة فتح مضبوطة وعكس دفع مستقل.", "Draft → Review → Approval → Paid, with controlled reopening and independent payment reversal.")}</p></div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label className="mb-1.5 block text-xs">{tr(language, "شهر المسير", "Payroll Month")}</Label><HabatDatePicker mode="month" value={month} onChange={setMonth} className="w-40" /></div>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading || saving}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {tr(language, "تحديث", "Refresh")}</Button>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}

      {loading ? <div className="flex items-center justify-center py-10 text-sm text-slate-500"><Loader2 className="ml-2 h-4 w-4 animate-spin" /> {tr(language, "جاري تحميل حالة المسير...", "Loading payroll status...")}</div> : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{tr(language, "الحالة", "Status")}</p><div className="mt-2"><Badge variant="outline" className="rounded-full px-3 py-1 font-bold">{language === "ar" ? STATUS_LABEL[status].ar : STATUS_LABEL[status].en}</Badge></div></div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{tr(language, "صافي الراتب", "Net Salary")}</p><p className="mt-2 text-xl font-black">{Number(netRiyals || 0).toLocaleString("en-US")} {tr(language, "ر.س", "SAR")}</p></div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{tr(language, "جاهزية المراجعة", "Review Readiness")}</p><p className={`mt-2 font-black ${workspace?.reviewGate.ready ? "text-emerald-700" : "text-amber-700"}`}>{workspace?.reviewGate.ready ? "جاهز" : "غير جاهز"}</p></div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{tr(language, "تاريخ الدفع", "Payment Date")}</p><p className="mt-2 font-bold">{workspace?.period?.payDate || "—"}</p></div>
          </div>

          {!entry ? <div className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {tr(language, "احتسب جاهزية الراتب لهذا الشهر أولًا حتى يتم إنشاء مسودة قابلة للمراجعة.", "Calculate payroll readiness for this month first to create a reviewable draft.")}</div> : null}
          {workspace?.reviewGate.blockers?.length ? <div className="mt-4 space-y-2">{workspace.reviewGate.blockers.map(item => <div key={item.code} className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{item.message}</div>)}</div> : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {status === "draft" ? <Button type="button" className="rounded-xl bg-black" disabled={!workspace?.actions.review || saving} onClick={() => void act("review")}><ShieldCheck className="h-4 w-4" /> {tr(language, "إرسال للمراجعة", "Send for Review")}</Button> : null}
            {status === "reviewed" ? <Button type="button" className="rounded-xl bg-black" disabled={!workspace?.actions.approve || saving} onClick={() => void act("approve")}><ShieldCheck className="h-4 w-4" /> {tr(language, "اعتماد الراتب", "Approve Payroll")}</Button> : null}
            {status === "approved" ? <Button type="button" className="rounded-xl bg-black" disabled={!workspace?.actions.markPaid || saving} onClick={() => void act("mark_paid")}><WalletCards className="h-4 w-4" /> {tr(language, "تسجيل كمدفوع", "Mark as Paid")}</Button> : null}
          </div>

          {status === "approved" ? <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[180px_1fr_auto] md:items-end"><div><Label className="mb-1.5 block text-xs">{tr(language, "إرجاع إلى", "Reopen To")}</Label><Select value={reopenTarget} onValueChange={v => setReopenTarget(v as "draft" | "reviewed")}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">{tr(language, "مسودة", "Draft")}</SelectItem><SelectItem value="reviewed">{tr(language, "تمت المراجعة", "Reviewed")}</SelectItem></SelectContent></Select></div><div><Label className="mb-1.5 block text-xs">{tr(language, "سبب إعادة الفتح", "Reopen Reason")}</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} className="min-h-10 rounded-xl" placeholder="السبب مطلوب ويُحفظ في سجل التدقيق" /></div><Button type="button" variant="outline" className="rounded-xl" disabled={!reason.trim() || saving} onClick={() => void act("reopen")}><RotateCcw className="h-4 w-4" /> {tr(language, "إعادة فتح", "Reopen")}</Button></div> : null}

          {status === "paid" ? <div className="mt-5 grid gap-3 rounded-2xl border border-red-100 bg-red-50/40 p-4 md:grid-cols-[1fr_auto] md:items-end"><div><Label className="mb-1.5 block text-xs">{tr(language, "سبب عكس الدفع", "Payment Reversal Reason")}</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} className="min-h-10 rounded-xl bg-white" placeholder="الراتب المدفوع لا يُفتح مباشرة؛ يجب عكس الدفع أولًا" /></div><Button type="button" variant="outline" className="rounded-xl border-red-200" disabled={!reason.trim() || saving} onClick={() => void act("reverse_payment")}><RotateCcw className="h-4 w-4" /> {tr(language, "عكس الدفع", "Reverse Payment")}</Button></div> : null}

          {status === "approved" ? <div className="mt-4 max-w-xs"><Label className="mb-1.5 block text-xs">{tr(language, "تاريخ الدفع الفعلي (اختياري)", "Actual Payment Date (Optional)")}</Label><HabatDatePicker value={payDate} onChange={setPayDate} /></div> : null}
        </>
      )}
    </section>
  );
}
