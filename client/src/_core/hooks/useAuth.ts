// client/src/_core/hooks/useAuth.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut, type User as FbUser } from "firebase/auth";

import { auth } from "@/_core/firebase";
import { getHrCoreMe, isHrCoreConfigured, type HrCoreAccount } from "@/lib/hrCoreApi";
import { getCurrentAppSurface, type AppSurface } from "@/lib/appSurface";

export type AppRole = "owner" | "admin" | "accountant" | "hr" | "staff" | "client" | "guest";

export const ALL_PERMISSION_KEYS = [
  "dashboard.view", "projects.view", "projects.manage", "projects.publish",
  "investments.view", "investments.manage", "users.view", "users.manage",
  "messages.view", "messages.manage", "recruitment.view", "recruitment.manage",
  "employees.view", "employees.manage", "attendance.view",
  "weekly_reports.manager_notes", "daily_tasks.manager_notes", "reports.view", "financial.view",
  "financial.edit", "settings.manage", "admin_accounts.manage",
] as const;

export type Permission = (typeof ALL_PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard.view": "عرض لوحة التحكم",
  "projects.view": "عرض المشاريع",
  "projects.manage": "إدارة المشاريع (إنشاء/تعديل/نشر)",
  "projects.publish": "نشر المشاريع (Publish)",
  "investments.view": "عرض الاستثمارات",
  "investments.manage": "إدارة الاستثمارات",
  "users.view": "عرض العملاء",
  "users.manage": "إدارة العملاء (VIP/ملاحظات)",
  "messages.view": "عرض الرسائل",
  "messages.manage": "إدارة الرسائل",
  "recruitment.view": "عرض طلبات التوظيف",
  "recruitment.manage": "إدارة طلبات التوظيف",
  "employees.view": "عرض الموظفين",
  "employees.manage": "إدارة الموظفين",
  "attendance.view": "عرض الحضور والانصراف",
  "weekly_reports.manager_notes": "كتابة ملاحظات المدير في التقرير الأسبوعي",
  "daily_tasks.manager_notes": "مراجعة المهام اليومية وكتابة ملاحظات الإدارة",
  "reports.view": "عرض التقارير",
  "financial.view": "عرض المالية",
  "financial.edit": "تعديل المالية",
  "settings.manage": "إدارة الإعدادات",
  "admin_accounts.manage": "إدارة حسابات الإدارة",
};

export const PERMISSION_DEFINITIONS: ReadonlyArray<{ key: Permission; label: string }> =
  ALL_PERMISSION_KEYS.map(key => ({ key, label: PERMISSION_LABELS[key] }));

export const ROLE_DEFAULT_PERMS: Record<AppRole, Permission[]> = {
  owner: [...ALL_PERMISSION_KEYS],
  admin: [
    "dashboard.view", "projects.view", "projects.manage", "projects.publish",
    "investments.view", "investments.manage", "users.view", "users.manage",
    "messages.view", "messages.manage", "recruitment.view", "recruitment.manage",
    "employees.view", "employees.manage", "attendance.view", "reports.view",
    "settings.manage",
  ],
  accountant: ["dashboard.view", "projects.view", "investments.view", "financial.view", "financial.edit", "reports.view"],
  hr: ["recruitment.view", "recruitment.manage", "employees.view", "employees.manage", "attendance.view"],
  staff: [],
  client: ["projects.view"],
  guest: ["projects.view"],
};

export const OPS_ROLES: AppRole[] = ["owner", "admin", "accountant", "hr"];
export const INVESTMENT_ADMIN_ROLES: AppRole[] = ["owner", "admin", "accountant"];
export const STAFF_ADMIN_ROLES: AppRole[] = ["owner", "admin", "hr", "staff"];

export type AppUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  title?: string | null;
  isActive?: boolean;
  role: AppRole;
  permissionsAllow?: Permission[];
  permissionsDeny?: Permission[];
  effectivePermissions?: Permission[];
  employeeProfileEnabled?: boolean;
  linkedEmployeeId?: string | null;
  firebaseUser?: FbUser;
};

type UserRuntimeData = {
  role: AppRole;
  permissionsAllow: Permission[];
  permissionsDeny: Permission[];
  effectivePermissions?: Permission[];
  isActive: boolean;
  title?: string;
  displayName?: string;
  employeeProfileEnabled: boolean;
  linkedEmployeeId: string | null;
};

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function normalizeRole(value: unknown): AppRole {
  const role = normalizeText(value).toLowerCase();
  if (["owner", "admin", "accountant", "hr", "staff", "client", "guest"].includes(role)) {
    return role as AppRole;
  }
  if (role === "employee") return "staff";
  if (["human_resources", "human-resources", "human resources"].includes(role)) return "hr";
  return "guest";
}

function normalizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(ALL_PERMISSION_KEYS);
  return Array.from(new Set(value.map(normalizeText).filter((item): item is Permission => allowed.has(item))));
}

