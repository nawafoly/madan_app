import { CalendarClock, CalendarOff, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import { workforceApi, type WorkforceScheduleTemplate } from "./workforceClient";

type ScheduleExceptionType = "off" | "custom_shift" | "alternate_shift" | "weekly_rest_work";

type ScheduleException = {
  id: string;
  work_date: string;
  exception_type: ScheduleExceptionType;
  template_id?: string | null;
  template_name?: string | null;
  custom_start_time?: string | null;
  custom_end_time?: string | null;
  reason?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  status?: "active" | "cancelled";
};

type ResolvedSchedule = {
  date: string;
  kind: "assignment" | "weekly_rest" | "exception_off" | "custom_shift" | "alternate_shift" | "weekly_rest_work" | "unassigned";
  source: string;
  ready: boolean;
  isWorkingDay: boolean;
  isWeeklyRest: boolean;
  templateName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

type Props = {
  employeeId: string;
  templates: WorkforceScheduleTemplate[];
};

const typeLabels: Record<ScheduleExceptionType, string> = {
  off: "يوم راحة استثنائي",
  custom_shift: "دوام مخصص ليوم واحد",
  alternate_shift: "شفت بديل ليوم واحد",
  weekly_rest_work: "عمل استثنائي في يوم الراحة",
};

const resolutionLabels: Record<ResolvedSchedule["kind"], string> = {
  assignment: "دوام حسب التكليف",
  weekly_rest: "راحة أسبوعية",
  exception_off: "يوم راحة استثنائي",
  custom_shift: "دوام مخصص",
  alternate_shift: "شفت بديل",
  weekly_rest_work: "عمل استثنائي في يوم الراحة",
  unassigned: "الدوام غير مضبوط",
};

function todayRiyadh() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(value: string, amount: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount, 12)).toISOString().slice(0, 10);
}

