import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp } from "firebase/firestore";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { auth, db } from "@/_core/firebase";
import { getHomePathForUser, useAuth } from "@/_core/hooks/useAuth";
import {
  AUDIT_ACTIONS,
  auditedSetDoc,
  buildAuditSource,
  logAuditEvent,
} from "@/lib/auditLog";
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
  const { user, loading, error } = useAuth();
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

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (loading || !user) return;

    const target = getHomePathForUser(user);

    if (location === target) return;
    setLocation(target);
  }, [loading, location, setLocation, user]);

  const normalizeEmail = (value: string) => value.trim().toLowerCase();

  const friendlyAuthError = (code?: string) => {
    switch (code) {
      case "auth/invalid-email":
        return "البريد الإلكتروني غير صحيح.";
      case "auth/missing-password":
        return "فضلًا اكتب كلمة المرور.";
      case "auth/weak-password":
        return "كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.";
      case "auth/user-not-found":
        return "لا يوجد حساب بهذا البريد.";
      case "auth/wrong-password":
        return "كلمة المرور غير صحيحة.";
      case "auth/invalid-credential":
        return "بيانات الدخول غير صحيحة.";
      case "auth/email-already-in-use":
        return "هذا البريد مستخدم بالفعل.";
      case "auth/too-many-requests":
        return "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.";
      case "auth/network-request-failed":
        return "مشكلة اتصال بالإنترنت. حاول مرة أخرى.";
      default:
        return "تعذر تنفيذ العملية. تحقق من إعدادات Firebase.";
    }
  };

  const modeCopy = useMemo(
    () =>
      mode === "login"
        ? {
            badge: "دخول المنصة",
            title: "تسجيل الدخول",
            description:
              "",
            submitLabel: "تسجيل الدخول",
            toggleLabel: "إنشاء حساب جديد",
          }
        : {
            badge: "إنشاء حساب",
            title: "إنشاء حساب جديد",
            description:
              "",
            submitLabel: "إنشاء الحساب",
            toggleLabel: "لدي حساب بالفعل",
          },
    [mode]
  );

  const effectiveError = useMemo(() => {
    if (localError) return localError;
    if (typeof error === "string" && error.trim()) return error;
    if (error) return "تعذر التحقق من حالة الجلسة الحالية. حاول مرة أخرى.";
    return null;
  }, [error, localError]);

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

    const normalizedEmail = normalizeEmail(email);
    const trimmedPassword = password;

    if (!normalizedEmail) {
      setBusy(false);
      setLocalError("فضلًا اكتب البريد الإلكتروني.");
      return;
    }

    if (!trimmedPassword) {
      setBusy(false);
      setLocalError("فضلًا اكتب كلمة المرور.");
      return;
    }

    try {
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
        setLocalError("فضلًا اكتب الاسم الكامل.");
        return;
      }

      if (!phoneValue) {
        setBusy(false);
        setLocalError("فضلًا اكتب رقم الجوال.");
        return;
      }

      if (trimmedPassword.length < 6) {
        setBusy(false);
        setLocalError("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
        return;
      }

      if (!confirmPassword.trim()) {
        setBusy(false);
        setLocalError("فضلًا أكد كلمة المرور.");
        return;
      }

      if (confirmPassword !== trimmedPassword) {
        setBusy(false);
        setLocalError("كلمة المرور وتأكيدها غير متطابقين.");
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
      setLocalError(friendlyAuthError(submitError?.code));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!firebaseConfigured || busy) return;

    resetTransientState();

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setLocalError(
        "اكتب بريدك الإلكتروني أولًا ثم اضغط على خيار استعادة كلمة المرور."
      );
      return;
    }

    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      setLocalInfo("تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.");
    } catch (submitError: any) {
      setLocalError(friendlyAuthError(submitError?.code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      dir="rtl"
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
              <div className="w-full rounded-[32px] border border-slate-200/80 bg-white/96 p-6 text-right shadow-[0_30px_90px_-48px_rgba(11,23,38,0.24)] backdrop-blur-sm sm:p-8 md:p-10">
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
                      <strong>تنبيه:</strong> إعدادات Firebase غير مكتملة.
                    </SurfaceAlert>
                  ) : null}

                  {effectiveError ? (
                    <SurfaceAlert tone="error">
                      <strong>خطأ:</strong> {effectiveError}
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
                        <FieldLabel>الاسم الكامل</FieldLabel>
                        <Input
                          value={fullName}
                          onChange={event => setFullName(event.target.value)}
                          placeholder="مثال: محمد أحمد"
                          autoComplete="name"
                          disabled={busy}
                          className="h-12 rounded-2xl border-slate-200/80 bg-slate-50/80 px-4 text-base shadow-none"
                        />
                      </div>

                      <div>
                        <FieldLabel>رقم الجوال</FieldLabel>
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
                    <FieldLabel>البريد الإلكتروني</FieldLabel>
                    <Input
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      placeholder="example@gmail.com"
                      autoComplete="email"
                      inputMode="email"
                      dir="ltr"
                      disabled={busy}
                      className="h-12 rounded-2xl border-slate-200/80 bg-slate-50/80 px-4 text-base shadow-none"
                    />
                  </div>

                  <div>
                    <FieldLabel>كلمة المرور</FieldLabel>
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
                            ? "إخفاء كلمة المرور"
                            : "إظهار كلمة المرور"
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
                      <FieldLabel>تأكيد كلمة المرور</FieldLabel>
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
                              ? "إخفاء تأكيد كلمة المرور"
                              : "إظهار تأكيد كلمة المرور"
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
                    {busy ? "جارٍ التنفيذ..." : modeCopy.submitLabel}
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
                      نسيت كلمة المرور؟
                    </button>
                  ) : (
                    <span className="text-sm text-slate-500">
                      كلمة المرور يجب أن تكون 6 أحرف على الأقل.
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
