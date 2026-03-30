import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  hasPermission,
  isOpsRole,
  useAuth,
  type AppUser,
  type Permission,
} from "@/_core/hooks/useAuth";

function homeForUser(user: AppUser | null | undefined) {
  if (!user) return "/login";
  if (isOpsRole(user.role) && hasPermission(user, "dashboard.view")) return "/dashboard";
  if (user.role === "client" || user.role === "guest") return "/client/dashboard";
  if (hasPermission(user, "projects.view")) return "/projects";
  return "/login";
}

type Props = {
  permission: Permission;
  children: ReactNode;
};

export default function RequireAdminPermission({ permission, children }: Props) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  const allowed = !!user && isOpsRole(user.role) && hasPermission(user, permission);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (location !== "/login") setLocation("/login");
      return;
    }

    if (!allowed) {
      const target = homeForUser(user);
      if (location !== target) setLocation(target);
    }
  }, [allowed, loading, location, setLocation, user]);

  if (loading || !user || !allowed) return null;

  return <>{children}</>;
}
