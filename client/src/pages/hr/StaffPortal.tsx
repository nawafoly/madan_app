import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  Eye,
  EyeOff,
  FileText,
  LockKeyhole,
  Mail,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";

import { auth } from "@/_core/firebase";
import {
  getHomePathForUser,
  hasPermission,
  useAuth,
} from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function PortalAlert({
  tone,
  children,
}: {
  tone: "error" | "info";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm leading-7",
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      )}
    >
      {children}
    </div>
  );
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function friendlyAuthError(code?: string) {
  switch (code) {
    case "auth/invalid-email":
      return "البريد الإلكتروني غير صحيح.";
    case "auth/missing-password":
      return "اكتب كلمة المرور.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "بيانات الدخول غير صحيحة.";
    case "auth/too-many-requests":
      return "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.";
    case "auth/network-request-failed":
      return "مشكلة اتصال بالإنترنت. حاول مرة أخرى.";
    default:
      return "تعذر تسجيل الدخول. حاول مرة أخرى.";
  }
}

export default function StaffPortalPage() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const firebaseConfigured = useMemo(() => {
    const projectId = (import.meta.env.VITE_FB_PROJECT_ID ?? "").trim();
    const apiKey = (import.meta.env.VITE_FB_API_KEY ?? "").trim();
    return Boolean(projectId && apiKey);
  }, []);

  const homePath = user ? getHomePathForUser(user, "staff") : "/login";
  const hasInternalAccess = user && homePath !== "/login";

  const portalLinks = useMemo(
    () =>
      [
        {
          title: "طلبات التوظيف",
          description: "مراجعة طلبات المرشحين والمرفقات.",
          href: "/hr/recruitment",
          icon: BriefcaseBusiness,
          enabled:
            !!user &&
            (hasPermission(user, "recruitment.view") ||
              hasPermission(user, "recruitment.manage")),
        },
        {
          title: "إدارة الموظفين",
          description: "الدوام، الإجازات، الرواتب، الملفات والرسائل.",
          href: "/hr/employees",
          icon: Users,
          enabled:
            !!user &&
            (hasPermission(user, "employees.view") ||
              hasPermission(user, "employees.manage")),
        },
        {
          title: "إعدادات الإدارة",
          description: "الأمان، الصلاحيات، حسابات الإدارة، والتوظيف.",
          href: "/hr/settings",
          icon: Settings,
          enabled: !!user && hasPermission(user, "settings.manage"),
        },
        {
          title: "بروفايل الموظف",
          description: "ملفك الشخصي، الملفات، والرسائل الداخلية.",
          href: "/employee/profile",
          icon: UserRound,
          enabled: !!user,
        },
      ].filter(item => item.enabled),
    [user]
  );

  const handleSubmit = async () => {
    if (!firebaseConfigured || busy) return;

    setBusy(true);
    setError(null);
    setInfo(null);

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setBusy(false);
      setError("اكتب البريد الإلكتروني.");
      return;
    }

    if (!password) {
      setBusy(false);
      setError("اكتب كلمة المرور.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
    } catch (submitError: any) {
      setError(friendlyAuthError(submitError?.code));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!firebaseConfigured || busy) return;

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setError("اكتب بريدك الإلكتروني أولًا لاستعادة كلمة المرور.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      setInfo("تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.");
    } catch (submitError: any) {
      setError(friendlyAuthError(submitError?.code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[linear-gradient(135deg,#07111f_0%,#101827_44%,#f8fafc_44%,#ffffff_100%)] text-slate-950"
    >
      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1fr)] lg:items-stretch">
          <section className="flex min-h-[580px] flex-col justify-between overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/72 p-6 text-white shadow-[0_34px_90px_-46px_rgba(2,6,23,0.95)] backdrop-blur-xl sm:p-8 lg:p-10">
            <div className="space-y-9">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#F2B705]/25 bg-[#F2B705]/10 text-[#F2B705]">
                    <BriefcaseBusiness className="h-6 w-6" />
                  </span>
                  <div>
                    <div className="text-lg font-semibold tracking-tight">
                      منصة الموارد البشرية
                    </div>
                    <div className="text-sm text-white/50">MAEDIN Staff Portal</div>
                  </div>
                </div>

                <Link href="/">
                  <Button
                    variant="outline"
                    className="h-10 rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08] hover:text-white"
                  >
                    الموقع العام
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
              </div>

              <div className="max-w-2xl space-y-5">
                <Badge className="rounded-full border border-[#F2B705]/30 bg-[#F2B705]/10 px-4 py-1.5 text-[#F2B705] shadow-none hover:bg-[#F2B705]/10">
                  نظام داخلي مستقل
                </Badge>
                <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                  دخول الموظفين وإدارة الموارد البشرية من مكان واحد.
                </h1>
                <p className="max-w-xl text-sm leading-8 text-white/62 sm:text-base">
                  بوابة مخصصة للموظفين والإدارة الداخلية: الدوام، الإجازات،
                  الرواتب، الملفات، الرسائل، طلبات التوظيف، وصلاحيات النظام.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    icon: CalendarDays,
                    label: "الدوام والإجازات",
                    helper: "متابعة الطلبات والحضور",
                  },
                  {
                    icon: FileText,
                    label: "الملفات والرواتب",
                    helper: "مستندات وسجلات الموظف",
                  },
                  {
                    icon: Mail,
                    label: "الرسائل الداخلية",
                    helper: "تواصل مباشر مع الإدارة",
                  },
                  {
                    icon: ShieldCheck,
                    label: "صلاحيات مؤسسية",
                    helper: "وصول حسب الدور والمسؤولية",
                  },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="rounded-3xl border border-white/10 bg-white/[0.04] p-4"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-[#F2B705]">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold">
                            {item.label}
                          </span>
                          <span className="mt-1 block text-xs leading-6 text-white/48">
                            {item.helper}
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-7 text-white/58">
              هذه البوابة منفصلة عن منصة الاستثمار. حسابات العملاء والمستثمرين
              تبقى في الموقع العام، بينما حسابات الموظفين والإدارة الداخلية هنا.
            </div>
          </section>

          <section className="flex items-center justify-center">
            <div className="w-full max-w-[560px] rounded-[32px] border border-slate-200 bg-white/96 p-6 shadow-[0_32px_90px_-52px_rgba(15,23,42,0.42)] backdrop-blur sm:p-8">
              {loading ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  جارٍ التحقق من الجلسة...
                </div>
              ) : hasInternalAccess ? (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Badge className="rounded-full bg-emerald-50 px-4 py-1.5 text-emerald-700 shadow-none hover:bg-emerald-50">
                      تم تسجيل الدخول
                    </Badge>
                    <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                      اختر وجهتك داخل المنصة
                    </h2>
                    <p className="text-sm leading-7 text-slate-500">
                      تظهر الاختصارات حسب صلاحيات حسابك الحالية.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    {portalLinks.map(item => {
                      const Icon = item.icon;
                      return (
                        <Link key={item.href} href={item.href}>
                          <div className="group flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white">
                            <div className="flex items-start gap-3">
                              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-[#F2B705]">
                                <Icon className="h-5 w-5" />
                              </span>
                              <span>
                                <span className="block text-base font-semibold text-slate-950">
                                  {item.title}
                                </span>
                                <span className="mt-1 block text-sm leading-6 text-slate-500">
                                  {item.description}
                                </span>
                              </span>
                            </div>
                            <ArrowLeft className="h-4 w-4 text-slate-400 transition group-hover:-translate-x-1 group-hover:text-slate-700" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>

                  {!portalLinks.length ? (
                    <PortalAlert tone="error">
                      حسابك لا يملك صلاحيات مفعلة داخل منصة الموظفين.
                    </PortalAlert>
                  ) : null}
                </div>
              ) : user ? (
                <div className="space-y-5">
                  <PortalAlert tone="error">
                    هذا الحساب غير مخصص لمنصة الموظفين. استخدم حساب موظف أو
                    حساب إداري داخلي.
                  </PortalAlert>
                  <Link href="/">
                    <Button className="h-12 w-full rounded-2xl">
                      العودة إلى منصة الاستثمار
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Badge
                      variant="outline"
                      className="rounded-full border-slate-200 bg-slate-50 px-4 py-1.5 text-slate-600"
                    >
                      دخول الموظفين
                    </Badge>
                    <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                      تسجيل الدخول للمنصة الداخلية
                    </h2>
                    <p className="text-sm leading-7 text-slate-500">
                      استخدم بريدك الوظيفي أو حساب الإدارة المخصص لك.
                    </p>
                  </div>

                  {!firebaseConfigured ? (
                    <PortalAlert tone="error">
                      إعدادات Firebase غير مكتملة.
                    </PortalAlert>
                  ) : null}

                  {error ? <PortalAlert tone="error">{error}</PortalAlert> : null}
                  {info ? <PortalAlert tone="info">{info}</PortalAlert> : null}

                  <form
                    className="space-y-5"
                    onSubmit={event => {
                      event.preventDefault();
                      void handleSubmit();
                    }}
                  >
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">
                        البريد الإلكتروني
                      </label>
                      <Input
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        placeholder="employee@maedin.com"
                        inputMode="email"
                        autoComplete="email"
                        dir="ltr"
                        disabled={busy}
                        className="h-12 rounded-2xl border-slate-200 bg-slate-50 px-4 text-base shadow-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">
                        كلمة المرور
                      </label>
                      <div className="relative">
                        <Input
                          value={password}
                          onChange={event => setPassword(event.target.value)}
                          placeholder="••••••"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          disabled={busy}
                          className="h-12 rounded-2xl border-slate-200 bg-slate-50 px-4 pl-12 text-base shadow-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(current => !current)}
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                          aria-label={
                            showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
                          }
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={!firebaseConfigured || busy}
                      className="h-12 w-full rounded-2xl bg-slate-950 text-white hover:bg-slate-900"
                    >
                      <LockKeyhole className="h-4 w-4" />
                      {busy ? "جارٍ تسجيل الدخول..." : "دخول المنصة"}
                    </Button>
                  </form>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
                    <button
                      type="button"
                      onClick={() => void handleForgotPassword()}
                      disabled={!firebaseConfigured || busy}
                      className="text-sm font-semibold text-slate-600 transition hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      نسيت كلمة المرور؟
                    </button>
                    <Link href="/">
                      <span className="text-sm font-semibold text-slate-500 transition hover:text-slate-950">
                        العودة للموقع العام
                      </span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
