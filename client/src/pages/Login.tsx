// client/src/pages/Login.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";

type AppRole = "client" | "owner" | "admin" | "accountant" | "staff";

function homeForRole(role: AppRole) {
  if (role === "owner" || role === "admin" || role === "accountant" || role === "staff") {
    return "/dashboard";
  }
  return "/client/dashboard";
}

export default function LoginPage() {
  const { user, loading, error } = useAuth();

  // خذ المسار الحالي + setLocation
  const [location, setLocation] = useLocation();

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localInfo, setLocalInfo] = useState<string | null>(null);

  // Login/Register mode
  const [mode, setMode] = useState<"login" | "register">("login");

  // Form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Register extra fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isInvestor, setIsInvestor] = useState(false);
  const [nationalId, setNationalId] = useState("");

  // تحقق مبسط من ENV
  const firebaseConfigured = useMemo(() => {
    const projectId = (import.meta.env.VITE_FB_PROJECT_ID ?? "").trim();
    const apiKey = (import.meta.env.VITE_FB_API_KEY ?? "").trim();
    return Boolean(projectId && apiKey);
  }, []);

  // Redirect ثابت: إذا المستخدم موجود و loading خلص → وده حسب role
  useEffect(() => {
    if (loading) return;
    if (!user) return;

    const role = ((user as any).role ?? "client") as AppRole;
    const target = homeForRole(role);

    // امنع إعادة التوجيه لنفس الصفحة
    if (location === target) return;

    setLocation(target);
  }, [user, loading, location, setLocation]);

  const normalizeEmail = (v: string) => v.trim().toLowerCase();

  const friendlyAuthError = (code?: string) => {
    switch (code) {
      case "auth/invalid-email":
        return "البريد الإلكتروني غير صحيح.";
      case "auth/missing-password":
        return "فضلاً اكتب كلمة المرور.";
      case "auth/weak-password":
        return "كلمة المرور ضعيفة (على الأقل 6 أحرف).";
      case "auth/user-not-found":
        return "لا يوجد حساب بهذا البريد.";
      case "auth/wrong-password":
        return "كلمة المرور غير صحيحة.";
      case "auth/invalid-credential":
        return "بيانات الدخول غير صحيحة.";
      case "auth/email-already-in-use":
        return "هذا البريد مستخدم بالفعل.";
      case "auth/too-many-requests":
        return "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.";
      case "auth/network-request-failed":
        return "مشكلة اتصال بالإنترنت. حاول مرة أخرى.";
      default:
        return "تعذر تنفيذ العملية. تحقق من إعدادات Firebase.";
    }
  };

  const handleSubmit = async () => {
    if (!firebaseConfigured || busy) return;

    setBusy(true);
    setLocalError(null);
    setLocalInfo(null);

    const e = normalizeEmail(email);
    const p = password;

    if (!e) {
      setBusy(false);
      setLocalError("فضلاً اكتب البريد الإلكتروني.");
      return;
    }
    if (!p) {
      setBusy(false);
      setLocalError("فضلاً اكتب كلمة المرور.");
      return;
    }

    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, e, p);
        // redirect يتم من useEffect
        return;
      }

      // register
      const name = fullName.trim();
      const phoneStr = phone.trim();
      const natId = nationalId.trim();

      if (!name) {
        setBusy(false);
        setLocalError("فضلاً اكتب الاسم الكامل.");
        return;
      }
      if (!phoneStr) {
        setBusy(false);
        setLocalError("فضلاً اكتب رقم الجوال.");
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, e, p);

      // ✅ حدّث Auth profile (مفيد للواجهة + للـ CF إذا احتاج)
      try {
        await updateProfile(cred.user, { displayName: name });
      } catch {
        // ignore
      }

      const ref = doc(db, "users", cred.user.uid);

      // ✅ اكتب/ادمج مباشرة — بدون updateDoc ولا race
      const payload: Record<string, any> = {
        role: "client",
        email: e,
        displayName: name,
        phone: phoneStr, // نخليه string دائمًا
        isInvestor: Boolean(isInvestor),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        source: "ui_signup",
      };

      if (natId) payload.nationalId = natId;

      await setDoc(ref, payload, { merge: true });

      // redirect يتم من useEffect
    } catch (err: any) {
      setLocalError(friendlyAuthError(err?.code));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!firebaseConfigured || busy) return;

    setLocalError(null);
    setLocalInfo(null);

    const e = normalizeEmail(email);
    if (!e) {
      setLocalError("اكتب بريدك الإلكتروني أولاً ثم اضغط (نسيت كلمة المرور).");
      return;
    }

    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, e);
      setLocalInfo("تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك.");
    } catch (err: any) {
      setLocalError(friendlyAuthError(err?.code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div
        style={{
          width: "min(460px, 100%)",
          background: "rgba(255,255,255,0.96)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 18,
          padding: 20,
          boxShadow: "0 12px 40px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
          {mode === "login" ? "تسجيل الدخول" : "إنشاء حساب"}
        </h1>

        <p style={{ marginTop: 8, marginBottom: 14, opacity: 0.75, fontSize: 13 }}>
          تسجيل الدخول يتم عبر البريد وكلمة المرور باستخدام Firebase Auth.
        </p>

        {!firebaseConfigured && (
          <div
            style={{
              marginBottom: 14,
              padding: 12,
              borderRadius: 12,
              background: "rgba(242,183,5,0.12)",
              border: "1px solid rgba(242,183,5,0.35)",
              fontSize: 13,
            }}
          >
            <b>تنبيه:</b> إعدادات Firebase غير مكتملة (ENV).
          </div>
        )}

        {(localError || error) && (
          <div
            style={{
              marginBottom: 14,
              padding: 12,
              borderRadius: 12,
              background: "rgba(220,38,38,0.08)",
              border: "1px solid rgba(220,38,38,0.25)",
              fontSize: 13,
            }}
          >
            <b>خطأ:</b> {localError ?? "حدث خطأ غير متوقع."}
          </div>
        )}

        {localInfo && (
          <div
            style={{
              marginBottom: 14,
              padding: 12,
              borderRadius: 12,
              background: "rgba(16,185,129,0.10)",
              border: "1px solid rgba(16,185,129,0.25)",
              fontSize: 13,
            }}
          >
            {localInfo}
          </div>
        )}

        {/* Fields */}
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>البريد الإلكتروني</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
              inputMode="email"
              disabled={busy}
              style={{
                width: "100%",
                height: 44,
                borderRadius: 14,
                border: "1px solid rgba(0,0,0,0.12)",
                padding: "0 12px",
                outline: "none",
                background: "rgba(255,255,255,0.98)",
              }}
            />
          </div>

          {mode === "register" && (
            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>الاسم الكامل</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="مثال: محمد أحمد"
                autoComplete="name"
                disabled={busy}
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 14,
                  border: "1px solid rgba(0,0,0,0.12)",
                  padding: "0 12px",
                  outline: "none",
                  background: "rgba(255,255,255,0.98)",
                }}
              />
            </div>
          )}

          {mode === "register" && (
            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>رقم الجوال</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05xxxxxxxx"
                autoComplete="tel"
                inputMode="tel"
                disabled={busy}
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 14,
                  border: "1px solid rgba(0,0,0,0.12)",
                  padding: "0 12px",
                  outline: "none",
                  background: "rgba(255,255,255,0.98)",
                }}
              />
            </div>
          )}

          {mode === "register" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={isInvestor}
                onChange={(e) => setIsInvestor(e.target.checked)}
                disabled={busy}
              />
              مستثمر؟
            </label>
          )}

          {mode === "register" && (
            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>
                رقم الهوية/الإقامة (اختياري)
              </label>
              <input
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                placeholder="مثال: 10xxxxxxxx"
                inputMode="numeric"
                disabled={busy}
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 14,
                  border: "1px solid rgba(0,0,0,0.12)",
                  padding: "0 12px",
                  outline: "none",
                  background: "rgba(255,255,255,0.98)",
                }}
              />
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>كلمة المرور</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              disabled={busy}
              style={{
                width: "100%",
                height: 44,
                borderRadius: 14,
                border: "1px solid rgba(0,0,0,0.12)",
                padding: "0 12px",
                outline: "none",
                background: "rgba(255,255,255,0.98)",
              }}
            />

            {mode === "register" && (
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>
                  تأكيد كلمة المرور
                </label>
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  disabled={busy}
                  style={{
                    width: "100%",
                    height: 44,
                    borderRadius: 14,
                    border: "1px solid rgba(0,0,0,0.12)",
                    padding: "0 12px",
                    outline: "none",
                    background: "rgba(255,255,255,0.98)",
                  }}
                />
              </div>
            )}

          </div>

          <button
            onClick={handleSubmit}
            disabled={!firebaseConfigured || busy}
            style={{
              width: "100%",
              height: 44,
              borderRadius: 14,
              border: "none",
              background: !firebaseConfigured || busy ? "rgba(0,0,0,0.25)" : "#111",
              color: "#fff",
              fontWeight: 800,
              cursor: !firebaseConfigured || busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "جاري التنفيذ..." : mode === "login" ? "تسجيل الدخول" : "إنشاء حساب"}
          </button>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "center",
              marginTop: 4,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={!firebaseConfigured || busy}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                color: "#111",
                fontWeight: 700,
                opacity: !firebaseConfigured || busy ? 0.5 : 0.85,
                cursor: !firebaseConfigured || busy ? "not-allowed" : "pointer",
                textDecoration: "underline",
              }}
            >
              نسيت كلمة المرور؟
            </button>

            <button
              type="button"
              onClick={() => {
                if (busy) return;
                setLocalError(null);
                setLocalInfo(null);
                setPassword("");
                setFullName("");
                setPhone("");
                setIsInvestor(false);
                setNationalId("");
                setMode((m) => (m === "login" ? "register" : "login"));
              }}
              disabled={busy}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                color: "#111",
                fontWeight: 800,
                opacity: busy ? 0.5 : 0.9,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {mode === "login" ? "إنشاء حساب جديد" : "لدي حساب بالفعل"}
            </button>
          </div>

          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
            ملاحظة: بعد تسجيل الدخول سيتم توجيهك تلقائيًا حسب دورك (Dashboard للإدارة / Client
            Dashboard للعميل).
          </div>
        </div>
      </div>
    </div>
  );
}
