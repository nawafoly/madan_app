import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp } from "firebase/firestore";
import {
  BriefcaseBusiness,
  Eye,
  EyeOff,
  LayoutDashboard,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { auth, db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  getAutomaticPostLoginPath,
  getWorkspaceAccess,
} from "@/lib/workspaceAccess";
import {
  AUDIT_ACTIONS,
  auditedSetDoc,
  buildAuditSource,
  logAuditEvent,
} from "@/lib/auditLog";
import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, textAlignClass, tr } from "@/lib/i18n";
import {
  isEmailLoginInput,
  isLoginIdentityError,
  resolveLoginEmailForAuth,
} from "@/lib/loginIdentity";

type AuthMode = "login" | "register";

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-2 block text-sm font-medium text-slate-700">
      {children}
    </label>
  );
}

function SurfaceAlert({
  tone,
  children,
}: {
  tone: "error" | "info" | "warning";
  children: ReactNode;
}) {
  const toneClass =
    tone === "error"
      ? "border-red-200 bg-red-50/90 text-red-700"
      : tone === "info"
        ? "border-emerald-200 bg-emerald-50/90 text-emerald-700"
        : "border-amber-200 bg-amber-50/90 text-amber-800";

  return (
    <div
      className={`rounded-[18px] border px-4 py-3 text-sm leading-7 ${toneClass}`}
    >
      {children}
    </div>
  );
}

