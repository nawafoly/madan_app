import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  getHomePathForUser,
  hasInvestmentAdminPermission,
  hasStaffAdminPermission,
  useAuth,
  type Permission,
} from "@/_core/hooks/useAuth";

type Props = {
  permission: Permission;
  area?: "investment" | "staff";
  children: ReactNode;
};

export default function RequireAdminPermission({
  permission,
  area = "investment",
  children,
}: Props) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  const allowed =
    !!user &&
    (area === "staff"
      ? hasStaffAdminPermission(user, permission)
      : hasInvestmentAdminPermission(user, permission));

  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (location !== "/login") setLocation("/login");
      return;
    }

    if (!allowed) {
      const target = getHomePathForUser(user);
      if (location !== target) setLocation(target);
    }
  }, [allowed, loading, location, setLocation, user]);

  if (loading || !user || !allowed) return null;

  return <>{children}</>;
}
