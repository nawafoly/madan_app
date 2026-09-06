import {
  KeyRound,
  Link2,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { deleteApp, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  inMemoryPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { auth } from "@/_core/firebase";
import {
  friendlyHabatError,
  habatApi,
  type HabatAccessAccount,
} from "./habatAttendanceClient";

type Props = {
  onDataChanged?: () => void | Promise<void>;
};

type AccountMode = "new" | "existing";
type AccessLevel = "employee" | "manager";

const firebaseConfig = {
  apiKey: String(import.meta.env.VITE_FB_API_KEY ?? "").trim(),
  authDomain: String(import.meta.env.VITE_FB_AUTH_DOMAIN ?? "").trim(),
  projectId: String(import.meta.env.VITE_FB_PROJECT_ID ?? "").trim(),
  storageBucket: String(import.meta.env.VITE_FB_STORAGE_BUCKET ?? "").trim(),
  messagingSenderId: String(
    import.meta.env.VITE_FB_MESSAGING_SENDER_ID ?? ""
  ).trim(),
  appId: String(import.meta.env.VITE_FB_APP_ID ?? "").trim(),
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function generateTemporaryPassword() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, value => alphabet[value % alphabet.length]);
  // Guarantee a useful mix even if random selection happens to miss a class.
  random[0] = "H";
  random[1] = "b";
  random[2] = "7";
  random[3] = "!";
  return random.join("");
}

function firebaseAccountError(error: unknown) {
  const code = String((error as { code?: unknown })?.code || "");
  switch (code) {
    case "auth/email-already-in-use":
      return "هذا البريد لديه حساب تسجيل دخول بالفعل. اختر «ربط حساب موجود» بدل إنشاء حساب جديد.";
    case "auth/invalid-email":
      return "البريد الإلكتروني غير صحيح.";
    case "auth/weak-password":
      return "كلمة المرور المؤقتة ضعيفة. استخدم 6 أحرف على الأقل.";
    case "auth/operation-not-allowed":
      return "تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في Firebase.";
    case "auth/too-many-requests":
      return "تم تنفيذ محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.";
    case "auth/user-not-found":
      return "حساب تسجيل الدخول غير موجود.";
    default:
      return friendlyHabatError(error);
  }
}

export default function HabatAccountManagement({ onDataChanged }: Props) {
  const [accounts, setAccounts] = useState<HabatAccessAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAccountId, setBusyAccountId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [mode, setMode] = useState<AccountMode>("new");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("manager");
  const [clockEnabled, setClockEnabled] = useState(false);

  const firebaseConfigured = Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await habatApi<{
        ok: true;
        accounts: HabatAccessAccount[];
      }>("access");
      setAccounts(payload.accounts || []);
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function resetForm() {
    setDisplayName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setAccessLevel("manager");
    setClockEnabled(false);
    setMode("new");
  }

  function changeRole(next: AccessLevel) {
    setAccessLevel(next);
    // Administrative accounts are management-only by default.
    setClockEnabled(next === "employee");
  }

  async function grantHabatAccess(
    targetEmail: string,
    targetDisplayName: string,
    targetAccessLevel: AccessLevel,
    targetClockEnabled: boolean
  ) {
    await habatApi("access", {
      method: "POST",
      body: JSON.stringify({
        email: targetEmail,
        displayName: targetDisplayName || null,
        accessLevel: targetAccessLevel,
        clockEnabled: targetClockEnabled,
      }),
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    const normalizedEmail = normalizeEmail(email);
    const normalizedName = displayName.trim();
    setError("");
    setMessage("");

    if (!isValidEmail(normalizedEmail)) {
      setError("اكتب بريدًا إلكترونيًا صحيحًا.");
      return;
    }
    if (!normalizedName) {
      setError("اكتب اسم صاحب الحساب.");
      return;
    }
    if (mode === "new") {
      if (!firebaseConfigured) {
        setError("إعداد Firebase غير مكتمل لهذا الموقع.");
        return;
      }
      if (password.length < 6) {
        setError("كلمة المرور المؤقتة يجب أن تكون 6 أحرف على الأقل.");
        return;
      }
      if (password !== confirmPassword) {
        setError("تأكيد كلمة المرور غير مطابق.");
        return;
      }
    }

    setSaving(true);
    let provisionedUser: Awaited<
      ReturnType<typeof createUserWithEmailAndPassword>
    >["user"] | null = null;
    let secondaryApp: ReturnType<typeof initializeApp> | null = null;

    try {
      if (mode === "new") {
        const appName = `habat-account-provision-${Date.now()}-${crypto.randomUUID()}`;
        secondaryApp = initializeApp(firebaseConfig, appName);
        const secondaryAuth = getAuth(secondaryApp);
        await setPersistence(secondaryAuth, inMemoryPersistence);

        const credential = await createUserWithEmailAndPassword(
          secondaryAuth,
          normalizedEmail,
          password
        );
        provisionedUser = credential.user;
        await updateProfile(credential.user, { displayName: normalizedName });

        try {
          await grantHabatAccess(
            normalizedEmail,
            normalizedName,
            accessLevel,
            clockEnabled
          );
        } catch (accessError) {
          // Avoid leaving an orphan Firebase login if the Habbat permission write fails.
          try {
            await deleteUser(credential.user);
          } catch (rollbackError) {
            console.warn("[habat-accounts] auth rollback failed", rollbackError);
          }
          provisionedUser = null;
          throw accessError;
        }

        await signOut(secondaryAuth).catch(() => undefined);
      } else {
        await grantHabatAccess(
          normalizedEmail,
          normalizedName,
          accessLevel,
          clockEnabled
        );
      }

      const roleLabel = accessLevel === "manager" ? "إدارة" : "موظف";
      setMessage(
        mode === "new"
          ? `تم إنشاء حساب تسجيل الدخول ومنحه صلاحية ${roleLabel} في حبات الورق.`
          : `تم ربط الحساب الموجود ومنحه صلاحية ${roleLabel} في حبات الورق.`
      );
      resetForm();
      await refresh();
      await onDataChanged?.();
    } catch (caught) {
      setError(firebaseAccountError(caught));
    } finally {
      if (secondaryApp) {
        await deleteApp(secondaryApp).catch(() => undefined);
      }
      void provisionedUser;
      setSaving(false);
    }
  }

  async function patchAccount(
    account: HabatAccessAccount,
    patch: Partial<
      Pick<HabatAccessAccount, "accessLevel" | "clockEnabled" | "isActive">
    >
  ) {
    setBusyAccountId(account.id);
    setError("");
    setMessage("");
    try {
      await habatApi(`access/${encodeURIComponent(account.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await refresh();
      await onDataChanged?.();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setBusyAccountId("");
    }
  }

  async function sendReset(account: HabatAccessAccount) {
    setBusyAccountId(account.id);
    setError("");
    setMessage("");
    try {
      await sendPasswordResetEmail(auth, account.email);
      setMessage(`تم إرسال رابط إعادة تعيين كلمة المرور إلى ${account.email}.`);
    } catch (caught) {
      setError(firebaseAccountError(caught));
    } finally {
      setBusyAccountId("");
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-black p-3 text-white">
                <UsersRound size={22} />
              </div>
              <div>
                <h2 className="text-lg font-black">إدارة الحسابات</h2>
                <p className="mt-1 text-sm text-slate-500">
                  إنشاء حسابات الدخول وربطها بصلاحيات حبات الورق
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => void refresh()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold hover:bg-slate-50"
          >
            <RefreshCw size={16} /> تحديث
          </button>
        </div>

        <div className="mt-6 grid gap-2 rounded-2xl bg-slate-50 p-1 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("new")}
            className={
              mode === "new"
                ? "flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black shadow-sm"
                : "flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-500"
            }
          >
            <UserPlus size={17} /> إنشاء حساب جديد
          </button>
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={
              mode === "existing"
                ? "flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black shadow-sm"
                : "flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-500"
            }
          >
            <Link2 size={17} /> ربط حساب موجود
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-bold">
            الاسم
            <input
              value={displayName}
              onChange={event => setDisplayName(event.target.value)}
              placeholder="اسم صاحب الحساب"
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-slate-900"
              autoComplete="off"
            />
          </label>
          <label className="text-sm font-bold">
            البريد الإلكتروني
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="name@example.com"
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-slate-900"
              autoComplete="off"
            />
          </label>

          {mode === "new" ? (
            <>
              <label className="text-sm font-bold">
                كلمة مرور مؤقتة
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 font-mono outline-none focus:border-slate-900"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const generated = generateTemporaryPassword();
                      setPassword(generated);
                      setConfirmPassword(generated);
                    }}
                    className="rounded-xl border border-slate-200 px-3 text-xs font-black hover:bg-slate-50"
                  >
                    توليد
                  </button>
                </div>
              </label>
              <label className="text-sm font-bold">
                تأكيد كلمة المرور
                <input
                  type="text"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono outline-none focus:border-slate-900"
                  autoComplete="new-password"
                />
              </label>
            </>
          ) : (
            <div className="rounded-2xl bg-blue-50 px-4 py-4 text-sm font-semibold text-blue-800 lg:col-span-2">
              استخدم هذا الخيار عندما يكون البريد لديه حساب Firebase مسبقًا. لن يتم تغيير كلمة مروره؛ سيتم فقط منحه صلاحية دخول حبات الورق.
            </div>
          )}

          <label className="text-sm font-bold">
            نوع الحساب
            <select
              value={accessLevel}
              onChange={event => changeRole(event.target.value as AccessLevel)}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
            >
              <option value="manager">إدارة — يدخل الداشبورد</option>
              <option value="employee">موظف — حضور وانصراف</option>
            </select>
          </label>

          <label className="flex min-h-11 items-center gap-3 self-end rounded-xl bg-slate-50 px-4 text-sm font-bold">
            <input
              type="checkbox"
              checked={clockEnabled}
              onChange={event => setClockEnabled(event.target.checked)}
            />
            يسمح له بتسجيل الحضور والانصراف
          </label>

          <div className="lg:col-span-2">
            {accessLevel === "manager" && !clockEnabled ? (
              <p className="mb-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                هذا الإعداد مناسب لحساب إدارة فقط: يدخل الداشبورد ولا يُحسب كموظف بصمة.
              </p>
            ) : null}
            {error ? (
              <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="mb-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                {message}
              </p>
            ) : null}
            <button
              disabled={saving}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-black px-5 font-black text-white disabled:opacity-50 sm:w-auto sm:min-w-52"
            >
              <Plus size={18} />
              {saving
                ? "جاري الحفظ..."
                : mode === "new"
                  ? "إنشاء الحساب"
                  : "ربط الحساب"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <ShieldCheck size={21} />
          <div>
            <h3 className="font-black">الحسابات المصرح لها</h3>
            <p className="text-sm text-slate-500">
              الإيقاف هنا يمنع دخول حبات الورق ولا يحذف حساب Firebase.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-slate-500">
            جاري تحميل الحسابات...
          </p>
        ) : accounts.length ? (
          <div className="space-y-3">
            {accounts.map(account => {
              const busy = busyAccountId === account.id;
              return (
                <div
                  key={account.id}
                  className="grid gap-4 rounded-2xl border border-slate-100 p-4 xl:grid-cols-[1.4fr_1fr_1fr_auto] xl:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-black">
                      {account.displayName || account.email}
                    </p>
                    <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
                      <Mail size={13} /> {account.email}
                    </p>
                    <p className="mt-2 text-xs font-bold">
                      <span
                        className={
                          account.isActive
                            ? "rounded-full bg-emerald-50 px-2 py-1 text-emerald-700"
                            : "rounded-full bg-slate-100 px-2 py-1 text-slate-500"
                        }
                      >
                        {account.isActive ? "فعال" : "موقوف"}
                      </span>
                    </p>
                  </div>

                  <select
                    value={account.accessLevel}
                    disabled={busy}
                    onChange={event =>
                      void patchAccount(account, {
                        accessLevel: event.target.value as AccessLevel,
                        ...(event.target.value === "manager" && account.clockEnabled
                          ? { clockEnabled: false }
                          : {}),
                      })
                    }
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold"
                  >
                    <option value="manager">إدارة</option>
                    <option value="employee">موظف</option>
                  </select>

                  <label className="flex h-10 items-center gap-2 rounded-xl bg-slate-50 px-3 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={account.clockEnabled}
                      disabled={busy}
                      onChange={event =>
                        void patchAccount(account, {
                          clockEnabled: event.target.checked,
                        })
                      }
                    />
                    حضور وانصراف
                  </label>

                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void sendReset(account)}
                      className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black hover:bg-slate-50 disabled:opacity-50"
                    >
                      <KeyRound size={14} /> إعادة كلمة المرور
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void patchAccount(account, { isActive: !account.isActive })
                      }
                      className={
                        account.isActive
                          ? "rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-50"
                          : "rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-50"
                      }
                    >
                      {account.isActive ? "إيقاف الدخول" : "تفعيل الدخول"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">
            لا توجد حسابات مضافة حتى الآن.
          </p>
        )}
      </section>
    </div>
  );
}
