import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarCheck2,
  CalendarDays,
  ClipboardList,
  Eye,
  EyeOff,
  FileText,
  Globe,
  LockKeyhole,
  LogOut,
  Mail,
  Settings,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import { Link } from "wouter";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { auth } from "@/_core/firebase";
import {
  getHomePathForUser,
  hasPermission,
  hasStaffAdminPermission,
  hasStaffAreaPermission,
  useAuth,
} from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HrBrandMark } from "@/components/HrBrandMark";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { resolveEmployeeAvatarUrl } from "@/lib/defaultEmployeeAvatars";
import {
  isEmailLoginInput,
  isLoginIdentityError,
  resolveLoginEmailCandidatesForAuth,
  resolveLoginEmailForAuth,
} from "@/lib/loginIdentity";
import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
import { WEEKLY_REPORT_MANAGER_NOTES_PERMISSION } from "@/lib/weeklyReportConfig";
import { listInAppNotifications } from "@/lib/inAppNotifications";
import { listHrCoreWeeklyReports } from "@/lib/hrCoreApi";

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

type PortalNotificationCounts = {
  leave: number;
  reports: number;
  messages: number;
  files: number;
};

const EMPTY_PORTAL_NOTIFICATION_COUNTS: PortalNotificationCounts = {
  leave: 0,
  reports: 0,
  messages: 0,
  files: 0,
};

function createEmptyPortalNotificationCounts(): PortalNotificationCounts {
  return { ...EMPTY_PORTAL_NOTIFICATION_COUNTS };
}

function resolvePortalNotificationBucket(data: Record<string, unknown>) {
  const relatedTo = String(data.relatedTo ?? "")
    .trim()
    .toLowerCase();
  const type = String(data.type ?? "")
    .trim()
    .toLowerCase();

  if (relatedTo === "weekly_report") return "reports";
  if (relatedTo === "daily_task") return "reports";
  if (relatedTo === "employee_message" || type === "message") return "messages";
  if (relatedTo === "employee_file" || type === "file") return "files";
  if (relatedTo.includes("leave") || type.includes("leave")) return "leave";
  return null;
}

function formatPortalBadgeCount(count: number) {
  if (count > 99) return "99+";
  return String(count);
}

function getAccountInitials(value: string) {
  const parts = value
    .replace(/@.*/, "")
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean);

  const initials = parts
    .slice(0, 2)
    .map(part => part[0])
    .join("");

  return initials || "HR";
}

function friendlyAuthError(code: string | undefined, language: "ar" | "en") {
  switch (code) {
    case "auth/invalid-email":
      return tr(
        language,
        "البريد الإلكتروني غير صحيح.",
        "Invalid email address."
      );
    case "auth/missing-password":
      return tr(language, "اكتب كلمة المرور.", "Enter your password.");
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return tr(
        language,
        "بيانات الدخول غير صحيحة.",
        "Invalid sign-in details."
      );
    case "auth/too-many-requests":
      return tr(
        language,
        "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
        "Too many attempts. Wait a moment and try again."
      );
    case "auth/network-request-failed":
      return tr(
        language,
        "مشكلة اتصال بالإنترنت. حاول مرة أخرى.",
        "Network issue. Try again."
      );
    default:
      return tr(
        language,
        "تعذر تسجيل الدخول. حاول مرة أخرى.",
        "Could not sign in. Try again."
      );
  }
}