export default function LoginPage() {
  const { user, loading, error, logout } = useAuth();
  const { language } = useLanguage();
  const [location, setLocation] = useLocation();

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localInfo, setLocalInfo] = useState<string | null>(null);
  const [mode, setMode] = useState<AuthMode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const firebaseConfigured = useMemo(() => {
    const projectId = (import.meta.env.VITE_FB_PROJECT_ID ?? "").trim();
    const apiKey = (import.meta.env.VITE_FB_API_KEY ?? "").trim();
    return Boolean(projectId && apiKey);
  }, []);

  const workspaceAccess = useMemo(() => getWorkspaceAccess(user), [user]);
  const needsWorkspaceChoice =
    !!user && workspaceAccess.dashboard && workspaceAccess.hr;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (loading || !user || needsWorkspaceChoice) return;

    const target = getAutomaticPostLoginPath(user);

    if (location === target) return;
    setLocation(target);
  }, [loading, location, needsWorkspaceChoice, setLocation, user]);

  const normalizeEmail = (value: string) => value.trim().toLowerCase();
  const resolveLoginEmail = (value: string) => resolveLoginEmailForAuth(value);

  const friendlyAuthError = (code?: string) => {
    switch (code) {
      case "auth/invalid-email":
        return tr(language, "البريد الإلكتروني غير صحيح.", "Invalid email address.");
      case "auth/missing-password":
        return tr(language, "فضلًا اكتب كلمة المرور.", "Enter your password.");
      case "auth/weak-password":
        return tr(
          language,
          "كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.",
          "Password is too weak. Use at least 6 characters."
        );
      case "auth/user-not-found":
        return tr(language, "لا يوجد حساب بهذا البريد.", "No account uses this email.");
      case "auth/wrong-password":
        return tr(language, "كلمة المرور غير صحيحة.", "Incorrect password.");
      case "auth/invalid-credential":
        return tr(language, "بيانات الدخول غير صحيحة.", "Invalid sign-in details.");
      case "auth/email-already-in-use":
        return tr(language, "هذا البريد مستخدم بالفعل.", "This email is already in use.");
      case "auth/too-many-requests":
        return tr(
          language,
          "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
          "Too many attempts. Wait a moment and try again."
        );
      case "auth/network-request-failed":
        return tr(language, "مشكلة اتصال بالإنترنت. حاول مرة أخرى.", "Network issue. Try again.");
      default:
        return tr(
          language,
          "تعذر تنفيذ العملية. تحقق من إعدادات Firebase.",
          "Could not complete the request. Check Firebase settings."
        );
    }
  };

  const friendlyLoginIdentityError = (
    code: "username-not-found" | "email-missing"
  ) => {
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
  };

  const modeCopy = useMemo(
    () =>
      mode === "login"
        ? {
            badge: tr(language, "دخول المنصة", "Platform Access"),
            title: tr(language, "تسجيل الدخول", "Sign In"),
            description: "",
            submitLabel: tr(language, "تسجيل الدخول", "Sign In"),
            toggleLabel: tr(language, "إنشاء حساب جديد", "Create Account"),
          }
        : {
            badge: tr(language, "إنشاء حساب", "Create Account"),
            title: tr(language, "إنشاء حساب جديد", "Create A New Account"),
            description: "",
            submitLabel: tr(language, "إنشاء الحساب", "Create Account"),
            toggleLabel: tr(language, "لدي حساب بالفعل", "I Already Have An Account"),
          },
    [language, mode]
  );

  const effectiveError = useMemo(() => {
    if (localError) return localError;
    if (typeof error === "string" && error.trim()) return error;
    if (error) {
      return tr(
        language,
        "تعذر التحقق من حالة الجلسة الحالية. حاول مرة أخرى.",
        "Could not verify the current session. Try again."
      );
    }
    return null;
  }, [error, language, localError]);

  const resetTransientState = () => {
    setLocalError(null);
    setLocalInfo(null);
  };

  const switchMode = (nextMode: AuthMode) => {
    if (busy || mode === nextMode) return;

    resetTransientState();
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleSubmit = async () => {
    if (!firebaseConfigured || busy) return;

    setBusy(true);
    resetTransientState();

    const trimmedPassword = password;

    try {
      const isEmail = isEmailLoginInput(email);
      const normalizedEmail =
        mode === "login" ? await resolveLoginEmail(email) : normalizeEmail(email);

      if (mode === "login") {
        console.log("[HR Login] input type:", isEmail ? "email" : "username");
        console.log("[HR Login] resolved email:", normalizedEmail ? "found" : "missing");
      }

      if (!normalizedEmail) {
        setBusy(false);
        setLocalError(tr(language, "فضلًا اكتب البريد الإلكتروني.", "Enter your email."));
        return;
      }

      if (!trimmedPassword) {
        setBusy(false);
        setLocalError(tr(language, "فضلًا اكتب كلمة المرور.", "Enter your password."));
        return;
      }

      if (mode === "login") {
        const cred = await signInWithEmailAndPassword(
          auth,
          normalizedEmail,
          trimmedPassword
        );

        await logAuditEvent({
          action: AUDIT_ACTIONS.USER_LOGIN,
          category: "system",
          severity: "info",
          status: "success",
          message: `User login: ${cred.user.uid}`,
          entityType: "user",
          entityId: cred.user.uid,
          entityPath: `users/${cred.user.uid}`,
          relatedIds: { userId: cred.user.uid },
          source: buildAuditSource({
            area: "public",
            page: "Login",
            method: "login",
          }),
          meta: {
            loginMode: "password",
          },
        });

        return;
      }

      const name = fullName.trim();
      const phoneValue = phone.trim();

      if (!name) {
        setBusy(false);
        setLocalError(tr(language, "فضلًا اكتب الاسم الكامل.", "Enter your full name."));
        return;
      }

      if (!phoneValue) {
        setBusy(false);
        setLocalError(tr(language, "فضلًا اكتب رقم الجوال.", "Enter your mobile number."));
        return;
      }

      if (trimmedPassword.length < 6) {
        setBusy(false);
        setLocalError(
          tr(
            language,
            "كلمة المرور يجب أن تكون 6 أحرف على الأقل.",
            "Password must be at least 6 characters."
          )
        );
        return;
      }

      if (!confirmPassword.trim()) {
        setBusy(false);
        setLocalError(tr(language, "فضلًا أكد كلمة المرور.", "Confirm your password."));
        return;
      }

      if (confirmPassword !== trimmedPassword) {
        setBusy(false);
        setLocalError(
          tr(
            language,
            "كلمة المرور وتأكيدها غير متطابقين.",
            "Password and confirmation do not match."
          )
        );
        return;
      }

      const cred = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        trimmedPassword
      );

      try {
        await updateProfile(cred.user, { displayName: name });
      } catch {
        // Ignore profile update errors and continue with document write.
      }

      const ref = doc(db, "users", cred.user.uid);
      const payload: Record<string, any> = {
        email: normalizedEmail,
        displayName: name,
        phone: phoneValue,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        source: "ui_signup",
      };

      await auditedSetDoc({
        ref,
        data: payload,
        options: { merge: true },
        action: AUDIT_ACTIONS.USER_CREATED,
        category: "user",
        entityType: "user",
        source: buildAuditSource({
          area: "public",
          page: "Login",
          method: "register",
        }),
        relatedIds: { userId: cred.user.uid },
        message: `Registered user ${cred.user.uid}`,
        meta: {
          signupSource: "ui_signup",
        },
        ignoreFields: ["updatedAt"],
      });
    } catch (submitError: any) {
      if (isLoginIdentityError(submitError)) {
        console.log("[HR Login] resolved email:", "missing");
        setLocalError(friendlyLoginIdentityError(submitError.code));
        return;
      }

      setLocalError(friendlyAuthError(submitError?.code));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!firebaseConfigured || busy) return;

    resetTransientState();
    setBusy(true);

    try {
      const normalizedEmail = await resolveLoginEmail(email);

      if (!normalizedEmail) {
        setLocalError(
          tr(
            language,
            "اكتب بريدك الإلكتروني أولًا ثم اضغط على خيار استعادة كلمة المرور.",
            "Enter your email first, then choose password recovery."
          )
        );
        return;
      }

      await sendPasswordResetEmail(auth, normalizedEmail);
      setLocalInfo(
        tr(
          language,
          "تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.",
          "A password reset link was sent to your email."
        )
      );
    } catch (submitError: any) {
      if (isLoginIdentityError(submitError)) {
        setLocalError(friendlyLoginIdentityError(submitError.code));
        return;
      }

      setLocalError(friendlyAuthError(submitError?.code));
    } finally {
      setBusy(false);
    }
  };

  if (!loading && user && needsWorkspaceChoice) {
    return (
      <div
        dir={languageDir(language)}
        className="min-h-[calc(100svh-var(--site-header-offset))] bg-[linear-gradient(180deg,#f6f6f7_0%,#ffffff_32%,#f7f7f8_100%)] text-foreground"
      >
        <main className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(242,174,48,0.14),transparent_62%)]"
          />
          <section className="px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
            <div className="container">
              <div className="mx-auto flex min-h-[calc(100svh-var(--site-header-offset)-11rem)] max-w-[46rem] items-center justify-center">
                <div
                  className={`w-full rounded-[32px] border border-slate-200/80 bg-white/96 p-6 shadow-[0_30px_90px_-48px_rgba(11,23,38,0.24)] backdrop-blur-sm sm:p-8 md:p-10 ${textAlignClass(language)}`}
                >
                  <div className="space-y-3">
                    <span className="inline-flex items-center rounded-full bg-[#f7f3ea] px-4 py-1.5 text-xs font-semibold tracking-[0.18em] text-primary/75 ring-1 ring-[#eadfbe]">
                      {tr(language, "اختيار الوجهة", "Choose Workspace")}
                    </span>
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
                      {tr(
                        language,
                        "أين تريد الدخول؟",
                        "Where would you like to go?"
                      )}
                    </h1>
                    <p className="text-sm leading-7 text-slate-600 sm:text-[15px]">
                      {tr(
                        language,
                        "حسابك يملك صلاحية الدخول إلى الوجهتين. اختر الوجهة التي تريد فتحها الآن.",
                        "Your account can access both workspaces. Choose where to continue."
                      )}
                    </p>
                  </div>

                  <div className="mt-7 grid gap-4 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setLocation(workspaceAccess.dashboardPath)}
                      className="group rounded-[24px] border border-slate-200 bg-white p-5 text-start shadow-[0_18px_45px_-38px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:border-[#F2B705]/60 hover:shadow-[0_24px_55px_-38px_rgba(15,23,42,0.55)]"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-[#F2B705]">
                        <LayoutDashboard className="h-5 w-5" />
                      </span>
                      <span className="mt-5 block text-lg font-semibold text-slate-950">
                        {tr(language, "لوحة التحكم", "Dashboard")}
                      </span>
                      <span className="mt-2 block text-sm leading-6 text-slate-500">
                        {tr(
                          language,
                          "الدخول إلى الإدارة الرئيسية لمعدن.",
                          "Open the main MAEDIN administration workspace."
                        )}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setLocation(workspaceAccess.hrPath)}
                      className="group rounded-[24px] border border-slate-200 bg-white p-5 text-start shadow-[0_18px_45px_-38px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:border-[#F2B705]/60 hover:shadow-[0_24px_55px_-38px_rgba(15,23,42,0.55)]"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-[#F2B705]">
                        <BriefcaseBusiness className="h-5 w-5" />
                      </span>
                      <span className="mt-5 block text-lg font-semibold text-slate-950">
                        {tr(language, "الموارد البشرية", "Human Resources")}
                      </span>
                      <span className="mt-2 block text-sm leading-6 text-slate-500">
                        {tr(
                          language,
                          "الدخول إلى مساحة الموارد البشرية المسموحة لحسابك.",
                          "Open the Human Resources workspace available to your account."
                        )}
                      </span>
                    </button>
                  </div>

                  <div className="mt-6 border-t border-slate-200/80 pt-5">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void logout()}
                      className="rounded-full text-slate-600"
                    >
                      {tr(language, "تسجيل الخروج", "Sign Out")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div
      dir={languageDir(language)}
      className="bg-[linear-gradient(180deg,#f6f6f7_0%,#ffffff_32%,#f7f7f8_100%)] text-foreground"
    >
      <main className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,rgba(242,174,48,0.12),transparent_62%)]"
        />

        <section className="px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
          <div className="container">
            <div className="mx-auto flex min-h-[calc(100svh-var(--site-header-offset)-11rem)] max-w-[36rem] items-center justify-center">
              <div className={`w-full rounded-[32px] border border-slate-200/80 bg-white/96 p-6 shadow-[0_30px_90px_-48px_rgba(11,23,38,0.24)] backdrop-blur-sm sm:p-8 md:p-10 ${textAlignClass(language)}`}>
                <div className="space-y-3">
                  <span className="inline-flex items-center rounded-full bg-[#f7f3ea] px-4 py-1.5 text-xs font-semibold tracking-[0.18em] text-primary/75 ring-1 ring-[#eadfbe]">
                    {modeCopy.badge}
                  </span>

                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
                    {modeCopy.title}
                  </h1>

                  <p className="text-sm leading-7 text-slate-600 sm:text-[15px]">
                    {modeCopy.description}
                  </p>
                </div>

                <div className="mt-6 space-y-4">
                  {!firebaseConfigured ? (
                    <SurfaceAlert tone="warning">
                      <strong>{tr(language, "تنبيه:", "Notice:")}</strong>{" "}
                      {tr(
                        language,
                        "إعدادات Firebase غير مكتملة.",
                        "Firebase settings are incomplete."
                      )}
                    </SurfaceAlert>
                  ) : null}

                  {effectiveError ? (
                    <SurfaceAlert tone="error">
                      <strong>{tr(language, "خطأ:", "Error:")}</strong>{" "}
                      {effectiveError}
                    </SurfaceAlert>
                  ) : null}

                  {localInfo ? (
                    <SurfaceAlert tone="info">{localInfo}</SurfaceAlert>
                  ) : null}
                </div>

                <form
                  onSubmit={event => {
                    event.preventDefault();
                    void handleSubmit();
                  }}
                  className="mt-6 space-y-5"
                >
                  {mode === "register" ? (
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <FieldLabel>{tr(language, "الاسم الكامل", "Full Name")}</FieldLabel>
                        <Input
                          value={fullName}
                          onChange={event => setFullName(event.target.value)}
                          placeholder={tr(language, "مثال: محمد أحمد", "Example: Mohammed Ahmed")}
                          autoComplete="name"
                          disabled={busy}
                          className="h-12 rounded-2xl border-slate-200/80 bg-slate-50/80 px-4 text-base shadow-none"
                        />
                      </div>

                      <div>
                        <FieldLabel>{tr(language, "رقم الجوال", "Mobile Number")}</FieldLabel>
                        <Input
                          value={phone}
                          onChange={event => setPhone(event.target.value)}
                          placeholder="05xxxxxxxx"
                          autoComplete="tel"
                          inputMode="tel"
                          dir="ltr"
                          disabled={busy}
                          className="h-12 rounded-2xl border-slate-200/80 bg-slate-50/80 px-4 text-base shadow-none"
                        />
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <FieldLabel>
                      {mode === "login"
                        ? tr(
                            language,
                            "اسم المستخدم أو البريد الإلكتروني",
                            "Username or Email"
                          )
                        : tr(language, "البريد الإلكتروني", "Email")}
                    </FieldLabel>
                    <Input
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      placeholder="example@gmail.com"
                      autoComplete={mode === "login" ? "username" : "email"}
                      inputMode={mode === "login" ? "text" : "email"}
                      dir="ltr"
                      disabled={busy}
                      className="h-12 rounded-2xl border-slate-200/80 bg-slate-50/80 px-4 text-base shadow-none"
                    />
                  </div>

                  <div>
                    <FieldLabel>{tr(language, "كلمة المرور", "Password")}</FieldLabel>
                    <div className="relative">
                      <Input
                        value={password}
                        onChange={event => setPassword(event.target.value)}
                        placeholder="••••••"
                        type={showPassword ? "text" : "password"}
                        autoComplete={
                          mode === "login" ? "current-password" : "new-password"
                        }
                        disabled={busy}
                        className="h-12 rounded-2xl border-slate-200/80 bg-slate-50/80 px-4 pl-12 text-base shadow-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(current => !current)}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
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

                  {mode === "register" ? (
                    <div>
                      <FieldLabel>{tr(language, "تأكيد كلمة المرور", "Confirm Password")}</FieldLabel>
                      <div className="relative">
                        <Input
                          value={confirmPassword}
                          onChange={event =>
                            setConfirmPassword(event.target.value)
                          }
                          placeholder="••••••"
                          type={showConfirmPassword ? "text" : "password"}
                          autoComplete="new-password"
                          disabled={busy}
                          className="h-12 rounded-2xl border-slate-200/80 bg-slate-50/80 px-4 pl-12 text-base shadow-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword(current => !current)
                          }
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                          aria-label={
                            showConfirmPassword
                              ? tr(language, "إخفاء تأكيد كلمة المرور", "Hide password confirmation")
                              : tr(language, "إظهار تأكيد كلمة المرور", "Show password confirmation")
                          }
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    size="lg"
                    disabled={!firebaseConfigured || busy}
                    className="h-12 w-full rounded-full text-sm font-semibold"
                  >
                    {busy ? tr(language, "جارٍ التنفيذ...", "Processing...") : modeCopy.submitLabel}
                  </Button>
                </form>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-5">
                  {mode === "login" ? (
                    <button
                      type="button"
                      onClick={() => void handleForgotPassword()}
                      disabled={!firebaseConfigured || busy}
                      className="text-sm font-semibold text-primary/82 transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {tr(language, "نسيت كلمة المرور؟", "Forgot password?")}
                    </button>
                  ) : (
                    <span className="text-sm text-slate-500">
                      {tr(
                        language,
                        "كلمة المرور يجب أن تكون 6 أحرف على الأقل.",
                        "Password must be at least 6 characters."
                      )}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      switchMode(mode === "login" ? "register" : "login")
                    }
                    disabled={busy}
                    className="text-sm font-semibold text-slate-700 transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {modeCopy.toggleLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
