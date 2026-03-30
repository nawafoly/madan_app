// client/src/_core/hooks/useAuth.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signOut,
  type User as FbUser,
} from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/_core/firebase";
import { resolveUserAccountStatus } from "@/lib/userAccountStatus";

export type AppRole =
  | "owner"
  | "admin"
  | "accountant"
  | "staff"
  | "client"
  | "guest";

export type Permission =
  | "dashboard.view"
  | "projects.view"
  | "projects.manage"
  | "projects.publish"
  | "investments.view"
  | "investments.manage"
  | "users.view"
  | "users.manage"
  | "messages.view"
  | "messages.manage"
  | "reports.view"
  | "financial.view"
  | "financial.edit"
  | "settings.manage";

export const ROLE_DEFAULT_PERMS: Record<AppRole, Permission[]> = {
  owner: [
    "dashboard.view",
    "projects.view",
    "projects.manage",
    "projects.publish",
    "investments.view",
    "investments.manage",
    "users.view",
    "users.manage",
    "messages.view",
    "messages.manage",
    "reports.view",
    "financial.view",
    "financial.edit",
    "settings.manage",
  ],
  admin: [
    "dashboard.view",
    "projects.view",
    "projects.manage",
    "projects.publish",
    "investments.view",
    "investments.manage",
    "users.view",
    "users.manage",
    "messages.view",
    "messages.manage",
    "reports.view",
    "settings.manage",
  ],
  accountant: [
    "dashboard.view",
    "projects.view",
    "investments.view",
    "financial.view",
    "financial.edit",
    "reports.view",
  ],
  staff: ["dashboard.view", "projects.view", "messages.view"],
  client: ["projects.view"],
  guest: ["projects.view"],
};

export const OPS_ROLES: AppRole[] = ["owner", "admin", "accountant", "staff"];

export type AppUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  title?: string | null;
  isActive?: boolean;
  role: AppRole;
  permissionsAllow?: Permission[];
  permissionsDeny?: Permission[];
  firebaseUser?: FbUser;
};

function normalizeRole(role: any): AppRole {
  const r = String(role ?? "")
    .toLowerCase()
    .trim();
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
  return list.filter(x => typeof x === "string") as Permission[];
}

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function isRoleLikeDisplayName(name: string) {
  const n = (name ?? "").trim();
  if (!n) return false;

  const nl = n.toLowerCase();
  if (
    nl === "owner" ||
    nl === "admin" ||
    nl === "accountant" ||
    nl === "staff" ||
    nl === "client" ||
    nl === "guest"
  ) {
    return true;
  }

  if (
    n === "ط£ظˆظ†ط±" ||
    n === "ط§ظˆظ†ط±" ||
    n === "ط§ظ„ط£ظˆظ†ط±" ||
    n === "ط§ظ„ط§ظˆظ†ط±"
  )
    return true;
  if (n === "ط£ط¯ظ…ظ†" || n === "ط§ط¯ظ…ظ†") return true;
  if (
    n === "ظ…ط­ط§ط³ط¨" ||
    n === "ظ…ظˆط¸ظپ" ||
    n === "ط¹ظ…ظٹظ„" ||
    n === "ط²ط§ط¦ط±"
  )
    return true;
  if (n === "ظ…ط§ظ„ظƒ" || n === "ط§ظ„ظ…ط§ظ„ظƒ") return true;

  return false;
}

type UserRuntimeData = {
  role: AppRole;
  permissionsAllow: Permission[];
  permissionsDeny: Permission[];
  isActive: boolean;
  title?: string;
  displayName?: string;
};

function isPermissionDenied(err: any) {
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || "").toLowerCase();
  return (
    code.includes("permission-denied") || msg.includes("permission-denied")
  );
}

function getFallbackRuntime(fb: FbUser): UserRuntimeData {
  void fb;
  return {
    role: "client",
    permissionsAllow: [],
    permissionsDeny: [],
    isActive: true,
  };
}

function getRuntimeFromDocData(fb: FbUser, data: any): UserRuntimeData {
  void fb;
  const rawRole = normalizeText(data?.role ?? data?.roleKey).toLowerCase();
  const role = rawRole ? normalizeRole(rawRole) : "client";

  const displayName = normalizeText(data?.displayName ?? data?.name);
  const title = normalizeText(data?.title);
  const accountStatus = resolveUserAccountStatus(data);

  return {
    role,
    permissionsAllow: normalizePerms(data?.permissionsAllow),
    permissionsDeny: normalizePerms(data?.permissionsDeny),
    isActive: accountStatus.isActive,
    title: title || undefined,
    displayName: displayName || undefined,
  };
}