function isRoleLikeDisplayName(name: string) {
  return [
    "owner", "admin", "accountant", "hr", "staff", "client", "guest",
    "أونر", "اونر", "الأونر", "الاونر", "أدمن", "ادمن",
    "محاسب", "موظف", "عميل", "زائر", "مالك", "المالك",
  ].includes(normalizeText(name).toLowerCase());
}

function getPublicClientRuntime(fb: FbUser): UserRuntimeData {
  const displayName = normalizeText(fb.displayName);
  return {
    role: "client",
    permissionsAllow: [],
    permissionsDeny: [],
    effectivePermissions: ["projects.view"],
    isActive: true,
    displayName: displayName || undefined,
    employeeProfileEnabled: false,
    linkedEmployeeId: null,
  };
}

function getDeniedStaffRuntime(): UserRuntimeData {
  return {
    role: "guest",
    permissionsAllow: [],
    permissionsDeny: [],
    effectivePermissions: [],
    isActive: false,
    employeeProfileEnabled: false,
    linkedEmployeeId: null,
  };
}

function getRuntimeFromHrCore(account: HrCoreAccount, permissions: string[]): UserRuntimeData {
  return {
    role: normalizeRole(account.role),
    permissionsAllow: [],
    permissionsDeny: [],
    effectivePermissions: normalizePermissions(permissions),
    isActive: account.isActive,
    title: normalizeText(account.title) || undefined,
    displayName: normalizeText(account.displayName) || undefined,
    employeeProfileEnabled: account.employeeProfileEnabled,
    linkedEmployeeId: normalizeText(account.linkedEmployeeId) || null,
  };
}

function getHrCoreErrorStatus(error: unknown) {
  return Number((error as { status?: unknown })?.status || 0);
}

function getHrCoreErrorCode(error: unknown) {
  return normalizeText((error as { code?: unknown })?.code).toLowerCase();
}

function isMissingHrCoreAccount(error: unknown) {
  const status = getHrCoreErrorStatus(error);
  const code = getHrCoreErrorCode(error);
  return status === 404 || code.includes("account_not_found") || code.includes("requester_not_found") || code.includes("requester_account_not_found");
}

async function resolveRuntime(fb: FbUser, surface: AppSurface): Promise<UserRuntimeData> {
  if (!isHrCoreConfigured()) {
    if (surface === "staff") throw new Error("HR Core API is not configured.");
    return getPublicClientRuntime(fb);
  }

  try {
    const result = await getHrCoreMe();
    if (result.account.uid !== fb.uid) throw new Error("HR Core account identity mismatch.");
    return getRuntimeFromHrCore(result.account, result.permissions);
  } catch (error) {
    if (isMissingHrCoreAccount(error)) {
      return surface === "staff" ? getDeniedStaffRuntime() : getPublicClientRuntime(fb);
    }
    throw error;
  }
}

function buildAppUserState(fb: FbUser, runtime: UserRuntimeData): AppUser {
  const authName = normalizeText(fb.displayName);
  const savedName = normalizeText(runtime.displayName);
  const savedTitle = normalizeText(runtime.title);
  const safeAuthName = authName && !isRoleLikeDisplayName(authName) ? authName : "";
  const safeSavedName = savedName && !isRoleLikeDisplayName(savedName) ? savedName : "";
  return {
    uid: fb.uid,
    email: fb.email,
    displayName: safeSavedName || safeAuthName || null,
    title: savedTitle || null,
    isActive: runtime.isActive,
    role: runtime.role,
    permissionsAllow: runtime.permissionsAllow,
    permissionsDeny: runtime.permissionsDeny,
    effectivePermissions: runtime.effectivePermissions,
    employeeProfileEnabled: runtime.employeeProfileEnabled,
    linkedEmployeeId: runtime.linkedEmployeeId,
    firebaseUser: fb,
  };
}

export function isOpsRole(role: AppRole | null | undefined) { return !!role && OPS_ROLES.includes(role); }
export function isInvestmentAdminRole(role: AppRole | null | undefined) { return !!role && INVESTMENT_ADMIN_ROLES.includes(role); }
export function isStaffAdminRole(role: AppRole | null | undefined) { return !!role && STAFF_ADMIN_ROLES.includes(role); }

type PermissionSubject = Pick<AppUser, "role" | "permissionsAllow" | "permissionsDeny" | "effectivePermissions" | "isActive">;

export function getEffectivePermissions(user: Pick<AppUser, "role" | "permissionsAllow" | "permissionsDeny" | "effectivePermissions"> | null | undefined): Permission[] {
  if (!user) return [];
  if (Array.isArray(user.effectivePermissions)) return normalizePermissions(user.effectivePermissions);
  const deny = new Set<Permission>(user.permissionsDeny ?? []);
  const allow = new Set<Permission>(user.permissionsAllow ?? []);
  const effective = new Set<Permission>();
  for (const permission of ROLE_DEFAULT_PERMS[user.role] ?? []) if (!deny.has(permission)) effective.add(permission);
  allow.forEach(permission => { if (!deny.has(permission)) effective.add(permission); });
  return Array.from(effective);
}

