import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  CheckCircle2,
  Clock3,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

import { auth } from "@/_core/firebase";
import { resolveLoginEmailForAuth } from "@/lib/loginIdentity";

type HabatPrincipal = {
  uid: string | null;
  email: string | null;
  displayName: string | null;
  accessLevel: "employee" | "manager";
  canManage: boolean;
  canClock: boolean;
  bootstrapOwner?: boolean;
};

type HabatRecord = {
  id: string;
  accountUid: string;
  accountEmail: string | null;
  displayName: string | null;
  attendanceDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  notes?: string | null;
};

type HabatAccessAccount = {
  id: string;
  uid: string | null;
  email: string;
  displayName: string | null;
  accessLevel: "employee" | "manager";
  clockEnabled: boolean;
  isActive: boolean;
};

type MePayload = {
  ok: true;
  principal: HabatPrincipal;
  today: HabatRecord | null;
  date: string;
};

type AccessState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "forbidden"; message: string }
  | {
      status: "ready";
      principal: HabatPrincipal;
      today: HabatRecord | null;
      date: string;
    };

class HabatApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function habatApi<T>(path: string, init?: RequestInit): Promise<T> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new HabatApiError(401, "authentication_required");
  }

  const token = await currentUser.getIdToken();
  const headers = new Headers(init?.headers || {});
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/habat-api/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload) {
    throw new HabatApiError(
      response.status,
      String(payload?.message || `habat_http_${response.status}`)
    );
  }

  return payload as T;
}

function friendlyApiError(error: unknown) {
  const code =
    error instanceof HabatApiError
      ? error.code
      : String((error as { message?: unknown })?.message || "");

  switch (code) {
    case "habat_access_forbidden":
      return "هذا الحساب غير مصرح له بالدخول إلى نظام حبات الورق.";
    case "habat_clock_forbidden":
      return "هذا الحساب لديه صلاحية دخول فقط ولا يمكنه تسجيل الحضور والانصراف.";
    case "habat_already_checked_in":
      return "تم تسجيل حضورك مسبقًا اليوم.";
    case "habat_check_in_required":
      return "يجب تسجيل الحضور أولًا قبل تسجيل الانصراف.";
    case "habat_already_checked_out":
      return "تم تسجيل انصرافك مسبقًا اليوم.";
    case "habat_attendance_database_unavailable":
    case "habat_access_lookup_failed":
    case "habat_records_query_failed":
      return "قاعدة حضور حبات الورق لم تكتمل تهيئتها بعد.";
    default:
      return "تعذر تنفيذ العملية الآن. حاول مرة أخرى.";
  }
}

async function loadMe(user: User): Promise<AccessState> {
  void user;
  try {
    const payload = await habatApi<MePayload>("me");
    return {
      status: "ready",
      principal: payload.principal,
      today: payload.today,
      date: payload.date,
    };
  } catch (error) {
    return { status: "forbidden", message: friendlyApiError(error) };
  }
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "flex items-center gap-3" : "text-center"}>
      <div
        className={
          compact
            ? "flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-black"
            : "mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-[28px] bg-black shadow-sm"
        }
      >
        <img
          src="/habat-alwaraq-logo.svg"
          alt="حبات الورق"
          className="h-full w-full object-contain"
        />
      </div>
      <div className={compact ? "text-right" : "mt-4"}>
        <h1
          className={
            compact
              ? "text-lg font-black"
              : "text-3xl font-black tracking-tight"
          }
        >
          حبات الورق
        </h1>
        <p className="mt-1 text-xs font-semibold tracking-[0.18em] text-slate-500">
          نظام الحضور والانصراف
        </p>
      </div>
    </div>
  );
}

