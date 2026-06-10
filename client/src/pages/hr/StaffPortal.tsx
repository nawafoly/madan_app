import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  Eye,
  EyeOff,
  FileText,
  Globe,
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
import { HrBrandMark } from "@/components/HrBrandMark";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";

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

function friendlyAuthError(code: string | undefined, language: "ar" | "en") {
  switch (code) {
    case "auth/invalid-email":
      return tr(language, "البريد الإلكتروني غير صحيح.", "Invalid email address.");
    case "auth/missing-password":
      return tr(language, "اكتب كلمة المرور.", "Enter your password.");
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return tr(language, "بيانات الدخول غير صحيحة.", "Invalid sign-in details.");
    case "auth/too-many-requests":
      return tr(
        language,
        "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
        "Too many attempts. Wait a moment and try again."
      );
    case "auth/network-request-failed":
      return tr(language, "مشكلة اتصال بالإنترنت. حاول مرة أخرى.", "Network issue. Try again.");
    default:
      return tr(language, "تعذر تسجيل الدخول. حاول مرة أخرى.", "Could not sign in. Try again.");
  }
}

export default function StaffPortalPage() {
  const { language, toggleLanguage } = useLanguage();
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
          title: tr(language, "طلبات التوظيف", "Recruitment Applications"),
          description: tr(
            language,
            "مراجعة طلبات المرشحين والمرفقات.",
            "Review candidate applications and attachments."
          ),
          href: "/hr/recruitment",
          icon: BriefcaseBusiness,
          enabled:
            !!user &&
            (hasPermission(user, "recruitment.view") ||
              hasPermission(user, "recruitment.manage")),
        },
        {
          title: tr(language, "إدارة الموظفين", "Employee Management"),
          description: tr(
            language,
            "الدوام، الإجازات، الرواتب، الملفات والرسائل.",
            "Attendance, leave, payroll, files, and messages."
          ),
          href: "/hr/employees",
          icon: Users,
          enabled:
            !!user &&
            (hasPermission(user, "employees.view") ||
              hasPermission(user, "employees.manage")),
        },
        {
          title: tr(language, "إعدادات الإدارة", "Administration Settings"),
          description: tr(
            language,
            "الأمان، الصلاحيات، حسابات الإدارة، والتوظيف.",
            "Security, permissions, admin accounts, and recruitment."
          ),
          href: "/hr/settings",
          icon: Settings,
          enabled: !!user && hasPermission(user, "settings.manage"),
        },
        {
          title: tr(language, "بروفايل الموظف", "Employee Profile"),
          description: tr(
            language,
            "ملفك الشخصي، الملفات، والرسائل الداخلية.",
            "Your profile, files, and internal messages."
          ),
          href: "/hr/profile",
          icon: UserRound,
          enabled: !!user,
        },
      ].filter(item => item.enabled),
    [language, user]
  );

  const handleSubmit = async () => {
    if (!firebaseConfigured || busy) return;

    setBusy(true);
    setError(null);
    setInfo(null);

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setBusy(false);
      setError(tr(language, "اكتب البريد الإلكتروني.", "Enter your email."));
      return;
    }

    if (!password) {
      setBusy(false);
      setError(tr(language, "اكتب كلمة المرور.", "Enter your password."));
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
    } catch (submitError: any) {
      setError(friendlyAuthError(submitError?.code, language));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!firebaseConfigured || busy) return;

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setError(
        tr(
          language,
          "اكتب بريدك الإلكتروني أولًا لاستعادة كلمة المرور.",
          "Enter your email first to reset your password."
        )
      );
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      setInfo(
        tr(
          language,
          "تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.",
          "A password reset link was sent to your email."
        )
      );
    } catch (submitError: any) {
      setError(friendlyAuthError(submitError?.code, language));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      dir={languageDir(language)}
      className="min-h-screen bg-[linear-gradient(135deg,#07111f_0%,#101827_44%,#f8fafc_44%,#ffffff_100%)] text-slate-950"
    >
      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1fr)] lg:items-stretch">
          <section className="flex min-h-[580px] flex-col justify-between overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/72 p-6 text-white shadow-[0_34px_90px_-46px_rgba(2,6,23,0.95)] backdrop-blur-xl sm:p-8 lg:p-10">
            <div className="space-y-9">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <HrBrandMark
                    alt={tr(language, "شعار معدن", "MAEDIN logo")}
                    className="h-12 w-12"
                    imageClassName="h-10 w-10"
                  />
                  <div>
                    <div className="text-lg font-semibold tracking-tight">
                      {tr(language, "منصة الموارد البشرية", "Human Resources Platform")}
                    </div>
                    <div className="text-sm text-white/50">MAEDIN Staff Portal</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleLanguage}
                    className="h-10 rounded-full border-white/10 bg-white/[0.04] px-3 text-white/80 hover:bg-white/[0.08] hover:text-white"
                    aria-label={tr(language, "تبديل اللغة", "Toggle language")}
                  >
                    <Globe className="h-4 w-4" />
                    {language === "ar" ? "English" : "Arabic"}
                  </Button>

                  <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-white/70 shadow-none hover:bg-white/[0.04]">
                    {tr(language, "بوابة داخلية", "Internal Portal")}
                  </Badge>
                </div>
              </div>

              <div className="max-w-2xl space-y-5">
                <Badge className="rounded-full border border-[#F2B705]/30 bg-[#F2B705]/10 px-4 py-1.5 text-[#F2B705] shadow-none hover:bg-[#F2B705]/10">
                  {tr(language, "نظام داخلي مستقل", "Independent Internal System")}
                </Badge>
                <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                  {tr(
                    language,
                    "دخول الموظفين وإدارة الموارد البشرية من مكان واحد.",
                    "Staff access and HR management in one place."
                  )}
                </h1>
                <p className="max-w-xl text-sm leading-8 text-white/62 sm:text-base">
                  {tr(
                    language,
                    "بوابة مخصصة للموظفين والإدارة الداخلية: الدوام، الإجازات، الرواتب، الملفات، الرسائل، طلبات التوظيف، وصلاحيات النظام.",
                    "A dedicated portal for staff and internal administration: attendance, leave, payroll, files, messages, recruitment, and system permissions."
                  )}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    icon: CalendarDays,
                    label: tr(language, "الدوام والإجازات", "Attendance And Leave"),
                    helper: tr(language, "متابعة الطلبات والحضور", "Track requests and attendance"),
                  },
                  {
                    icon: FileText,
                    label: tr(language, "الملفات والرواتب", "Files And Payroll"),
                    helper: tr(language, "مستندات وسجلات الموظف", "Employee documents and records"),
                  },
                  {
                    icon: Mail,
                    label: tr(language, "الرسائل الداخلية", "Internal Messages"),
                    helper: tr(language, "تواصل مباشر مع الإدارة", "Direct communication with management"),
                  },
                  {
                    icon: ShieldCheck,
                    label: tr(language, "صلاحيات مؤسسية", "Role-Based Permissions"),
                    helper: tr(language, "وصول حسب الدور والمسؤولية", "Access by role and responsibility"),
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
              {tr(
                language,
                "هذه البوابة منفصلة عن منصة الاستثمار. حسابات الموظفين والإدارة الداخلية تبدأ من هنا وتبقى داخل مسارات منصة الموارد البشرية.",
                "This portal is separate from the investment platform. Staff and internal admin accounts start here and stay within HR platform routes."
              )}
            </div>
          </section>

          <section className="flex items-center justify-center">
            <div className="w-full max-w-[560px] rounded-[32px] border border-slate-200 bg-white/96 p-6 shadow-[0_32px_90px_-52px_rgba(15,23,42,0.42)] backdrop-blur sm:p-8">
              {loading ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  {tr(language, "جارٍ التحقق من الجلسة...", "Checking session...")}
                </div>
              ) : hasInternalAccess ? (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Badge className="rounded-full bg-emerald-50 px-4 py-1.5 text-emerald-700 shadow-none hover:bg-emerald-50">
                      {tr(language, "تم تسجيل الدخول", "Signed In")}
                    </Badge>
                    <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                      {tr(language, "اختر وجهتك داخل المنصة", "Choose Your Destination")}
                    </h2>
                    <p className="text-sm leading-7 text-slate-500">
                      {tr(
                        language,
                        "تظهر الاختصارات حسب صلاحيات حسابك الحالية.",
                        "Shortcuts appear based on your current account permissions."
                      )}
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
                      {tr(
                        language,
                        "حسابك لا يملك صلاحيات مفعلة داخل منصة الموظفين.",
                        "Your account does not have active permissions inside the staff platform."
                      )}
                    </PortalAlert>
                  ) : null}
                </div>
              ) : user ? (
                <div className="space-y-5">
                  <PortalAlert tone="error">
                    {tr(
                      language,
                      "يبدو أنك دخلت بحساب تابع للموقع الرئيسي وليس لمنصة الموارد البشرية. يمكنك الرجوع للموقع أو تسجيل الدخول بحساب موظف/إداري داخلي.",
                      "It looks like you signed in with a main website account, not an HR platform account. Return to the website or sign in with a staff/internal admin account."
                    )}
                  </PortalAlert>
                  <Link href="/">
                    <Button className="h-12 w-full rounded-2xl">
                      {tr(language, "العودة إلى الموقع الرئيسي", "Back To Main Website")}
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
                      {tr(language, "دخول الموظفين", "Staff Sign In")}
                    </Badge>
                    <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                      {tr(language, "تسجيل الدخول للمنصة الداخلية", "Sign In To The Internal Platform")}
                    </h2>
                    <p className="text-sm leading-7 text-slate-500">
                      {tr(
                        language,
                        "استخدم بريدك الوظيفي أو حساب الإدارة المخصص لك.",
                        "Use your work email or assigned admin account."
                      )}
                    </p>
                  </div>

                  {!firebaseConfigured ? (
                    <PortalAlert tone="error">
                      {tr(language, "إعدادات Firebase غير مكتملة.", "Firebase settings are incomplete.")}
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
                        {tr(language, "البريد الإلكتروني", "Email")}
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
                        {tr(language, "كلمة المرور", "Password")}
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
                            showPassword
                              ? tr(language, "إخفاء كلمة المرور", "Hide password")
                              : tr(language, "إظهار كلمة المرور", "Show password")
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
                      {busy
                        ? tr(language, "جارٍ تسجيل الدخول...", "Signing in...")
                        : tr(language, "دخول المنصة", "Enter Platform")}
                    </Button>
                  </form>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
                    <button
                      type="button"
                      onClick={() => void handleForgotPassword()}
                      disabled={!firebaseConfigured || busy}
                      className="text-sm font-semibold text-slate-600 transition hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {tr(language, "نسيت كلمة المرور؟", "Forgot password?")}
                    </button>
                    <span className="text-sm text-slate-400">
                      {tr(
                        language,
                        "الدخول مخصص لحسابات الموظفين والإدارة فقط.",
                        "Access is limited to staff and admin accounts."
                      )}
                    </span>
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
