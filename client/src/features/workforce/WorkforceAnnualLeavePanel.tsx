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

function friendly(error: unknown) {
  const code = error instanceof WorkforceApiError ? error.code : String((error as { message?: unknown })?.message || "");
  const map: Record<string, string> = {
    workforce_annual_leave_service_start_date_required: "أدخل تاريخ بداية الخدمة أولًا قبل ضبط رصيد الإجازة السنوية.",
    workforce_annual_leave_opening_before_service_start: "تاريخ الرصيد الافتتاحي لا يمكن أن يسبق تاريخ بداية الخدمة.",
    workforce_annual_leave_opening_in_future: "تاريخ الرصيد الافتتاحي لا يمكن أن يكون في المستقبل.",
    workforce_annual_leave_opening_already_exists: "يوجد رصيد افتتاحي معتمد لهذا الموظف بالفعل.",
    workforce_annual_leave_opening_balance_days_invalid: "الرصيد الافتتاحي يجب أن يكون بصيغة نصف يوم: 0، 0.5، 1، 1.5 ...",
    workforce_annual_leave_adjustment_days_invalid: "التعديل يجب أن يكون بصيغة نصف يوم فأكثر.",
    workforce_annual_leave_adjustment_before_service_start: "تاريخ التعديل لا يمكن أن يسبق بداية الخدمة.",
    workforce_annual_leave_adjustment_in_future: "تاريخ التعديل لا يمكن أن يكون في المستقبل.",
    workforce_annual_leave_reason_required: "سبب العملية مطلوب.",
  };
  return map[code] || code || "تعذر تحميل أو حفظ رصيد الإجازة السنوية.";
}

function entryLabel(code?: string | null) {
  const map: Record<string, string> = {
    OPENING_BALANCE: "رصيد افتتاحي",
    ACCRUAL: "استحقاق",
    LEAVE_USED: "إجازة مستخدمة",
    LEAVE_REVERSAL: "عكس إجازة",
    MANUAL_CREDIT: "إضافة يدوية",
    MANUAL_DEBIT: "خصم يدوي",
    MANUAL_ADJUSTMENT: "تسوية",
    RECALL: "استدعاء من إجازة",
  };
  return map[code || ""] || code || "حركة";
}

