import {
  BarChart3,
  CalendarClock,
  Clock3,
  FileClock,
  LogIn,
  LogOut,
  RefreshCw,
  Settings2,
  ShieldCheck,
  UserCog,
  UserRound,
  Users,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { auth } from "@/_core/firebase";
import { resolveLoginEmailForAuth } from "@/lib/loginIdentity";
import HabatAccountManagement from "./HabatAccountManagement";
import {
  DashboardPage,
  EmployeesPage,
  RecordsPage,
  ReportsPage,
  ShiftsPage,
} from "./HabatAttendanceAdmin";
import HabatAttendanceSettings from "./HabatAttendanceSettings";
import {
  AuditLogPage,
  EmployeePortalPage,
} from "./HabatAttendancePortal";
import {
  formatDate,
  formatMinutes,
  formatTime,
  friendlyHabatError,
  habatApi,
  readBrowserLocation,
  shiftDateKey,
  statusLabel,
  todayRiyadhKey,
  type HabatContext,
  type HabatRecord,
} from "./habatAttendanceClient";

type AccessState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "forbidden"; message: string }
  | { status: "ready"; context: HabatContext };

type PageKey =
  | "dashboard"
  | "profile"
  | "clock"
  | "history"
  | "employees"
  | "accounts"
  | "shifts"
  | "records"
  | "reports"
  | "audit"
  | "settings";

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "flex items-center gap-3" : "text-center"}>
      <div
        className={
          compact
            ? "flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-black"
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
        <h1 className={compact ? "text-lg font-black" : "text-3xl font-black tracking-tight"}>
          حبات الورق
        </h1>
        <p className="mt-1 text-xs font-semibold tracking-[0.12em] text-slate-500">
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
    <main dir="rtl" className="min-h-screen bg-[#f5f5f3] px-4 py-10 text-slate-950">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <section className="w-full rounded-[32px] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/40 sm:p-9">
          <Brand />
          <div className="my-7 h-px bg-slate-100" />
          <div className="mb-5">
            <h2 className="text-xl font-black">تسجيل الدخول</h2>
            <p className="mt-1 text-sm text-slate-500">الدخول للحسابات المصرح لها فقط</p>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <label className="block text-sm font-semibold">
              البريد أو اسم المستخدم
              <input
                value={identity}
                onChange={event => setIdentity(event.target.value)}
                autoComplete="username"
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 outline-none focus:border-slate-900 focus:bg-white"
              />
            </label>
            <label className="block text-sm font-semibold">
              كلمة المرور
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="current-password"
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 outline-none focus:border-slate-900 focus:bg-white"
              />
            </label>
            {error ? (
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !identity.trim() || !password}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-black font-bold text-white disabled:opacity-50"
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

function LiveClock() {
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

function ClockPage({
  context,
  onRefresh,
}: {
  context: HabatContext;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<"check-in" | "check-out" | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const record = context.today;
  const checkedIn = Boolean(record?.checkInAt);
  const checkedOut = Boolean(record?.checkOutAt);

  async function clock(type: "check-in" | "check-out") {
    if (busy) return;
    setBusy(type);
    setMessage("");
    setError("");

    try {
      let location: { latitude?: number; longitude?: number; accuracyM?: number } = {};
      try {
        location = await readBrowserLocation(context.settings.locationRequired);
      } catch {
        setError("تعذر الحصول على موقعك. فعّل إذن الموقع وGPS ثم حاول مرة أخرى.");
        return;
      }

      await habatApi(`v2/${type}`, {
        method: "POST",
        body: JSON.stringify(location),
      });
      await onRefresh();
      setMessage(type === "check-in" ? "تم تسجيل الحضور بنجاح." : "تم تسجيل الانصراف بنجاح.");
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-slate-500">مرحبًا</p>
            <h2 className="mt-1 text-2xl font-black">
              {context.principal.displayName || context.principal.email || "المستخدم"}
            </h2>
            <p className="mt-2 text-sm text-slate-500">{context.principal.email}</p>
          </div>
          <LiveClock />
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-500">الشفت</p>
            <p className="mt-1 font-black">{context.shift?.name || "غير محدد"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-500">وقت الدوام</p>
            <p className="mt-1 font-black">
              {context.shift ? `${context.shift.startTime} → ${context.shift.endTime}` : "—"}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-500">الموقع</p>
            <p className="mt-1 font-black">
              {context.settings.locationRequired
                ? `إلزامي · ${context.settings.radiusM} م`
                : "غير إلزامي"}
            </p>
          </div>
        </div>

        {context.principal.canClock ? (
          <>
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              <button
                onClick={() => void clock("check-in")}
                disabled={busy !== "" || checkedIn}
                className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-[24px] bg-black px-5 text-white transition disabled:cursor-not-allowed disabled:opacity-35"
              >
                <LogIn size={28} />
                <span className="text-xl font-black">
                  {busy === "check-in" ? "جاري التسجيل..." : "تسجيل حضور"}
                </span>
              </button>
              <button
                onClick={() => void clock("check-out")}
                disabled={busy !== "" || !checkedIn || checkedOut}
                className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-[24px] border-2 border-slate-900 bg-white px-5 transition disabled:cursor-not-allowed disabled:opacity-35"
              >
                <LogOut size={28} />
                <span className="text-xl font-black">
                  {busy === "check-out" ? "جاري التسجيل..." : "تسجيل انصراف"}
                </span>
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs font-bold text-emerald-700">الحضور</p>
                <p className="mt-1 text-xl font-black">{formatTime(record?.checkInAt)}</p>
              </div>
              <div className="rounded-2xl bg-slate-100 p-4">
                <p className="text-xs font-bold text-slate-500">الانصراف</p>
                <p className="mt-1 text-xl font-black">{formatTime(record?.checkOutAt)}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-xs font-bold text-amber-700">الحالة</p>
                <p className="mt-1 font-black">{statusLabel(record?.attendanceStatus)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-500">ساعات العمل</p>
                <p className="mt-1 font-black">
                  {record?.workedMinutes == null ? "—" : formatMinutes(record.workedMinutes)}
                </p>
              </div>
            </div>

            {record?.lateMinutes ? (
              <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                التأخير: {record.lateMinutes} دقيقة
              </p>
            ) : null}
            {record?.earlyLeaveMinutes ? (
              <p className="mt-3 rounded-2xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">
                الانصراف المبكر: {record.earlyLeaveMinutes} دقيقة
              </p>
            ) : null}
          </>
        ) : (
          <div className="mt-7 rounded-2xl bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-800">
            هذا حساب إدارة فقط. لتسجيل الحضور أضفه ضمن الموظفين وفعّل صلاحية البصمة.
          </div>
        )}

        {message ? (
          <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function MyHistoryPage() {
  const today = todayRiyadhKey();
  const [from, setFrom] = useState(shiftDateKey(today, -30));
  const [to, setTo] = useState(today);
  const [records, setRecords] = useState<HabatRecord[]>([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const payload = await habatApi<{ ok: true; records: HabatRecord[] }>(
        `v2/my-history?from=${from}&to=${to}`
      );
      setRecords(payload.records || []);
    } catch (caught) {
      setError(friendlyHabatError(caught));
    }
  }, [from, to]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">سجلي</h2>
          <p className="mt-1 text-sm text-slate-500">سجل حضورك وانصرافك</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="date" value={from} onChange={event => setFrom(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
          <input type="date" value={to} onChange={event => setTo(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-5 space-y-3">
        {records.map(record => (
          <div key={record.id} className="grid gap-3 rounded-2xl border border-slate-100 p-4 md:grid-cols-5">
            <div>
              <p className="text-xs text-slate-500">التاريخ</p>
              <p className="font-bold">{formatDate(record.attendanceDate)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">الحضور</p>
              <p className="font-bold">{formatTime(record.checkInAt)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">الانصراف</p>
              <p className="font-bold">{formatTime(record.checkOutAt)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">الحالة</p>
              <p className="font-bold">{statusLabel(record.attendanceStatus)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">العمل</p>
              <p className="font-bold">
                {record.workedMinutes == null ? "—" : formatMinutes(record.workedMinutes)}
              </p>
            </div>
          </div>
        ))}
        {!records.length ? (
          <p className="py-8 text-center text-sm text-slate-500">لا توجد سجلات في الفترة.</p>
        ) : null}
      </div>
    </section>
  );
}

function AttendanceShell({
  context,
  onContextRefresh,
}: {
  context: HabatContext;
  onContextRefresh: () => Promise<void>;
}) {
  const principal = context.principal;
  const [page, setPage] = useState<PageKey>(principal.canManage ? "dashboard" : "profile");

  const managerItems: Array<{
    key: PageKey;
    label: string;
    icon: typeof Clock3;
  }> = [
    { key: "dashboard", label: "الرئيسية", icon: ShieldCheck },
    { key: "clock", label: "الحضور والانصراف", icon: Clock3 },
    { key: "employees", label: "الموظفون", icon: Users },
    { key: "accounts", label: "إدارة الحسابات", icon: UserCog },
    { key: "shifts", label: "الدوام والشفتات", icon: CalendarClock },
    { key: "records", label: "سجل الحضور", icon: RefreshCw },
    { key: "reports", label: "التقارير", icon: BarChart3 },
    { key: "audit", label: "سجل التدقيق", icon: FileClock },
    { key: "settings", label: "الإعدادات", icon: Settings2 },
  ];

  const employeeItems: typeof managerItems = [
    { key: "profile", label: "صفحتي", icon: UserRound },
    { key: "clock", label: "الحضور والانصراف", icon: Clock3 },
    { key: "history", label: "سجلي", icon: CalendarClock },
  ];

  const items = principal.canManage ? managerItems : employeeItems;

  const content = useMemo(() => {
    switch (page) {
      case "dashboard":
        return <DashboardPage />;
      case "profile":
        return <EmployeePortalPage />;
      case "clock":
        return <ClockPage context={context} onRefresh={onContextRefresh} />;
      case "history":
        return <MyHistoryPage />;
      case "employees":
        return <EmployeesPage onDataChanged={onContextRefresh} />;
      case "accounts":
        return <HabatAccountManagement onDataChanged={onContextRefresh} />;
      case "shifts":
        return <ShiftsPage onDataChanged={onContextRefresh} />;
      case "records":
        return <RecordsPage />;
      case "reports":
        return <ReportsPage />;
      case "audit":
        return <AuditLogPage />;
      case "settings":
        return <HabatAttendanceSettings onDataChanged={onContextRefresh} />;
      default:
        return principal.canManage
          ? <DashboardPage />
          : <EmployeePortalPage />;
    }
  }, [context, onContextRefresh, page, principal.canManage]);

  return (
    <main dir="rtl" className="habat-attendance-shell min-h-screen bg-[#f5f5f3] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 sm:gap-4">
          <Brand compact />
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden text-left sm:block">
              <p className="text-sm font-black">{principal.displayName || principal.email}</p>
              <p className="text-xs text-slate-500">
                {principal.canManage ? "إدارة" : "موظف"}
              </p>
            </div>
            <button
              onClick={() => signOut(auth)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600"
            >
              خروج
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-3 py-4 sm:px-4 sm:py-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-6">
        <div className="lg:hidden">
          <label className="block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="mb-2 block text-xs font-bold text-slate-500">القسم</span>
            <select
              value={page}
              onChange={event => setPage(event.target.value as PageKey)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none"
            >
              {items.map(item => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <aside className="hidden h-fit rounded-[24px] border border-slate-200 bg-white p-2 shadow-sm lg:sticky lg:top-24 lg:block">
          <nav className="flex flex-col gap-2">
            {items.map(item => {
              const Icon = item.icon;
              const active = page === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setPage(item.key)}
                  className={
                    active
                      ? "flex min-w-0 items-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-bold text-white"
                      : "flex min-w-0 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  }
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="min-w-0">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0">{content}</div>
      </div>
    </main>
  );
}

async function loadContext(): Promise<AccessState> {
  try {
    const context = await habatApi<HabatContext>("v2/context");
    return { status: "ready", context };
  } catch (error) {
    return { status: "forbidden", message: friendlyHabatError(error) };
  }
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
      setAccess(await loadContext());
    });
  }, []);

  const refreshContext = useCallback(async () => {
    setAccess(await loadContext());
  }, []);

  if (access.status === "loading") {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f5f5f3] px-4 font-bold text-slate-600">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-3 animate-spin" size={24} />
          جاري تحميل نظام الحضور...
        </div>
      </main>
    );
  }

  if (access.status === "signed-out") return <LoginScreen />;

  if (access.status === "forbidden") {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f5f5f3] px-4">
        <section className="w-full max-w-md rounded-[28px] border border-red-100 bg-white p-8 text-center shadow-sm">
          <Brand />
          <p className="mt-7 rounded-2xl bg-red-50 px-4 py-4 text-sm font-semibold text-red-700">
            {access.message}
          </p>
          <button onClick={() => signOut(auth)} className="mt-5 rounded-2xl bg-black px-5 py-3 font-bold text-white">
            العودة لتسجيل الدخول
          </button>
        </section>
      </main>
    );
  }

  return (
    <AttendanceShell
      context={access.context}
      onContextRefresh={refreshContext}
    />
  );
}
