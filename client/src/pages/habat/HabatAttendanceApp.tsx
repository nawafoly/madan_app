import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { Clock3, LogIn, LogOut, ShieldCheck } from "lucide-react";

import { auth } from "@/_core/firebase";
import { resolveLoginEmailForAuth } from "@/lib/loginIdentity";

const API_URL = (import.meta.env.VITE_HR_CORE_API_URL ?? "").trim().replace(/\/$/, "");

type AccessState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "forbidden"; message: string }
  | {
      status: "ready";
      displayName: string;
      email: string;
      canManage: boolean;
    };

function hasPermission(list: unknown, key: string) {
  return Array.isArray(list) && list.some(value => String(value) === key);
}

async function loadHabatAccess(user: User): Promise<AccessState> {
  if (!API_URL) {
    return { status: "forbidden", message: "إعداد رابط النظام غير مكتمل." };
  }

  const token = await user.getIdToken();
  const response = await fetch(`${API_URL}/api/hr/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    return { status: "forbidden", message: "تعذر التحقق من صلاحية الحساب." };
  }

  const payload = await response.json();
  const permissions = payload?.permissions ?? [];
  const role = String(payload?.account?.roleKey ?? payload?.account?.role_key ?? "");
  const access = role === "owner" || hasPermission(permissions, "habat_attendance.access");
  const canManage = role === "owner" || hasPermission(permissions, "habat_attendance.manage");

  if (!access) {
    return {
      status: "forbidden",
      message: "هذا الحساب غير مصرح له بالدخول إلى نظام حبات الورق.",
    };
  }

  return {
    status: "ready",
    displayName:
      String(payload?.account?.displayName ?? payload?.account?.display_name ?? "").trim() ||
      user.displayName ||
      "المستخدم",
    email: user.email || "",
    canManage,
  };
}

function Brand() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 shadow-sm">
        <span className="text-3xl font-black">ح</span>
      </div>
      <h1 className="text-3xl font-black tracking-tight text-slate-900">حبات الورق</h1>
      <p className="mt-1 text-xs font-semibold tracking-[0.24em] text-emerald-700">HABBAT ALWARAQ</p>
    </div>
  );
}

function LoginScreen() {
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const email = await resolveLoginEmailForAuth(identity);
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError("بيانات الدخول غير صحيحة أو الحساب غير مصرح له.");
      setBusy(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#f7f8f4] px-4 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <section className="w-full rounded-[32px] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50 sm:p-9">
          <Brand />
          <div className="my-7 h-px bg-slate-100" />
          <div className="mb-5">
            <h2 className="text-xl font-bold">تسجيل الدخول</h2>
            <p className="mt-1 text-sm text-slate-500">نظام الحضور والانصراف الخاص بحبات الورق</p>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <label className="mb-2 block text-sm font-semibold">البريد أو اسم المستخدم</label>
              <input
                value={identity}
                onChange={e => setIdentity(e.target.value)}
                autoComplete="username"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 outline-none transition focus:border-emerald-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">كلمة المرور</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 outline-none transition focus:border-emerald-500 focus:bg-white"
              />
            </div>
            {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            <button
              type="submit"
              disabled={busy || !identity.trim() || !password}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
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

function AttendanceHome({ access }: { access: Extract<AccessState, { status: "ready" }> }) {
  const now = useMemo(() => new Date(), []);

  return (
    <main dir="rtl" className="min-h-screen bg-[#f7f8f4] text-slate-900">
      <header className="border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <p className="font-black">حبات الورق</p>
            <p className="text-xs text-slate-500">نظام الحضور والانصراف</p>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            تسجيل الخروج
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-500">مرحبًا</p>
              <h1 className="mt-1 text-2xl font-black">{access.displayName}</h1>
              <p className="mt-2 text-sm text-slate-500">{access.email}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-5 py-4 text-emerald-800">
              <div className="flex items-center gap-2 font-bold">
                <Clock3 size={18} />
                {now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <p className="mt-1 text-xs">{now.toLocaleDateString("ar-SA")}</p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <button className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-[24px] bg-emerald-700 px-5 text-white shadow-lg shadow-emerald-900/10 transition hover:bg-emerald-800">
              <LogIn size={30} />
              <span className="text-xl font-black">تسجيل حضور</span>
            </button>
            <button className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-[24px] bg-slate-900 px-5 text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800">
              <LogOut size={30} />
              <span className="text-xl font-black">تسجيل انصراف</span>
            </button>
          </div>

          <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            واجهة حبات الورق أصبحت معزولة عن موقع معدن. ربط أزرار الحضور بالسجل المستقل هو المرحلة التالية.
          </p>
        </section>

        {access.canManage ? (
          <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3"><ShieldCheck size={22} /></div>
              <div>
                <h2 className="font-black">إدارة حبات الورق</h2>
                <p className="text-sm text-slate-500">هذا الحساب لديه صلاحية إدارة حضور الفرع.</p>
              </div>
            </div>
          </section>
        ) : null}
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
      setAccess(await loadHabatAccess(user));
    });
  }, []);

  if (access.status === "loading") {
    return <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f7f8f4] font-bold text-slate-600">جاري التحقق من الحساب...</main>;
  }

  if (access.status === "signed-out") return <LoginScreen />;

  if (access.status === "forbidden") {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f7f8f4] px-4">
        <section className="w-full max-w-md rounded-[28px] border border-red-100 bg-white p-8 text-center shadow-sm">
          <Brand />
          <p className="mt-7 rounded-2xl bg-red-50 px-4 py-4 text-sm font-semibold text-red-700">{access.message}</p>
          <button onClick={() => signOut(auth)} className="mt-5 rounded-2xl bg-slate-900 px-5 py-3 font-bold text-white">العودة لتسجيل الدخول</button>
        </section>
      </main>
    );
  }

  return <AttendanceHome access={access} />;
}
