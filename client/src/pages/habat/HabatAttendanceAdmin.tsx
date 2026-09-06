import {
  BarChart3,
  CheckCircle2,
  Edit3,
  LocateFixed,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  formatDate,
  formatMinutes,
  formatTime,
  friendlyHabatError,
  fromRiyadhDateTimeLocal,
  habatApi,
  liveStatusLabel,
  shiftDateKey,
  statusLabel,
  toDateTimeLocal,
  todayRiyadhKey,
  type HabatAccessAccount,
  type HabatAssignment,
  type HabatDashboard,
  type HabatRecord,
  type HabatReport,
  type HabatSettings,
  type HabatShift,
} from "./habatAttendanceClient";

type PageProps = {
  onDataChanged?: () => void | Promise<void>;
};

const dayOptions = [
  { value: 0, label: "الأحد" },
  { value: 1, label: "الاثنين" },
  { value: 2, label: "الثلاثاء" },
  { value: 3, label: "الأربعاء" },
  { value: 4, label: "الخميس" },
  { value: 5, label: "الجمعة" },
  { value: 6, label: "السبت" },
];

function Panel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
      {message}
    </p>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<HabatDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await habatApi<HabatDashboard>("v2/dashboard"));
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const cards = data
    ? [
        ["الموظفون", data.counts.employees],
        ["موجودون الآن", data.counts.presentNow],
        ["انصرفوا", data.counts.checkedOut],
        ["متأخرون", data.counts.late],
        ["غائبون حتى الآن", data.counts.absent],
        ["لم يبدأ دوامهم", data.counts.notStarted],
      ]
    : [];

  return (
    <div className="space-y-6">
      <Panel
        title="الرئيسية"
        subtitle="الحالة المباشرة لدوام اليوم"
        action={
          <button
            onClick={() => void refresh()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold hover:bg-slate-50"
          >
            <RefreshCw size={16} /> تحديث
          </button>
        }
      >
        <ErrorBox message={error} />
        {loading ? (
          <p className="py-8 text-center text-slate-500">جاري تحميل حالة اليوم...</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-black">{value}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="حالة الموظفين اليوم" subtitle={data ? formatDate(data.date) : undefined}>
        {data?.employees.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-right text-sm">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-3">الموظف</th>
                  <th className="px-3 py-3">الحالة</th>
                  <th className="px-3 py-3">الدوام</th>
                  <th className="px-3 py-3">الحضور</th>
                  <th className="px-3 py-3">الانصراف</th>
                </tr>
              </thead>
              <tbody>
                {data.employees.map(employee => (
                  <tr key={employee.id} className="border-b border-slate-50">
                    <td className="px-3 py-3">
                      <p className="font-bold">{employee.displayName}</p>
                      <p className="text-xs text-slate-500">{employee.email}</p>
                    </td>
                    <td className="px-3 py-3 font-bold">
                      {liveStatusLabel(employee.liveStatus)}
                    </td>
                    <td className="px-3 py-3">
                      {employee.shift
                        ? `${employee.shift.startTime} - ${employee.shift.endTime}`
                        : "—"}
                    </td>
                    <td className="px-3 py-3">{formatTime(employee.record?.checkInAt)}</td>
                    <td className="px-3 py-3">{formatTime(employee.record?.checkOutAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading ? (
          <p className="py-8 text-center text-sm text-slate-500">لا توجد حسابات موظفين مفعلة.</p>
        ) : null}
      </Panel>
    </div>
  );
}

export function EmployeesPage({ onDataChanged }: PageProps) {
  const [accounts, setAccounts] = useState<HabatAccessAccount[]>([]);
  const [shifts, setShifts] = useState<HabatShift[]>([]);
  const [assignments, setAssignments] = useState<HabatAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accessLevel, setAccessLevel] = useState<"employee" | "manager">("employee");
  const [clockEnabled, setClockEnabled] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [accountPayload, shiftPayload, assignmentPayload] = await Promise.all([
        habatApi<{ ok: true; accounts: HabatAccessAccount[] }>("access"),
        habatApi<{ ok: true; shifts: HabatShift[] }>("v2/shifts"),
        habatApi<{ ok: true; assignments: HabatAssignment[] }>("v2/assignments"),
      ]);
      setAccounts(accountPayload.accounts || []);
      setShifts(shiftPayload.shifts || []);
      setAssignments(assignmentPayload.assignments || []);
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addAccount(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await habatApi("access", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim() || null,
          accessLevel,
          clockEnabled,
        }),
      });
      setEmail("");
      setDisplayName("");
      setAccessLevel("employee");
      setClockEnabled(true);
      await refresh();
      await onDataChanged?.();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function patchAccount(
    account: HabatAccessAccount,
    patch: Partial<Pick<HabatAccessAccount, "accessLevel" | "clockEnabled" | "isActive">>
  ) {
    setError("");
    try {
      await habatApi(`access/${encodeURIComponent(account.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await refresh();
      await onDataChanged?.();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    }
  }

  async function removeAccount(account: HabatAccessAccount) {
    if (!window.confirm(`إلغاء صلاحية ${account.displayName || account.email}؟`)) return;
    setError("");
    try {
      await habatApi(`access/${encodeURIComponent(account.id)}`, { method: "DELETE" });
      await refresh();
      await onDataChanged?.();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    }
  }

  async function assignShift(accessId: string, shiftId: string) {
    if (!shiftId) return;
    setError("");
    try {
      await habatApi("v2/assignments", {
        method: "POST",
        body: JSON.stringify({
          accessId,
          shiftId,
          effectiveFrom: todayRiyadhKey(),
        }),
      });
      await refresh();
      await onDataChanged?.();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    }
  }

  const latestAssignment = useMemo(() => {
    const map = new Map<string, HabatAssignment>();
    for (const assignment of assignments) {
      if (!map.has(assignment.accessId)) map.set(assignment.accessId, assignment);
    }
    return map;
  }, [assignments]);

  return (
    <div className="space-y-6">
      <Panel title="الموظفون" subtitle="الحسابات المصرح لها وصلاحية البصمة والشفت">
        <form onSubmit={addAccount} className="grid gap-3 rounded-2xl bg-slate-50 p-4 lg:grid-cols-5">
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            value={email}
            onChange={event => setEmail(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none lg:col-span-2"
            required
          />
          <input
            placeholder="الاسم"
            value={displayName}
            onChange={event => setDisplayName(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none"
          />
          <select
            value={accessLevel}
            onChange={event => setAccessLevel(event.target.value as "employee" | "manager")}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3"
          >
            <option value="employee">موظف</option>
            <option value="manager">إدارة</option>
          </select>
          <button
            disabled={saving}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 font-bold text-white disabled:opacity-50"
          >
            <Plus size={17} /> {saving ? "جاري الإضافة" : "إضافة"}
          </button>
          <label className="flex items-center gap-2 text-sm font-semibold lg:col-span-5">
            <input
              type="checkbox"
              checked={clockEnabled}
              onChange={event => setClockEnabled(event.target.checked)}
            />
            يسمح بتسجيل الحضور والانصراف
          </label>
        </form>
        <div className="mt-4"><ErrorBox message={error} /></div>
      </Panel>

      <Panel
        title="الحسابات المصرح لها"
        action={
          <button onClick={() => void refresh()} className="rounded-xl border border-slate-200 p-2">
            <RefreshCw size={16} />
          </button>
        }
      >
        {loading ? (
          <p className="py-8 text-center text-slate-500">جاري التحميل...</p>
        ) : accounts.length ? (
          <div className="space-y-3">
            {accounts.map(account => {
              const assignment = latestAssignment.get(account.id);
              return (
                <div key={account.id} className="grid gap-3 rounded-2xl border border-slate-100 p-4 lg:grid-cols-[1.5fr_1fr_1.3fr_auto] lg:items-center">
                  <div>
                    <p className="font-black">{account.displayName || account.email}</p>
                    <p className="text-xs text-slate-500">{account.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={account.accessLevel}
                      onChange={event =>
                        void patchAccount(account, {
                          accessLevel: event.target.value as "employee" | "manager",
                        })
                      }
                      className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm"
                    >
                      <option value="employee">موظف</option>
                      <option value="manager">إدارة</option>
                    </select>
                    <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 text-xs font-bold">
                      <input
                        type="checkbox"
                        checked={account.clockEnabled}
                        onChange={event =>
                          void patchAccount(account, { clockEnabled: event.target.checked })
                        }
                      />
                      بصمة
                    </label>
                  </div>
                  <select
                    value={assignment?.shiftId || "habat_shift_default"}
                    onChange={event => void assignShift(account.id, event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  >
                    {shifts.filter(shift => shift.isActive).map(shift => (
                      <option key={shift.id} value={shift.id}>
                        {shift.name} · {shift.startTime}-{shift.endTime}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void removeAccount(account)}
                    className="rounded-xl p-2 text-red-600 hover:bg-red-50"
                    title="إلغاء الصلاحية"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-slate-500">لا توجد حسابات حتى الآن.</p>
        )}
      </Panel>
    </div>
  );
}

type ShiftDraft = {
  id?: string;
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  workingDays: number[];
};

const emptyShift: ShiftDraft = {
  name: "",
  startTime: "09:00",
  endTime: "17:00",
  graceMinutes: 10,
  earlyLeaveToleranceMinutes: 0,
  workingDays: [0, 1, 2, 3, 4],
};

export function ShiftsPage({ onDataChanged }: PageProps) {
  const [shifts, setShifts] = useState<HabatShift[]>([]);
  const [draft, setDraft] = useState<ShiftDraft>(emptyShift);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const payload = await habatApi<{ ok: true; shifts: HabatShift[] }>("v2/shifts");
      setShifts(payload.shifts || []);
    } catch (caught) {
      setError(friendlyHabatError(caught));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function toggleDay(day: number) {
    setDraft(current => ({
      ...current,
      workingDays: current.workingDays.includes(day)
        ? current.workingDays.filter(item => item !== day)
        : [...current.workingDays, day].sort(),
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const path = draft.id ? `v2/shifts/${encodeURIComponent(draft.id)}` : "v2/shifts";
      await habatApi(path, {
        method: draft.id ? "PATCH" : "POST",
        body: JSON.stringify(draft),
      });
      setDraft(emptyShift);
      await refresh();
      await onDataChanged?.();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setSaving(false);
    }
  }

  function edit(shift: HabatShift) {
    setDraft({
      id: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      graceMinutes: shift.graceMinutes,
      earlyLeaveToleranceMinutes: shift.earlyLeaveToleranceMinutes,
      workingDays: shift.workingDays,
    });
  }

  async function deactivate(shift: HabatShift) {
    if (!window.confirm(`تعطيل شفت ${shift.name}؟`)) return;
    try {
      await habatApi(`v2/shifts/${encodeURIComponent(shift.id)}`, { method: "DELETE" });
      await refresh();
      await onDataChanged?.();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    }
  }

  return (
    <div className="space-y-6">
      <Panel title="الدوام والشفتات" subtitle="ساعات العمل، أيام الدوام، السماح بالتأخير والانصراف المبكر">
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input
              placeholder="اسم الشفت"
              value={draft.name}
              onChange={event => setDraft({ ...draft, name: event.target.value })}
              className="h-11 rounded-xl border border-slate-200 px-3 xl:col-span-2"
              required
            />
            <label className="text-xs font-bold text-slate-500">
              البداية
              <input
                type="time"
                value={draft.startTime}
                onChange={event => setDraft({ ...draft, startTime: event.target.value })}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-slate-950"
              />
            </label>
            <label className="text-xs font-bold text-slate-500">
              النهاية
              <input
                type="time"
                value={draft.endTime}
                onChange={event => setDraft({ ...draft, endTime: event.target.value })}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-slate-950"
              />
            </label>
            <button disabled={saving} className="mt-auto flex h-11 items-center justify-center gap-2 rounded-xl bg-black font-bold text-white">
              <Save size={17} /> {draft.id ? "حفظ التعديل" : "إنشاء شفت"}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold">
              فترة السماح بالتأخير — بالدقائق
              <input
                type="number"
                min={0}
                max={240}
                value={draft.graceMinutes}
                onChange={event => setDraft({ ...draft, graceMinutes: Number(event.target.value) })}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"
              />
            </label>
            <label className="text-sm font-semibold">
              سماح الانصراف المبكر — بالدقائق
              <input
                type="number"
                min={0}
                max={240}
                value={draft.earlyLeaveToleranceMinutes}
                onChange={event =>
                  setDraft({ ...draft, earlyLeaveToleranceMinutes: Number(event.target.value) })
                }
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold">أيام العمل</p>
            <div className="flex flex-wrap gap-2">
              {dayOptions.map(day => (
                <button
                  type="button"
                  key={day.value}
                  onClick={() => toggleDay(day.value)}
                  className={
                    draft.workingDays.includes(day.value)
                      ? "rounded-xl bg-black px-3 py-2 text-sm font-bold text-white"
                      : "rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                  }
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          {draft.id ? (
            <button
              type="button"
              onClick={() => setDraft(emptyShift)}
              className="text-sm font-bold text-slate-500"
            >
              إلغاء التعديل
            </button>
          ) : null}
          <ErrorBox message={error} />
        </form>
      </Panel>

      <Panel title="الشفتات الحالية">
        <div className="grid gap-3 lg:grid-cols-2">
          {shifts.map(shift => (
            <div key={shift.id} className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">{shift.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {shift.startTime} → {shift.endTime} · سماح {shift.graceMinutes} د
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {dayOptions
                      .filter(day => shift.workingDays.includes(day.value))
                      .map(day => day.label)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => edit(shift)} className="rounded-xl p-2 hover:bg-slate-50">
                    <Edit3 size={17} />
                  </button>
                  {shift.id !== "habat_shift_default" ? (
                    <button
                      onClick={() => void deactivate(shift)}
                      className="rounded-xl p-2 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={17} />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function RecordsPage() {
  const today = todayRiyadhKey();
  const [from, setFrom] = useState(shiftDateKey(today, -30));
  const [to, setTo] = useState(today);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [records, setRecords] = useState<HabatRecord[]>([]);
  const [editing, setEditing] = useState<HabatRecord | null>(null);
  const [checkInAt, setCheckInAt] = useState("");
  const [checkOutAt, setCheckOutAt] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams({ from, to, limit: "300" });
      if (email.trim()) params.set("email", email.trim());
      if (status) params.set("status", status);
      const payload = await habatApi<{ ok: true; records: HabatRecord[] }>(
        `v2/records?${params.toString()}`
      );
      setRecords(payload.records || []);
    } catch (caught) {
      setError(friendlyHabatError(caught));
    }
  }, [email, from, status, to]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCorrection(record: HabatRecord) {
    setEditing(record);
    setCheckInAt(toDateTimeLocal(record.checkInAt));
    setCheckOutAt(toDateTimeLocal(record.checkOutAt));
    setReason("");
  }

  async function correct(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setError("");
    try {
      await habatApi(`v2/records/${encodeURIComponent(editing.id)}/correct`, {
        method: "POST",
        body: JSON.stringify({
          checkInAt: fromRiyadhDateTimeLocal(checkInAt),
          checkOutAt: checkOutAt ? fromRiyadhDateTimeLocal(checkOutAt) : null,
          reason,
        }),
      });
      setEditing(null);
      await refresh();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    }
  }

  return (
    <div className="space-y-6">
      <Panel title="سجل الحضور" subtitle="فلترة السجلات ومراجعة التأخير والانصراف والتصحيحات">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input type="date" value={from} onChange={event => setFrom(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3" />
          <input type="date" value={to} onChange={event => setTo(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3" />
          <input placeholder="بريد الموظف" value={email} onChange={event => setEmail(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3" />
          <select value={status} onChange={event => setStatus(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3">
            <option value="">كل الحالات</option>
            <option value="present">حاضر</option>
            <option value="late">متأخر</option>
            <option value="early_leave">انصراف مبكر</option>
            <option value="late_early_leave">متأخر + انصراف مبكر</option>
          </select>
          <button onClick={() => void refresh()} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-black font-bold text-white">
            <RefreshCw size={17} /> تحديث
          </button>
        </div>
        <div className="mt-4"><ErrorBox message={error} /></div>
      </Panel>

      <Panel title={`السجلات (${records.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-right text-sm">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-3 py-3">الموظف</th>
                <th className="px-3 py-3">التاريخ</th>
                <th className="px-3 py-3">الحالة</th>
                <th className="px-3 py-3">الحضور</th>
                <th className="px-3 py-3">الانصراف</th>
                <th className="px-3 py-3">التأخير</th>
                <th className="px-3 py-3">الخروج المبكر</th>
                <th className="px-3 py-3">العمل</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {records.map(record => (
                <tr key={record.id} className="border-b border-slate-50">
                  <td className="px-3 py-3">
                    <p className="font-bold">{record.displayName || record.accountEmail}</p>
                    <p className="text-xs text-slate-500">{record.accountEmail}</p>
                  </td>
                  <td className="px-3 py-3">{formatDate(record.attendanceDate)}</td>
                  <td className="px-3 py-3 font-bold">{statusLabel(record.attendanceStatus)}</td>
                  <td className="px-3 py-3">{formatTime(record.checkInAt)}</td>
                  <td className="px-3 py-3">{formatTime(record.checkOutAt)}</td>
                  <td className="px-3 py-3">{record.lateMinutes ? `${record.lateMinutes} د` : "—"}</td>
                  <td className="px-3 py-3">{record.earlyLeaveMinutes ? `${record.earlyLeaveMinutes} د` : "—"}</td>
                  <td className="px-3 py-3">{record.workedMinutes == null ? "—" : formatMinutes(record.workedMinutes)}</td>
                  <td className="px-3 py-3">
                    <button onClick={() => openCorrection(record)} className="rounded-xl border border-slate-200 p-2" title="تصحيح">
                      <Edit3 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!records.length ? <p className="py-8 text-center text-slate-500">لا توجد سجلات ضمن الفترة.</p> : null}
      </Panel>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <form onSubmit={correct} className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-black">تصحيح سجل الحضور</h3>
            <p className="mt-1 text-sm text-slate-500">
              {editing.displayName || editing.accountEmail} · {formatDate(editing.attendanceDate)}
            </p>
            <div className="mt-5 grid gap-3">
              <label className="text-sm font-bold">
                وقت الحضور
                <input type="datetime-local" value={checkInAt} onChange={event => setCheckInAt(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" required />
              </label>
              <label className="text-sm font-bold">
                وقت الانصراف
                <input type="datetime-local" value={checkOutAt} onChange={event => setCheckOutAt(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" />
              </label>
              <label className="text-sm font-bold">
                سبب التصحيح
                <textarea value={reason} onChange={event => setReason(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3" required />
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-black font-bold text-white">
                <Save size={17} /> حفظ التصحيح
              </button>
              <button type="button" onClick={() => setEditing(null)} className="h-11 rounded-xl border border-slate-200 px-5 font-bold">
                إلغاء
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function ReportsPage() {
  const today = todayRiyadhKey();
  const [from, setFrom] = useState(shiftDateKey(today, -30));
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<HabatReport | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      setReport(
        await habatApi<HabatReport>(`v2/reports/summary?from=${from}&to=${to}`)
      );
    } catch (caught) {
      setError(friendlyHabatError(caught));
    }
  }, [from, to]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totals = report?.totals;

  return (
    <div className="space-y-6">
      <Panel title="التقارير" subtitle="ملخص الحضور والغياب والتأخير وساعات العمل">
        <div className="flex flex-wrap gap-3">
          <input type="date" value={from} onChange={event => setFrom(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3" />
          <input type="date" value={to} onChange={event => setTo(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3" />
          <button onClick={() => void refresh()} className="flex h-11 items-center gap-2 rounded-xl bg-black px-5 font-bold text-white">
            <BarChart3 size={17} /> تحديث التقرير
          </button>
        </div>
        <div className="mt-4"><ErrorBox message={error} /></div>
      </Panel>

      {totals ? (
        <Panel title="ملخص الفترة">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["أيام الدوام", totals.scheduledDays],
              ["الحضور", totals.attendedDays],
              ["الغياب", totals.absentDays],
              ["التأخير", totals.lateDays],
              ["الخروج المبكر", totals.earlyLeaveDays],
              ["بدون انصراف", totals.incompleteDays],
              ["ساعات العمل", formatMinutes(totals.workedMinutes)],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-black">{value}</p>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel title="حسب الموظف">
        {report?.employees.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-right text-sm">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-3">الموظف</th>
                  <th className="px-3 py-3">دوام</th>
                  <th className="px-3 py-3">حضور</th>
                  <th className="px-3 py-3">غياب</th>
                  <th className="px-3 py-3">تأخير</th>
                  <th className="px-3 py-3">مبكر</th>
                  <th className="px-3 py-3">بدون انصراف</th>
                  <th className="px-3 py-3">ساعات</th>
                </tr>
              </thead>
              <tbody>
                {report.employees.map(employee => (
                  <tr key={employee.accessId} className="border-b border-slate-50">
                    <td className="px-3 py-3">
                      <p className="font-bold">{employee.displayName}</p>
                      <p className="text-xs text-slate-500">{employee.email}</p>
                    </td>
                    <td className="px-3 py-3">{employee.scheduledDays}</td>
                    <td className="px-3 py-3">{employee.attendedDays}</td>
                    <td className="px-3 py-3">{employee.absentDays}</td>
                    <td className="px-3 py-3">{employee.lateDays}</td>
                    <td className="px-3 py-3">{employee.earlyLeaveDays}</td>
                    <td className="px-3 py-3">{employee.incompleteDays}</td>
                    <td className="px-3 py-3 font-bold">{formatMinutes(employee.workedMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-slate-500">لا توجد بيانات للفترة.</p>
        )}
      </Panel>
    </div>
  );
}

export function SettingsPage({ onDataChanged }: PageProps) {
  const [settings, setSettings] = useState<HabatSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const payload = await habatApi<{ ok: true; settings: HabatSettings }>("v2/settings");
      setSettings(payload.settings);
    } catch (caught) {
      setError(friendlyHabatError(caught));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("المتصفح لا يدعم تحديد الموقع.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      position => {
        setSettings(current =>
          current
            ? {
                ...current,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              }
            : current
        );
        setLocating(false);
      },
      () => {
        setError("تعذر الحصول على الموقع. اسمح للموقع من إعدادات المتصفح.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = await habatApi<{ ok: true; settings: HabatSettings }>("v2/settings", {
        method: "PATCH",
        body: JSON.stringify({
          locationRequired: settings.locationRequired,
          latitude: settings.latitude,
          longitude: settings.longitude,
          radiusM: settings.radiusM,
          maxAccuracyM: settings.maxAccuracyM,
        }),
      });
      setSettings(payload.settings);
      setMessage("تم حفظ إعدادات الحضور.");
      await onDataChanged?.();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <Panel title="الإعدادات"><p className="py-8 text-center text-slate-500">جاري التحميل...</p></Panel>;
  }

  return (
    <Panel title="إعدادات الحضور" subtitle="موقع الفرع ونطاق البصمة ودقة GPS">
      <form onSubmit={save} className="space-y-5">
        <div className="rounded-2xl bg-slate-50 p-4">
          <label className="flex items-center gap-3 font-bold">
            <input
              type="checkbox"
              checked={settings.locationRequired}
              onChange={event => setSettings({ ...settings, locationRequired: event.target.checked })}
              className="h-5 w-5"
            />
            إلزام الموظف بالتواجد داخل نطاق الفرع وقت البصمة
          </label>
          <p className="mt-2 text-xs text-slate-500">
            عند التفعيل يعتمد القرار على GPS في السيرفر، وليس على الواجهة فقط.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-bold">
            Latitude
            <input
              type="number"
              step="any"
              value={settings.latitude ?? ""}
              onChange={event =>
                setSettings({
                  ...settings,
                  latitude: event.target.value === "" ? null : Number(event.target.value),
                })
              }
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>
          <label className="text-sm font-bold">
            Longitude
            <input
              type="number"
              step="any"
              value={settings.longitude ?? ""}
              onChange={event =>
                setSettings({
                  ...settings,
                  longitude: event.target.value === "" ? null : Number(event.target.value),
                })
              }
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => void useCurrentLocation()}
          disabled={locating}
          className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 font-bold"
        >
          <LocateFixed size={18} /> {locating ? "جاري تحديد الموقع..." : "استخدام موقعي الحالي كموقع الفرع"}
        </button>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-bold">
            نصف قطر الحضور بالمتر
            <input
              type="number"
              min={10}
              max={5000}
              value={settings.radiusM}
              onChange={event => setSettings({ ...settings, radiusM: Number(event.target.value) })}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>
          <label className="text-sm font-bold">
            أقصى دقة GPS مقبولة بالمتر
            <input
              type="number"
              min={10}
              max={1000}
              value={settings.maxAccuracyM}
              onChange={event =>
                setSettings({ ...settings, maxAccuracyM: Number(event.target.value) })
              }
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button disabled={saving} className="flex h-11 items-center gap-2 rounded-xl bg-black px-5 font-bold text-white">
            <Save size={17} /> {saving ? "جاري الحفظ" : "حفظ الإعدادات"}
          </button>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 text-sm text-slate-600">
            <MapPin size={16} />
            المنطقة الزمنية: Asia/Riyadh
          </div>
        </div>

        {message ? (
          <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            <CheckCircle2 size={17} /> {message}
          </p>
        ) : null}
        <ErrorBox message={error} />
      </form>
    </Panel>
  );
}