function LoginScreen() {
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const email = await resolveLoginEmailForAuth(identity);
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError("بيانات الدخول غير صحيحة أو الحساب غير موجود.");
      setBusy(false);
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#f5f5f3] px-4 py-10 text-slate-950"
    >
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <section className="w-full rounded-[32px] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/40 sm:p-9">
          <Brand />
          <div className="my-7 h-px bg-slate-100" />
          <div className="mb-5">
            <h2 className="text-xl font-black">تسجيل الدخول</h2>
            <p className="mt-1 text-sm text-slate-500">
              الدخول مخصص للحسابات المصرح لها فقط
            </p>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <label className="mb-2 block text-sm font-semibold">
                البريد أو اسم المستخدم
              </label>
              <input
                value={identity}
                onChange={event => setIdentity(event.target.value)}
                autoComplete="username"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 outline-none transition focus:border-slate-900 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">
                كلمة المرور
              </label>
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="current-password"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 outline-none transition focus:border-slate-900 focus:bg-white"
              />
            </div>
            {error ? (
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !identity.trim() || !password}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-black font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogIn size={18} />
              {busy ? "جاري الدخول..." : "دخول"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleTimeString("ar-SA", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("ar-SA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function LiveRiyadhClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="rounded-2xl bg-slate-100 px-5 py-4">
      <div className="flex items-center gap-2 font-black">
        <Clock3 size={18} />
        {now.toLocaleTimeString("ar-SA", {
          timeZone: "Asia/Riyadh",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
      <p className="mt-1 text-xs text-slate-500">بتوقيت الرياض</p>
    </div>
  );
}

function AttendanceCard({
  principal,
  today,
  onRefresh,
}: {
  principal: HabatPrincipal;
  today: HabatRecord | null;
  onRefresh: (next?: HabatRecord | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"check-in" | "check-out" | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const checkedIn = Boolean(today?.checkInAt);
  const checkedOut = Boolean(today?.checkOutAt);

  async function clock(type: "check-in" | "check-out") {
    if (busy) return;

    setBusy(type);
    setMessage("");
    setError("");

    try {
      const payload = await habatApi<{ ok: true; record: HabatRecord }>(
        type,
        {
          method: "POST",
          body: "{}",
        }
      );
      await onRefresh(payload.record);
      setMessage(
        type === "check-in"
          ? "تم تسجيل الحضور بنجاح."
          : "تم تسجيل الانصراف بنجاح."
      );
    } catch (caught) {
      setError(friendlyApiError(caught));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">مرحبًا</p>
          <h2 className="mt-1 text-2xl font-black">
            {principal.displayName || principal.email || "المستخدم"}
          </h2>
          <p className="mt-2 text-sm text-slate-500">{principal.email}</p>
        </div>
        <LiveRiyadhClock />
      </div>

      {principal.canClock ? (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <button
              onClick={() => clock("check-in")}
              disabled={busy !== "" || checkedIn}
              className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-[24px] bg-black px-5 text-white shadow-lg shadow-black/10 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LogIn size={30} />
              <span className="text-xl font-black">
                {busy === "check-in" ? "جاري التسجيل..." : "تسجيل حضور"}
              </span>
            </button>
            <button
              onClick={() => clock("check-out")}
              disabled={busy !== "" || !checkedIn || checkedOut}
              className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-[24px] border-2 border-slate-900 bg-white px-5 text-slate-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <LogOut size={30} />
              <span className="text-xl font-black">
                {busy === "check-out"
                  ? "جاري التسجيل..."
                  : "تسجيل انصراف"}
              </span>
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-emerald-50 px-4 py-4">
              <p className="text-xs font-semibold text-emerald-700">
                وقت الحضور
              </p>
              <p className="mt-1 text-xl font-black text-emerald-950">
                {formatTime(today?.checkInAt)}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 px-4 py-4">
              <p className="text-xs font-semibold text-slate-500">
                وقت الانصراف
              </p>
              <p className="mt-1 text-xl font-black">
                {formatTime(today?.checkOutAt)}
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-7 rounded-2xl bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-800">
          هذا حساب إدارة فقط. لا يوجد تسجيل حضور وانصراف لهذا الحساب.
        </div>
      )}

      {message ? (
        <p className="mt-5 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 size={18} /> {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function ManagerPanel() {
  const [records, setRecords] = useState<HabatRecord[]>([]);
  const [accounts, setAccounts] = useState<HabatAccessAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accessLevel, setAccessLevel] = useState<"employee" | "manager">(
    "employee"
  );
  const [clockEnabled, setClockEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [recordsPayload, accountsPayload] = await Promise.all([
        habatApi<{ ok: true; records: HabatRecord[] }>("records?limit=150"),
        habatApi<{ ok: true; accounts: HabatAccessAccount[] }>("access"),
      ]);
      setRecords(recordsPayload.records || []);
      setAccounts(accountsPayload.accounts || []);
    } catch (caught) {
      setError(friendlyApiError(caught));
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
    } catch (caught) {
      setError(friendlyApiError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function removeAccount(account: HabatAccessAccount) {
    if (
      !window.confirm(`إلغاء صلاحية ${account.displayName || account.email}؟`)
    ) {
      return;
    }

    setError("");
    try {
      await habatApi(`access/${encodeURIComponent(account.id)}`, {
        method: "DELETE",
      });
      await refresh();
    } catch (caught) {
      setError(friendlyApiError(caught));
    }
  }

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-black p-3 text-white">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="font-black">إدارة حبات الورق</h2>
              <p className="text-sm text-slate-500">
                الحسابات المصرح لها وسجل الحضور المستقل
              </p>
            </div>
          </div>
          <button
            onClick={() => void refresh()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold hover:bg-slate-50"
          >
            <RefreshCw size={16} /> تحديث
          </button>
        </div>

        <form
          onSubmit={addAccount}
          className="mt-6 grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2 lg:grid-cols-5"
        >
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            value={email}
            onChange={event => setEmail(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-slate-900 lg:col-span-2"
            required
          />
          <input
            placeholder="الاسم"
            value={displayName}
            onChange={event => setDisplayName(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-slate-900"
          />
          <select
            value={accessLevel}
            onChange={event =>
              setAccessLevel(event.target.value as "employee" | "manager")
            }
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none"
          >
            <option value="employee">موظف</option>
            <option value="manager">إدارة</option>
          </select>
          <button
            disabled={saving || !email.trim()}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 font-bold text-white disabled:opacity-50"
          >
            <Plus size={17} /> {saving ? "جاري الإضافة" : "إضافة حساب"}
          </button>
          <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2 lg:col-span-5">
            <input
              type="checkbox"
              checked={clockEnabled}
              onChange={event => setClockEnabled(event.target.checked)}
              className="h-4 w-4"
            />
            يسمح لهذا الحساب بتسجيل الحضور والانصراف
          </label>
        </form>

        {error ? (
          <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Users size={20} />
            <h3 className="font-black">الحسابات المصرح لها</h3>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">
              جاري التحميل...
            </p>
          ) : accounts.length ? (
            <div className="space-y-2">
              {accounts.map(account => (
                <div
                  key={account.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">
                      {account.displayName || account.email}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {account.email}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">
                      {account.accessLevel === "manager" ? "إدارة" : "موظف"}
                      {account.clockEnabled
                        ? " · حضور وانصراف"
                        : " · بدون بصمة"}
                    </p>
                  </div>
                  <button
                    onClick={() => void removeAccount(account)}
                    className="rounded-xl p-2 text-red-600 hover:bg-red-50"
                    title="إلغاء الصلاحية"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              لم تتم إضافة حسابات بعد.
            </p>
          )}
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Clock3 size={20} />
            <h3 className="font-black">آخر سجلات الحضور</h3>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">
              جاري التحميل...
            </p>
          ) : records.length ? (
            <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
              {records.map(record => (
                <div
                  key={record.id}
                  className="rounded-2xl border border-slate-100 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">
                        {record.displayName || record.accountEmail || "موظف"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {record.accountEmail}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      {formatDate(record.attendanceDate)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-emerald-50 px-3 py-2">
                      <span className="text-xs text-emerald-700">حضور</span>
                      <p className="font-black">
                        {formatTime(record.checkInAt)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-100 px-3 py-2">
                      <span className="text-xs text-slate-500">انصراف</span>
                      <p className="font-black">
                        {formatTime(record.checkOutAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              لا توجد سجلات حتى الآن.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function AttendanceHome({
  access,
  setAccess,
}: {
  access: Extract<AccessState, { status: "ready" }>;
  setAccess: Dispatch<SetStateAction<AccessState>>;
}) {
  const refreshMe = useCallback(
    async (optimisticRecord?: HabatRecord | null) => {
      if (optimisticRecord !== undefined) {
        setAccess(current =>
          current.status === "ready"
            ? { ...current, today: optimisticRecord }
            : current
        );
      }

      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const next = await loadMe(currentUser);
      setAccess(next);
    },
    [setAccess]
  );

  return (
    <main dir="rtl" className="min-h-screen bg-[#f5f5f3] text-slate-950">
      <header className="border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Brand compact />
          <button
            onClick={() => signOut(auth)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            تسجيل الخروج
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <AttendanceCard
          principal={access.principal}
          today={access.today}
          onRefresh={refreshMe}
        />
        {access.principal.canManage ? <ManagerPanel /> : null}
      </div>
    </main>
  );
}

export default function HabatAttendanceApp() {
  const [access, setAccess] = useState<AccessState>({ status: "loading" });

  useEffect(() => {
    return onAuthStateChanged(auth, async user => {
      if (!user) {
        setAccess({ status: "signed-out" });
        return;
      }

      setAccess({ status: "loading" });
      setAccess(await loadMe(user));
    });
  }, []);

  const loadingCopy = useMemo(
    () => "جاري التحقق من صلاحية الحساب...",
    []
  );

  if (access.status === "loading") {
    return (
      <main
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-[#f5f5f3] px-4 font-bold text-slate-600"
      >
        <div className="text-center">
          <RefreshCw className="mx-auto mb-3 animate-spin" size={24} />
          {loadingCopy}
        </div>
      </main>
    );
  }

  if (access.status === "signed-out") return <LoginScreen />;

  if (access.status === "forbidden") {
    return (
      <main
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-[#f5f5f3] px-4"
      >
        <section className="w-full max-w-md rounded-[28px] border border-red-100 bg-white p-8 text-center shadow-sm">
          <Brand />
          <p className="mt-7 rounded-2xl bg-red-50 px-4 py-4 text-sm font-semibold text-red-700">
            {access.message}
          </p>
          <button
            onClick={() => signOut(auth)}
            className="mt-5 rounded-2xl bg-black px-5 py-3 font-bold text-white"
          >
            العودة لتسجيل الدخول
          </button>
        </section>
      </main>
    );
  }

  return <AttendanceHome access={access} setAccess={setAccess} />;
}
