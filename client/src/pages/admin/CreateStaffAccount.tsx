import { useMemo, useState, type ReactNode } from "react";
import { Eye, EyeOff, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { initializeApp, deleteApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  updateProfile,
} from "firebase/auth";

import { db } from "@/_core/firebase";
import {
  syncEmployeeDirectoryFromWorker,
  type EmployeeDirectorySyncResult,
} from "@/lib/employeeDirectoryWorker";
import { formatNumberEN } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getRoleDisplayLabel } from "@/lib/ownerAccounts";
import {
  AUDIT_ACTIONS,
  diffAuditTargets,
  logAuditEvent,
  buildAuditSource,
} from "@/lib/auditLog";
import {
  ALL_PERMISSION_KEYS as CENTRAL_PERMISSION_KEYS,
  getEffectivePermissions,
  type Permission,
  useAuth,
} from "@/_core/hooks/useAuth";

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

export default function CreateStaffAccount() {
  const { user } = useAuth();

  const currentRole = String(user?.role ?? "").toLowerCase();

  const canChooseAnyPromoteRole =
    currentRole === "owner" || currentRole === "admin";

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localInfo, setLocalInfo] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [createdEmailForPromote, setCreatedEmailForPromote] = useState("");
  const [createdNameForPromote, setCreatedNameForPromote] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [employeeDirectorySyncing, setEmployeeDirectorySyncing] =
    useState(false);
  const [employeeDirectorySyncSummary, setEmployeeDirectorySyncSummary] =
    useState<EmployeeDirectorySyncResult | null>(null);
  const [promoteRoleKey, setPromoteRoleKey] = useState<
    "staff" | "hr" | "accountant" | "admin" | "owner"
  >("staff");

  const effectivePromoteRoleKey = canChooseAnyPromoteRole
    ? promoteRoleKey
    : "staff";

  const firebaseConfigured = useMemo(() => {
    const projectId = (import.meta.env.VITE_FB_PROJECT_ID ?? "").trim();
    const apiKey = (import.meta.env.VITE_FB_API_KEY ?? "").trim();
    return Boolean(projectId && apiKey);
  }, []);

  const normalizeEmail = (value: string) => value.trim().toLowerCase();
  const formatSyncDateTime = (value?: string | null) => {
    if (!value) return "لم تُنفذ المزامنة من داخل النظام بعد.";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "لم تُنفذ المزامنة من داخل النظام بعد.";
    return `آخر مزامنة: ${date.toLocaleString("en-GB")}`;
  };
  const settingsSource = (method: string) =>
    buildAuditSource({
      area: "admin",
      page: "CreateStaffAccount",
      method,
    });

  const buildDefaultEmployeePayload = ({
    uid,
    email,
    displayName,
    phone = "",
    title = "",
    isActive = true,
  }: {
    uid: string;
    email: string;
    displayName: string;
    phone?: string;
    title?: string;
    isActive?: boolean;
  }) => ({
    uid,
    linkedUserUid: uid,
    email,
    displayName,
    name: displayName,
    phone,
    title: title || null,
    includeInEmployeeManagement: true,
    active: isActive,
    isActive,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    employeeProfile: {
      personal: {},
      employment: {
        employmentStatus: isActive ? "active" : "inactive",
        status: isActive ? "active" : "inactive",
        title: title || null,
        jobTitle: title || null,
        updatedAt: serverTimestamp(),
      },
    },
  });

  const isKnownPermission = (
    permissionKey: unknown
  ): permissionKey is Permission => {
    return CENTRAL_PERMISSION_KEYS.includes(permissionKey as Permission);
  };

  const normalizePermissionOverrides = (
    allow: string[] = [],
    deny: string[] = []
  ): { permissionsAllow: Permission[]; permissionsDeny: Permission[] } => {
    const allowSet = new Set<Permission>(
      (allow || []).filter(isKnownPermission) as Permission[]
    );
    const denySet = new Set<Permission>(
      (deny || []).filter(isKnownPermission) as Permission[]
    );

    denySet.forEach(deniedPermission => {
      allowSet.delete(deniedPermission);
    });

    return {
      permissionsAllow: CENTRAL_PERMISSION_KEYS.filter(permissionKey =>
        allowSet.has(permissionKey)
      ),
      permissionsDeny: CENTRAL_PERMISSION_KEYS.filter(permissionKey =>
        denySet.has(permissionKey)
      ),
    };
  };

  const getEffectivePermissionKeys = (
    roleKey:
      | "owner"
      | "admin"
      | "accountant"
      | "hr"
      | "staff"
      | "client"
      | "guest",
    allow: string[] = [],
    deny: string[] = []
  ): Permission[] => {
    const { permissionsAllow, permissionsDeny } = normalizePermissionOverrides(
      allow,
      deny
    );

    return getEffectivePermissions({
      role: roleKey,
      permissionsAllow,
      permissionsDeny,
    });
  };

  const resetTransientState = () => {
    setLocalError(null);
    setLocalInfo(null);
  };

  const friendlyAuthError = (code?: string) => {
    switch (code) {
      case "auth/invalid-email":
        return "البريد الإلكتروني غير صحيح.";
      case "auth/missing-password":
        return "فضلًا اكتب كلمة المرور.";
      case "auth/weak-password":
        return "كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.";
      case "auth/email-already-in-use":
        return "هذا البريد مستخدم بالفعل.";
      case "auth/network-request-failed":
        return "مشكلة اتصال بالإنترنت. حاول مرة أخرى.";
      default:
        return "تعذر إنشاء الحساب.";
    }
  };

  const handleSubmit = async () => {
    if (!firebaseConfigured || busy) return;

    setBusy(true);
    resetTransientState();

    const normalizedEmail = normalizeEmail(email);
    const trimmedPassword = password;
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

    let authCreatedSuccessfully = false;

    try {
      const secondaryApp = initializeApp(
        {
          apiKey: import.meta.env.VITE_FB_API_KEY,
          authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
          projectId: import.meta.env.VITE_FB_PROJECT_ID,
          appId: import.meta.env.VITE_FB_APP_ID,
        },
        `secondary-${Date.now()}`
      );

      const secondaryAuth = getAuth(secondaryApp);
      let createdUid = "";

      try {
        const cred = await createUserWithEmailAndPassword(
          secondaryAuth,
          normalizedEmail,
          trimmedPassword
        );

        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid,
          email: normalizedEmail,
          displayName: name,
          name,
          phone: phoneValue,
          role: "staff",
          roleKey: "staff",
          title: "",
          active: true,
          isActive: true,
          employeeProfileEnabled: true,
          includeInEmployeeManagement: true,
          linkedEmployeeId: cred.user.uid,
          permissionsAllow: [],
          permissionsDeny: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          source: "create_staff_account_default_employee",
        });

        createdUid = cred.user.uid;
        authCreatedSuccessfully = true;

        try {
          await updateProfile(cred.user, { displayName: name });
        } catch {
          // تجاهل فشل تحديث displayName
        }
      } finally {
        await secondaryAuth.signOut().catch(() => undefined);
        await deleteApp(secondaryApp).catch(() => undefined);
      }

      if (!createdUid) {
        throw new Error("auth_user_not_created");
      }

      await setDoc(
        doc(db, "admin_users", normalizedEmail),
        {
          displayName: name,
          email: normalizedEmail,
          role: "staff",
          roleKey: "staff",
          title: "",
          active: true,
          isActive: true,
          linkedUserUid: createdUid,
          employeeProfileEnabled: true,
          includeInEmployeeManagement: true,
          linkedEmployeeId: createdUid,
          notes: "",
          permissionsAllow: [],
          permissionsDeny: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          source: "create_staff_account_default_employee",
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "employees", createdUid),
        buildDefaultEmployeePayload({
          uid: createdUid,
          email: normalizedEmail,
          displayName: name,
          phone: phoneValue,
          isActive: true,
        }),
        { merge: true }
      );

      setFullName("");
      setPhone("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);

      setLocalInfo("تم إنشاء الحساب كموظف وإنشاء سجل الموظف وربطه تلقائياً.");
      toast.success("تم إنشاء الحساب بنجاح.");
    } catch (submitError: any) {
      console.error("create account error:", submitError);

      if (authCreatedSuccessfully) {
        setLocalError(
          "تم إنشاء الحساب في Authentication، لكن فشلت تهيئة بياناته داخل Firestore بسبب الصلاحيات."
        );
        setLocalInfo(
          "الحساب أُنشئ فعليًا، لكن يلزم إصلاح صلاحيات Firestore أو إكمال التهيئة يدويًا."
        );
      } else if (submitError?.code === "auth/email-already-in-use") {
        setCreatedEmailForPromote(normalizedEmail);
        setCreatedNameForPromote(name);
        setPromoteRoleKey("staff");
        setPromoteDialogOpen(true);
        setLocalError(null);
        setLocalInfo(
          "هذا البريد موجود مسبقًا، لذلك تم فتح خطوة الترقية المباشرة بدل إنشاء حساب جديد."
        );
        toast.success("تم العثور على حساب موجود مسبقًا. أكمل الترقية الآن.");
      } else {
        setLocalError(friendlyAuthError(submitError?.code));
      }
    } finally {
      setBusy(false);
    }
  };

  const promoteExistingUserByEmail = async () => {
    const normalizedTargetEmail = String(createdEmailForPromote || "")
      .trim()
      .toLowerCase();
    const roleKey = effectivePromoteRoleKey;

    if (!normalizedTargetEmail || !normalizedTargetEmail.includes("@")) {
      toast.error("البريد غير صحيح");
      return;
    }

    setPromoting(true);
    setLocalError(null);

    try {
      const q = query(
        collection(db, "users"),
        where("email", "==", normalizedTargetEmail),
        limit(1)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        toast.error(
          "هذا الإيميل ما له حساب مسجل داخل users. تم إنشاء حساب Authentication لكن لم نجد وثيقة users."
        );
        return;
      }

      const userDoc = snap.docs[0];
      const userData = userDoc.data() as any;

      const beforeAdminSnap = await getDoc(
        doc(db, "admin_users", normalizedTargetEmail)
      );
      const beforeAdminData = beforeAdminSnap.exists()
        ? beforeAdminSnap.data()
        : null;

      const { permissionsAllow, permissionsDeny } =
        normalizePermissionOverrides(
          beforeAdminData?.permissionsAllow || [],
          beforeAdminData?.permissionsDeny || []
        );

      const effectivePermissions = getEffectivePermissionKeys(
        roleKey,
        permissionsAllow,
        permissionsDeny
      );

      const displayName = String(
        beforeAdminData?.displayName ||
        userData?.displayName ||
        userData?.name ||
        createdNameForPromote ||
        normalizedTargetEmail.split("@")[0]
      ).trim();

      const title = String(
        beforeAdminData?.title || userData?.title || ""
      ).trim();
      const notes = String(beforeAdminData?.notes || "").trim();
      const isActive = beforeAdminData?.isActive !== false;

      await updateDoc(doc(db, "users", userDoc.id), {
        role: roleKey,
        roleKey,
        active: isActive,
        isActive,
        displayName: displayName || null,
        name: displayName || null,
        title: title || null,
        employeeProfileEnabled: true,
        includeInEmployeeManagement: true,
        linkedEmployeeId: userDoc.id,
        permissionsAllow,
        permissionsDeny,
        updatedAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, "admin_users", normalizedTargetEmail),
        {
          displayName: displayName || "",
          email: normalizedTargetEmail,
          roleKey,
          title,
          isActive,
          linkedUserUid: userDoc.id,
          employeeProfileEnabled: true,
          includeInEmployeeManagement: true,
          linkedEmployeeId: userDoc.id,
          notes,
          permissionsAllow,
          permissionsDeny,
          updatedAt: serverTimestamp(),
          createdAt: userData?.createdAt ?? serverTimestamp(),
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "employees", userDoc.id),
        buildDefaultEmployeePayload({
          uid: userDoc.id,
          email: normalizedTargetEmail,
          displayName,
          phone: String(userData?.phone || "").trim(),
          title,
          isActive,
        }),
        { merge: true }
      );

      const refreshedUserSnap = await getDoc(doc(db, "users", userDoc.id));
      const refreshedAdminSnap = await getDoc(
        doc(db, "admin_users", normalizedTargetEmail)
      );

      await logAuditEvent({
        action: AUDIT_ACTIONS.USER_ROLE_UPDATED,
        category: "user",
        entityType: "user",
        entityId: userDoc.id,
        entityPath: `users/${userDoc.id}`,
        source: settingsSource("promote_existing_user_after_create"),
        relatedIds: { userId: userDoc.id },
        message: `Promoted user ${normalizedTargetEmail} to ${getRoleDisplayLabel(roleKey) || roleKey}`,
        changes: diffAuditTargets([
          {
            label: "user",
            before: userData,
            after: refreshedUserSnap.exists() ? refreshedUserSnap.data() : null,
          },
          {
            label: "admin_user",
            before: beforeAdminData,
            after: refreshedAdminSnap.exists()
              ? refreshedAdminSnap.data()
              : null,
          },
        ]),
        meta: {
          roleKey,
          permissionsAllow,
          permissionsDeny,
          effectivePermissions,
          targetUserEmail: normalizedTargetEmail,
        },
      });

      setLocalInfo(
        `تمت الترقية بنجاح إلى ${getRoleDisplayLabel(roleKey) || roleKey}.`
      );
      toast.success(
        `تمت الترقية بنجاح: ${normalizedTargetEmail} → ${getRoleDisplayLabel(roleKey) || roleKey}`
      );

      setPromoteDialogOpen(false);
      setCreatedEmailForPromote("");
      setCreatedNameForPromote("");
      setPromoteRoleKey("staff");
    } catch (e) {
      console.error(e);
      setLocalError("فشل ترقية المستخدم بعد إنشاء الحساب.");
      toast.error("فشل ترقية المستخدم");
    } finally {
      setPromoting(false);
    }
  };

  const handleSyncEmployeeDirectory = async () => {
    setEmployeeDirectorySyncing(true);

    try {
      const summary = await syncEmployeeDirectoryFromWorker();
      setEmployeeDirectorySyncSummary(summary);

      toast.success(
        `تمت مزامنة دليل الموظفين: ${formatNumberEN(summary.employeesSynced)} سجل`
      );

      void logAuditEvent({
        action: "employee_directory_synced",
        category: "settings",
        entityType: "employee_directory",
        entityId: "d1",
        source: settingsSource("sync_employee_directory_from_create_staff"),
        message: `Synced employee_directory to D1 (${summary.employeesSynced} rows, ${summary.employeesDeleted} deleted).`,
        meta: {
          syncedAt: summary.syncedAt,
          sourceCount: summary.sourceCount,
          employeesSynced: summary.employeesSynced,
          employeesDeleted: summary.employeesDeleted,
          actorRole: currentRole || null,
        },
      }).catch(error => {
        console.warn("employee_directory_sync_audit_failed", error);
      });
    } catch (error) {
      console.error("employee_directory_sync_failed", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "فشلت مزامنة دليل الموظفين."
      );
    } finally {
      setEmployeeDirectorySyncing(false);
    }
  };

  return (
    <DashboardLayout>
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
            <div className="mx-auto max-w-[36rem]">
              <div className="w-full rounded-[32px] border border-slate-200/80 bg-white/96 p-6 text-right shadow-[0_30px_90px_-48px_rgba(11,23,38,0.24)] backdrop-blur-sm sm:p-8 md:p-10">
                <div className="space-y-3">
                  <span className="inline-flex items-center rounded-full bg-[#f7f3ea] px-4 py-1.5 text-xs font-semibold tracking-[0.18em] text-primary/75 ring-1 ring-[#eadfbe]">
                    إنشاء حساب
                  </span>

                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
                    إنشاء حساب جديد
                  </h1>

                  <p className="text-sm leading-7 text-slate-600 sm:text-[15px]">
                    هذه الصفحة مخصصة للموارد البشرية والإدارة. يتم منها إنشاء الحساب
                    أولًا، ثم تنفيذ الترقية الفعلية مباشرة من نفس الصفحة دون الحاجة
                    للانتقال إلى Settings.
                  </p>
                  <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">
                          مزامنة دليل الموظفين
                        </div>

                        <Badge variant="outline" className="rounded-full">
                          {employeeDirectorySyncing
                            ? "جارٍ التنفيذ"
                            : employeeDirectorySyncSummary?.syncedAt
                              ? "تمت آخر مزامنة"
                              : "مزامنة يدوية"}
                        </Badge>
                      </div>

                      <div className="text-sm text-slate-500">
                        {formatSyncDateTime(employeeDirectorySyncSummary?.syncedAt)}
                      </div>

                      {employeeDirectorySyncSummary ? (
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            {formatNumberEN(employeeDirectorySyncSummary.employeesSynced)} سجل
                          </Badge>
                          <Badge variant="outline">
                            حذف {formatNumberEN(employeeDirectorySyncSummary.employeesDeleted)}
                          </Badge>
                          <Badge variant="outline">
                            المصدر {formatNumberEN(employeeDirectorySyncSummary.sourceCount)}
                          </Badge>
                        </div>
                      ) : null}

                      <Button
                        type="button"
                        className="h-12 w-full rounded-full text-sm font-semibold"
                        disabled={employeeDirectorySyncing}
                        onClick={handleSyncEmployeeDirectory}
                      >
                        {employeeDirectorySyncing
                          ? "جارٍ مزامنة دليل الموظفين..."
                          : "مزامنة دليل الموظفين"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  {!firebaseConfigured ? (
                    <SurfaceAlert tone="warning">
                      <strong>تنبيه:</strong> إعدادات Firebase غير مكتملة.
                    </SurfaceAlert>
                  ) : null}

                  {localError ? (
                    <SurfaceAlert tone="error">
                      <strong>خطأ:</strong> {localError}
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
                        autoComplete="new-password"
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

                  <Button
                    type="submit"
                    size="lg"
                    disabled={!firebaseConfigured || busy}
                    className="h-12 w-full rounded-full text-sm font-semibold"
                  >
                    {busy ? "جارٍ التنفيذ..." : "إنشاء الحساب"}
                  </Button>
                </form>

                <div className="mt-5 border-t border-slate-200/80 pt-5">
                  <span className="text-sm text-slate-500">
                    بعد إنشاء الحساب، ستظهر لك نافذة الترقية مباشرة بنفس البريد
                    الذي تم إنشاؤه أو العثور عليه.
                  </span>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      <Dialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <DialogContent
          dir="rtl"
          className="max-w-[980px] overflow-hidden rounded-[28px] border border-slate-200 bg-white p-0 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)]"
        >
          <div className="relative">
            <button
              type="button"
              onClick={() => setPromoteDialogOpen(false)}
              className="absolute left-5 top-5 z-10 rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              aria-label="إغلاق"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-6 sm:px-8">
              <div className="space-y-2">
                <div className="text-xs font-semibold tracking-[0.18em] text-slate-500">
                  الوحدة 01
                </div>
                <DialogHeader className="space-y-2 text-right">
                  <DialogTitle className="text-3xl font-semibold text-slate-950">
                    ترقية مباشرة
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-7 text-slate-600">
                    ترقية مستخدم موجود داخل users مباشرة عبر البريد الإلكتروني،
                    من دون إنشاء حساب جديد.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600">
                <UserRound className="h-6 w-6" />
              </div>
            </div>

            <div className="px-6 py-8 sm:px-8">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-slate-500">
                    الإيميل
                  </div>
                  <Input
                    value={createdEmailForPromote}
                    readOnly
                    dir="ltr"
                    className="h-14 rounded-2xl border-slate-200 bg-slate-50/80 px-4 text-base"
                  />
                  <p className="text-sm leading-7 text-slate-500">
                    البريد المرتبط بالحساب الذي تم إنشاؤه أو العثور عليه.
                    {createdNameForPromote ? ` (${createdNameForPromote})` : ""}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-slate-500">
                    الدور
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                      {canChooseAnyPromoteRole
                        ? "قابل للتغيير"
                        : "ثابت للموارد البشرية"}
                    </span>
                  </div>

                  {canChooseAnyPromoteRole ? (
                    <Select
                      value={promoteRoleKey}
                      onValueChange={(
                        value: "staff" | "hr" | "accountant" | "admin" | "owner"
                      ) => setPromoteRoleKey(value)}
                    >
                      <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-white px-4 text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">موظف (staff)</SelectItem>
                        <SelectItem value="hr">الموارد البشرية (hr)</SelectItem>
                        <SelectItem value="accountant">
                          محاسب (accountant)
                        </SelectItem>
                        <SelectItem value="admin">أدمن (admin)</SelectItem>
                        <SelectItem value="owner">المالك (owner)</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex h-14 items-center justify-between rounded-2xl border border-slate-200 bg-white px-4">
                      <span className="text-base font-medium text-slate-900">
                        موظف (staff)
                      </span>
                      <span className="text-sm text-slate-400">ثابت</span>
                    </div>
                  )}

                  <p className="text-sm leading-7 text-slate-500">
                    {canChooseAnyPromoteRole
                      ? "يمكن للمالك والأدمن اختيار أي دور مباشرة."
                      : "الموارد البشرية يمكنها الترقية إلى staff فقط."}
                  </p>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <Button
                  type="button"
                  onClick={promoteExistingUserByEmail}
                  disabled={promoting}
                  className="h-11 rounded-full bg-[#F2B705] px-6 text-sm font-semibold text-slate-950 hover:bg-[#e7ae04] disabled:opacity-60"
                >
                  {promoting ? "جاري الترقية..." : "ترقية الآن"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
