import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileClock,
  History,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Timer,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  formatDate,
  formatMinutes,
  formatTime,
  friendlyHabatError,
  habatApi,
  shiftDateKey,
  todayRiyadhKey,
} from "./habatAttendanceClient";

type PortalShift = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  workingDays: number[];
  isActive: boolean;
};

type PortalRecord = {
  id: string;
  attendanceDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  attendanceStatus: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  shiftId: string | null;
  notes: string | null;
};

type PortalPayload = {
  ok: true;
  date: string;
  month: string;
  profile: {
    uid: string | null;
    accessId: string | null;
    displayName: string;
    email: string | null;
    accessLevel: "employee" | "manager";
    canManage: boolean;
    canClock: boolean;
    createdAt: string | null;
  };
  settings: {
    timezone: string;
    locationRequired: boolean;
    radiusM: number;
  };
  schedule: {
    shift: PortalShift | null;
    assignment: {
      id: string;
      shiftId: string;
      effectiveFrom: string;
      effectiveTo: string | null;
      createdAt: string | null;
    } | null;
  };
  totals: {
    scheduledDays: number;
    attendedDays: number;
    absentDays: number;
    lateDays: number;
    earlyLeaveDays: number;
    incompleteDays: number;
    workedMinutes: number;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    attendanceRate: number;
  };
  today: {
    date: string;
    status: string;
    shift: PortalShift | null;
    record: PortalRecord | null;
  } | null;
  calendar: Array<{
    date: string;
    status: string;
    shift: PortalShift | null;
    record: PortalRecord | null;
  }>;
  recentRecords: PortalRecord[];
};

type AuditEvent = {
  id: string;
  actorUid: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};

const WEEKDAY_NAMES: Record<number, string> = {
  0: "الأحد",
  1: "الاثنين",
  2: "الثلاثاء",
  3: "الأربعاء",
  4: "الخميس",
  5: "الجمعة",
  6: "السبت",
};

function dayStatusLabel(status: string) {
  switch (status) {
    case "present":
      return "حاضر";
    case "present_now":
      return "موجود الآن";
    case "late":
      return "متأخر";
    case "early_leave":
      return "انصراف مبكر";
    case "late_early_leave":
      return "متأخر · انصراف مبكر";
    case "absent":
      return "غائب";
    case "incomplete":
      return "لم يسجل الانصراف";
    case "off_day":
      return "راحة";
    case "not_started":
      return "لم يبدأ الدوام";
    default:
      return status || "—";
  }
}

