// client/src/_core/hooks/useAuth.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut, type User as FbUser } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/_core/firebase";

/**
 * ✅ ruols (FINAL)
 * owner / admin / accountant / staff / client / guest
 */
export type AppRole =
  | "owner"
  | "admin"
  | "accountant"
  | "staff"
  | "client"
  | "guest";

/**
 * ✅ Permission Keys (مرنة)
 * - تقدر توسعها لاحقًا بدون كسر النظام (بس أضف مفاتيح جديدة)
 */
export type Permission =
  | "project.view"
  | "project.create"
  | "project.edit"
  | "project.publish"
  | "project.delete"
  | "financial.view"
  | "financial.edit"
  | "users.manage"
  | "settings.manage";

/**
 * ✅ Role -> default permissions (Baseline)
 * ملاحظة: هذا الأساس، لكن:
 * - permissionsDeny يفوز دائمًا
 * - permissionsAllow يضيف صلاحيات حتى لو الدور ما يسمح
 */
const ROLE_DEFAULT_PERMS: Record<AppRole, Permission[]> = {
  owner: [
    "project.view",
    "project.create",
    "project.edit",
    "project.publish",
    "project.delete",
    "financial.view",
    "financial.edit",
    "users.manage",
    "settings.manage",
  ],
  admin: [
    "project.view",
    "project.create",
    "project.edit",
    "project.publish",
    // بدون حذف نهائي ولا إعدادات حساسة ولا ماليات تعديل
    "financial.view",
  ],
  accountant: [
    "project.view",
    // مالي فقط
    "financial.view",
    "financial.edit",
    // ملاحظة: ما نعطي publish افتراضيًا، تقدر تضيفها لاحقًا عبر allow
  ],
  staff: [
    "project.view",
    // تشغيلية بسيطة
  ],
  client: ["project.view"],
  guest: ["project.view"],
};

export type AppUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  role: AppRole;

  /** ✅ Flexible permissions overrides (per-user) */
  permissionsAllow?: Permission[];
  permissionsDeny?: Permission[];

  firebaseUser?: FbUser;
};

function normalizeRole(role: any): AppRole {
  if (
    role === "owner" ||
    role === "admin" ||
    role === "accountant" ||
    role === "staff" ||
    role === "client"
  ) {
    return role;
  }
  return "guest";
}

function normalizePerms(list: any): Permission[] {
  if (!Array.isArray(list)) return [];
  return list.filter((x) => typeof x === "string") as Permission[];
}

/** ✅ Bootstrap Owner emails (عدّلها براحتك) */
const BOOTSTRAP_OWNER_EMAILS = new Set<string>(["nawafaaa0@gmail.com"]);

function isBootstrapOwnerEmail(email?: string | null) {
  const e = (email ?? "").toLowerCase().trim();
  return Boolean(e) && BOOTSTRAP_OWNER_EMAILS.has(e);
}

type UserRuntimeData = {
  role: AppRole;
  permissionsAllow: Permission[];
  permissionsDeny: Permission[];
};

async function ensureUserDocAndGetRuntime(fb: FbUser): Promise<UserRuntimeData> {
  const ref = doc(db, "users", fb.uid);

  // ✅ أي حساب مسجّل دخول = client افتراضيًا
  // ✅ bootstrap owner = owner
  const bootstrapRole: AppRole = isBootstrapOwnerEmail(fb.email) ? "owner" : "client";

  try {
    const snap = await getDoc(ref);

    // ✅ موجود: رجّع role + perms + حدّث updatedAt
    if (snap.exists()) {
      const data = snap.data() as any;

      let role = normalizeRole(data?.role);

      // ✅ تصحيح تلقائي: لا يوجد guest لمستخدم مسجّل دخول
      if (role === "guest" && !isBootstrapOwnerEmail(fb.email)) {
        role = "client";
      }

      const permissionsAllow = normalizePerms(data?.permissionsAllow);
      const permissionsDeny = normalizePerms(data?.permissionsDeny);

      await setDoc(
        ref,
        {
          uid: fb.uid,
          email: fb.email ?? null,
          displayName: fb.displayName ?? null,
          role,
          permissionsAllow,
          permissionsDeny,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      return { role, permissionsAllow, permissionsDeny };
    }

    // ✅ غير موجود: أنشئ doc من الصفر
    await setDoc(
      ref,
      {
        uid: fb.uid,
        email: fb.email ?? null,
        displayName: fb.displayName ?? null,
        role: bootstrapRole,
        permissionsAllow: [],
        permissionsDeny: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { role: bootstrapRole, permissionsAllow: [], permissionsDeny: [] };
  } catch {
    // ✅ لا نعلّق النظام بسبب Firestore
    // (لو صار خطأ قراءة/كتابة، نخلي الدور guest مؤقتًا)
    return { role: "guest", permissionsAllow: [], permissionsDeny: [] };
  }
}

/**
 * ✅ Core permission check
 * القاعدة:
 * 1) Deny يفوز دائمًا
 * 2) Allow يضيف صلاحية
 * 3) Role baseline fallback
 */
export function hasPermission(
  user: AppUser | null | undefined,
  perm: Permission
): boolean {
  if (!user) return false;

  const deny = new Set<Permission>(user.permissionsDeny ?? []);
  if (deny.has(perm)) return false;

  const allow = new Set<Permission>(user.permissionsAllow ?? []);
  if (allow.has(perm)) return true;

  const baseline = ROLE_DEFAULT_PERMS[user.role] ?? [];
  return baseline.includes(perm);
}

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const fb = auth.currentUser;

    if (!fb) {
      setUser(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const runtime = await ensureUserDocAndGetRuntime(fb);
      if (!aliveRef.current) return;

      setUser({
        uid: fb.uid,
        email: fb.email,
        displayName: fb.displayName,
        role: runtime.role,
        permissionsAllow: runtime.permissionsAllow,
        permissionsDeny: runtime.permissionsDeny,
        firebaseUser: fb,
      });
      setError(null);
    } catch (e) {
      if (!aliveRef.current) return;
      setError(e);
    } finally {
      if (!aliveRef.current) return;
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } finally {
      setUser(null);
      setError(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;

    const unsub = onAuthStateChanged(auth, async (fb) => {
      if (!aliveRef.current) return;

      if (!fb) {
        setUser(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const runtime = await ensureUserDocAndGetRuntime(fb);
        if (!aliveRef.current) return;

        setUser({
          uid: fb.uid,
          email: fb.email,
          displayName: fb.displayName,
          role: runtime.role,
          permissionsAllow: runtime.permissionsAllow,
          permissionsDeny: runtime.permissionsDeny,
          firebaseUser: fb,
        });
        setError(null);
      } catch (e) {
        if (!aliveRef.current) return;
        setError(e);
        setUser(null);
      } finally {
        if (!aliveRef.current) return;
        setLoading(false);
      }
    });

    return () => {
      aliveRef.current = false;
      unsub();
    };
  }, []);

  return useMemo(
    () => ({
      user,
      loading,
      error,
      refresh,
      logout,
      hasPermission: (perm: Permission) => hasPermission(user, perm),
    }),
    [user, loading, error, refresh, logout]
  );
}