export function hasPermission(user: PermissionSubject | null | undefined, permission: Permission): boolean {
  if (!user || user.isActive === false) return false;
  if (Array.isArray(user.effectivePermissions)) return user.effectivePermissions.includes(permission);
  const deny = new Set<Permission>(user.permissionsDeny ?? []);
  if (deny.has(permission)) return false;
  const allow = new Set<Permission>(user.permissionsAllow ?? []);
  if (allow.has(permission)) return true;
  return (ROLE_DEFAULT_PERMS[user.role] ?? []).includes(permission);
}

export function hasInvestmentAdminPermission(user: PermissionSubject | null | undefined, permission: Permission) {
  return isInvestmentAdminRole(user?.role) && hasPermission(user, permission);
}
export function hasStaffAdminPermission(user: PermissionSubject | null | undefined, permission: Permission) {
  return isStaffAdminRole(user?.role) && hasPermission(user, permission);
}
export function hasStaffAreaPermission(user: PermissionSubject | null | undefined, permission: Permission) {
  return (isStaffAdminRole(user?.role) || user?.role === "staff") && hasPermission(user, permission);
}

export function getHomePathForRole(role: AppRole | null | undefined) {
  if (!role) return "/login";
  if (role === "owner" || role === "admin" || role === "accountant") return "/dashboard";
  if (role === "hr") return "/hr/recruitment";
  if (role === "staff") return "/employee/profile";
  if (role === "client" || role === "guest") return "/client/dashboard";
  return "/projects";
}

export function canAccessEmployeeProfile(user: Pick<AppUser, "role" | "employeeProfileEnabled" | "linkedEmployeeId"> | null | undefined) {
  if (!user) return false;
  return user.role === "staff" || user.employeeProfileEnabled === true || !!normalizeText(user.linkedEmployeeId);
}
export const hasEmployeeProfileAccess = canAccessEmployeeProfile;

export function getStaffHomePathForUser(user: (PermissionSubject & Partial<Pick<AppUser, "employeeProfileEnabled" | "linkedEmployeeId">>) | null | undefined) {
  if (!user) return "/login";
  if (hasStaffAdminPermission(user, "recruitment.view") || hasStaffAdminPermission(user, "recruitment.manage")) return "/hr/recruitment";
  if (hasStaffAdminPermission(user, "employees.view") || hasStaffAdminPermission(user, "employees.manage")) return "/hr/employees";
  if (hasStaffAdminPermission(user, "settings.manage")) return "/hr/settings";
  if (hasStaffAdminPermission(user, "weekly_reports.manager_notes")) return "/hr/weekly-reports";
  if (hasStaffAdminPermission(user, "daily_tasks.manager_notes")) return "/hr/daily-tasks";
  if (hasPermission(user, "attendance.view")) return "/hr/attendance";
  if (user.role === "staff" || canAccessEmployeeProfile(user)) return "/employee/profile";
  return "/login";
}

export function getHomePathForUser(
  user: (PermissionSubject & Partial<Pick<AppUser, "employeeProfileEnabled" | "linkedEmployeeId">>) | null | undefined,
  surface: AppSurface = getCurrentAppSurface()
) {
  if (!user) return "/login";
  if (surface === "staff") return getStaffHomePathForUser(user);
  if (user.role === "staff") return "/employee/profile";
  if (user.role === "client" || user.role === "guest") return "/client/dashboard";
  if (user.role === "hr") return getStaffHomePathForUser(user);
  if (isInvestmentAdminRole(user.role)) {
    if (hasInvestmentAdminPermission(user, "dashboard.view")) return "/dashboard";
    if (hasInvestmentAdminPermission(user, "messages.view")) return "/admin/messages";
    if (hasInvestmentAdminPermission(user, "users.view")) return "/admin/clients";
    if (hasInvestmentAdminPermission(user, "projects.manage")) return "/admin/projects";
    if (hasInvestmentAdminPermission(user, "financial.view")) return "/admin/financial";
    if (hasInvestmentAdminPermission(user, "reports.view")) return "/admin/reports";
  }
  if (hasPermission(user, "projects.view")) return "/projects";
  return getHomePathForRole(user.role);
}

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      setUser(null); setError(null); setLoading(false); return;
    }
    setLoading(true);
    try {
      const runtime = await resolveRuntime(firebaseUser, getCurrentAppSurface());
      if (!aliveRef.current) return;
      setUser(buildAppUserState(firebaseUser, runtime));
      setError(null);
    } catch (refreshError) {
      if (!aliveRef.current) return;
      setUser(null);
      setError(refreshError);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await signOut(auth); }
    finally { setUser(null); setError(null); setLoading(false); }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      if (!aliveRef.current) return;
      if (!firebaseUser) {
        setUser(null); setError(null); setLoading(false); return;
      }
      void refresh();
    });
    return () => { aliveRef.current = false; unsubscribe(); };
  }, [refresh]);

  return useMemo(() => ({
    user, loading, error, refresh, logout,
    hasPermission: (permission: Permission) => hasPermission(user, permission),
    effectivePermissions: getEffectivePermissions(user),
  }), [user, loading, error, refresh, logout]);
}
