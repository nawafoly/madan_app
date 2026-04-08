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
  | "hr"
  | "staff"
  | "client"
  | "guest";

export const ALL_PERMISSION_KEYS = [
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
  "recruitment.view",
  "recruitment.manage",
  "employees.view",
  "employees.manage",
  "reports.view",
  "financial.view",
  "financial.edit",
  "settings.manage",
] as const;

export type Permission = (typeof ALL_PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard.view": "عرض لوحة التحكم",
  "projects.view": "عرض المشاريع",
  "projects.manage": "إدارة المشاريع (إنشاء/تعديل/نشر)",
  "projects.publish": "نشر المشاريع (Publish)",
  "investments.view": "عرض الاستثمارات",
  "investments.manage": "إدارة الاستثمارات (موافقة/رفض/تحديث)",
  "users.view": "عرض العملاء",
  "users.manage": "إدارة العملاء (VIP/ملاحظات)",
  "messages.view": "عرض الرسائل",
  "messages.manage": "إدارة الرسائل",
  "recruitment.view": "عرض طلبات التوظيف",
  "recruitment.manage": "إدارة طلبات التوظيف",
  "employees.view": "عرض الموظفين",
  "employees.manage": "إدارة الموظفين",
  "reports.view": "عرض التقارير",
  "financial.view": "عرض المالية",
  "financial.edit": "تعديل المالية",
  "settings.manage": "إدارة الإعدادات",
};

export const PERMISSION_DEFINITIONS: ReadonlyArray<{
  key: Permission;
  label: string;
}> = ALL_PERMISSION_KEYS.map(key => ({
  key,
  label: PERMISSION_LABELS[key],
}));

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
    "recruitment.view",
    "recruitment.manage",
    "employees.view",
    "employees.manage",
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
    "recruitment.view",
    "recruitment.manage",
    "employees.view",
    "employees.manage",
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
  hr: [
    "recruitment.view",
    "recruitment.manage",
    "employees.view",
    "employees.manage",
  ],
  staff: [],
  client: ["projects.view"],
  guest: ["projects.view"],
};

export const OPS_ROLES: AppRole[] = ["owner", "admin", "accountant", "hr"];

export type AppUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  title?: string | null;
  isActive?: boolean;
  role: AppRole;
  permissionsAllow?: Permission[];
  permissionsDeny?: Permission[];
  employeeProfileEnabled?: boolean;
  linkedEmployeeId?: string | null;
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
    r === "hr" ||
    r === "staff" ||
    r === "client"
  ) {
    return r;
  }

  if (
    r === "human_resources" ||
    r === "human-resources" ||
    r === "human resources"
  ) {
    return "hr";
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

function normalizeOptionalText(value: unknown) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function isRoleLikeDisplayName(name: string) {
  const n = (name ?? "").trim();
  if (!n) return false;

  const nl = n.toLowerCase();
  if (
    nl === "owner" ||
    nl === "admin" ||
    nl === "accountant" ||
    nl === "hr" ||
    nl === "staff" ||
    nl === "client" ||
    nl === "guest"
  ) {
    return true;
  }

  if (
    n === "أونر" ||
    n === "اونر" ||
    n === "الأونر" ||
    n === "الاونر"
  )
    return true;
  if (n === "أدمن" || n === "ادمن") return true;
  if (
    n === "محاسب" ||
    n === "موظف" ||
    n === "عميل" ||
    n === "زائر"
  )
    return true;
  if (n === "مالك" || n === "المالك") return true;

  return false;
}

type UserRuntimeData = {
  role: AppRole;
  permissionsAllow: Permission[];
  permissionsDeny: Permission[];
  isActive: boolean;
  title?: string;
  displayName?: string;
  employeeProfileEnabled: boolean;
  linkedEmployeeId: string | null;
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
    employeeProfileEnabled: false,
    linkedEmployeeId: null,
  };
}

function getRuntimeFromUserDocData(fb: FbUser, data: any): UserRuntimeData {
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
    employeeProfileEnabled: normalizeBoolean(data?.employeeProfileEnabled),
    linkedEmployeeId: normalizeOptionalText(data?.linkedEmployeeId),
  };
}

