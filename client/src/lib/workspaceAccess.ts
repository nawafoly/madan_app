import {
  getHomePathForUser,
  getStaffHomePathForUser,
  hasInvestmentAdminPermission,
  type AppUser,
} from "@/_core/hooks/useAuth";

export type WorkspaceAccess = {
  dashboard: boolean;
  hr: boolean;
  dashboardPath: "/dashboard";
  hrPath: string;
  fallbackPath: string;
};

/**
 * Resolve which top-level workspaces an authenticated account can enter.
 *
 * Role remains the baseline through ROLE_DEFAULT_PERMS, while
 * permissionsAllow / permissionsDeny are honored by the existing permission
 * helpers. This keeps workspace routing aligned with the same effective RBAC
 * model already used by protected routes.
 */
export function getWorkspaceAccess(
  user: AppUser | null | undefined
): WorkspaceAccess {
  if (!user || user.isActive === false) {
    return {
      dashboard: false,
      hr: false,
      dashboardPath: "/dashboard",
      hrPath: "/hr",
      fallbackPath: "/login",
    };
  }

  const dashboard = hasInvestmentAdminPermission(user, "dashboard.view");
  const resolvedHrPath = getStaffHomePathForUser(user);
  const hr = resolvedHrPath.startsWith("/hr/");

  return {
    dashboard,
    hr,
    dashboardPath: "/dashboard",
    hrPath: hr ? resolvedHrPath : "/hr",
    fallbackPath: getHomePathForUser(user),
  };
}

export function getAutomaticPostLoginPath(
  user: AppUser | null | undefined
): string {
  const access = getWorkspaceAccess(user);

  if (access.dashboard && !access.hr) return access.dashboardPath;
  if (access.hr && !access.dashboard) return access.hrPath;
  return access.fallbackPath;
}