export default function WorkforceAnnualLeavePanel({ employeeId, serviceStartDate }: Props) {
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
      setError(friendly(caught));
    } finally {
      setLoading(false);
    }
  }, [employeeId, openingDate]);

  useEffect(() => { void load(); }, [employeeId]);

  const cards = useMemo(() => [
    ["الرصيد المتاح", state?.availableDays == null ? "—" : `${days(state.availableDays)} يوم`],
    ["الاستحقاق السنوي", state?.annualEntitlementDays == null ? "—" : `${days(state.annualEntitlementDays)} يوم`],
    ["المكتسب هذه السنة", state?.earnedCurrentServiceYearDays == null ? "—" : `${days(state.earnedCurrentServiceYearDays)} يوم`],
    ["الرصيد الافتتاحي", state?.openingBalanceDays == null ? "—" : `${days(state.openingBalanceDays)} يوم`],
  ], [state]);

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
      setMessage("تم اعتماد الرصيد الافتتاحي وتسجيله في سجل الحركات.");
    } catch (caught) { setError(friendly(caught)); }
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
      setMessage("تم تسجيل تعديل الرصيد في الـledger.");
    } catch (caught) { setError(friendly(caught)); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white"><Umbrella className="h-5 w-5" /></span>
            <div><h3 className="font-black">رصيد الإجازة السنوية</h3><p className="mt-1 text-sm leading-6 text-slate-500">الرصيد مبني على تاريخ بداية الخدمة، الاستحقاق السنوي، والـledger القانوني للحركات. الرصيد الافتتاحي لا يُعاد إنشاؤه بعد اعتماده.</p></div>
          </div>
          <Button type="button" variant="outline" className="rounded-xl" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> تحديث</Button>
        </div>

        {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}

        {state?.reviewRequired ? <div className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-black">الرصيد يحتاج مراجعة</p><p className="mt-1 text-sm">{state.reviewReason === "service_start_date_required" ? "تاريخ بداية الخدمة غير مضبوط، لذلك لا يمكن احتساب الاستحقاق." : state.reviewReason || "تحقق من بيانات الخدمة."}</p></div></div> : null}

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-xl font-black">{value}</p></div>)}</div>

        {state && !state.reviewRequired ? <div className="mt-4 flex flex-wrap gap-2 text-xs"><Badge variant="outline" className="rounded-full">بداية الخدمة: {textDate(state.startDate)}</Badge><Badge variant="outline" className="rounded-full">سنة الخدمة: {textDate(state.serviceYearStart)} — {textDate(state.serviceYearEnd)}</Badge><Badge variant="outline" className="rounded-full">الحد النظامي: {days(state.statutoryEntitlementDays)} يوم</Badge>{state.contractualEntitlementDays ? <Badge variant="outline" className="rounded-full">التعاقدي: {days(state.contractualEntitlementDays)} يوم</Badge> : null}</div> : null}
      </section>

      {!state?.openingBalance && serviceStartDate ? (
        <form onSubmit={saveOpening} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div><h3 className="font-black">تثبيت الرصيد الافتتاحي</h3><p className="mt-1 text-sm text-slate-500">يُستخدم عند بدء النظام أو تصحيح رصيد سابق. يجب أن يكون التاريخ من بداية الخدمة وحتى اليوم، وبزيادات نصف يوم.</p></div>
          <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>الرصيد بالأيام</Label><Input dir="ltr" type="number" min="0" max="3650" step="0.5" value={openingDays} onChange={e => setOpeningDays(e.target.value)} className="h-11 rounded-2xl" required /></div><div className="space-y-2"><Label>تاريخ السريان</Label><Input dir="ltr" type="date" min={serviceStartDate || undefined} value={openingDate} onChange={e => setOpeningDate(e.target.value)} className="h-11 rounded-2xl" required /></div></div>
          <div className="space-y-2"><Label>سبب الرصيد الافتتاحي</Label><Textarea value={openingReason} onChange={e => setOpeningReason(e.target.value)} className="min-h-20 rounded-2xl" required /></div>
          <Button type="submit" disabled={saving || !openingReason.trim() || !openingDate} className="rounded-xl bg-black"><Save className="h-4 w-4" /> اعتماد الرصيد الافتتاحي</Button>
        </form>
      ) : null}

      {state && !state.reviewRequired ? (
        <form onSubmit={saveAdjustment} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div><h3 className="font-black">تصحيح رصيد يدوي</h3><p className="mt-1 text-sm text-slate-500">للتصحيحات الإدارية فقط. كل حركة تحفظ السبب والتاريخ والموظف المنفذ في الـledger.</p></div>
          <div className="grid gap-4 md:grid-cols-3"><div className="space-y-2"><Label>نوع التعديل</Label><Select value={direction} onValueChange={value => setDirection(value as "credit" | "debit")}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="credit">إضافة رصيد</SelectItem><SelectItem value="debit">خصم رصيد</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>عدد الأيام</Label><Input dir="ltr" type="number" min="0.5" max="3650" step="0.5" value={adjustmentDays} onChange={e => setAdjustmentDays(e.target.value)} className="h-11 rounded-2xl" required /></div><div className="space-y-2"><Label>تاريخ السريان</Label><Input dir="ltr" type="date" min={serviceStartDate || undefined} value={adjustmentDate} onChange={e => setAdjustmentDate(e.target.value)} className="h-11 rounded-2xl" required /></div></div>
          <div className="space-y-2"><Label>سبب التصحيح</Label><Textarea value={adjustmentReason} onChange={e => setAdjustmentReason(e.target.value)} className="min-h-20 rounded-2xl" required /></div>
          <Button type="submit" disabled={saving || !adjustmentReason.trim() || !adjustmentDate} className="rounded-xl bg-black"><Plus className="h-4 w-4" /> تسجيل الحركة</Button>
        </form>
      ) : null}

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100"><History className="h-5 w-5" /></span><div><h3 className="font-black">سجل حركات الرصيد</h3><p className="mt-1 text-sm text-slate-500">ترتيب زمني قابل للتدقيق لكل رصيد افتتاحي أو إضافة أو خصم.</p></div></div>
        <div className="mt-5 overflow-x-auto"><Table className="min-w-[850px]"><TableHeader><TableRow><TableHead className="text-right">الحركة</TableHead><TableHead className="text-right">تاريخ السريان</TableHead><TableHead className="text-right">التغيير</TableHead><TableHead className="text-right">قبل</TableHead><TableHead className="text-right">بعد</TableHead><TableHead className="text-right">السبب</TableHead><TableHead className="text-right">المنفذ</TableHead></TableRow></TableHeader><TableBody>{(state?.entries || []).slice().reverse().map(entry => <TableRow key={entry.id}><TableCell className="font-bold">{entryLabel(entry.entryCode)}</TableCell><TableCell>{textDate(entry.effectiveDate)}</TableCell><TableCell dir="ltr" className={entry.deltaDays < 0 ? "text-red-600" : "text-emerald-700"}>{entry.deltaDays > 0 ? "+" : ""}{days(entry.deltaDays)}</TableCell><TableCell>{days(entry.balanceBeforeDays)}</TableCell><TableCell>{days(entry.balanceAfterDays)}</TableCell><TableCell>{entry.reason || "—"}</TableCell><TableCell>{entry.createdByEmail || "—"}</TableCell></TableRow>)}</TableBody></Table>{!state?.entries?.length ? <p className="py-8 text-center text-sm text-slate-500">لا توجد حركات رصيد مسجلة حتى الآن.</p> : null}</div>
      </section>
    </div>
  );
}
