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
import HabatDatePicker from "./HabatDatePicker";
import HabatNumberInput from "@/pages/habat/HabatNumberInput";
import HabatTimeInput, { formatHabatShiftRange } from "@/pages/habat/HabatTimeInput";
import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
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
  { value: 0, ar: "الأحد", en: "Sunday" },
  { value: 1, ar: "الاثنين", en: "Monday" },
  { value: 2, ar: "الثلاثاء", en: "Tuesday" },
  { value: 3, ar: "الأربعاء", en: "Wednesday" },
  { value: 4, ar: "الخميس", en: "Thursday" },
  { value: 5, ar: "الجمعة", en: "Friday" },
  { value: 6, ar: "السبت", en: "Saturday" },
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
  const { language } = useLanguage();
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
        [tr(language, "الموظفون", "Employees"), data.counts.employees],
        [tr(language, "موجودون الآن", "Present Now"), data.counts.presentNow],
        [tr(language, "انصرفوا", "Clocked Out"), data.counts.checkedOut],
        [tr(language, "متأخرون", "Late"), data.counts.late],
        [tr(language, "غائبون حتى الآن", "Absent So Far"), data.counts.absent],
        [tr(language, "لم يبدأ دوامهم", "Shift Not Started"), data.counts.notStarted],
      ]
    : [];

  return (
    <div className="space-y-6">
      <Panel
        title={tr(language, "الرئيسية", "Dashboard")}
        subtitle={tr(language, "الحالة المباشرة لدوام اليوم", "Live attendance status for today")}
        action={
          <button
            onClick={() => void refresh()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold hover:bg-slate-50"
          >
            <RefreshCw size={16} /> {tr(language, "تحديث", "Refresh")}
          </button>
        }
      >
        <ErrorBox message={error} />
        {loading ? (
          <p className="py-8 text-center text-slate-500">{tr(language, "جاري تحميل حالة اليوم...", "Loading today's status...")}</p>
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

      <Panel title={tr(language, "حالة الموظفين اليوم", "Employees Today")} subtitle={data ? formatDate(data.date) : undefined}>
        {data?.employees.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-start text-sm">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-3">{tr(language, "الموظف", "Employee")}</th>
                  <th className="px-3 py-3">{tr(language, "الحالة", "Status")}</th>
                  <th className="px-3 py-3">{tr(language, "الدوام", "Shift")}</th>
                  <th className="px-3 py-3">{tr(language, "الحضور", "Clock In")}</th>
                  <th className="px-3 py-3">{tr(language, "الانصراف", "Clock Out")}</th>
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
                      {tr(language, liveStatusLabel(employee.liveStatus), employee.liveStatus)}
                    </td>
                    <td className="px-3 py-3">
                      {employee.shift
                        ? formatHabatShiftRange(employee.shift.startTime, employee.shift.endTime, language)
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
          <p className="py-8 text-center text-sm text-slate-500">{tr(language, "لا توجد حسابات موظفين مفعلة.", "No active employee accounts.")}</p>
        ) : null}
      </Panel>
    </div>
  );
}

export function EmployeesPage({ onDataChanged }: PageProps) {
  const { language } = useLanguage();
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
    if (!window.confirm(tr(language, `إلغاء صلاحية ${account.displayName || account.email}؟`, `Revoke access for ${account.displayName || account.email}?`))) return;
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
      <Panel title={tr(language, "الموظفون", "Employees")} subtitle={tr(language, "الحسابات المصرح لها وصلاحية البصمة والشفت", "Authorized accounts, attendance access, and shift assignment")}>
        <form onSubmit={addAccount} className="grid gap-3 rounded-2xl bg-slate-50 p-4 lg:grid-cols-5">
          <input
            type="email"
            placeholder={tr(language, "البريد الإلكتروني", "Email")}
            value={email}
            onChange={event => setEmail(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none lg:col-span-2"
            required
          />
          <input
            placeholder={tr(language, "الاسم", "Name")}
            value={displayName}
            onChange={event => setDisplayName(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none"
          />
          <select
            value={accessLevel}
            onChange={event => setAccessLevel(event.target.value as "employee" | "manager")}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3"
          >
            <option value="employee">{tr(language, "موظف", "Employee")}</option>
            <option value="manager">{tr(language, "إدارة", "Manager")}</option>
          </select>
          <button
            disabled={saving}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 font-bold text-white disabled:opacity-50"
          >
            <Plus size={17} /> {saving ? tr(language, "جاري الإضافة", "Adding...") : tr(language, "إضافة", "Add")}
          </button>
          <label className="flex items-center gap-2 text-sm font-semibold lg:col-span-5">
            <input
              type="checkbox"
              checked={clockEnabled}
              onChange={event => setClockEnabled(event.target.checked)}
            />
            {tr(language, "يسمح بتسجيل الحضور والانصراف", "Allow clock in and clock out")}
          </label>
        </form>
        <div className="mt-4"><ErrorBox message={error} /></div>
      </Panel>

      <Panel
        title={tr(language, "الحسابات المصرح لها", "Authorized Accounts")}
        action={
          <button onClick={() => void refresh()} className="rounded-xl border border-slate-200 p-2">
            <RefreshCw size={16} />
          </button>
        }
      >
        {loading ? (
          <p className="py-8 text-center text-slate-500">{tr(language, "جاري التحميل...", "Loading...")}</p>
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
                      <option value="employee">{tr(language, "موظف", "Employee")}</option>
                      <option value="manager">{tr(language, "إدارة", "Manager")}</option>
                    </select>
                    <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 text-xs font-bold">
                      <input
                        type="checkbox"
                        checked={account.clockEnabled}
                        onChange={event =>
                          void patchAccount(account, { clockEnabled: event.target.checked })
                        }
                      />
                      {tr(language, "بصمة", "Attendance")}
                    </label>
                  </div>
                  <select
                    value={assignment?.shiftId || "habat_shift_default"}
                    onChange={event => void assignShift(account.id, event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  >
                    {shifts.filter(shift => shift.isActive).map(shift => (
                      <option key={shift.id} value={shift.id}>
                        {shift.name} · {formatHabatShiftRange(shift.startTime, shift.endTime, language)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void removeAccount(account)}
                    className="rounded-xl p-2 text-red-600 hover:bg-red-50"
                    title={tr(language, "إلغاء الصلاحية", "Revoke Access")}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-slate-500">{tr(language, "لا توجد حسابات حتى الآن.", "No accounts yet.")}</p>
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
  const { language } = useLanguage();
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
      workingDays: [0, 1, 2, 3, 4, 5, 6],
    });
  }

  async function deactivate(shift: HabatShift) {
    if (!window.confirm(tr(language, `تعطيل شفت ${shift.name}؟`, `Disable shift ${shift.name}?`))) return;
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
      <Panel title={tr(language, "قوالب الشفتات", "Shift Templates")} subtitle={tr(language, "أوقات وسياسات قابلة لإعادة الاستخدام. يوم الراحة يُحدد لكل موظف من ملفه.", "Reusable shift times and policies. Weekly rest is configured per employee.")}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input
              placeholder={tr(language, "اسم الشفت", "Shift Name")}
              value={draft.name}
              onChange={event => setDraft({ ...draft, name: event.target.value })}
              className="h-11 rounded-xl border border-slate-200 px-3 xl:col-span-2"
              required
            />
            <label className="text-xs font-bold text-slate-500">
              {tr(language, "البداية", "Start")}
              <HabatTimeInput
                value={draft.startTime}
                onChange={value => setDraft({ ...draft, startTime: value })}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-slate-950"
              />
            </label>
            <label className="text-xs font-bold text-slate-500">
              {tr(language, "النهاية", "End")}
              <HabatTimeInput
                value={draft.endTime}
                onChange={value => setDraft({ ...draft, endTime: value })}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-slate-950"
              />
            </label>
            <button disabled={saving} className="mt-auto flex h-11 items-center justify-center gap-2 rounded-xl bg-black font-bold text-white">
              <Save size={17} /> {draft.id ? tr(language, "حفظ التعديل", "Save Changes") : tr(language, "إنشاء شفت", "Create Shift")}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold">
              {tr(language, "فترة السماح بالتأخير — بالدقائق", "Late Grace Period — minutes")}
              <HabatNumberInput
                min={0}
                max={240}
                value={draft.graceMinutes}
                onValueChange={value => setDraft({ ...draft, graceMinutes: Number(value) })}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"
              />
            </label>
            <label className="text-sm font-semibold">
              {tr(language, "سماح الانصراف المبكر — بالدقائق", "Early Leave Allowance — minutes")}
              <HabatNumberInput
                min={0}
                max={240}
                value={draft.earlyLeaveToleranceMinutes}
                onValueChange={value =>
                  setDraft({ ...draft, earlyLeaveToleranceMinutes: Number(value) })
                }
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"
              />
            </label>
          </div>


          {draft.id ? (
            <button
              type="button"
              onClick={() => setDraft(emptyShift)}
              className="text-sm font-bold text-slate-500"
            >
              {tr(language, "إلغاء التعديل", "Cancel Edit")}
            </button>
          ) : null}
          <ErrorBox message={error} />
        </form>
      </Panel>

      <Panel title={tr(language, "الشفتات الحالية", "Current Shifts")}>
        <div className="grid gap-3 lg:grid-cols-2">
          {shifts.map(shift => (
            <div key={shift.id} className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">{shift.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatHabatShiftRange(shift.startTime, shift.endTime, language)} · {tr(language, "سماح", "Grace")} {shift.graceMinutes} {tr(language, "د", "min")}
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
  const { language } = useLanguage();
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
      <Panel title={tr(language, "سجل الحضور", "Attendance Records")} subtitle={tr(language, "فلترة السجلات ومراجعة التأخير والانصراف والتصحيحات", "Filter records and review late arrivals, early departures, and corrections")}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <HabatDatePicker value={from} onChange={setFrom} />
          <HabatDatePicker value={to} onChange={setTo} />
          <input placeholder={tr(language, "بريد الموظف", "Employee Email")} value={email} onChange={event => setEmail(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3" />
          <select value={status} onChange={event => setStatus(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3">
            <option value="">{tr(language, "كل الحالات", "All Statuses")}</option>
            <option value="present">{tr(language, "حاضر", "Present")}</option>
            <option value="late">{tr(language, "متأخر", "Late")}</option>
            <option value="early_leave">{tr(language, "انصراف مبكر", "Early Leave")}</option>
            <option value="late_early_leave">{tr(language, "متأخر + انصراف مبكر", "Late + Early Leave")}</option>
          </select>
          <button onClick={() => void refresh()} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-black font-bold text-white">
            <RefreshCw size={17} /> {tr(language, "تحديث", "Refresh")}
          </button>
        </div>
        <div className="mt-4"><ErrorBox message={error} /></div>
      </Panel>

      <Panel title={`${tr(language, "السجلات", "Records")} (${records.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-start text-sm">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-3 py-3">{tr(language, "الموظف", "Employee")}</th>
                <th className="px-3 py-3">{tr(language, "التاريخ", "Date")}</th>
                <th className="px-3 py-3">{tr(language, "الحالة", "Status")}</th>
                <th className="px-3 py-3">{tr(language, "الحضور", "Clock In")}</th>
                <th className="px-3 py-3">{tr(language, "الانصراف", "Clock Out")}</th>
                <th className="px-3 py-3">{tr(language, "التأخير", "Late")}</th>
                <th className="px-3 py-3">{tr(language, "الخروج المبكر", "Early Leave")}</th>
                <th className="px-3 py-3">{tr(language, "العمل", "Worked")}</th>
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
                  <td className="px-3 py-3">{record.lateMinutes ? language === "ar" ? `${record.lateMinutes} د` : `${record.lateMinutes} min` : "—"}</td>
                  <td className="px-3 py-3">{record.earlyLeaveMinutes ? language === "ar" ? `${record.earlyLeaveMinutes} د` : `${record.earlyLeaveMinutes} min` : "—"}</td>
                  <td className="px-3 py-3">{record.workedMinutes == null ? "—" : formatMinutes(record.workedMinutes)}</td>
                  <td className="px-3 py-3">
                    <button onClick={() => openCorrection(record)} className="rounded-xl border border-slate-200 p-2" title={tr(language, "تصحيح", "Correct")}>
                      <Edit3 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!records.length ? <p className="py-8 text-center text-slate-500">{tr(language, "لا توجد سجلات ضمن الفترة.", "No records in this period.")}</p> : null}
      </Panel>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <form onSubmit={correct} className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-black">{tr(language, "تصحيح سجل الحضور", "Correct Attendance Record")}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {editing.displayName || editing.accountEmail} · {formatDate(editing.attendanceDate)}
            </p>
            <div className="mt-5 grid gap-3">
              <label className="text-sm font-bold">
                {tr(language, "وقت الحضور", "Clock-in Time")}
                <HabatDatePicker mode="datetime" value={checkInAt} onChange={setCheckInAt} className="mt-2" />
              </label>
              <label className="text-sm font-bold">
                {tr(language, "وقت الانصراف", "Clock-out Time")}
                <HabatDatePicker mode="datetime" value={checkOutAt} onChange={setCheckOutAt} className="mt-2" />
              </label>
              <label className="text-sm font-bold">
                {tr(language, "سبب التصحيح", "Correction Reason")}
                <textarea value={reason} onChange={event => setReason(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3" required />
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-black font-bold text-white">
                <Save size={17} /> {tr(language, "حفظ التصحيح", "Save Correction")}
              </button>
              <button type="button" onClick={() => setEditing(null)} className="h-11 rounded-xl border border-slate-200 px-5 font-bold">
                {tr(language, "إلغاء", "Cancel")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function ReportsPage() {
  const { language } = useLanguage();
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
      <Panel title={tr(language, "التقارير", "Reports")} subtitle={tr(language, "ملخص الحضور والغياب والتأخير وساعات العمل", "Attendance, absence, lateness, and worked-hours summary")}>
        <div className="flex flex-wrap gap-3">
          <HabatDatePicker value={from} onChange={setFrom} />
          <HabatDatePicker value={to} onChange={setTo} />
          <button onClick={() => void refresh()} className="flex h-11 items-center gap-2 rounded-xl bg-black px-5 font-bold text-white">
            <BarChart3 size={17} /> {tr(language, "تحديث التقرير", "Refresh Report")}
          </button>
        </div>
        <div className="mt-4"><ErrorBox message={error} /></div>
      </Panel>

      {totals ? (
        <Panel title={tr(language, "ملخص الفترة", "Period Summary")}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [tr(language, "أيام الدوام", "Scheduled Days"), totals.scheduledDays],
              [tr(language, "الحضور", "Clock In"), totals.attendedDays],
              [tr(language, "الغياب", "Absence"), totals.absentDays],
              [tr(language, "التأخير", "Late"), totals.lateDays],
              [tr(language, "الخروج المبكر", "Early Leave"), totals.earlyLeaveDays],
              [tr(language, "بدون انصراف", "Missing Clock-out"), totals.incompleteDays],
              [tr(language, "ساعات العمل", "Worked Hours"), formatMinutes(totals.workedMinutes)],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-black">{value}</p>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel title={tr(language, "حسب الموظف", "By Employee")}>
        {report?.employees.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-start text-sm">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-3">{tr(language, "الموظف", "Employee")}</th>
                  <th className="px-3 py-3">{tr(language, "دوام", "Scheduled")}</th>
                  <th className="px-3 py-3">{tr(language, "حضور", "Attendance")}</th>
                  <th className="px-3 py-3">{tr(language, "غياب", "Absence")}</th>
                  <th className="px-3 py-3">{tr(language, "تأخير", "Late")}</th>
                  <th className="px-3 py-3">{tr(language, "مبكر", "Early")}</th>
                  <th className="px-3 py-3">{tr(language, "بدون انصراف", "Missing Clock-out")}</th>
                  <th className="px-3 py-3">{tr(language, "ساعات", "Hours")}</th>
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
          <p className="py-8 text-center text-slate-500">{tr(language, "لا توجد بيانات للفترة.", "No data for this period.")}</p>
        )}
      </Panel>
    </div>
  );
}

export function SettingsPage({ onDataChanged }: PageProps) {
  const { language } = useLanguage();
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
      setError(tr(language, "المتصفح لا يدعم تحديد الموقع.", "This browser does not support geolocation."));
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
        setError(tr(language, "تعذر الحصول على الموقع. اسمح للموقع من إعدادات المتصفح.", "Unable to get your location. Allow location access in browser settings."));
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
      setMessage(tr(language, "تم حفظ إعدادات الحضور.", "Attendance settings saved."));
      await onDataChanged?.();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <Panel title={tr(language, "الإعدادات", "Settings")}><p className="py-8 text-center text-slate-500">{tr(language, "جاري التحميل...", "Loading...")}</p></Panel>;
  }

  return (
    <Panel title={tr(language, "إعدادات الحضور", "Attendance Settings")} subtitle={tr(language, "موقع الفرع ونطاق البصمة ودقة GPS", "Branch location, attendance radius, and GPS accuracy")}>
      <form onSubmit={save} className="space-y-5">
        <div className="rounded-2xl bg-slate-50 p-4">
          <label className="flex items-center gap-3 font-bold">
            <input
              type="checkbox"
              checked={settings.locationRequired}
              onChange={event => setSettings({ ...settings, locationRequired: event.target.checked })}
              className="h-5 w-5"
            />
            {tr(language, "إلزام الموظف بالتواجد داخل نطاق الفرع وقت البصمة", "Require employee to be inside the branch geofence when clocking")}
          </label>
          <p className="mt-2 text-xs text-slate-500">
            {tr(language, "عند التفعيل يعتمد القرار على GPS في السيرفر، وليس على الواجهة فقط.", "When enabled, GPS validation is enforced by the server, not only the interface.")}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-bold">
            Latitude
            <HabatNumberInput
              step="any"
              value={settings.latitude ?? ""}
              onValueChange={value =>
                setSettings({
                  ...settings,
                  latitude: value === "" ? null : Number(value),
                })
              }
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>
          <label className="text-sm font-bold">
            Longitude
            <HabatNumberInput
              step="any"
              value={settings.longitude ?? ""}
              onValueChange={value =>
                setSettings({
                  ...settings,
                  longitude: value === "" ? null : Number(value),
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
          <LocateFixed size={18} /> {locating ? tr(language, "جاري تحديد الموقع...", "Locating...") : tr(language, "استخدام موقعي الحالي كموقع الفرع", "Use My Current Location as Branch Location")}
        </button>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-bold">
            {tr(language, "نصف قطر الحضور بالمتر", "Attendance Radius in Meters")}
            <HabatNumberInput
              min={10}
              max={5000}
              value={settings.radiusM}
              onValueChange={value => setSettings({ ...settings, radiusM: Number(value) })}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>
          <label className="text-sm font-bold">
            {tr(language, "أقصى دقة GPS مقبولة بالمتر", "Maximum Accepted GPS Accuracy in Meters")}
            <HabatNumberInput
              min={10}
              max={1000}
              value={settings.maxAccuracyM}
              onValueChange={value =>
                setSettings({ ...settings, maxAccuracyM: Number(value) })
              }
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button disabled={saving} className="flex h-11 items-center gap-2 rounded-xl bg-black px-5 font-bold text-white">
            <Save size={17} /> {saving ? tr(language, "جاري الحفظ", "Saving...") : tr(language, "حفظ الإعدادات", "Save Settings")}
          </button>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 text-sm text-slate-600">
            <MapPin size={16} />
            {tr(language, "المنطقة الزمنية: Asia/Riyadh", "Timezone: Asia/Riyadh")}
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