function friendlyLoginIdentityError(
  code: "username-not-found" | "email-missing",
  language: "ar" | "en"
) {
  if (code === "email-missing") {
    return tr(
      language,
      "هذا الحساب لا يحتوي على بريد إلكتروني صالح.",
      "This account does not have a valid email address."
    );
  }

  return tr(
    language,
    "اسم المستخدم غير موجود أو غير مرتبط ببريد إلكتروني.",
    "Username was not found or is not linked to an email."
  );
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
  const [weeklyReportBadgeCount, setWeeklyReportBadgeCount] = useState(0);
  const [portalNotificationCounts, setPortalNotificationCounts] =
    useState<PortalNotificationCounts>(EMPTY_PORTAL_NOTIFICATION_COUNTS);

  const firebaseConfigured = useMemo(() => {
    const projectId = (import.meta.env.VITE_FB_PROJECT_ID ?? "").trim();
    const apiKey = (import.meta.env.VITE_FB_API_KEY ?? "").trim();
    return Boolean(projectId && apiKey);
  }, []);

  const homePath = user ? getHomePathForUser(user, "staff") : "/hr";
  const hasInternalAccess = user && homePath !== "/login";
  const canWriteWeeklyReportNotes =
    !!user &&
    hasStaffAreaPermission(user, WEEKLY_REPORT_MANAGER_NOTES_PERMISSION);

  useEffect(() => {
    if (!user?.uid) {
      setPortalNotificationCounts(createEmptyPortalNotificationCounts());
      setWeeklyReportBadgeCount(0);
      return;
    }

    let active = true;
    const loadNotifications = async () => {
      try {
        const items = await listInAppNotifications(user.uid);
        if (!active) return;
        const counts = createEmptyPortalNotificationCounts();
        items.forEach(item => {
          if (item.isRead) return;
          const bucket = resolvePortalNotificationBucket(item as unknown as Record<string, unknown>);
          if (bucket) counts[bucket] += 1;
        });
        setPortalNotificationCounts(counts);
        if (!canWriteWeeklyReportNotes) setWeeklyReportBadgeCount(counts.reports);
      } catch (error) {
        console.error("staff_portal_notifications_badge_failed", error);
        if (!active) return;
        setPortalNotificationCounts(createEmptyPortalNotificationCounts());
        if (!canWriteWeeklyReportNotes) setWeeklyReportBadgeCount(0);
      }
    };

    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [canWriteWeeklyReportNotes, user?.uid]);

  useEffect(() => {
    if (!user?.uid || !canWriteWeeklyReportNotes) return;

    let active = true;
    const loadPendingWeeklyReports = async () => {
      try {
        const result = await listHrCoreWeeklyReports({
          status: "sent",
          limit: 200,
          offset: 0,
        });
        if (!active) return;
        setWeeklyReportBadgeCount(
          result.weeklyReports.filter(report =>
            !String(report.managerNotes ?? "").trim()
          ).length
        );
      } catch (error) {
        console.error("weekly_report_pending_badge_failed", error);
        if (active) setWeeklyReportBadgeCount(0);
      }
    };

    void loadPendingWeeklyReports();
    const timer = window.setInterval(
      () => void loadPendingWeeklyReports(),
      30_000
    );

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [canWriteWeeklyReportNotes, user?.uid]);

  const portalLinks = useMemo(
    () => [
      {
        title: tr(language, "طلبات التوظيف", "Recruitment Applications"),
        description: tr(
          language,
          "مراجعة طلبات المرشحين والمرفقات.",
          "Review candidate applications and attachments."
        ),
        href: "/hr/recruitment",
        icon: BriefcaseBusiness,
        canEnter:
          !!user &&
          (hasStaffAdminPermission(user, "recruitment.view") ||
            hasStaffAdminPermission(user, "recruitment.manage")),
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
        canEnter:
          !!user &&
          (hasStaffAdminPermission(user, "employees.view") ||
            hasStaffAdminPermission(user, "employees.manage")),
      },
      {
        title: tr(language, "الحضور والانصراف", "Attendance"),
        description: tr(
          language,
          "مراجعة سجلات الدوام والمواقع والأجهزة.",
          "Review attendance, locations, and devices."
        ),
        href: "/hr/attendance",
        icon: CalendarCheck2,
        canEnter:
          !!user &&
          user.role !== "client" &&
          user.role !== "guest" &&
          hasPermission(user, "attendance.view"),
      },
      {
        title: tr(language, "إدارة الرواتب", "Payroll Management"),
        description: tr(
          language,
          "توليد مسيرات الرواتب ومراجعة الحضور والإضافات والخصومات.",
          "Generate payroll and review attendance, additions, and deductions."
        ),
        href: "/hr/payroll",
        icon: WalletCards,
        canEnter:
          !!user &&
          user.role !== "client" &&
          user.role !== "guest" &&
          hasPermission(user, "payroll.view"),
      },
      {
        title: tr(language, "التقارير الأسبوعية", "Weekly Reports"),
        description: tr(
          language,
          "مراجعة تقارير الموظفين وكتابة ملاحظات المدير.",
          "Review staff reports and add manager notes."
        ),
        href: "/hr/weekly-reports",
        icon: ClipboardList,
        canEnter: canWriteWeeklyReportNotes,
      },
      {
        title: tr(language, "المهام اليومية", "Daily Tasks"),
        description: tr(
          language,
          "متابعة تحديثات الموظفين اليومية والصور المرفقة عند الحاجة.",
          "Review daily staff updates and optional photos."
        ),
        href: "/hr/daily-tasks",
        icon: CalendarDays,
        canEnter: canWriteWeeklyReportNotes,
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
        canEnter: !!user && hasStaffAdminPermission(user, "settings.manage"),
      },
    ].filter(
      item =>
        !["/hr/weekly-reports", "/hr/daily-tasks"].includes(item.href) ||
        item.canEnter
    ),
    [canWriteWeeklyReportNotes, language, user]
  );

  const accountDisplayName =
    user?.displayName ||
    user?.firebaseUser?.displayName ||
    auth.currentUser?.displayName ||
    user?.email ||
    tr(language, "حساب الموارد البشرية", "HR Account");
  const accountEmail =
    user?.email || user?.firebaseUser?.email || auth.currentUser?.email || "";
  const accountPhotoUrl = resolveEmployeeAvatarUrl(
    (user as any)?.photoURL ||
      (user as any)?.avatarUrl ||
      user?.firebaseUser?.photoURL ||
      auth.currentUser?.photoURL,
    {
      uid: (user as any)?.uid,
      name: accountDisplayName,
      email: accountEmail,
      gender: (user as any)?.gender,
    }
  );
  const accountRoleLabel = useMemo(() => {
    if (!user?.role) {
      return tr(language, "بوابة الموظفين", "Staff Portal");
    }

    const labels: Record<string, string> = {
      owner: tr(language, "مالك النظام", "System Owner"),
      admin: tr(language, "إدارة", "Admin"),
      accountant: tr(language, "محاسبة", "Accounting"),
      hr: tr(language, "موارد بشرية", "Human Resources"),
      staff: tr(language, "موظف", "Employee"),
      client: tr(language, "حساب موقع", "Website Account"),
      guest: tr(language, "ضيف", "Guest"),
    };

    return labels[user.role] || tr(language, "حساب داخلي", "Internal Account");
  }, [language, user?.role]);
  const accountInitials = useMemo(
    () => getAccountInitials(accountDisplayName),
    [accountDisplayName]
  );

  const portalFeatureCards = useMemo(
    () => [
      {
        icon: CalendarDays,
        label: tr(language, "الدوام والإجازات", "Attendance And Leave"),
        helper:
          portalNotificationCounts.leave > 0
            ? tr(
                language,
                `${portalNotificationCounts.leave} تنبيه جديد على الإجازات`,
                `${portalNotificationCounts.leave} new leave alert${
                  portalNotificationCounts.leave > 1 ? "s" : ""
                }`
              )
            : tr(
                language,
                "متابعة الطلبات والحضور",
                "Track requests and attendance"
              ),
        count: portalNotificationCounts.leave,
      },
      {
        icon: ClipboardList,
        label: tr(language, "التقارير الأسبوعية", "Weekly Reports"),
        helper:
          weeklyReportBadgeCount > 0
            ? canWriteWeeklyReportNotes
              ? tr(
                  language,
                  `${weeklyReportBadgeCount} تقرير يحتاج ملاحظة`,
                  `${weeklyReportBadgeCount} report${
                    weeklyReportBadgeCount > 1 ? "s" : ""
                  } need manager notes`
                )
              : tr(
                  language,
                  `${weeklyReportBadgeCount} ملاحظة جديدة من المدير`,
                  `${weeklyReportBadgeCount} new manager note${
                    weeklyReportBadgeCount > 1 ? "s" : ""
                  }`
                )
            : canWriteWeeklyReportNotes
              ? tr(
                  language,
                  "لا توجد تقارير جديدة تحتاج ملاحظة",
                  "No reports need notes now"
                )
              : tr(
                  language,
                  "متابعة تقاريرك وملاحظات المدير",
                  "Track your reports and manager notes"
                ),
        count: weeklyReportBadgeCount,
      },
      {
        icon: Mail,
        label: tr(language, "الرسائل الداخلية", "Internal Messages"),
        helper:
          portalNotificationCounts.messages > 0
            ? tr(
                language,
                `${portalNotificationCounts.messages} رسالة جديدة`,
                `${portalNotificationCounts.messages} new message${
                  portalNotificationCounts.messages > 1 ? "s" : ""
                }`
              )
            : tr(
                language,
                "تواصل مباشر مع الإدارة",
                "Direct communication with management"
              ),
        count: portalNotificationCounts.messages,
      },
      {
        icon: FileText,
        label: tr(language, "الملفات والرواتب", "Files And Payroll"),
        helper:
          portalNotificationCounts.files > 0
            ? tr(
                language,
                `${portalNotificationCounts.files} ملف جديد يحتاج مراجعة`,
                `${portalNotificationCounts.files} new file${
                  portalNotificationCounts.files > 1 ? "s" : ""
                } to review`
              )
            : tr(
                language,
                "مستندات وسجلات ورواتب الموظف",
                "Employee documents, records, and payroll"
              ),
        count: portalNotificationCounts.files,
      },
    ],
    [
      canWriteWeeklyReportNotes,
      language,
      portalNotificationCounts.files,
      portalNotificationCounts.leave,
      portalNotificationCounts.messages,
      weeklyReportBadgeCount,
    ]
  );

  const handleSubmit = async () => {
    if (!firebaseConfigured || busy) return;

    setBusy(true);
    setError(null);
    setInfo(null);

    const loginInput = email.trim();
    const isEmail = isEmailLoginInput(loginInput);
    console.log("[HR Login] input type:", isEmail ? "email" : "username");

    let normalizedEmail = "";

    try {
      if (!loginInput) {
        console.log("[HR Login] resolved email:", "missing");
        setError(
          tr(
            language,
            "ط§ظƒطھط¨ ط§ط³ظ… ط§ظ„ظ…ط³طھط®ط¯ظ… ط£ظˆ ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ.",
            "Enter your username or email."
          )
        );
        return;
      }

      if (!password) {
        setError(tr(language, "ط§ظƒطھط¨ ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±.", "Enter your password."));
        return;
      }

      const candidateEmails = await resolveLoginEmailCandidatesForAuth(loginInput);
      normalizedEmail = candidateEmails[0] || "";
      console.log("[HR Login] resolved email:", candidateEmails.length ? "found" : "missing");

    if (!normalizedEmail) {
      setBusy(false);
      setError(
        tr(
          language,
          "اكتب اسم المستخدم أو البريد الإلكتروني.",
          "Enter your username or email."
        )
      );
      return;
    }

    if (!password) {
      setBusy(false);
      setError(tr(language, "اكتب كلمة المرور.", "Enter your password."));
      return;
    }

      let lastSignInError: any = null;

      for (const candidateEmail of candidateEmails) {
        try {
          await signInWithEmailAndPassword(auth, candidateEmail, password);
          return;
        } catch (candidateError: any) {
          lastSignInError = candidateError;
          const code = String(candidateError?.code || "");
          const canTryNextCandidate =
            !isEmail &&
            [
              "auth/invalid-email",
              "auth/user-not-found",
              "auth/wrong-password",
              "auth/invalid-credential",
            ].includes(code);

          if (!canTryNextCandidate) {
            throw candidateError;
          }
        }
      }

      throw lastSignInError;
    } catch (submitError: any) {
      if (isLoginIdentityError(submitError)) {
        console.log("[HR Login] resolved email:", "missing");
        setError(friendlyLoginIdentityError(submitError.code, language));
        return;
      }

      setError(friendlyAuthError(submitError?.code, language));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!firebaseConfigured || busy) return;

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const normalizedEmail = await resolveLoginEmailForAuth(email);
    if (!normalizedEmail) {
      setError(
        tr(
          language,
          "اكتب اسم المستخدم أو البريد الإلكتروني أولًا لاستعادة كلمة المرور.",
          "Enter your username or email first to reset your password."
        )
      );
      return;
    }

      await sendPasswordResetEmail(auth, normalizedEmail);
      setInfo(
        tr(
          language,
          "تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.",
          "A password reset link was sent to your email."
        )
      );
    } catch (submitError: any) {
      if (isLoginIdentityError(submitError)) {
        setError(friendlyLoginIdentityError(submitError.code, language));
        return;
      }

      setError(friendlyAuthError(submitError?.code, language));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (busy) return;

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      await signOut(auth);
    } catch (submitError) {
      console.error("staff_portal_sign_out_failed", submitError);
      setError(
        tr(
          language,
          "تعذر تسجيل الخروج الآن. حاول مرة أخرى.",
          "Could not sign out now. Try again."
        )
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      dir={languageDir(language)}
      className="hr-portal-shell min-h-screen bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_44%,#101827_44%,#07111f_100%)] text-slate-950"
    >
      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
        <div
          className={cn(
            "mx-auto grid min-h-[calc(100vh-3rem)]",
            hasInternalAccess
              ? "max-w-7xl gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1fr)] lg:items-stretch"
              : "max-w-[640px] items-center"
          )}
        >
          {hasInternalAccess ? (
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
                      {tr(
                        language,
                        "منصة الموارد البشرية",
                        "Human Resources Platform"
                      )}
                    </div>
                    <div className="text-sm text-white/50">
                      MAEDIN Staff Portal
                    </div>
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
                  {tr(
                    language,
                    "نظام داخلي مستقل",
                    "Independent Internal System"
                  )}
                </Badge>
                <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                  {tr(
                    language,
                    "بوابة الموارد البشرية للموظفين.",
                    "Human Resources Staff Portal."
                  )}
                </h1>
                <p className="max-w-lg text-sm leading-7 text-white/62">
                  {tr(
                    language,
                    "مساحة داخلية لمتابعة العمل اليومي والتنبيهات المهمة.",
                    "An internal space for daily work and important alerts."
                  )}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {portalFeatureCards.map(item => {
                  const Icon = item.icon;
                  const count = Number(item.count || 0);
                  return (
                    <div
                      key={item.label}
                      className={cn(
                        "rounded-3xl border p-4 transition",
                        count > 0
                          ? "border-[#F2B705]/35 bg-[#F2B705]/10"
                          : "border-white/10 bg-white/[0.04]"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-[#F2B705]">
                          <Icon className="h-5 w-5" />
                          {count > 0 ? (
                            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white shadow-lg shadow-red-600/25 ring-2 ring-slate-950/80">
                              {formatPortalBadgeCount(count)}
                            </span>
                          ) : null}
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

            <div className="mt-12 rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.035))] px-5 pb-5 pt-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_55px_-42px_rgba(0,0,0,0.75)]">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="relative -mt-10 flex h-24 w-24 shrink-0 items-center justify-center">
                    <span className="motion-safe:animate-[spin_18s_linear_infinite] absolute inset-0 rounded-full border border-[#F2B705]/35 border-t-white/75" />
                    <span className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-lg font-bold text-[#F2B705] shadow-[0_18px_40px_-24px_rgba(0,0,0,0.95)] ring-2 ring-white/15">
                      {accountPhotoUrl ? (
                        <img
                          src={accountPhotoUrl}
                          alt={tr(language, "صورة الحساب", "Account photo")}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        accountInitials
                      )}
                    </span>
                  </div>
                  <div className="min-w-0 pt-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#F2B705]/25 bg-[#F2B705]/10 px-3 py-1 text-[11px] font-semibold text-[#F2B705]">
                        {accountRoleLabel}
                      </span>
                      <span className="text-[11px] text-white/40">
                        {tr(language, "الحساب الحالي", "Current Account")}
                      </span>
                    </div>
                    <div className="truncate text-lg font-semibold text-white">
                      {accountDisplayName}
                    </div>
                    <div
                      className="mt-1 truncate text-xs text-white/48"
                      dir="ltr"
                    >
                      {accountEmail || "MAEDIN Staff Portal"}
                    </div>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-2 sm:w-[190px] sm:shrink-0">
                  {hasInternalAccess ? (
                    <Link href="/hr/profile">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-14 w-full justify-between rounded-[22px] border-[#F2B705]/30 bg-[linear-gradient(135deg,rgba(242,183,5,0.18),rgba(242,183,5,0.07))] px-4 text-[#F2B705] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_34px_-28px_rgba(242,183,5,0.9)] hover:border-[#F2B705]/45 hover:bg-[#F2B705]/16 hover:text-[#FFD24A]"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F2B705]/14 ring-1 ring-[#F2B705]/25">
                            <UserRound className="h-4 w-4" />
                          </span>
                          <span className="truncate text-sm font-semibold">
                            {tr(language, "فتح البروفايل", "Open Profile")}
                          </span>
                        </span>
                        <ArrowLeft className="h-4 w-4 shrink-0 opacity-80" />
                      </Button>
                    </Link>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSignOut()}
                    disabled={busy}
                    className="h-10 w-full shrink-0 rounded-full border-white/10 bg-white/[0.06] px-4 text-white/78 shadow-none hover:bg-white/[0.1] hover:text-white disabled:opacity-60"
                  >
                    <LogOut className="h-4 w-4" />
                    {busy
                      ? tr(language, "جاري الخروج", "Signing Out")
                      : tr(language, "تسجيل خروج", "Sign Out")}
                  </Button>
                </div>
              </div>
            </div>
            </section>
          ) : null}

          <section className="flex items-center justify-center">
            <div className="w-full max-w-[560px] rounded-[32px] border border-slate-200 bg-white/96 p-6 shadow-[0_32px_90px_-52px_rgba(15,23,42,0.42)] backdrop-blur sm:p-8">
              {loading ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  {tr(
                    language,
                    "جارٍ التحقق من الجلسة...",
                    "Checking session..."
                  )}
                </div>
              ) : hasInternalAccess ? (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Badge className="rounded-full bg-emerald-50 px-4 py-1.5 text-emerald-700 shadow-none hover:bg-emerald-50">
                      {tr(language, "تم تسجيل الدخول", "Signed In")}
                    </Badge>
                    <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                      {tr(
                        language,
                        "اختر وجهتك داخل المنصة",
                        "Choose Your Destination"
                      )}
                    </h2>
                    <p className="text-sm leading-7 text-slate-500">
                      {tr(
                        language,
                        "تظهر الاختصارات حسب صلاحيات حسابك الحالية.",
                        "Shortcuts appear based on your current account permissions."
                      )}
                    </p>
                  </div>

                  {error ? (
                    <PortalAlert tone="error">{error}</PortalAlert>
                  ) : null}

                  <div className="grid gap-3">
                    {portalLinks.map(item => {
                      const Icon = item.icon;
                      const isAllowed = item.canEnter;
                      const destinationCard = (
                        <div
                          className={cn(
                            "group flex items-center justify-between gap-4 rounded-3xl border p-4 transition",
                            isAllowed
                              ? "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white"
                              : "cursor-not-allowed border-slate-200/80 bg-slate-100/65 text-slate-400"
                          )}
                          aria-disabled={!isAllowed}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={cn(
                                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                                isAllowed
                                  ? "bg-slate-950 text-[#F2B705]"
                                  : "bg-slate-200/80 text-slate-400"
                              )}
                            >
                              <Icon className="h-5 w-5" />
                            </span>
                            <span>
                              <span
                                className={cn(
                                  "block text-base font-semibold",
                                  isAllowed
                                    ? "text-slate-950"
                                    : "text-slate-500"
                                )}
                              >
                                {item.title}
                              </span>
                              <span
                                className={cn(
                                  "mt-1 block text-sm leading-6",
                                  isAllowed
                                    ? "text-slate-500"
                                    : "text-slate-400"
                                )}
                              >
                                {item.description}
                              </span>
                            </span>
                          </div>
                          {isAllowed ? (
                            <ArrowLeft className="h-4 w-4 text-slate-400 transition group-hover:-translate-x-1 group-hover:text-slate-700" />
                          ) : (
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-500">
                              <LockKeyhole className="h-3.5 w-3.5" />
                              {tr(language, "غير متاح", "Locked")}
                            </span>
                          )}
                        </div>
                      );

                      if (!isAllowed) {
                        return (
                          <div
                            key={item.href}
                            title={tr(
                              language,
                              "يتطلب صلاحية دخول",
                              "Permission required"
                            )}
                          >
                            {destinationCard}
                          </div>
                        );
                      }

                      return (
                        <Link key={item.href} href={item.href}>
                          {destinationCard}
                        </Link>
                      );
                    })}
                  </div>

                  {!portalLinks.some(item => item.canEnter) ? (
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
                      {tr(
                        language,
                        "العودة إلى الموقع الرئيسي",
                        "Back To Main Website"
                      )}
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
                      {tr(
                        language,
                        "تسجيل الدخول للمنصة الداخلية",
                        "Sign In To The Internal Platform"
                      )}
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
                      {tr(
                        language,
                        "إعدادات Firebase غير مكتملة.",
                        "Firebase settings are incomplete."
                      )}
                    </PortalAlert>
                  ) : null}

                  {error ? (
                    <PortalAlert tone="error">{error}</PortalAlert>
                  ) : null}
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
                        {tr(language, "اسم المستخدم أو البريد الإلكتروني", "Username or Email")}
                      </label>
                      <Input
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        placeholder="employee@madanalbena.com"
                        inputMode="text"
                        autoComplete="username"
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
                              ? tr(
                                  language,
                                  "إخفاء كلمة المرور",
                                  "Hide password"
                                )
                              : tr(
                                  language,
                                  "إظهار كلمة المرور",
                                  "Show password"
                                )
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
