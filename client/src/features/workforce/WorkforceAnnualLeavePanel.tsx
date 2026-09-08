import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CircleAlert, History, Plus, RefreshCw, Save, Umbrella } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { WorkforceApiError, workforceApi } from "./workforceClient";

import HabatDatePicker from "@/pages/habat/HabatDatePicker";
import HabatNumberInput from "@/pages/habat/HabatNumberInput";
type LedgerEntry = {
  id: string;
  entryCode: string | null;
  deltaDays: number;
  balanceBeforeDays: number | null;
  balanceAfterDays: number | null;
  effectiveDate: string;
  reason: string;
  createdByEmail: string | null;
  createdAt: string;
};

type AnnualLeaveState = {
  employeeId: string;
  asOfDate: string;
  startDate: string | null;
  policyVersion: string;
  reviewRequired: boolean;
  reviewReason: string | null;
  openingBalance: LedgerEntry | null;
  openingBalanceDays?: number;
  annualEntitlementDays?: number;
  statutoryEntitlementDays?: number;
  contractualEntitlementDays?: number | null;
  earnedCurrentServiceYearDays?: number;
  accruedSinceAnchorDays?: number;
  serviceYearStart?: string;
  serviceYearEnd?: string;
  usedDays?: number;
  creditedDays?: number;
  postOpeningNetDays?: number;
  availableDays: number | null;
  entries: LedgerEntry[];
};

type Props = {
  employeeId: string;
  serviceStartDate?: string | null;
};

function textDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function days(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function friendly(error: unknown, language: "ar" | "en") {
  const code = error instanceof WorkforceApiError ? error.code : String((error as { message?: unknown })?.message || "");
  const map: Record<string, string> = {
    workforce_annual_leave_service_start_date_required: tr(language, "أدخل تاريخ بداية الخدمة أولًا قبل ضبط رصيد الإجازة السنوية.", "Enter the employment start date before configuring annual leave."),
    workforce_annual_leave_opening_before_service_start: tr(language, "تاريخ الرصيد الافتتاحي لا يمكن أن يسبق تاريخ بداية الخدمة.", "Opening balance date cannot be before the employment start date."),
    workforce_annual_leave_opening_in_future: tr(language, "تاريخ الرصيد الافتتاحي لا يمكن أن يكون في المستقبل.", "Opening balance date cannot be in the future."),
    workforce_annual_leave_opening_already_exists: tr(language, "يوجد رصيد افتتاحي معتمد لهذا الموظف بالفعل.", "An approved opening balance already exists for this employee."),
    workforce_annual_leave_opening_balance_days_invalid: tr(language, "الرصيد الافتتاحي يجب أن يكون بصيغة نصف يوم: 0، 0.5، 1، 1.5 ...", "Opening balance must use half-day increments: 0, 0.5, 1, 1.5 ..."),
    workforce_annual_leave_adjustment_days_invalid: tr(language, "التعديل يجب أن يكون بصيغة نصف يوم فأكثر.", "Adjustment must use half-day increments or greater."),
    workforce_annual_leave_adjustment_before_service_start: tr(language, "تاريخ التعديل لا يمكن أن يسبق بداية الخدمة.", "Adjustment date cannot be before the employment start date."),
    workforce_annual_leave_adjustment_in_future: tr(language, "تاريخ التعديل لا يمكن أن يكون في المستقبل.", "Adjustment date cannot be in the future."),
    workforce_annual_leave_reason_required: tr(language, "سبب العملية مطلوب.", "A reason is required."),
  };
  return map[code] || code || tr(language, "تعذر تحميل أو حفظ رصيد الإجازة السنوية.", "Unable to load or save annual leave balance.");
}

function entryLabel(code: string | null | undefined, language: "ar" | "en") {
  const map: Record<string, string> = {
    OPENING_BALANCE: tr(language, "رصيد افتتاحي", "Opening Balance"),
    ACCRUAL: tr(language, "استحقاق", "Accrual"),
    LEAVE_USED: tr(language, "إجازة مستخدمة", "Leave Used"),
    LEAVE_REVERSAL: tr(language, "عكس إجازة", "Leave Reversal"),
    MANUAL_CREDIT: tr(language, "إضافة يدوية", "Manual Credit"),
    MANUAL_DEBIT: tr(language, "خصم يدوي", "Manual Debit"),
    MANUAL_ADJUSTMENT: tr(language, "تسوية", "Manual Adjustment"),
    RECALL: tr(language, "استدعاء من إجازة", "Leave Recall"),
  };
  return map[code || ""] || code || tr(language, "حركة", "Entry");
}

export default function WorkforceAnnualLeavePanel({ employeeId, serviceStartDate }: Props) {
  const { language } = useLanguage();
  const [state, setState] = useState<AnnualLeaveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [openingDays, setOpeningDays] = useState("0");
  const [openingDate, setOpeningDate] = useState(serviceStartDate || "");
  const [openingReason, setOpeningReason] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [adjustmentDays, setAdjustmentDays] = useState("0.5");
  const [adjustmentDate, setAdjustmentDate] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await workforceApi<{ ok: true; annualLeave: AnnualLeaveState }>(
        `employees/${encodeURIComponent(employeeId)}/annual-leave`
      );
      setState(payload.annualLeave);
      if (!openingDate && payload.annualLeave.startDate) setOpeningDate(payload.annualLeave.startDate);
    } catch (caught) {
      setError(friendly(caught, language));
    } finally {
      setLoading(false);
    }
  }, [employeeId, openingDate]);

  useEffect(() => { void load(); }, [employeeId]);

  const cards = useMemo(() => [
    [tr(language, "الرصيد المتاح", "Available Balance"), state?.availableDays == null ? "—" : `${days(state.availableDays)} ${tr(language, "يوم", "days")}`],
    [tr(language, "الاستحقاق السنوي", "Annual Entitlement"), state?.annualEntitlementDays == null ? "—" : `${days(state.annualEntitlementDays)} ${tr(language, "يوم", "days")}`],
    [tr(language, "المكتسب هذه السنة", "Earned This Year"), state?.earnedCurrentServiceYearDays == null ? "—" : `${days(state.earnedCurrentServiceYearDays)} ${tr(language, "يوم", "days")}`],
    [tr(language, "الرصيد الافتتاحي", "Opening Balance"), state?.openingBalanceDays == null ? "—" : `${days(state.openingBalanceDays)} ${tr(language, "يوم", "days")}`],
  ], [language, state]);

  async function saveOpening(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const payload = await workforceApi<{ ok: true; annualLeave: AnnualLeaveState }>(
        `employees/${encodeURIComponent(employeeId)}/annual-leave/opening-balance`,
        {
          method: "POST",
          body: JSON.stringify({
            days: Number(openingDays),
            effectiveDate: openingDate,
            reason: openingReason,
            operationId: crypto.randomUUID(),
          }),
        }
      );
      setState(payload.annualLeave);
      setOpeningReason("");
      setMessage(tr(language, "تم اعتماد الرصيد الافتتاحي وتسجيله في سجل الحركات.", "Opening balance approved and recorded in the ledger."));
    } catch (caught) { setError(friendly(caught, language)); }
    finally { setSaving(false); }
  }

  async function saveAdjustment(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const payload = await workforceApi<{ ok: true; annualLeave: AnnualLeaveState }>(
        `employees/${encodeURIComponent(employeeId)}/annual-leave/adjustments`,
        {
          method: "POST",
          body: JSON.stringify({
            direction,
            days: Number(adjustmentDays),
            effectiveDate: adjustmentDate,
            reason: adjustmentReason,
            operationId: crypto.randomUUID(),
          }),
        }
      );
      setState(payload.annualLeave);
      setAdjustmentReason("");
      setMessage(tr(language, "تم تسجيل تعديل الرصيد في الـledger.", "Balance adjustment recorded in the ledger."));
    } catch (caught) { setError(friendly(caught, language)); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white"><Umbrella className="h-5 w-5" /></span>
            <div><h3 className="font-black">{tr(language, "رصيد الإجازة السنوية", "Annual Leave Balance")}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{tr(language, "الرصيد مبني على تاريخ بداية الخدمة، الاستحقاق السنوي، والـledger القانوني للحركات. الرصيد الافتتاحي لا يُعاد إنشاؤه بعد اعتماده.", "The balance is based on employment start date, annual entitlement, and the auditable leave ledger. An approved opening balance cannot be recreated.")}</p></div>
          </div>
          <Button type="button" variant="outline" className="rounded-xl" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> {tr(language, "تحديث", "Refresh")}</Button>
        </div>

        {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}

        {state?.reviewRequired ? <div className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-black">{tr(language, "الرصيد يحتاج مراجعة", "Balance Needs Review")}</p><p className="mt-1 text-sm">{state.reviewReason === "service_start_date_required" ? tr(language, "تاريخ بداية الخدمة غير مضبوط، لذلك لا يمكن احتساب الاستحقاق.", "Employment start date is missing, so entitlement cannot be calculated.") : state.reviewReason || tr(language, "تحقق من بيانات الخدمة.", "Check employment data.")}</p></div></div> : null}

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-xl font-black">{value}</p></div>)}</div>

        {state && !state.reviewRequired ? <div className="mt-4 flex flex-wrap gap-2 text-xs"><Badge variant="outline" className="rounded-full">{tr(language, "بداية الخدمة:", "Employment Start:")} {textDate(state.startDate)}</Badge><Badge variant="outline" className="rounded-full">{tr(language, "سنة الخدمة:", "Service Year:")} {textDate(state.serviceYearStart)} — {textDate(state.serviceYearEnd)}</Badge><Badge variant="outline" className="rounded-full">{tr(language, "الحد النظامي:", "Statutory Entitlement:")} {days(state.statutoryEntitlementDays)} {tr(language, "يوم", "days")}</Badge>{state.contractualEntitlementDays ? <Badge variant="outline" className="rounded-full">{tr(language, "التعاقدي:", "Contractual:")} {days(state.contractualEntitlementDays)} {tr(language, "يوم", "days")}</Badge> : null}</div> : null}
      </section>

      {!state?.openingBalance && serviceStartDate ? (
        <form onSubmit={saveOpening} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div><h3 className="font-black">{tr(language, "تثبيت الرصيد الافتتاحي", "Set Opening Balance")}</h3><p className="mt-1 text-sm text-slate-500">{tr(language, "يُستخدم عند بدء النظام أو تصحيح رصيد سابق. يجب أن يكون التاريخ من بداية الخدمة وحتى اليوم، وبزيادات نصف يوم.", "Use when starting the system or correcting a previous balance. The date must be between employment start and today, using half-day increments.")}</p></div>
          <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>{tr(language, "الرصيد بالأيام", "Balance in Days")}</Label><HabatNumberInput min="0" max="3650" step="0.5" value={openingDays} onValueChange={value => setOpeningDays(value)} className="h-11 rounded-2xl" required /></div><div className="space-y-2"><Label>{tr(language, "تاريخ السريان", "Effective Date")}</Label><HabatDatePicker value={openingDate} onChange={setOpeningDate} /></div></div>
          <div className="space-y-2"><Label>{tr(language, "سبب الرصيد الافتتاحي", "Opening Balance Reason")}</Label><Textarea value={openingReason} onChange={e => setOpeningReason(e.target.value)} className="min-h-20 rounded-2xl" required /></div>
          <Button type="submit" disabled={saving || !openingReason.trim() || !openingDate} className="rounded-xl bg-black"><Save className="h-4 w-4" /> {tr(language, "اعتماد الرصيد الافتتاحي", "Approve Opening Balance")}</Button>
        </form>
      ) : null}

      {state && !state.reviewRequired ? (
        <form onSubmit={saveAdjustment} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div><h3 className="font-black">{tr(language, "تصحيح رصيد يدوي", "Manual Balance Adjustment")}</h3><p className="mt-1 text-sm text-slate-500">{tr(language, "للتصحيحات الإدارية فقط. كل حركة تحفظ السبب والتاريخ والموظف المنفذ في الـledger.", "For administrative corrections only. Each entry stores the reason, date, and acting employee in the ledger.")}</p></div>
          <div className="grid gap-4 md:grid-cols-3"><div className="space-y-2"><Label>{tr(language, "نوع التعديل", "Adjustment Type")}</Label><Select value={direction} onValueChange={value => setDirection(value as "credit" | "debit")}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="credit">{tr(language, "إضافة رصيد", "Add Balance")}</SelectItem><SelectItem value="debit">{tr(language, "خصم رصيد", "Deduct Balance")}</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>{tr(language, "عدد الأيام", "Number of Days")}</Label><HabatNumberInput min="0.5" max="3650" step="0.5" value={adjustmentDays} onValueChange={value => setAdjustmentDays(value)} className="h-11 rounded-2xl" required /></div><div className="space-y-2"><Label>{tr(language, "تاريخ السريان", "Effective Date")}</Label><HabatDatePicker value={adjustmentDate} onChange={setAdjustmentDate} /></div></div>
          <div className="space-y-2"><Label>{tr(language, "سبب التصحيح", "Adjustment Reason")}</Label><Textarea value={adjustmentReason} onChange={e => setAdjustmentReason(e.target.value)} className="min-h-20 rounded-2xl" required /></div>
          <Button type="submit" disabled={saving || !adjustmentReason.trim() || !adjustmentDate} className="rounded-xl bg-black"><Plus className="h-4 w-4" /> {tr(language, "تسجيل الحركة", "Record Entry")}</Button>
        </form>
      ) : null}

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100"><History className="h-5 w-5" /></span><div><h3 className="font-black">{tr(language, "سجل حركات الرصيد", "Balance Ledger")}</h3><p className="mt-1 text-sm text-slate-500">{tr(language, "ترتيب زمني قابل للتدقيق لكل رصيد افتتاحي أو إضافة أو خصم.", "Auditable chronological history of every opening balance, addition, and deduction.")}</p></div></div>
        <div className="mt-5 overflow-x-auto"><Table className="min-w-[850px]"><TableHeader><TableRow><TableHead className="text-start">{tr(language, "الحركة", "Entry")}</TableHead><TableHead className="text-start">{tr(language, "تاريخ السريان", "Effective Date")}</TableHead><TableHead className="text-start">{tr(language, "التغيير", "Change")}</TableHead><TableHead className="text-start">{tr(language, "قبل", "Before")}</TableHead><TableHead className="text-start">{tr(language, "بعد", "After")}</TableHead><TableHead className="text-start">{tr(language, "السبب", "Reason")}</TableHead><TableHead className="text-start">{tr(language, "المنفذ", "Performed By")}</TableHead></TableRow></TableHeader><TableBody>{(state?.entries || []).slice().reverse().map(entry => <TableRow key={entry.id}><TableCell className="font-bold">{entryLabel(entry.entryCode, language)}</TableCell><TableCell>{textDate(entry.effectiveDate)}</TableCell><TableCell dir="ltr" className={entry.deltaDays < 0 ? "text-red-600" : "text-emerald-700"}>{entry.deltaDays > 0 ? "+" : ""}{days(entry.deltaDays)}</TableCell><TableCell>{days(entry.balanceBeforeDays)}</TableCell><TableCell>{days(entry.balanceAfterDays)}</TableCell><TableCell>{entry.reason || "—"}</TableCell><TableCell>{entry.createdByEmail || "—"}</TableCell></TableRow>)}</TableBody></Table>{!state?.entries?.length ? <p className="py-8 text-center text-sm text-slate-500">{tr(language, "لا توجد حركات رصيد مسجلة حتى الآن.", "No balance entries have been recorded yet.")}</p> : null}</div>
      </section>
    </div>
  );
}