function statusClass(status: string) {
  if (status === "present" || status === "present_now") return "bg-emerald-50 text-emerald-700";
  if (status === "late") return "bg-amber-50 text-amber-800";
  if (status === "early_leave" || status === "late_early_leave") return "bg-orange-50 text-orange-800";
  if (status === "absent" || status === "incomplete") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-600";
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function EmployeePortalPage() {
  const [payload, setPayload] = useState<PortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await habatApi<PortalPayload>("portal/me");
      setPayload(response);
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shift = payload?.schedule.shift || null;
  const today = payload?.today || null;
  const workedHours = payload ? (payload.totals.workedMinutes / 60).toFixed(1) : "0.0";

  if (loading && !payload) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-[28px] border border-slate-200 bg-white">
        <RefreshCw className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="rounded-[28px] border border-red-100 bg-white p-6 text-center shadow-sm">
        <p className="font-bold text-red-700">{error || "تعذر تحميل صفحتك."}</p>
        <button onClick={() => void refresh()} className="mt-4 rounded-xl bg-black px-4 py-2 text-sm font-bold text-white">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[30px] bg-black p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
              <UserRound size={30} />
            </div>
            <div>
              <p className="text-xs font-bold text-white/55">صفحتي</p>
              <h2 className="mt-1 text-2xl font-black">{payload.profile.displayName}</h2>
              <p className="mt-1 text-sm text-white/60">{payload.profile.email || "—"}</p>
            </div>
          </div>
          <button
            onClick={() => void refresh()}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/15"
          >
            <RefreshCw size={16} /> تحديث
          </button>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-xs text-white/55">الصلاحية</p>
            <p className="mt-1 font-black">{payload.profile.accessLevel === "manager" ? "إدارة" : "موظف"}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-xs text-white/55">الشفت الحالي</p>
            <p className="mt-1 font-black">{shift?.name || "غير محدد"}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-xs text-white/55">نظام الموقع</p>
            <p className="mt-1 font-black">
              {payload.settings.locationRequired ? `إلزامي · ${payload.settings.radiusM} م` : "غير إلزامي"}
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-500">اليوم</p>
              <h3 className="mt-1 text-xl font-black">{formatDate(payload.date)}</h3>
            </div>
            <span className={`rounded-full px-3 py-1.5 text-xs font-black ${statusClass(today?.status || "")}`}>
              {dayStatusLabel(today?.status || "")}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="flex items-center gap-2 text-xs font-bold text-slate-500"><Clock3 size={14} /> الدوام</p>
              <p className="mt-2 font-black">{today?.shift ? `${today.shift.startTime} → ${today.shift.endTime}` : "—"}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-bold text-emerald-700">الحضور</p>
              <p className="mt-2 text-lg font-black">{formatTime(today?.record?.checkInAt)}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-4">
              <p className="text-xs font-bold text-slate-500">الانصراف</p>
              <p className="mt-2 text-lg font-black">{formatTime(today?.record?.checkOutAt)}</p>
            </div>
          </div>

          {today?.record?.lateMinutes ? (
            <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              تأخير اليوم: {today.record.lateMinutes} دقيقة
            </p>
          ) : null}
          {today?.status === "incomplete" ? (
            <p className="mt-4 flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              <TriangleAlert size={16} /> سجلت حضور ولم يتم تسجيل الانصراف.
            </p>
          ) : null}
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-100 p-3"><CalendarDays size={20} /></div>
            <div>
              <h3 className="font-black">جدولي</h3>
              <p className="text-xs text-slate-500">الدوام الفعلي المرتبط بحسابك</p>
            </div>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-slate-500">الشفت</span>
              <strong>{shift?.name || "غير محدد"}</strong>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-slate-500">الوقت</span>
              <strong>{shift ? `${shift.startTime} — ${shift.endTime}` : "—"}</strong>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-slate-500">سماح التأخير</span>
              <strong>{shift ? `${shift.graceMinutes} د` : "—"}</strong>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-slate-500">أيام العمل</p>
              <p className="mt-2 font-bold leading-7">
                {shift?.workingDays?.length
                  ? shift.workingDays.map(day => WEEKDAY_NAMES[day]).join(" · ")
                  : "غير محددة"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black">ملخص هذا الشهر</h3>
            <p className="text-sm text-slate-500">من بداية الشهر حتى اليوم</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-2 text-center shadow-sm">
            <p className="text-xs text-slate-500">نسبة الحضور</p>
            <p className="font-black">{payload.totals.attendanceRate}%</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="أيام الحضور" value={payload.totals.attendedDays} hint={`من ${payload.totals.scheduledDays} يوم دوام`} />
          <StatCard label="الغياب" value={payload.totals.absentDays} />
          <StatCard label="التأخير" value={payload.totals.lateDays} hint={`${payload.totals.lateMinutes} دقيقة إجمالي`} />
          <StatCard label="الانصراف المبكر" value={payload.totals.earlyLeaveDays} hint={`${payload.totals.earlyLeaveMinutes} دقيقة إجمالي`} />
          <StatCard label="سجلات ناقصة" value={payload.totals.incompleteDays} hint="حضور بدون انصراف" />
          <StatCard label="إجمالي ساعات العمل" value={`${workedHours} س`} />
          <StatCard label="صلاحية البصمة" value={payload.profile.canClock ? "مفعلة" : "غير مفعلة"} />
          <StatCard label="نطاق الحضور" value={payload.settings.locationRequired ? `${payload.settings.radiusM} م` : "مفتوح"} />
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-slate-100 p-3"><History size={20} /></div>
          <div>
            <h3 className="font-black">تفاصيل الشهر</h3>
            <p className="text-xs text-slate-500">آخر الأيام أولًا</p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="px-3 py-3">التاريخ</th>
                <th className="px-3 py-3">الحالة</th>
                <th className="px-3 py-3">الشفت</th>
                <th className="px-3 py-3">الحضور</th>
                <th className="px-3 py-3">الانصراف</th>
                <th className="px-3 py-3">ساعات العمل</th>
                <th className="px-3 py-3">التأخير</th>
              </tr>
            </thead>
            <tbody>
              {payload.calendar.map(day => (
                <tr key={day.date} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-3 font-bold">{formatDate(day.date)}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(day.status)}`}>
                      {dayStatusLabel(day.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3">{day.shift?.name || "—"}</td>
                  <td className="px-3 py-3">{formatTime(day.record?.checkInAt)}</td>
                  <td className="px-3 py-3">{formatTime(day.record?.checkOutAt)}</td>
                  <td className="px-3 py-3">{day.record?.workedMinutes == null ? "—" : formatMinutes(day.record.workedMinutes)}</td>
                  <td className="px-3 py-3">{day.record?.lateMinutes ? `${day.record.lateMinutes} د` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    check_in: "تسجيل حضور",
    check_out: "تسجيل انصراف",
    check_in_v2: "تسجيل حضور",
    check_out_v2: "تسجيل انصراف",
    create_access: "إضافة صلاحية",
    update_access: "تعديل صلاحية",
    delete_access: "حذف صلاحية",
    create_shift: "إنشاء شفت",
    update_shift: "تعديل شفت",
    deactivate_shift: "تعطيل شفت",
    assign_shift: "ربط شفت",
    update_settings: "تعديل الإعدادات",
    correct_record: "تصحيح سجل حضور",
  };
  return labels[action] || action.replaceAll("_", " ");
}

function formatAuditTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ar-SA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function changeSummary(event: AuditEvent) {
  const after = event.after as Record<string, unknown> | null;
  const before = event.before as Record<string, unknown> | null;
  if (after && typeof after === "object") {
    const reason = String(after.correctionReason || after.reason || "").trim();
    if (reason) return reason;
  }
  if (before || after) return "تم حفظ تفاصيل قبل/بعد للعملية.";
  return "عملية إدارية مسجلة في سجل التدقيق.";
}

export function AuditLogPage() {
  const today = todayRiyadhKey();
  const [from, setFrom] = useState(shiftDateKey(today, -30));
  const [to, setTo] = useState(today);
  const [email, setEmail] = useState("");
  const [action, setAction] = useState("");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ from, to, limit: "200" });
    if (email.trim()) params.set("email", email.trim());
    if (action) params.set("action", action);
    try {
      const payload = await habatApi<{ ok: true; events: AuditEvent[] }>(`portal/audit?${params.toString()}`);
      setEvents(payload.events || []);
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setLoading(false);
    }
  }, [action, email, from, to]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const actions = useMemo(
    () => Array.from(new Set(events.map(event => event.action).filter(Boolean))).sort(),
    [events]
  );

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-black p-3 text-white"><ShieldCheck size={20} /></div>
            <div>
              <h2 className="text-lg font-black">سجل التدقيق</h2>
              <p className="mt-1 text-sm text-slate-500">كل التعديلات والعمليات الحساسة في نظام الحضور</p>
            </div>
          </div>
          <button onClick={() => void refresh()} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold hover:bg-slate-50">
            <RefreshCw size={16} /> تحديث
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <label className="text-xs font-bold text-slate-500">
            من
            <input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900" />
          </label>
          <label className="text-xs font-bold text-slate-500">
            إلى
            <input type="date" value={to} onChange={event => setTo(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900" />
          </label>
          <label className="text-xs font-bold text-slate-500">
            بريد المنفذ
            <div className="relative mt-1">
              <Search className="absolute right-3 top-3.5 text-slate-400" size={15} />
              <input value={email} onChange={event => setEmail(event.target.value)} placeholder="email@example.com" className="h-11 w-full rounded-xl border border-slate-200 pr-9 pl-3 text-sm text-slate-900" />
            </div>
          </label>
          <label className="text-xs font-bold text-slate-500">
            العملية
            <select value={action} onChange={event => setAction(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900">
              <option value="">الكل</option>
              {actions.map(item => <option key={item} value={item}>{actionLabel(item)}</option>)}
            </select>
          </label>
        </div>
      </section>

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-black">العمليات المسجلة</h3>
            <p className="text-xs text-slate-500">{events.length} عملية ضمن الفلاتر الحالية</p>
          </div>
          {loading ? <RefreshCw className="animate-spin text-slate-400" size={18} /> : <FileClock className="text-slate-400" size={20} />}
        </div>

        <div className="mt-5 space-y-3">
          {events.map(event => (
            <details key={event.id} className="group rounded-2xl border border-slate-100 p-4 open:bg-slate-50">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black">{actionLabel(event.action)}</span>
                      <span className="text-xs text-slate-400">{event.entityType}</span>
                    </div>
                    <p className="mt-2 text-sm font-bold">{event.actorEmail || "النظام"}</p>
                    <p className="mt-1 text-xs text-slate-500">{changeSummary(event)}</p>
                  </div>
                  <p className="text-xs font-semibold text-slate-500">{formatAuditTime(event.createdAt)}</p>
                </div>
              </summary>
              <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-black text-slate-500">قبل</p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-left text-xs" dir="ltr">{event.before ? JSON.stringify(event.before, null, 2) : "—"}</pre>
                </div>
                <div>
                  <p className="mb-2 text-xs font-black text-slate-500">بعد</p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-left text-xs" dir="ltr">{event.after ? JSON.stringify(event.after, null, 2) : "—"}</pre>
                </div>
              </div>
            </details>
          ))}
          {!loading && !events.length ? (
            <div className="py-12 text-center text-sm text-slate-500">
              <CheckCircle2 className="mx-auto mb-3 text-slate-300" size={26} />
              لا توجد عمليات ضمن الفترة الحالية.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