function getRuntimeFromAdminUserDocData(
  fb: FbUser,
  data: any
): UserRuntimeData {
  void fb;
  const rawRole = normalizeText(data?.roleKey ?? data?.role).toLowerCase();
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
    employeeProfileEnabled: normalizeBoolean(data?.employeeProfileEnabled),
    linkedEmployeeId: normalizeOptionalText(data?.linkedEmployeeId),
  };
}

function getAdminUserDocId(email: string | null | undefined) {
  const normalizedEmail = normalizeText(email).toLowerCase();
  return normalizedEmail || "";
}

function mergeRuntimeData(
  fb: FbUser,
  userRuntime: UserRuntimeData | null,
  adminRuntime: UserRuntimeData | null
): UserRuntimeData {
  const base = userRuntime ?? getFallbackRuntime(fb);
  if (!adminRuntime) return base;

  const adminHasPrivilegedRole =
    adminRuntime.role !== "client" && adminRuntime.role !== "guest";
  const shouldUseAdminRole =
    adminHasPrivilegedRole &&
    (base.role === "client" || base.role === "guest");
  const shouldUseAdminPermissions =
    adminHasPrivilegedRole &&
    (shouldUseAdminRole || adminRuntime.role === base.role);

  return {
    role: shouldUseAdminRole ? adminRuntime.role : base.role,
    permissionsAllow: shouldUseAdminPermissions
      ? adminRuntime.permissionsAllow
      : base.permissionsAllow,
    permissionsDeny: shouldUseAdminPermissions
      ? adminRuntime.permissionsDeny
      : base.permissionsDeny,
    isActive: base.isActive && adminRuntime.isActive,
    title: base.title || adminRuntime.title,
    displayName: base.displayName || adminRuntime.displayName,
    employeeProfileEnabled:
      base.employeeProfileEnabled || adminRuntime.employeeProfileEnabled,
    linkedEmployeeId: adminRuntime.linkedEmployeeId || base.linkedEmployeeId,
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
  const userRef = doc(db, "users", fb.uid);
  const adminUserDocId = getAdminUserDocId(fb.email);
  const adminUserRef = adminUserDocId
    ? doc(db, "admin_users", adminUserDocId)
    : null;

  try {
    await ensureUserDocExists(fb);
  } catch (e: any) {
    if (!isPermissionDenied(e)) {
      return getFallbackRuntime(fb);
    }
  }

  try {
    const [userSnap, adminUserSnap] = await Promise.all([
      getDoc(userRef),
      adminUserRef ? getDoc(adminUserRef) : Promise.resolve(null),
    ]);

    const userRuntime = userSnap.exists()
      ? getRuntimeFromUserDocData(fb, userSnap.data())
      : getFallbackRuntime(fb);
    const adminRuntime =
      adminUserSnap && adminUserSnap.exists()
        ? getRuntimeFromAdminUserDocData(fb, adminUserSnap.data())
        : null;

    return mergeRuntimeData(fb, userRuntime, adminRuntime);
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

type PermissionSubject = Pick<
  AppUser,
  "role" | "permissionsAllow" | "permissionsDeny" | "isActive"
>;

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
  user: PermissionSubject | null | undefined,
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

export function getHomePathForRole(role: AppRole | null | undefined) {
  if (!role) return "/login";
  if (role === "owner" || role === "admin" || role === "accountant") {
    return "/dashboard";
  }
  if (role === "hr") return "/admin/recruitment-applications";
  if (role === "staff") return "/employee/profile";
  if (role === "client" || role === "guest") return "/client/dashboard";
  return "/projects";
}

export function getHomePathForUser(user: PermissionSubject | null | undefined) {
  if (!user) return "/login";

  if (user.role === "staff") return "/employee/profile";
  if (user.role === "client" || user.role === "guest") return "/client/dashboard";

  if (user.role === "hr") {
    if (
      hasPermission(user, "recruitment.view") ||
      hasPermission(user, "recruitment.manage")
    ) {
      return "/admin/recruitment-applications";
    }
    if (
      hasPermission(user, "employees.view") ||
      hasPermission(user, "employees.manage")
    ) {
      return "/admin/employees";
    }
  }

  if (isOpsRole(user.role)) {
    if (hasPermission(user, "dashboard.view")) return "/dashboard";
    if (
      hasPermission(user, "recruitment.view") ||
      hasPermission(user, "recruitment.manage")
    ) {
      return "/admin/recruitment-applications";
    }
    if (
      hasPermission(user, "employees.view") ||
      hasPermission(user, "employees.manage")
    ) {
      return "/admin/employees";
    }
    if (hasPermission(user, "messages.view")) return "/admin/messages";
    if (hasPermission(user, "users.view")) return "/admin/clients";
    if (hasPermission(user, "projects.manage")) return "/admin/projects";
    if (hasPermission(user, "financial.view")) return "/admin/financial";
    if (hasPermission(user, "reports.view")) return "/admin/reports";
  }

  if (hasPermission(user, "projects.view")) return "/projects";
  return getHomePathForRole(user.role);
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
    employeeProfileEnabled: runtime.employeeProfileEnabled,
    linkedEmployeeId: runtime.linkedEmployeeId,
    firebaseUser: fb,
  };
}

export function canAccessEmployeeProfile(
  user:
    | Pick<AppUser, "role" | "employeeProfileEnabled" | "linkedEmployeeId">
    | null
    | undefined
): boolean {
  if (!user) return false;
  return (
    user.role === "staff" ||
    user.employeeProfileEnabled === true ||
    !!normalizeText(user.linkedEmployeeId)
  );
}

export const hasEmployeeProfileAccess = canAccessEmployeeProfile;

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
    let unsubAdminUserDoc: (() => void) | null = null;

    const cleanupUserDoc = () => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      if (unsubAdminUserDoc) {
        unsubAdminUserDoc();
        unsubAdminUserDoc = null;
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

        const adminUserDocId = getAdminUserDocId(fb.email);
        const adminUserRef = adminUserDocId
          ? doc(db, "admin_users", adminUserDocId)
          : null;
        let latestUserDocData: any | null | undefined = undefined;
        let latestAdminUserDocData: any | null | undefined = adminUserRef
          ? undefined
          : null;

        const publishRuntime = () => {
          if (!aliveRef.current) return;
          if (latestUserDocData === undefined) return;
          if (adminUserRef && latestAdminUserDocData === undefined) return;

          const nextUserRuntime = latestUserDocData
            ? getRuntimeFromUserDocData(fb, latestUserDocData)
            : getFallbackRuntime(fb);
          const nextAdminRuntime = latestAdminUserDocData
            ? getRuntimeFromAdminUserDocData(fb, latestAdminUserDocData)
            : null;

          setUser(
            buildAppUserState(
              fb,
              mergeRuntimeData(fb, nextUserRuntime, nextAdminRuntime)
            )
          );
          setError(null);
          setLoading(false);
        };

        unsubUserDoc = onSnapshot(
          doc(db, "users", fb.uid),
          snap => {
            if (!aliveRef.current) return;

            latestUserDocData = snap.exists() ? snap.data() : null;
            publishRuntime();
          },
          snapshotError => {
            if (!aliveRef.current) return;

            if (isPermissionDenied(snapshotError)) {
              latestUserDocData = null;
              publishRuntime();
            } else {
              setError(snapshotError);
              latestUserDocData = null;
              publishRuntime();
            }
          }
        );

        if (adminUserRef) {
          unsubAdminUserDoc = onSnapshot(
            adminUserRef,
            snap => {
              if (!aliveRef.current) return;

              latestAdminUserDocData = snap.exists() ? snap.data() : null;
              publishRuntime();
            },
            snapshotError => {
              if (!aliveRef.current) return;

              if (!isPermissionDenied(snapshotError)) {
                setError(snapshotError);
              }

              latestAdminUserDocData = null;
              publishRuntime();
            }
          );
        }
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
