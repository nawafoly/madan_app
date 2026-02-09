// client/src/_core/hooks/useAuth.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut, type User as FbUser } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/_core/firebase";

/**
 * ✅ roles (FINAL)
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
    "financial.view",
  ],
  accountant: ["project.view", "financial.view", "financial.edit"],
  staff: ["project.view"],
  client: ["project.view"],
  guest: ["project.view"],
};

export type AppUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  role: AppRole;

  permissionsAllow?: Permission[];
  permissionsDeny?: Permission[];

  firebaseUser?: FbUser;
};

function normalizeRole(role: any): AppRole {
  const r = String(role ?? "").toLowerCase().trim();
  if (
    r === "owner" ||
    r === "admin" ||
    r === "accountant" ||
    r === "staff" ||
    r === "client"
  ) {
    return r;
  }
  return "guest";
}

function normalizePerms(list: any): Permission[] {
  if (!Array.isArray(list)) return [];
  return list.filter((x) => typeof x === "string") as Permission[];
}

/** ✅ Bootstrap Owners (Email + UID) */
const BOOTSTRAP_OWNER_EMAILS = new Set<string>([
  "nawafaaa0@gmail.com",
  "nawaf@gmail.com",
]);

const BOOTSTRAP_OWNER_UIDS = new Set<string>([
  "wmYxCYS85eOcr4XFqHkoIPYB8OF2",
]);

function isBootstrapOwner(fb?: FbUser | null) {
  const email = (fb?.email ?? "").toLowerCase().trim();
  const uid = fb?.uid ?? "";
  return (email && BOOTSTRAP_OWNER_EMAILS.has(email)) || (uid && BOOTSTRAP_OWNER_UIDS.has(uid));
}


type UserRuntimeData = {
  role: AppRole;
  permissionsAllow: Permission[];
  permissionsDeny: Permission[];
};

// ✅ helper: نميّز permission-denied
function isPermissionDenied(err: any) {
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || "").toLowerCase();
  return code.includes("permission-denied") || msg.includes("permission-denied");
}

/**
 * ✅ IMPORTANT FIX:
 * - إذا وثيقة المستخدم موجودة: لا تكتب role ولا perms (عشان الـ Rules تمنع)
 * - إذا غير موجودة: create مرّة واحدة (مسموح)
 * - إذا صار permission-denied: لا نحول Guest (عشان لا يطيح الدخول)
 */
async function ensureUserDocAndGetRuntime(fb: FbUser): Promise<UserRuntimeData> {
  const ref = doc(db, "users", fb.uid);

  // ✅ افتراضيًا أي حساب مسجّل دخول = client
  // ✅ bootstrap owner = owner
  const bootstrapRole: AppRole = isBootstrapOwner(fb) ? "owner" : "client";

  try {
    const snap = await getDoc(ref);

    // ✅ موجود: اقرأ role+perms فقط + (اختياري) حدث updatedAt بدون role
    if (snap.exists()) {
      const data = snap.data() as any;

      let role = normalizeRole(data?.role);

      // ✅ لا يوجد guest لمستخدم مسجّل دخول (إلا الأونر bootstrap)
      if (role === "guest" && !isBootstrapOwner(fb)) {
        role = "client";
      }

      const permissionsAllow = normalizePerms(data?.permissionsAllow);
      const permissionsDeny = normalizePerms(data?.permissionsDeny);

      // ✅ تحديث آمن بدون role/perms (مسموح عندك)
      // ملاحظة: هذا best-effort، لو فشل ما نطيّح الدخول
      try {
        await setDoc(
          ref,
          {
            uid: fb.uid,
            email: fb.email ?? null,
            displayName: fb.displayName ?? null,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {
        // ignore
      }

      return { role, permissionsAllow, permissionsDeny };
    }

    // ✅ غير موجود: أنشئ doc من الصفر (create مسموح)
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
  } catch (e: any) {
    // ✅ إذا rules مانعة: لا نخرب الدخول -> خله client/owner
    if (isPermissionDenied(e)) {
      const fallbackRole: AppRole = isBootstrapOwner(fb) ? "owner" : "client";
      return { role: fallbackRole, permissionsAllow: [], permissionsDeny: [] };
    }

    // ✅ أي خطأ ثاني: برضه لا نطيّح الدخول (خلّه client/owner)
    const fallbackRole: AppRole = isBootstrapOwner(fb) ? "owner" : "client";
    return { role: fallbackRole, permissionsAllow: [], permissionsDeny: [] };
  }
}

/**
 * ✅ Core permission check
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