function dateText(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(`${value}T12:00:00+03:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
}

function timeText(start?: string | null, end?: string | null) {
  return start && end ? `${start} — ${end}` : "—";
}

export default function WorkforceScheduleControlPanel({ employeeId, templates }: Props) {
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [previewDate, setPreviewDate] = useState(todayRiyadh());
  const [resolved, setResolved] = useState<ResolvedSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [type, setType] = useState<ScheduleExceptionType>("off");
  const [date, setDate] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [reason, setReason] = useState("");

  const [restDate, setRestDate] = useState("");
  const [substituteDate, setSubstituteDate] = useState("");
  const [moveReason, setMoveReason] = useState("");

  const activeTemplates = useMemo(() => templates.filter(item => item.isActive), [templates]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const from = addDays(todayRiyadh(), -31);
      const to = addDays(todayRiyadh(), 62);
      const payload = await workforceApi<{ ok: true; exceptions: ScheduleException[] }>(
        `employees/${encodeURIComponent(employeeId)}/schedule-exceptions?from=${from}&to=${to}`
      );
      setExceptions(payload.exceptions || []);
    } catch (caught) {
      setError(String((caught as Error)?.message || caught));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { void load(); }, [load]);

  async function resolveDate() {
    setLoading(true); setError(""); setMessage("");
    try {
      const payload = await workforceApi<{ ok: true; schedule: ResolvedSchedule }>(
        `employees/${encodeURIComponent(employeeId)}/schedule/resolve?date=${encodeURIComponent(previewDate)}`
      );
      setResolved(payload.schedule);
    } catch (caught) {
      setError(String((caught as Error)?.message || caught));
    } finally {
      setLoading(false);
    }
  }

  async function createException(event: FormEvent) {
    event.preventDefault();
    if (saving || !date) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await workforceApi(`employees/${encodeURIComponent(employeeId)}/schedule-exceptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDate: date,
          exceptionType: type,
          templateId: type === "alternate_shift" || type === "weekly_rest_work" ? templateId || undefined : undefined,
          customStartTime: type === "custom_shift" ? customStart : undefined,
          customEndTime: type === "custom_shift" ? customEnd : undefined,
          reason: reason || undefined,
          operationId: crypto.randomUUID(),
        }),
      });
      setDate(""); setReason(""); setCustomStart(""); setCustomEnd("");
      setMessage("تم حفظ استثناء الدوام.");
      await load();
    } catch (caught) {
      setError(String((caught as Error)?.message || caught));
    } finally {
      setSaving(false);
    }
  }

  async function cancelException(exceptionId: string) {
    if (saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await workforceApi(`employees/${encodeURIComponent(employeeId)}/schedule-exceptions/${encodeURIComponent(exceptionId)}`, {
        method: "DELETE",
      });
      setMessage("تم إلغاء استثناء الدوام مع الاحتفاظ بسجل التدقيق.");
      await load();
    } catch (caught) {
      setError(String((caught as Error)?.message || caught));
    } finally {
      setSaving(false);
    }
  }

  async function moveWeeklyRest(event: FormEvent) {
    event.preventDefault();
    if (saving || !restDate || !substituteDate) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await workforceApi(`employees/${encodeURIComponent(employeeId)}/weekly-rest-moves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restDate,
          substituteDate,
          reason: moveReason || undefined,
          operationId: crypto.randomUUID(),
        }),
      });
      setRestDate(""); setSubstituteDate(""); setMoveReason("");
      setMessage("تم نقل الراحة الأسبوعية: يوم الراحة الأصلي أصبح يوم عمل واليوم البديل أصبح راحة.");
      await load();
    } catch (caught) {
      setError(String((caught as Error)?.message || caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white"><CalendarClock className="h-5 w-5" /></span>
            <div><h3 className="font-black">استثناءات الدوام والراحة الأسبوعية</h3><p className="mt-1 text-sm leading-6 text-slate-500">Resolver موحد يحدد الشفت الفعلي لكل يوم قبل استخدامه في الحضور والإجازات والرواتب.</p></div>
          </div>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> تحديث</Button>
        </div>

        {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div><Label>فحص الدوام الفعلي ليوم</Label><Input className="mt-2 h-11 rounded-2xl" dir="ltr" type="date" value={previewDate} onChange={e => setPreviewDate(e.target.value)} /></div>
          <Button type="button" className="self-end rounded-xl bg-black" onClick={() => void resolveDate()} disabled={loading || !previewDate}>حلّ اليوم</Button>
        </div>

        {resolved ? <div className="mt-4 rounded-2xl bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{resolutionLabels[resolved.kind]}</Badge><Badge variant="outline">{resolved.ready ? "جاهز للاحتساب" : "يحتاج مراجعة"}</Badge></div><p className="mt-3 text-sm"><strong>{dateText(resolved.date)}</strong> · {resolved.templateName || "بدون شفت"} · <span dir="ltr">{timeText(resolved.startTime, resolved.endTime)}</span></p></div> : null}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="font-black">الاستثناءات الحالية</h3>
        <div className="mt-4 overflow-x-auto"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">الدوام</TableHead><TableHead className="text-right">السبب</TableHead><TableHead /></TableRow></TableHeader><TableBody>{exceptions.map(item => <TableRow key={item.id}><TableCell>{dateText(item.work_date)}</TableCell><TableCell className="font-bold">{typeLabels[item.exception_type] || item.exception_type}</TableCell><TableCell dir="ltr" className="text-right">{item.template_name || timeText(item.custom_start_time, item.custom_end_time)}</TableCell><TableCell>{item.reason || "—"}</TableCell><TableCell><Button type="button" size="sm" variant="ghost" onClick={() => void cancelException(item.id)} disabled={saving}><Trash2 className="h-4 w-4" /> إلغاء</Button></TableCell></TableRow>)}</TableBody></Table>{!exceptions.length ? <p className="py-8 text-center text-sm text-slate-500">لا توجد استثناءات فعالة.</p> : null}</div>
      </section>

      <form onSubmit={createException} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="font-black">إضافة استثناء ليوم واحد</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div><Label>التاريخ</Label><Input className="mt-2 h-11 rounded-2xl" dir="ltr" type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
          <div><Label>النوع</Label><Select value={type} onValueChange={value => setType(value as ScheduleExceptionType)}><SelectTrigger className="mt-2 h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          {(type === "alternate_shift" || type === "weekly_rest_work") ? <div><Label>الشفت البديل (اختياري للعمل في الراحة)</Label><Select value={templateId} onValueChange={setTemplateId}><SelectTrigger className="mt-2 h-11 w-full rounded-2xl"><SelectValue placeholder="اختر الشفت" /></SelectTrigger><SelectContent>{activeTemplates.map(item => <SelectItem key={item.id} value={item.id}>{item.name} · {item.startTime} — {item.endTime}</SelectItem>)}</SelectContent></Select></div> : null}
          {type === "custom_shift" ? <><div><Label>من</Label><Input className="mt-2 h-11 rounded-2xl" dir="ltr" type="time" value={customStart} onChange={e => setCustomStart(e.target.value)} required /></div><div><Label>إلى</Label><Input className="mt-2 h-11 rounded-2xl" dir="ltr" type="time" value={customEnd} onChange={e => setCustomEnd(e.target.value)} required /></div></> : null}
        </div>
        <div><Label>السبب / الملاحظة</Label><Textarea className="mt-2 min-h-20 rounded-2xl" value={reason} onChange={e => setReason(e.target.value)} /></div>
        <Button type="submit" className="rounded-xl bg-black" disabled={saving || !date}>حفظ الاستثناء</Button>
      </form>

      <form onSubmit={moveWeeklyRest} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white"><RotateCcw className="h-5 w-5" /></span><div><h3 className="font-black">نقل الراحة الأسبوعية مؤقتًا</h3><p className="mt-1 text-sm leading-6 text-slate-500">ينشئ عمليتين مترابطتين: عمل استثنائي في يوم الراحة الأصلي + يوم راحة استثنائي في اليوم البديل.</p></div></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label>يوم الراحة الأصلي</Label><Input className="mt-2 h-11 rounded-2xl" dir="ltr" type="date" value={restDate} onChange={e => setRestDate(e.target.value)} required /></div>
          <div><Label>يوم الراحة البديل</Label><Input className="mt-2 h-11 rounded-2xl" dir="ltr" type="date" value={substituteDate} onChange={e => setSubstituteDate(e.target.value)} required /></div>
        </div>
        <div><Label>سبب النقل</Label><Textarea className="mt-2 min-h-20 rounded-2xl" value={moveReason} onChange={e => setMoveReason(e.target.value)} /></div>
        <Button type="submit" className="rounded-xl bg-black" disabled={saving || !restDate || !substituteDate}><CalendarOff className="h-4 w-4" /> نقل الراحة</Button>
      </form>
    </div>
  );
}