async function ensureUserDocExists(fb: FbUser) {
  const ref = doc(db, "users", fb.uid);
  const authDisplayName = normalizeText(fb.displayName);
  const authEmail = normalizeText(fb.email);

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        uid: fb.uid,
        email: authEmail || null,
        displayName: authDisplayName || null,
        name: authDisplayName || null,
        active: true,
        role: "client",
        permissionsAllow: [],
        permissionsDeny: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  const data = snap.data() as any;
  const patch: Record<string, unknown> = {};

  if (!normalizeText(data?.uid)) {
    patch.uid = fb.uid;
  }

  if (
    authEmail &&
    normalizeText(data?.email).toLowerCase() !== authEmail.toLowerCase()
  ) {
    patch.email = authEmail;
  }

  if (authDisplayName && !normalizeText(data?.displayName)) {
    patch.displayName = authDisplayName;
  }

  if (authDisplayName && !normalizeText(data?.name)) {
    patch.name = authDisplayName;
  }

  if (Object.keys(patch).length > 0) {
    await setDoc(
      ref,
      {
        ...patch,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
}

async function ensureUserDocAndGetRuntime(
  fb: FbUser
): Promise<UserRuntimeData> {
  try {
    await ensureUserDocExists(fb);
    const snap = await getDoc(doc(db, "users", fb.uid));
    if (snap.exists()) {
      return getRuntimeFromDocData(fb, snap.data());
    }
    return getFallbackRuntime(fb);
  } catch (e: any) {
    if (isPermissionDenied(e)) {
      return getFallbackRuntime(fb);
    }
    return getFallbackRuntime(fb);
  }
}

export function isOpsRole(role: AppRole | null | undefined) {
  return !!role && OPS_ROLES.includes(role);
}

export function getEffectivePermissions(
  user:
    | Pick<AppUser, "role" | "permissionsAllow" | "permissionsDeny">
    | null
    | undefined
): Permission[] {
  if (!user) return [];

  const deny = new Set<Permission>(user.permissionsDeny ?? []);
  const allow = new Set<Permission>(user.permissionsAllow ?? []);
  const baseline = ROLE_DEFAULT_PERMS[user.role] ?? [];

  const effective = new Set<Permission>();

  for (const perm of baseline) {
    if (!deny.has(perm)) effective.add(perm);
  }

  allow.forEach(perm => {
    if (!deny.has(perm)) effective.add(perm);
  });

  return Array.from(effective);
}

export function hasPermission(
  user: AppUser | null | undefined,
  perm: Permission
): boolean {
  if (!user) return false;
  if (user.isActive === false) return false;

  const deny = new Set<Permission>(user.permissionsDeny ?? []);
  if (deny.has(perm)) return false;

  const allow = new Set<Permission>(user.permissionsAllow ?? []);
  if (allow.has(perm)) return true;

  const baseline = ROLE_DEFAULT_PERMS[user.role] ?? [];
  return baseline.includes(perm);
}

function buildAppUserState(fb: FbUser, runtime: UserRuntimeData): AppUser {
  const fbNameRaw = normalizeText(fb.displayName);
  const savedName = normalizeText(runtime.displayName);
  const savedTitle = normalizeText(runtime.title);

  const fbName =
    fbNameRaw && !isRoleLikeDisplayName(fbNameRaw) ? fbNameRaw : "";
  const safeSavedName =
    savedName && !isRoleLikeDisplayName(savedName) ? savedName : "";

  const preferredDisplayName = safeSavedName || fbName || null;
  const preferredTitle = savedTitle || null;

  return {
    uid: fb.uid,
    email: fb.email,
    displayName: preferredDisplayName,
    title: preferredTitle,
    isActive: runtime.isActive,
    role: runtime.role,
    permissionsAllow: runtime.permissionsAllow,
    permissionsDeny: runtime.permissionsDeny,
    firebaseUser: fb,
  };
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

      setUser(buildAppUserState(fb, runtime));
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
    let unsubUserDoc: (() => void) | null = null;

    const cleanupUserDoc = () => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
    };

    const unsubAuth = onAuthStateChanged(auth, async fb => {
      cleanupUserDoc();

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

        setUser(buildAppUserState(fb, runtime));
        setError(null);

        unsubUserDoc = onSnapshot(
          doc(db, "users", fb.uid),
          snap => {
            if (!aliveRef.current) return;

            const nextRuntime = snap.exists()
              ? getRuntimeFromDocData(fb, snap.data())
              : getFallbackRuntime(fb);

            setUser(buildAppUserState(fb, nextRuntime));
            setError(null);
            setLoading(false);
          },
          snapshotError => {
            if (!aliveRef.current) return;

            if (isPermissionDenied(snapshotError)) {
              setUser(buildAppUserState(fb, getFallbackRuntime(fb)));
              setError(null);
            } else {
              setError(snapshotError);
            }

            setLoading(false);
          }
        );
      } catch (e) {
        if (!aliveRef.current) return;
        setError(e);
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      aliveRef.current = false;
      cleanupUserDoc();
      unsubAuth();
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
      effectivePermissions: getEffectivePermissions(user),
    }),
    [user, loading, error, refresh, logout]
  );
}
